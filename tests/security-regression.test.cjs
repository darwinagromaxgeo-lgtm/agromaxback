require('reflect-metadata');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { randomBytes } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { PARAMTYPES_METADATA, SELF_DECLARED_DEPS_METADATA } = require('@nestjs/common/constants');
const { NestFactory, Reflector } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { JwtStrategy } = require('../dist/infrastructure/config/jwt.strategy');
const { JwtAuthGuard } = require('../dist/presentation/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/presentation/guards/roles.guard');
const { validationPipe } = require('../dist/presentation/pipes/validation.pipe');
const { HttpExceptionFilter } = require('../dist/presentation/filters/http-exception.filter');
const { ResponseTransformInterceptor } = require('../dist/presentation/interceptors/response-transform.interceptor');
const { LoginUseCase } = require('../dist/application/use-cases/auth/login.use-case');
const { ValidateTokenUseCase } = require('../dist/application/use-cases/auth/validate-token.use-case');
const { ImportProductsUseCase } = require('../dist/application/use-cases/product/import-products.use-case');
const { GetProductsUseCase } = require('../dist/application/use-cases/product/get-products.use-case');

// Exercise the real controllers, guards, validation, uploads and Excel importer.
// Persistence and external services are replaced; this never imports main.ts or seeds a database.
let app;
let http;
let document;
let jwt;
let adminToken;
const products = new Map();
const secret = randomBytes(32).toString('hex');
const user = {
  id: 'security-test-user', username: 'security-test', role: 'ADMIN',
  fullName: 'Security Test', isActive: true,
  password: bcrypt.hashSync('test-password', 4),
};

before(async () => {
  const controllerDir = join(__dirname, '../dist/presentation/controllers');
  const controllers = readdirSync(controllerDir)
    .filter((name) => name.endsWith('.controller.js'))
    .flatMap((name) => Object.values(require(join(controllerDir, name))))
    .filter((value) => typeof value === 'function' && Reflect.hasMetadata('path', value));
  const providers = new Map();
  for (const controller of controllers) {
    const tokens = [...(Reflect.getMetadata(PARAMTYPES_METADATA, controller) || [])];
    for (const { index, param } of Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, controller) || []) {
      tokens[index] = param;
    }
    for (const token of tokens) {
      providers.set(token, { provide: token, useValue: {
        execute: () => { throw new Error(`Unexpected service call: ${token.name || token}`); },
      } });
    }
  }
  jwt = new JwtService({ secret, signOptions: { expiresIn: '1h' } });
  const users = {
    findByUsername: async (name) => name === user.username ? user : null,
    findById: async (id) => id === user.id ? user : null,
  };
  const productRepo = {
    findByName: async (name) => products.get(name),
    create: async (data) => { products.set(data.name, { ...data, id: data.name }); },
    update: async (id, data) => { products.set(id, { ...data, id }); },
  };
  const categories = { findByNameAndParent: async () => ({ id: 'category-1' }) };
  const units = { findByName: async () => ({ id: 'unit-1' }) };
  for (const [token, useValue] of [
    [LoginUseCase, new LoginUseCase(users, jwt)],
    [ValidateTokenUseCase, new ValidateTokenUseCase(users)],
    [ImportProductsUseCase, new ImportProductsUseCase(productRepo, categories, units)],
    [GetProductsUseCase, { execute: async (filter) => filter }],
  ]) providers.set(token, { provide: token, useValue });
  providers.set(ConfigService, {
    provide: ConfigService, useValue: new ConfigService({ app: { jwtSecret: secret } }),
  });
  class TestModule {}
  Module({ controllers, providers: [...providers.values(), JwtStrategy] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
  app.useGlobalGuards(new JwtAuthGuard(new Reflector()), new RolesGuard(new Reflector()));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.enableCors({ origin: ['http://localhost:5173'], credentials: true });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', '::ffff:10.0.0.0/8');
  expressApp.get('/test-client-ip', (req, res) => res.json({ ip: req.ip }));
  document = SwaggerModule.createDocument(app,
    new DocumentBuilder().setTitle('Regression test').setVersion('1').build());
  await app.listen(0, '127.0.0.1');
  http = axios.create({ baseURL: await app.getUrl(), proxy: false, validateStatus: () => true, timeout: 5000 });
  adminToken = jwt.sign({ sub: user.id, username: user.username, role: 'ADMIN' });
});

after(async () => { if (app) await app.close(); });

const authorized = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

test('all application routes register and generate Swagger schemas', () => {
  assert.ok(Object.keys(document.paths).length > 60);
  assert.ok(document.paths['/api/auth/login'].post);
  assert.ok(document.paths['/api/products/import'].post);
  assert.ok(document.paths['/api/sales'].post);
});

test('login issues a usable JWT and invalid credentials are rejected', async () => {
  const login = await http.post('/api/auth/login', { username: user.username, password: 'test-password' });
  assert.equal(login.status, 201);
  const token = login.data.data.accessToken;
  const payload = jwt.verify(token);
  assert.equal(payload.exp - payload.iat, 3600);
  const me = await http.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.data.data.id, user.id);
  const invalid = await http.post('/api/auth/login', { username: user.username, password: 'incorrect' });
  assert.equal(invalid.status, 401);
});

