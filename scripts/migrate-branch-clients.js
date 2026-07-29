const mongoose = require('mongoose');

const { ObjectId } = mongoose.Types;
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const branchArg = args.find((arg) => arg.startsWith('--branch='));
const branchId = branchArg?.slice('--branch='.length) || process.env.LEGACY_BRANCH_ID;
const uri = process.env.MONGODB_URI;

function id(value) {
  return value?.toString();
}

function missingBranchFilter() {
  return {
    $or: [
      { branch: { $exists: false } },
      { branch: null },
    ],
  };
}

function addCandidate(map, entityId, candidateBranch) {
  if (!entityId || !candidateBranch) return;
  const key = id(entityId);
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(id(candidateBranch));
}

async function inspect(db, fallbackBranch) {
  const clientsCollection = db.collection('clients');
  const creditsCollection = db.collection('credit_accounts');
  const salesCollection = db.collection('sales');
  const quotesCollection = db.collection('quotes');

  const [clients, credits, sales, quotes, unscopedQuoteCounters] = await Promise.all([
    clientsCollection.find({}, { projection: { branch: 1, documentNumber: 1 } }).toArray(),
    creditsCollection.find({}, { projection: { branch: 1, client: 1, sales: 1 } }).toArray(),
    salesCollection.find({}, { projection: { branch: 1, client: 1 } }).toArray(),
    quotesCollection.find({}, { projection: { branch: 1, client: 1 } }).toArray(),
    db.collection('quote_counters').countDocuments(missingBranchFilter()),
  ]);

  const saleBranchById = new Map();
  const clientCandidates = new Map();
  for (const sale of sales) {
    const saleBranch = sale.branch || fallbackBranch;
    saleBranchById.set(id(sale._id), id(saleBranch));
    addCandidate(clientCandidates, sale.client, saleBranch);
  }
  for (const quote of quotes) {
    addCandidate(clientCandidates, quote.client, quote.branch || fallbackBranch);
  }
  for (const client of clients) {
    addCandidate(clientCandidates, client._id, client.branch);
  }

  const conflicts = [];
  const clientBranchById = new Map();
  for (const client of clients) {
    const clientId = id(client._id);
    const candidates = clientCandidates.get(clientId) || new Set();
    if (candidates.size > 1) {
      conflicts.push(`Cliente ${clientId}: aparece en ${candidates.size} sucursales`);
      continue;
    }
    clientBranchById.set(clientId, [...candidates][0] || id(fallbackBranch));
  }

  const duplicateDocuments = new Map();
  for (const client of clients) {
    const documentNumber = String(client.documentNumber || '').trim();
    if (!documentNumber) continue;
    const key = `${clientBranchById.get(id(client._id))}:${documentNumber}`;
    duplicateDocuments.set(key, (duplicateDocuments.get(key) || 0) + 1);
  }
  for (const [key, count] of duplicateDocuments) {
    if (count > 1) {
      conflicts.push(`Documento duplicado dentro de la misma sucursal: ${key.split(':').slice(1).join(':')}`);
    }
  }

  const creditBranchById = new Map();
  for (const credit of credits) {
    const candidates = new Set();
    if (credit.branch) candidates.add(id(credit.branch));

    for (const saleId of credit.sales || []) {
      const saleBranch = saleBranchById.get(id(saleId));
      if (saleBranch) candidates.add(saleBranch);
    }

    const clientBranch = clientBranchById.get(id(credit.client));
    if (clientBranch) candidates.add(clientBranch);

    if (candidates.size > 1) {
      conflicts.push(`Crédito ${id(credit._id)}: enlaza datos de ${candidates.size} sucursales`);
      continue;
    }
    creditBranchById.set(id(credit._id), [...candidates][0] || id(fallbackBranch));
  }

  return {
    clients,
    credits,
    sales,
    quotes,
    unscopedQuoteCounters,
    clientBranchById,
    creditBranchById,
    conflicts,
    counts: {
      clients: clients.length,
      clientsWithoutBranch: clients.filter((item) => !item.branch).length,
      credits: credits.length,
      creditsWithoutBranch: credits.filter((item) => !item.branch).length,
      salesWithoutBranch: sales.filter((item) => !item.branch).length,
      quotesWithoutBranch: quotes.filter((item) => !item.branch).length,
      quoteCountersWithoutBranch: unscopedQuoteCounters,
    },
  };
}

