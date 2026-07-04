/**
 * Seed script — base de datos de prueba para desarrollo local
 * Uso: node scripts/seed.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';

// ─── Schemas mínimos ─────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({ username: String, password: String, fullName: String, role: String, email: String, isActive: Boolean }, { timestamps: true, collection: 'users' });
const CategorySchema = new mongoose.Schema({ name: String, description: String, isActive: Boolean }, { timestamps: true, collection: 'categories' });
const CompanySchema = new mongoose.Schema({ name: String, ruc: String, address: String, phone: String, isActive: Boolean }, { timestamps: true, collection: 'companies' });
const PriceTierSchema = new mongoose.Schema({ name: String, description: String, priority: Number, isActive: Boolean }, { timestamps: true, collection: 'price-tiers' });
const PaymentMethodSchema = new mongoose.Schema({ name: String, isActive: Boolean }, { timestamps: true, collection: 'payment_methods' });
const SupplierSchema = new mongoose.Schema({ ruc: String, businessName: String, address: String, phone: String, isActive: Boolean }, { timestamps: true, collection: 'suppliers' });
const ClientSchema = new mongoose.Schema({ name: String, documentNumber: String, phone: String, email: String, address: String, isActive: Boolean }, { timestamps: true, collection: 'clients' });

const ProductPriceSchema = new mongoose.Schema({ priceTier: mongoose.Schema.Types.ObjectId, company: mongoose.Schema.Types.ObjectId, price: Number }, { _id: false });
const ProductSchema = new mongoose.Schema({ name: String, description: String, category: mongoose.Schema.Types.ObjectId, unit: String, activeIngredient: String, prices: [ProductPriceSchema], taxType: String, tracksLot: Boolean, isActive: Boolean }, { timestamps: true, collection: 'products' });

const StockSchema = new mongoose.Schema({ product: mongoose.Schema.Types.ObjectId, company: mongoose.Schema.Types.ObjectId, quantity: Number }, { timestamps: true, collection: 'stocks' });

const UnitSchema = new mongoose.Schema({ name: String, abbreviation: String, isActive: Boolean }, { timestamps: true, collection: 'units' });

// ─── Modelos ──────────────────────────────────────────────────────────────────

const User = mongoose.model('UserDocument', UserSchema);
const Category = mongoose.model('CategoryDocument', CategorySchema);
const Company = mongoose.model('CompanyDocument', CompanySchema);
const PriceTier = mongoose.model('PriceTierDocument', PriceTierSchema);
const PaymentMethod = mongoose.model('PaymentMethodDocument', PaymentMethodSchema);
const Supplier = mongoose.model('SupplierDocument', SupplierSchema);
const Client = mongoose.model('ClientDocument', ClientSchema);
const Product = mongoose.model('ProductDocument', ProductSchema);
const Stock = mongoose.model('StockDocument', StockSchema);
const Unit = mongoose.model('UnitDocument', UnitSchema);

// ─── Datos ────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('✓ Conectado a MongoDB:', MONGODB_URI);

  // Limpiar colecciones
  const collections = ['users', 'categories', 'companies', 'price-tiers', 'payment_methods', 'suppliers', 'clients', 'products', 'stocks', 'units'];
  for (const col of collections) {
    await mongoose.connection.collection(col).deleteMany({});
  }
  console.log('✓ Colecciones limpiadas');

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const password = await bcrypt.hash('admin123', 10);
  const passwordVendedor = await bcrypt.hash('vendedor123', 10);

  const [adminUser, vendedorUser] = await User.insertMany([
    { username: 'admin', password, fullName: 'Administrador', role: 'ADMIN', email: 'admin@agro.com', isActive: true },
    { username: 'vendedor1', password: passwordVendedor, fullName: 'Carlos Rojas', role: 'VENDEDOR', email: 'vendedor1@agro.com', isActive: true },
    { username: 'vendedor2', password: passwordVendedor, fullName: 'María López', role: 'VENDEDOR', email: 'vendedor2@agro.com', isActive: true },
  ]);
  console.log('✓ Usuarios creados (admin/admin123, vendedor1/vendedor123)');

  // ── Empresas ──────────────────────────────────────────────────────────────
  const [empresa1, empresa2] = await Company.insertMany([
    { name: 'AgroSystem Norte', ruc: '20600111222', address: 'Av. La Marina 123, Trujillo', phone: '044-123456', isActive: true },
    { name: 'AgroSystem Sur', ruc: '20600333444', address: 'Jr. Comercio 456, Chiclayo', phone: '074-654321', isActive: true },
  ]);
  console.log('✓ Empresas creadas');

  // ── Unidades de medida ────────────────────────────────────────────────────
  await Unit.insertMany([
    { name: 'Kilogramo', abbreviation: 'kg', isActive: true },
    { name: 'Litro', abbreviation: 'L', isActive: true },
    { name: 'Saco 25kg', abbreviation: 'saco', isActive: true },
    { name: 'Galon', abbreviation: 'gal', isActive: true },
    { name: 'Unidad', abbreviation: 'und', isActive: true },
    { name: 'Caja', abbreviation: 'caja', isActive: true },
  ]);
  console.log('✓ Unidades de medida creadas');

  // ── Rangos de precio ──────────────────────────────────────────────────────
  const [tierMay, tierMin, tierEsp] = await PriceTier.insertMany([
    { name: 'Mayorista', description: 'Precios al por mayor', priority: 1, isActive: true },
    { name: 'Minorista', description: 'Precios al por menor', priority: 2, isActive: true },
    { name: 'Especial', description: 'Precios especiales para clientes frecuentes', priority: 3, isActive: true },
  ]);
  console.log('✓ Rangos de precio creados');

  // ── Métodos de pago ───────────────────────────────────────────────────────
  await PaymentMethod.insertMany([
    { name: 'Efectivo', isActive: true },
    { name: 'Yape', isActive: true },
    { name: 'Plin', isActive: true },
    { name: 'Transferencia', isActive: true },
  ]);
  console.log('✓ Métodos de pago creados');

  // ── Categorías ────────────────────────────────────────────────────────────
  const [catFert, catPest, catHerb, catFung, catReg, catOtro] = await Category.insertMany([
    { name: 'Fertilizantes', description: 'Nutrientes para el suelo y cultivos', isActive: true },
    { name: 'Pesticidas', description: 'Control de plagas e insectos', isActive: true },
    { name: 'Herbicidas', description: 'Control de malezas y hierbas', isActive: true },
    { name: 'Fungicidas', description: 'Control de hongos y enfermedades', isActive: true },
    { name: 'Reguladores', description: 'Reguladores de crecimiento', isActive: true },
    { name: 'Otros', description: 'Otros productos agroquímicos', isActive: true },
  ]);
  console.log('✓ Categorías creadas');

  // ── Proveedores ───────────────────────────────────────────────────────────
  await Supplier.insertMany([
    { ruc: '20100182282', businessName: 'Bayer CropScience Perú S.A.', address: 'Av. Primavera 654, Lima', phone: '01-610-3600', isActive: true },
    { ruc: '20100354753', businessName: 'Syngenta Perú S.A.', address: 'Av. Javier Prado 777, Lima', phone: '01-706-9400', isActive: true },
    { ruc: '20517693771', businessName: 'Agroverde S.R.L.', address: 'Calle Los Pinos 231, Trujillo', phone: '044-987654', isActive: true },
    { ruc: '20600777888', businessName: 'Distribuidora Norte Agro E.I.R.L.', address: 'Jr. Los Olivos 890, Chiclayo', phone: '074-111222', isActive: true },
  ]);
  console.log('✓ Proveedores creados');

  // ── Clientes ──────────────────────────────────────────────────────────────
  const [cli1, cli2, cli3, cli4, cli5] = await Client.insertMany([
    { name: 'Juan Pérez Ramírez', documentNumber: '45678901', phone: '944111222', email: 'juan.perez@gmail.com', address: 'Caserío La Esperanza, Otuzco', isActive: true },
    { name: 'María García Torres', documentNumber: '52341678', phone: '955333444', email: 'maria.garcia@hotmail.com', address: 'Jr. Los Rosales 123, Trujillo', isActive: true },
    { name: 'Cooperativa Agro Virú', documentNumber: '20450112233', phone: '044-445566', email: 'coop.viru@agro.pe', address: 'Km 5 Carretera Virú, La Libertad', isActive: true },
    { name: 'Carlos Mendoza Silva', documentNumber: '33445566', phone: '966555666', email: '', address: 'Caserío El Progreso, Chepén', isActive: true },
    { name: 'Rosa Quispe Flores', documentNumber: '41122334', phone: '977777888', email: '', address: 'Av. Los Incas 456, Huamachuco', isActive: true },
  ]);
  console.log('✓ Clientes creados');

  // ── Productos ─────────────────────────────────────────────────────────────
  // Helper para precios en ambas empresas y los 3 rangos
  const prices = (p1May, p1Min, p1Esp, p2May, p2Min, p2Esp) => [
    { priceTier: tierMay._id, company: empresa1._id, price: p1May },
    { priceTier: tierMin._id, company: empresa1._id, price: p1Min },
    { priceTier: tierEsp._id, company: empresa1._id, price: p1Esp },
    { priceTier: tierMay._id, company: empresa2._id, price: p2May },
    { priceTier: tierMin._id, company: empresa2._id, price: p2Min },
    { priceTier: tierEsp._id, company: empresa2._id, price: p2Esp },
  ];

  const products = await Product.insertMany([
    // Fertilizantes
    { name: 'Urea 46%', description: 'Fertilizante nitrogenado granulado', category: catFert._id, unit: 'saco', activeIngredient: 'Nitrógeno 46%', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(58, 65, 60, 57, 64, 59) },
    { name: 'Fosfato Diamónico (DAP)', description: 'Fertilizante fosfatado de alta concentración', category: catFert._id, unit: 'saco', activeIngredient: 'N 18% + P2O5 46%', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(85, 95, 88, 84, 93, 87) },
    { name: 'Cloruro de Potasio', description: 'Fuente de potasio para cultivos exigentes', category: catFert._id, unit: 'saco', activeIngredient: 'K2O 60%', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(72, 82, 75, 71, 80, 74) },
    { name: 'Nitrato de Amonio', description: 'Fertilizante de rápida asimilación', category: catFert._id, unit: 'saco', activeIngredient: 'Nitrógeno 33.5%', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(62, 70, 65, 61, 69, 64) },
    { name: 'Sulfato de Magnesio', description: 'Fuente de magnesio y azufre', category: catFert._id, unit: 'kg', activeIngredient: 'MgO 16% + SO3 32%', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(3.5, 4.2, 3.8, 3.4, 4.1, 3.7) },
    // Pesticidas
    { name: 'Clorpirifos 480 EC', description: 'Insecticida organofosforado de amplio espectro', category: catPest._id, unit: 'L', activeIngredient: 'Clorpirifos 480 g/L', taxType: 'GRAVADO', tracksLot: true, isActive: true, prices: prices(28, 35, 30, 27, 34, 29) },
    { name: 'Imidacloprid 35 SC', description: 'Insecticida sistémico neonicotinoide', category: catPest._id, unit: 'L', activeIngredient: 'Imidacloprid 350 g/L', taxType: 'GRAVADO', tracksLot: true, isActive: true, prices: prices(45, 55, 48, 44, 54, 47) },
    { name: 'Abamectina 1.8 EC', description: 'Acaricida e insecticida biológico', category: catPest._id, unit: 'L', activeIngredient: 'Abamectina 18 g/L', taxType: 'GRAVADO', tracksLot: true, isActive: true, prices: prices(62, 75, 66, 60, 73, 64) },
    // Herbicidas
    { name: 'Glifosato 48%', description: 'Herbicida sistémico no selectivo', category: catHerb._id, unit: 'L', activeIngredient: 'Glifosato 480 g/L', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(18, 25, 20, 17, 24, 19) },
    { name: 'Paraquat 20 SL', description: 'Herbicida de contacto rápido', category: catHerb._id, unit: 'L', activeIngredient: 'Paraquat 200 g/L', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(22, 30, 25, 21, 29, 24) },
    { name: 'Atrazina 80 WP', description: 'Herbicida selectivo para maíz', category: catHerb._id, unit: 'kg', activeIngredient: 'Atrazina 800 g/kg', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(15, 20, 17, 14, 19, 16) },
    // Fungicidas
    { name: 'Mancozeb 80 WP', description: 'Fungicida protectante de amplio espectro', category: catFung._id, unit: 'kg', activeIngredient: 'Mancozeb 800 g/kg', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(25, 32, 27, 24, 31, 26) },
    { name: 'Metalaxil + Mancozeb', description: 'Fungicida sistémico + contacto', category: catFung._id, unit: 'kg', activeIngredient: 'Metalaxil 80 g/kg + Mancozeb 640 g/kg', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(38, 48, 41, 37, 46, 40) },
    { name: 'Propiconazol 25 EC', description: 'Fungicida sistémico triazol', category: catFung._id, unit: 'L', activeIngredient: 'Propiconazol 250 g/L', taxType: 'GRAVADO', tracksLot: true, isActive: true, prices: prices(55, 68, 58, 53, 66, 56) },
    // Reguladores
    { name: 'Ácido Giberélico 10%', description: 'Regulador de crecimiento para cuajado y tamaño de fruto', category: catReg._id, unit: 'und', activeIngredient: 'Ácido Giberélico 100 g/L', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(12, 18, 14, 11, 17, 13) },
    { name: 'Etileno 3.9% SL', description: 'Regulador de maduración', category: catReg._id, unit: 'L', activeIngredient: 'Etileno 39 g/L', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(35, 45, 38, 34, 43, 37) },
    // Otros
    { name: 'Sulfato de Cobre Pentahidratado', description: 'Fungicida y bactericida cúprico', category: catOtro._id, unit: 'kg', activeIngredient: 'Sulfato de Cobre 960 g/kg', taxType: 'GRAVADO', tracksLot: false, isActive: true, prices: prices(8, 12, 9, 7.5, 11, 8.5) },
    { name: 'Cal Agrícola', description: 'Corrector de acidez del suelo', category: catOtro._id, unit: 'saco', activeIngredient: 'CaCO3 90%', taxType: 'INAFECTO', tracksLot: false, isActive: true, prices: prices(12, 16, 13, 11, 15, 12) },
  ]);
  console.log(`✓ ${products.length} productos creados`);

  // ── Stock inicial ─────────────────────────────────────────────────────────
  const stockData = [];
  for (const product of products) {
    // Stock en empresa 1
    stockData.push({ product: product._id, company: empresa1._id, quantity: Math.floor(Math.random() * 150) + 20 });
    // Stock en empresa 2
    stockData.push({ product: product._id, company: empresa2._id, quantity: Math.floor(Math.random() * 100) + 10 });
  }
  await Stock.insertMany(stockData);
  console.log(`✓ Stock creado para ${products.length} productos × 2 empresas`);

  // ─── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('  Seed completado exitosamente');
  console.log('════════════════════════════════════════');
  console.log('  Credenciales de acceso:');
  console.log('    admin      / admin123    (ADMIN)');
  console.log('    vendedor1  / vendedor123 (VENDEDOR)');
  console.log('    vendedor2  / vendedor123 (VENDEDOR)');
  console.log('────────────────────────────────────────');
  console.log('  Datos creados:');
  console.log('    2 empresas');
  console.log('    6 unidades de medida');
  console.log('    3 rangos de precio (Mayorista / Minorista / Especial)');
  console.log('    4 métodos de pago');
  console.log('    6 categorías');
  console.log('    4 proveedores');
  console.log('    5 clientes');
  console.log(`   ${products.length} productos con precios`);
  console.log('    Stock inicial en ambas empresas');
  console.log('════════════════════════════════════════\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