test('guards reject missing, expired, forged and insufficient-role tokens', async () => {
  assert.equal((await http.get('/api/products')).status, 401);
  for (const token of [
    jwt.sign({ sub: user.id }, { expiresIn: -1 }),
    new JwtService({ secret: 'different-test-secret' }).sign({ sub: user.id }),
  ]) {
    assert.equal((await http.get('/api/products', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  }
  const token = jwt.sign({ sub: user.id, role: 'ALMACENERO' });
  const response = await http.post('/api/auth/register', {}, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403);
});

test('query conversion and DTO validation survive the Express upgrade', async () => {
  const response = await http.get('/api/products?page=2&limit=5&isActive=false', authorized());
  assert.equal(response.status, 200);
  assert.equal(response.data.data.page, 2);
  assert.equal(response.data.data.limit, 5);
  assert.equal(response.data.data.isActive, false);
  assert.equal((await http.get('/api/products?page=-1', authorized())).status, 400);
  assert.equal((await http.post('/api/auth/login', { username: user.username, password: 'short' })).status, 400);
});

test('proxy subnet handling does not trust a forged forwarded address', async () => {
  const response = await http.get('/test-client-ip', { headers: { 'X-Forwarded-For': '198.51.100.99' } });
  assert.equal(response.status, 200);
  assert.equal(response.data.ip, '127.0.0.1');
});

test('browser CORS preflight still permits authenticated frontend requests', async () => {
  const response = await http.options('/api/products', { headers: {
    Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal(response.status, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

for (const format of ['xlsx', 'xls']) {
  test(`multipart ${format} import preserves product values and updates existing rows`, async () => {
    products.clear();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Productos'], ['Nombre', 'Unidad', 'Ingrediente', 'Vencimiento', 'Proveedor', 'Categoría', 'Subcategoría', 'Control', 'Cultivo', 'Dosis', 'Ubicación', 'IGV'],
      ['Fertilizante orgánico', 'KG', 'Nitrógeno', 46200, 'Proveedor', 'Fertilizantes', '', 'Control', 'Maíz', '2 kg', 'A - B', 0.18],
    ]), 'Productos');
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: format });
    const upload = () => {
      const form = new FormData();
      form.append('file', new Blob([bytes]), `productos.${format}`);
      return http.post('/api/products/import', form, authorized());
    };
    const created = await upload();
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.data, { created: 1, updated: 0, errors: [] });
    const saved = products.get('Fertilizante orgánico');
    assert.equal(saved.unit, 'KG');
    assert.equal(saved.taxType, 'GRAVADO');
    assert.equal(saved.tracksLot, true);
    assert.deepEqual(saved.locations, ['A', 'B']);
    assert.deepEqual((await upload()).data.data, { created: 0, updated: 1, errors: [] });
  });
}

test('upload limits and malformed multipart requests return errors without crashing', async () => {
  const oversized = new FormData();
  oversized.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), 'too-large.xlsx');
  assert.equal((await http.post('/api/products/import', oversized, authorized())).status, 413);
  const malformed = await http.post('/api/products/import', 'invalid multipart', {
    headers: { ...authorized().headers, 'Content-Type': 'multipart/form-data' },
  });
  assert.equal(malformed.status, 400);
  assert.equal((await http.get('/api/auth/me', authorized())).status, 200);
});