async function migrate() {
  if (!uri) throw new Error('MONGODB_URI no está definido');
  if (!branchId || !ObjectId.isValid(branchId)) {
    throw new Error('Indica una sucursal válida con --branch=<ObjectId> o LEGACY_BRANCH_ID');
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const fallbackBranch = new ObjectId(branchId);
  const branch = await db.collection('branches').findOne({ _id: fallbackBranch });
  if (!branch) throw new Error('La sucursal indicada no existe');

  const report = await inspect(db, fallbackBranch);
  console.log(`Modo: ${apply ? 'APLICAR' : 'SIMULACIÓN'}`);
  console.log(`Sucursal heredada: ${branch.code} - ${branch.name}`);
  console.table(report.counts);

  if (report.conflicts.length) {
    console.error('La migración fue detenida por inconsistencias:');
    report.conflicts.forEach((conflict) => console.error(`- ${conflict}`));
    process.exitCode = 2;
    return;
  }

  if (!apply) {
    console.log('Simulación correcta. Ejecuta nuevamente con --apply para guardar los cambios.');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const options = { session };
      await db.collection('sales').updateMany(
        missingBranchFilter(),
        { $set: { branch: fallbackBranch } },
        options,
      );
      await db.collection('quotes').updateMany(
        missingBranchFilter(),
        { $set: { branch: fallbackBranch } },
        options,
      );
      await db.collection('quote_counters').updateMany(
        missingBranchFilter(),
        { $set: { branch: fallbackBranch } },
        options,
      );

      if (report.clients.length) {
        await db.collection('clients').bulkWrite(
          report.clients.map((client) => {
            const documentNumber = String(client.documentNumber || '').trim();
            return {
              updateOne: {
                filter: { _id: client._id },
                update: {
                  $set: {
                    branch: new ObjectId(report.clientBranchById.get(id(client._id))),
                    ...(documentNumber ? { documentNumber } : {}),
                  },
                  ...(!documentNumber ? { $unset: { documentNumber: 1 } } : {}),
                },
              },
            };
          }),
          options,
        );
      }

      if (report.credits.length) {
        await db.collection('credit_accounts').bulkWrite(
          report.credits.map((credit) => ({
            updateOne: {
              filter: { _id: credit._id },
              update: {
                $set: {
                  branch: new ObjectId(report.creditBranchById.get(id(credit._id))),
                },
              },
            },
          })),
          options,
        );
      }
    });
  } finally {
    await session.endSession();
  }

  const clientsCollection = db.collection('clients');
  const clientIndexes = await clientsCollection.indexes();
  for (const indexName of ['documentNumber_1', 'branch_1_documentNumber_1']) {
    if (clientIndexes.some((index) => index.name === indexName)) {
      await clientsCollection.dropIndex(indexName);
    }
  }
  await clientsCollection.createIndex(
    { branch: 1, documentNumber: 1 },
    {
      name: 'branch_1_documentNumber_1',
      unique: true,
      partialFilterExpression: { documentNumber: { $type: 'string', $gt: '' } },
    },
  );
  await clientsCollection.createIndex(
    { branch: 1, name: 1 },
    { name: 'branch_1_name_1' },
  );
  await db.collection('credit_accounts').createIndex(
    { branch: 1, client: 1, status: 1 },
    { name: 'branch_1_client_1_status_1' },
  );

  const verification = await inspect(db, fallbackBranch);
  console.table(verification.counts);
  if (verification.conflicts.length) {
    throw new Error('La verificación posterior detectó inconsistencias');
  }
  console.log('Migración completada y verificada.');
}

migrate()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
