import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { validationPipe } from './presentation/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { connect } from 'mongoose';
import * as bcrypt from 'bcryptjs';

async function runSeed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';
  const conn = await connect(uri);

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

  await conn.disconnect();
}

async function bootstrap() {
  await runSeed();
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fertilizantes API')
    .setDescription('API del sistema de gestion de agroquimicos - Ventas, Stock, Caja, Creditos')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('Auth', 'Autenticacion y gestion de usuarios')
    .addTag('Products', 'Gestion de productos')
    .addTag('Companies', 'Gestion de empresas (RUCs)')
    .addTag('Price Tiers', 'Rangos de precios')
    .addTag('Stock', 'Inventario por empresa')
    .addTag('Stock Adjustments', 'Ajustes manuales de inventario')
    .addTag('Purchases', 'Registro de compras')
    .addTag('Sales', 'Registro de ventas (mixtas multi-empresa)')
    .addTag('Clients', 'Gestion de clientes')
    .addTag('Cash Register', 'Caja diaria global')
    .addTag('Credits', 'Cuentas de credito de clientes')
    .addTag('Dashboard', 'Reportes y resumen financiero')
    .addTag('Users', 'Gestion de usuarios del sistema')
    .addTag('Kardex', 'Historial de movimientos de inventario')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/health', (_req: any, res: any) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
  console.log(`Swagger docs on http://localhost:${port}/api/docs`);
}
bootstrap();
