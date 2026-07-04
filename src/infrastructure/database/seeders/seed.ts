import { connect } from 'mongoose';
import * as bcrypt from 'bcryptjs';

async function seed() {
  const conn = await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes');

  // Seed price tiers
  const priceTiersCollection = conn.connection.collection('price-tiers');
  const existingTiers = await priceTiersCollection.countDocuments();
  if (existingTiers === 0) {
    await priceTiersCollection.insertMany([
      { name: 'Minorista', description: 'Precio para venta al por menor', priority: 1, isActive: true, createdAt: new Date() },
      { name: 'Mayorista', description: 'Precio para venta al por mayor', priority: 2, isActive: true, createdAt: new Date() },
      { name: 'Distribuidor', description: 'Precio especial para distribuidores', priority: 3, isActive: true, createdAt: new Date() },
    ]);
    console.log('Price tiers seeded');
  }

  // Seed admin user
  const usersCollection = conn.connection.collection('users');
  const existingUsers = await usersCollection.countDocuments();
  if (existingUsers === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await usersCollection.insertOne({
      username: 'admin',
      email: 'admin@fertilizantes.com',
      password: hashedPassword,
      fullName: 'Administrador',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Admin user seeded (username: admin, password: admin123)');
  }

  await conn.disconnect();
  console.log('Seed complete');
}
seed().catch(console.error);
