const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

function validateEnvironment(environment) {
  if (environment.MVP_MODE !== 'true') throw new Error('El seed requiere MVP_MODE=true');
  const uri = environment.MONGODB_URI || '';
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['mongo', 'localhost', '127.0.0.1'].includes(parsed.hostname) || !/^\/agromax_mvp(?:_[a-z0-9]+)*$/.test(parsed.pathname)) throw new Error('El seed solo admite una base local agromax_mvp o agromax_mvp_*');
  if (!environment.MVP_ADMIN_PASSWORD || environment.MVP_ADMIN_PASSWORD.length < 12) throw new Error('Configura una contraseña MVP de al menos 12 caracteres');
  return uri;
}

async function seed(environment = process.env) {
  const uri = validateEnvironment(environment);
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const db = connection.db;
    const now = new Date();
    const id = number => new mongoose.Types.ObjectId(String(number).padStart(24, '0'));
    const upsert = (collection, _id, data) => db.collection(collection).updateOne({ _id }, { $setOnInsert: { _id, ...data, createdAt: now, updatedAt: now } }, { upsert: true });
    await upsert('companies', id(8001), { name: 'AGROMAX MVP - EMISOR DE SIMULACION', ruc: '20600000001', address: 'Dirección de demostración, Lima', isActive: true });
    await upsert('branches', id(8002), { code: 'MVP', name: 'Sucursal MVP', companies: [id(8001)], defaultCompany: id(8001), isActive: true, isMain: true });
    await upsert('users', id(8003), { username: 'mvpadmin', fullName: 'Administrador MVP', email: 'mvp@example.invalid', password: await bcrypt.hash(environment.MVP_ADMIN_PASSWORD, 10), role: 'ADMIN', isActive: true, branchAssignments: [] });
    await upsert('categories', id(8004), { name: 'Productos de demostración', isActive: true });
    await upsert('price-tiers', id(8005), { name: 'Minorista', priority: 1, isActive: true });
    await upsert('payment_methods', id(8006), { name: 'Efectivo MVP', isActive: true });
    for (const [number, taxType, price] of [[8010, 'GRAVADO', 118], [8011, 'EXONERADO', 50], [8012, 'INAFECTO', 30]]) {
      await upsert('products', id(number), { name: `MVP - Producto ${taxType.toLowerCase()}`, description: 'Producto ficticio para comprobar separación tributaria', category: id(8004), unit: 'UND', taxType, tracksLot: false, isActive: true, prices: [{ priceTier: id(8005), price, company: id(8001), branch: id(8002) }] });
      await upsert('stocks', id(number + 100), { branch: id(8002), company: id(8001), product: id(number), quantity: 100, lastUpdated: now });
    }
    for (const [number, documentNumber, name] of [[8020, '20600000002', 'Cliente RUC de demostración'], [8021, '12345678', 'Cliente DNI de demostración']]) {
      await upsert('clients', id(number), { branch: id(8002), documentNumber, name, address: 'Dirección de prueba', isActive: true });
    }
    await upsert('units', id(8030), { name: 'Unidad', abbreviation: 'UND', isActive: true });
    console.log('Datos MVP preparados sin sobrescribir registros existentes. Usuario: mvpadmin.');
  } finally { await connection.close(); }
}

module.exports = { seed, validateEnvironment };
if (require.main === module) seed().catch(error => { console.error(error.message); process.exitCode = 1; });
