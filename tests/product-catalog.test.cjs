require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { productCatalogPendingFields } = require('../dist/application/services/product-catalog-readiness');
const { UpdateProductUseCase } = require('../dist/application/use-cases/product/update-product.use-case');
const { CreateSaleUseCase } = require('../dist/application/use-cases/sale/create-sale.use-case');
const { MongoProductRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-product.repository');
const { UpdateProductDto } = require('../dist/application/dtos/product/update-product.dto');

const pending = () => ({ id: 'product', name: 'Producto importado', categoryId: 'pending-category', unit: 'PENDIENTE', taxType: 'PENDIENTE', catalogStatus: 'PENDING_REVIEW', isActive: true, prices: [], catalogImport: { branchId: 'sausal', pendingCategoryId: 'pending-category' } });

test('el catálogo conserva los pendientes y exige precio de la sucursal, unidad e IGV conocidos', () => {
  const product = pending();
  assert.deepEqual(productCatalogPendingFields(product), ['afectación de IGV', 'unidad de venta', 'precio de venta', 'categoría']);
  const ready = { ...product, categoryId: 'fertilizantes', unit: 'Saco', taxType: 'EXONERADO', prices: [{ priceTierId: 'minorista', branchId: 'sausal', price: 10 }] };
  assert.deepEqual(productCatalogPendingFields(ready), []);
  assert.deepEqual(productCatalogPendingFields({ ...ready, prices: [{ branchId: 'central', price: 10 }] }), ['precio de venta']);
  assert.deepEqual(productCatalogPendingFields({ ...ready, prices: [{ price: 0 }] }), ['precio de venta']);
});

test('editar nombre o imagen no habilita venta; completar datos sí, y quitar un precio vuelve a bloquear', async () => {
  let product = pending();
  const useCase = new UpdateProductUseCase({ findById: async () => structuredClone(product), findByName: async () => null, update: async (_, change) => (product = { ...product, ...change }) });
  await useCase.execute('product', { name: 'Nombre revisado' });
  assert.equal(product.catalogStatus, 'PENDING_REVIEW');
  await useCase.execute('product', { categoryId: 'fertilizantes', unit: 'Saco', taxType: 'GRAVADO', prices: [{ priceTierId: 'minorista', price: 20 }] });
  assert.equal(product.catalogStatus, 'READY');
  await useCase.execute('product', { prices: [] });
  assert.equal(product.catalogStatus, 'PENDING_REVIEW');
  assert.ok(product.catalogImport);
});

test('la API acepta IGV pendiente en productos sin extender los tipos tributarios de comprobantes', async () => {
  assert.equal((await validate(plainToInstance(UpdateProductDto, { taxType: 'PENDIENTE' }))).length, 0);
  assert.ok((await validate(plainToInstance(UpdateProductDto, { taxType: 'DESCONOCIDO' }))).length > 0);
});

test('ventas rechaza productos demo desactivados y fichas pendientes antes de tocar stock o caja', async () => {
  for (const product of [{ ...pending(), isActive: false }, pending(), { ...pending(), catalogStatus: 'READY' }]) {
    const fail = async () => { throw new Error('Se accedió a stock/caja para un producto bloqueado'); };
    const useCase = new CreateSaleUseCase({ create: fail }, { findByProductAndCompany: fail }, { findById: async () => product }, { findByProductAndCompany: fail }, {}, {}, {}, {}, {}, {}, {}, {});
    await assert.rejects(useCase.execute({ items: [{ productId: 'product', companyId: 'agromax', quantity: 1, unitPrice: 1 }], payments: [{ paymentMethodId: 'cash', amount: 1 }] }, 'admin', 'sausal'), /desactivado|Completa el precio/);
  }
});

test('la consulta de POS filtra pendientes en el servidor sin alterar el catálogo administrativo', async () => {
  const queries = [];
  const chain = result => ({ collation() { return this; }, skip() { return this; }, limit() { return this; }, sort() { return this; }, lean() { return this; }, async exec() { return result; } });
  const repo = new MongoProductRepository({ find(query) { queries.push(query); return chain([]); }, countDocuments() { return chain(0); } });
  await repo.findAll({ sellableOnly: true }, 1, 20);
  assert.deepEqual(queries[0].catalogStatus, { $ne: 'PENDING_REVIEW' });
  assert.deepEqual(queries[0].taxType, { $ne: 'PENDIENTE' });
  await repo.findAll({}, 1, 20);
  assert.equal(queries[1].catalogStatus, undefined);
});
