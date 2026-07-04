import { connect, Types } from 'mongoose';

async function seedProducts() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';
  const conn = await connect(uri);
  const db = conn.connection;

  // 1) Price tiers (must exist)
  const tiers = await db.collection('price-tiers').find({}).toArray();
  const tierByName: Record<string, Types.ObjectId> = {};
  tiers.forEach((t: any) => (tierByName[t.name] = t._id));
  if (!tierByName['Minorista'] || !tierByName['Mayorista'] || !tierByName['Distribuidor']) {
    throw new Error('Faltan price tiers. Corre primero `npm run seed`.');
  }

  // 2) Company (create one default if none)
  let company = await db.collection('companies').findOne({});
  if (!company) {
    const result = await db.collection('companies').insertOne({
      name: 'Agrosystem Distribuidora SAC',
      ruc: '20600000001',
      address: 'Av. Principal 123, Lima',
      phone: '+51 999 888 777',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    company = await db.collection('companies').findOne({ _id: result.insertedId });
    console.log('✓ Empresa creada: Agrosystem Distribuidora SAC');
  }

  // 3) Payment method (create Efectivo if none)
  const pmExisting = await db.collection('payment_methods').countDocuments();
  if (pmExisting === 0) {
    await db.collection('payment_methods').insertMany([
      { name: 'Efectivo', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Yape', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Plin', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Transferencia', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    console.log('✓ Métodos de pago creados');
  }

  // 4) Categories
  const categoriesData = [
    { name: 'Herbicidas', description: 'Control de malezas' },
    { name: 'Insecticidas', description: 'Control de plagas y insectos' },
    { name: 'Fungicidas', description: 'Control de hongos y enfermedades' },
    { name: 'Fertilizantes', description: 'Nutrición del suelo' },
    { name: 'Foliares', description: 'Fertilizantes aplicados a hojas' },
    { name: 'Semillas', description: 'Semillas certificadas' },
    { name: 'Abonos Orgánicos', description: 'Materia orgánica para el suelo' },
  ];

  const catByName: Record<string, Types.ObjectId> = {};
  for (const c of categoriesData) {
    const existing = await db.collection('categories').findOne({ name: c.name });
    if (existing) {
      catByName[c.name] = existing._id as Types.ObjectId;
    } else {
      const r = await db.collection('categories').insertOne({
        ...c,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      catByName[c.name] = r.insertedId;
    }
  }
  console.log('✓ Categorías listas');

  // 5) Products
  // Prices: [minorista, mayorista, distribuidor]
  const productsData: {
    name: string;
    category: string;
    unit: string;
    description?: string;
    prices: [number, number, number];
  }[] = [
    // Herbicidas
    { name: 'Roundup Ultramax 1L', category: 'Herbicidas', unit: 'litro', description: 'Glifosato 68% sistémico no selectivo', prices: [48, 42, 38] },
    { name: 'Gramoxone Super 1L', category: 'Herbicidas', unit: 'litro', description: 'Paraquat 20% de contacto', prices: [55, 49, 44] },
    { name: 'Panzer Gold 1L', category: 'Herbicidas', unit: 'litro', description: 'Glifosato 74.7%', prices: [42, 37, 33] },
    { name: '2,4-D Amina 1L', category: 'Herbicidas', unit: 'litro', description: 'Herbicida selectivo hoja ancha', prices: [28, 24, 21] },

    // Insecticidas
    { name: 'Lorsban 4E 1L', category: 'Insecticidas', unit: 'litro', description: 'Clorpirifos 48% amplio espectro', prices: [58, 51, 46] },
    { name: 'Karate Zeon 250ml', category: 'Insecticidas', unit: 'unidad', description: 'Lambda-cihalotrina 5%', prices: [38, 33, 29] },
    { name: 'Engeo 247 SC 250ml', category: 'Insecticidas', unit: 'unidad', description: 'Tiametoxam + Lambda-cihalotrina', prices: [72, 64, 57] },
    { name: 'Cipermetrina 25% 1L', category: 'Insecticidas', unit: 'litro', description: 'Piretroide de contacto', prices: [35, 30, 27] },
    { name: 'Abamectina 1.8% 250ml', category: 'Insecticidas', unit: 'unidad', description: 'Control de ácaros', prices: [42, 37, 33] },

    // Fungicidas
    { name: 'Antracol 70 WP 1kg', category: 'Fungicidas', unit: 'kilo', description: 'Propineb 70% preventivo', prices: [48, 42, 38] },
    { name: 'Manzate 200 1kg', category: 'Fungicidas', unit: 'kilo', description: 'Mancozeb 80% de contacto', prices: [38, 33, 29] },
    { name: 'Amistar Top 250ml', category: 'Fungicidas', unit: 'unidad', description: 'Azoxistrobina + Difenoconazol', prices: [85, 76, 68] },
    { name: 'Ridomil Gold 1kg', category: 'Fungicidas', unit: 'kilo', description: 'Metalaxil-M + Mancozeb', prices: [92, 82, 74] },

    // Fertilizantes
    { name: 'Urea 46% 50kg', category: 'Fertilizantes', unit: 'saco', description: 'Nitrógeno 46% granulado', prices: [115, 105, 98] },
    { name: 'Nitrato de Amonio 50kg', category: 'Fertilizantes', unit: 'saco', description: 'Nitrógeno 33% de rápida absorción', prices: [135, 122, 112] },
    { name: 'Sulfato de Potasio 50kg', category: 'Fertilizantes', unit: 'saco', description: 'Potasio 50% + Azufre 18%', prices: [185, 168, 155] },
    { name: 'Fosfato Diamónico 50kg', category: 'Fertilizantes', unit: 'saco', description: 'DAP 18-46-0', prices: [165, 150, 138] },
    { name: 'NPK 20-20-20 25kg', category: 'Fertilizantes', unit: 'saco', description: 'Fertilizante triple balanceado', prices: [125, 113, 104] },

    // Foliares
    { name: 'Bayfolan Forte 1L', category: 'Foliares', unit: 'litro', description: 'Fertilizante foliar completo', prices: [32, 28, 25] },
    { name: 'Biozyme TF 250ml', category: 'Foliares', unit: 'unidad', description: 'Bioestimulante con aminoácidos', prices: [45, 40, 36] },

    // Semillas
    { name: 'Semilla Maíz Híbrido Dekalb 60', category: 'Semillas', unit: 'bolsa', description: 'Bolsa 50,000 semillas', prices: [380, 345, 315] },
    { name: 'Semilla Papa Canchán 50kg', category: 'Semillas', unit: 'saco', description: 'Papa certificada categoría Básica', prices: [220, 200, 185] },

    // Abonos Orgánicos
    { name: 'Guano de Isla 50kg', category: 'Abonos Orgánicos', unit: 'saco', description: 'Abono orgánico natural 10-10-2', prices: [95, 85, 78] },
    { name: 'Compost Orgánico 40kg', category: 'Abonos Orgánicos', unit: 'saco', description: 'Materia orgánica procesada', prices: [35, 31, 28] },
  ];

  const toInsert = [];
  for (const p of productsData) {
    const exists = await db.collection('products').findOne({ name: p.name });
    if (exists) continue;
    toInsert.push({
      name: p.name,
      description: p.description,
      category: catByName[p.category],
      unit: p.unit,
      taxType: 'GRAVADO',
      prices: [
        { priceTier: tierByName['Minorista'], company: company!._id, price: p.prices[0] },
        { priceTier: tierByName['Mayorista'], company: company!._id, price: p.prices[1] },
        { priceTier: tierByName['Distribuidor'], company: company!._id, price: p.prices[2] },
      ],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (toInsert.length) {
    await db.collection('products').insertMany(toInsert);
    console.log(`✓ ${toInsert.length} productos insertados`);
  } else {
    console.log('ℹ Todos los productos ya existen');
  }

  await conn.disconnect();
  console.log('Seed completo');
}

seedProducts().catch((err) => {
  console.error(err);
  process.exit(1);
});
