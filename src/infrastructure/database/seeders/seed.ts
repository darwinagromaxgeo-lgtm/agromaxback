import * as fs from 'fs';
import * as path from 'path';
import { connect } from 'mongoose';
import * as bcrypt from 'bcryptjs';

type DemoProductSeed = {
  name: string;
  category: string;
  unit: string;
  description: string;
  activeIngredient: string;
  control: string;
  prices: [number, number, number];
  tracksLot: boolean;
  stock: number;
  lotNumber: string;
  expirationDays: number;
  location: string;
  supplier: string;
};

async function upsertByName(collection: any, name: string, doc: Record<string, any>) {
  const existing = await collection.findOne({ name });
  if (existing) return existing;
  const result = await collection.insertOne(doc);
  return collection.findOne({ _id: result.insertedId });
}

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../../../../.env');
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

async function seed() {
  loadEnvFile();
  const conn = await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes');
  const db = conn.connection.db!;
  const now = new Date();

  // Seed price tiers
  const priceTiersCollection = db.collection('price-tiers');
  const existingTiers = await priceTiersCollection.countDocuments();
  if (existingTiers === 0) {
    await priceTiersCollection.insertMany([
      { name: 'Minorista', description: 'Precio para venta al por menor', priority: 1, isActive: true, createdAt: new Date() },
      { name: 'Mayorista', description: 'Precio para venta al por mayor', priority: 2, isActive: true, createdAt: new Date() },
      { name: 'Distribuidor', description: 'Precio especial para distribuidores', priority: 3, isActive: true, createdAt: new Date() },
    ]);
    console.log('Price tiers seeded');
  }

  const tiers = await priceTiersCollection.find({}).sort({ priority: 1 }).toArray();
  const tierByName = new Map<string, any>(tiers.map((tier: any) => [tier.name, tier]));

  // Seed demo company
  const companiesCollection = db.collection('companies');
  const company = await upsertByName(companiesCollection, 'Agrosystem Demo SAC', {
    name: 'Agrosystem Demo SAC',
    ruc: '20600000001',
    address: 'Av. Principal 123, Lima',
    phone: '+51 999 888 777',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  // Seed categories
  const categoriesCollection = db.collection('categories');
  const demoCategories = [
    { name: 'Herbicidas', description: 'Control de malezas', parentId: null },
    { name: 'Insecticidas', description: 'Control de plagas y insectos', parentId: null },
    { name: 'Fungicidas', description: 'Control de hongos y enfermedades', parentId: null },
    { name: 'Fertilizantes', description: 'Nutrición del suelo', parentId: null },
    { name: 'Foliares', description: 'Fertilizantes aplicados a hojas', parentId: null },
    { name: 'Semillas', description: 'Semillas certificadas', parentId: null },
    { name: 'Abonos Orgánicos', description: 'Materia orgánica para el suelo', parentId: null },
  ];

  const categoryByName = new Map<string, any>();
  for (const category of demoCategories) {
    const existing = await categoriesCollection.findOne({ name: category.name });
    if (existing) {
      categoryByName.set(category.name, existing);
      continue;
    }
    const result = await categoriesCollection.insertOne({
      ...category,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const created = await categoriesCollection.findOne({ _id: result.insertedId });
    categoryByName.set(category.name, created);
  }
  console.log('Categories seeded');

  // Seed units of measure
  const unitsCollection = db.collection('units');
  const demoUnits = [
    { name: 'Unidad', abbreviation: 'UND' },
    { name: 'Litro', abbreviation: 'L' },
    { name: 'Mililitro', abbreviation: 'mL' },
    { name: 'Kilogramo', abbreviation: 'kg' },
    { name: 'Gramo', abbreviation: 'g' },
    { name: 'Saco', abbreviation: 'sac' },
    { name: 'Bolsa', abbreviation: 'bol' },
    { name: 'Caja', abbreviation: 'caja' },
  ];

  for (const unit of demoUnits) {
    const existing = await unitsCollection.findOne({ name: unit.name });
    if (existing) continue;
    await unitsCollection.insertOne({
      ...unit,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log('Units seeded');

  // Seed admin user
  const usersCollection = db.collection('users');
  const existingAdmin = await usersCollection.findOne({ username: 'admin' });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await usersCollection.insertOne({
      username: 'admin',
      email: 'admin@fertilizantes.com',
      password: hashedPassword,
      fullName: 'Administrador',
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log('Admin user seeded (username: admin, password: admin123)');
  }

  const productsCollection = db.collection('products');
  const stocksCollection = db.collection('stocks');
  const lotsCollection = db.collection('product_lots');
  const movementsCollection = db.collection('stock_movements');

  const demoProducts: DemoProductSeed[] = [
    {
      name: 'Roundup Ultramax 1L',
      category: 'Herbicidas',
      unit: 'Litro',
      description: 'Glifosato 68% sistémico no selectivo',
      activeIngredient: 'Glifosato 68%',
      control: 'Malezas',
      prices: [48, 42, 38],
      tracksLot: true,
      stock: 24,
      lotNumber: 'DEMO-RU-001',
      expirationDays: 540,
      location: 'Estante A1',
      supplier: 'Bayer',
    },
    {
      name: 'Gramoxone Super 1L',
      category: 'Herbicidas',
      unit: 'Litro',
      description: 'Paraquat 20% de contacto',
      activeIngredient: 'Paraquat 20%',
      control: 'Desecación de malezas',
      prices: [55, 49, 44],
      tracksLot: true,
      stock: 18,
      lotNumber: 'DEMO-GR-002',
      expirationDays: 540,
      location: 'Estante A2',
      supplier: 'Syngenta',
    },
    {
      name: 'Karate Zeon 250ml',
      category: 'Insecticidas',
      unit: 'Unidad',
      description: 'Lambda-cihalotrina 5%',
      activeIngredient: 'Lambda-cihalotrina 5%',
      control: 'Insectos masticadores y chupadores',
      prices: [38, 33, 29],
      tracksLot: true,
      stock: 30,
      lotNumber: 'DEMO-KZ-003',
      expirationDays: 540,
      location: 'Estante B1',
      supplier: 'Syngenta',
    },
    {
      name: 'Abamectina 1.8% 250ml',
      category: 'Insecticidas',
      unit: 'Unidad',
      description: 'Control de ácaros',
      activeIngredient: 'Abamectina 1.8%',
      control: 'Ácaros y minadores',
      prices: [42, 37, 33],
      tracksLot: true,
      stock: 28,
      lotNumber: 'DEMO-AB-004',
      expirationDays: 540,
      location: 'Estante B2',
      supplier: 'Agrovet',
    },
    {
      name: 'Antracol 70 WP 1kg',
      category: 'Fungicidas',
      unit: 'Kilogramo',
      description: 'Propineb 70% preventivo',
      activeIngredient: 'Propineb 70%',
      control: 'Hongos foliares',
      prices: [48, 42, 38],
      tracksLot: true,
      stock: 20,
      lotNumber: 'DEMO-AN-005',
      expirationDays: 720,
      location: 'Estante C1',
      supplier: 'Bayer',
    },
    {
      name: 'Manzate 200 1kg',
      category: 'Fungicidas',
      unit: 'Kilogramo',
      description: 'Mancozeb 80% de contacto',
      activeIngredient: 'Mancozeb 80%',
      control: 'Hongos de contacto',
      prices: [38, 33, 29],
      tracksLot: true,
      stock: 22,
      lotNumber: 'DEMO-MA-006',
      expirationDays: 720,
      location: 'Estante C2',
      supplier: 'Mills',
    },
    {
      name: 'Urea 46% 50kg',
      category: 'Fertilizantes',
      unit: 'Saco',
      description: 'Nitrógeno 46% granulado',
      activeIngredient: 'Urea 46%',
      control: 'Nutrición nitrogenada',
      prices: [115, 105, 98],
      tracksLot: true,
      stock: 60,
      lotNumber: 'DEMO-UR-007',
      expirationDays: 900,
      location: 'Almacén D1',
      supplier: 'Yara',
    },
    {
      name: 'NPK 20-20-20 25kg',
      category: 'Fertilizantes',
      unit: 'Saco',
      description: 'Fertilizante triple balanceado',
      activeIngredient: 'NPK 20-20-20',
      control: 'Nutrición completa',
      prices: [125, 113, 104],
      tracksLot: true,
      stock: 45,
      lotNumber: 'DEMO-NP-008',
      expirationDays: 900,
      location: 'Almacén D2',
      supplier: 'SQM',
    },
    {
      name: 'Bayfolan Forte 1L',
      category: 'Foliares',
      unit: 'Litro',
      description: 'Fertilizante foliar completo',
      activeIngredient: 'Nutrientes foliares',
      control: 'Nutrición foliar',
      prices: [32, 28, 25],
      tracksLot: true,
      stock: 22,
      lotNumber: 'DEMO-BF-009',
      expirationDays: 540,
      location: 'Estante E1',
      supplier: 'Bayer',
    },
    {
      name: 'Biozyme TF 250ml',
      category: 'Foliares',
      unit: 'Unidad',
      description: 'Bioestimulante con aminoácidos',
      activeIngredient: 'Aminoácidos y extractos vegetales',
      control: 'Bioestimulación',
      prices: [45, 40, 36],
      tracksLot: true,
      stock: 26,
      lotNumber: 'DEMO-BZ-010',
      expirationDays: 540,
      location: 'Estante E2',
      supplier: 'Biolchim',
    },
    {
      name: 'Semilla Maíz Híbrido Dekalb 60',
      category: 'Semillas',
      unit: 'Bolsa',
      description: 'Bolsa 50,000 semillas',
      activeIngredient: 'Semilla certificada',
      control: 'Siembra',
      prices: [380, 345, 315],
      tracksLot: true,
      stock: 35,
      lotNumber: 'DEMO-SM-011',
      expirationDays: 720,
      location: 'Estante F1',
      supplier: 'Dekalb',
    },
    {
      name: 'Guano de Isla 50kg',
      category: 'Abonos Orgánicos',
      unit: 'Saco',
      description: 'Abono orgánico natural 10-10-2',
      activeIngredient: 'Materia orgánica',
      control: 'Enmienda orgánica',
      prices: [95, 85, 78],
      tracksLot: true,
      stock: 40,
      lotNumber: 'DEMO-GI-012',
      expirationDays: 900,
      location: 'Almacén G1',
      supplier: 'Granja Orgánica',
    },
  ];

  let createdProducts = 0;
  let createdStocks = 0;
  let createdLots = 0;
  let createdMovements = 0;

  for (const item of demoProducts) {
    const category = categoryByName.get(item.category);
    if (!category?._id) continue;

    let product = await productsCollection.findOne({ name: item.name });
    if (!product) {
      const productDoc = {
        name: item.name,
        description: item.description,
        category: category._id,
        unit: item.unit,
        activeIngredient: item.activeIngredient,
        activeIngredients: [],
        prices: [
          { priceTier: tierByName.get('Minorista')._id, company: company._id, price: item.prices[0] },
          { priceTier: tierByName.get('Mayorista')._id, company: company._id, price: item.prices[1] },
          { priceTier: tierByName.get('Distribuidor')._id, company: company._id, price: item.prices[2] },
        ],
        taxType: 'GRAVADO',
        tracksLot: item.tracksLot,
        isActive: true,
        minMarginPercent: 5,
        location: item.location,
        locations: item.location ? [item.location] : [],
        supplier: item.supplier,
        control: item.control,
        createdAt: now,
        updatedAt: now,
      };
      const result = await productsCollection.insertOne(productDoc);
      product = await productsCollection.findOne({ _id: result.insertedId });
      createdProducts++;
    }

    if (!product?._id) continue;

    const stockExisting = await stocksCollection.findOne({ product: product._id, company: company._id });
    if (!stockExisting) {
      await stocksCollection.insertOne({
        product: product._id,
        company: company._id,
        quantity: item.stock,
        lastUpdated: now,
        createdAt: now,
        updatedAt: now,
      });
      createdStocks++;
    }

    const expirationDate = new Date(now);
    expirationDate.setDate(expirationDate.getDate() + item.expirationDays);

    if (item.tracksLot) {
      const lotExisting = await lotsCollection.findOne({
        product: product._id,
        company: company._id,
        lotNumber: item.lotNumber,
      });
      if (!lotExisting) {
        await lotsCollection.insertOne({
          product: product._id,
          company: company._id,
          lotNumber: item.lotNumber,
          expirationDate,
          initialQuantity: item.stock,
          currentQuantity: item.stock,
          purchaseId: undefined,
          receivedAt: now,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        createdLots++;
      }
    }

    const movementExisting = await movementsCollection.findOne({
      product: product._id,
      company: company._id,
      referenceType: 'SeedInitialStock',
      description: 'Stock inicial de prueba',
    });
    if (!movementExisting) {
      await movementsCollection.insertOne({
        product: product._id,
        company: company._id,
        movementType: 'ADJUSTMENT_IN',
        quantity: item.stock,
        previousStock: 0,
        newStock: item.stock,
        referenceId: product._id,
        referenceType: 'SeedInitialStock',
        description: 'Stock inicial de prueba',
        date: now,
        createdAt: now,
        updatedAt: now,
      });
      createdMovements++;
    }
  }

  console.log(`Products seeded: ${createdProducts}`);
  console.log(`Stocks seeded: ${createdStocks}`);
  console.log(`Lots seeded: ${createdLots}`);
  console.log(`Stock movements seeded: ${createdMovements}`);

  await conn.disconnect();
  console.log('Seed complete');
}
seed().catch(console.error);
