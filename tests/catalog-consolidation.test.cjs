require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CancelSaleUseCase } = require('../dist/application/use-cases/sale/cancel-sale.use-case');
const { MongoProductRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-product.repository');

test('cancelling a legacy sale restores the principal stock and preserves its original product reference', async () => {
  const item = { productId: 'bonus', companyId: 'company', quantity: 2 };
  const sale = { id: 'sale', isCancelled: false, isCredit: false, items: [item] };
  const products = {
    bonus: { id: 'bonus', name: 'Producto anterior BON', isActive: false, catalogImport: { deduplication: { inventoryConsolidated: true, canonicalProductId: 'normal' } } },
    normal: { id: 'normal', name: 'Producto normal', isActive: true, tracksLot: false },
  };
  const writes = [], movements = [];
  const useCase = new CancelSaleUseCase(
    { findById: async () => sale, update: async (_, data) => ({ ...sale, ...data }) },
    { findByProductAndCompany: async id => { assert.equal(id, 'normal'); return { quantity: 156 }; }, upsert: async (...args) => writes.push(args) },
    { findById: async id => products[id] }, {}, { findAll: async () => ({ data: [], total: 0 }) }, {},
    { execute: async data => movements.push(data) }, { hasSubmittedSale: async () => false },
  );
  await useCase.execute('sale', 'Error de registro', 'admin');
  assert.deepEqual(writes, [['normal', 'company', 2]]);
  assert.equal(movements[0].productId, 'normal');
  assert.deepEqual([movements[0].previousStock, movements[0].newStock], [156, 158]);
  assert.equal(sale.items[0].productId, 'bonus');
});

test('a missing principal prevents any partial inventory return', async () => {
  let writes = 0;
  const useCase = new CancelSaleUseCase(
    { findById: async () => ({ id:'sale', items:[{productId:'bonus'}] }) },
    { upsert: async () => writes++ },
    { findById: async id => id==='bonus' ? { catalogImport:{deduplication:{inventoryConsolidated:true,canonicalProductId:'missing'}} } : null },
    {}, {}, {}, {}, { hasSubmittedSale:async()=>false },
  );
  await assert.rejects(useCase.execute('sale','Error','admin'), /ficha principal/);
  assert.equal(writes, 0);
});

test('consolidated aliases cannot be reactivated through direct updates or imports', async () => {
  let updates = 0;
  const repository = new MongoProductRepository({
    findById: () => ({ lean: () => ({ exec: async () => ({ catalogImport: { deduplication: { inventoryConsolidated:true,canonicalSku:'NORMAL-01' } } }) }) }),
    findByIdAndUpdate: () => { updates++; throw Error('Must not update'); },
  });
  await assert.rejects(repository.update('bonus',{isActive:true}), /producto principal NORMAL-01/);
  assert.equal(updates, 0);
});

test('names containing package brackets and SKU punctuation are matched literally during duplicate checks', async () => {
  let query;
  const repository = new MongoProductRepository({ findOne: value => { query=value; return { lean: () => ({ exec: async () => null }) }; } });
  const name='TALARIN SC (1 L) [52353/BON.]';
  await repository.findByName(name);
  const match=query.$or[0].name;
  const pattern=new RegExp(match.$regex,match.$options);
  assert.equal(pattern.test(name),true);
  assert.equal(pattern.test(name.toLowerCase()),true);
  assert.equal(pattern.test('TALARIN SC 1 L 5'),false);
});

test('editing a product cannot rename it to an existing product or a previous catalog name', async () => {
  const { UpdateProductUseCase } = require('../dist/application/use-cases/product/update-product.use-case');
  let writes=0;
  const useCase=new UpdateProductUseCase({
    findById:async()=>({id:'current',name:'Producto actual'}),
    findByName:async()=>({id:'principal',name:'Producto principal'}),
    update:async()=>{writes++;},
  });
  await assert.rejects(useCase.execute('current',{name:'Nombre antiguo del principal'}),/Ya existe una ficha/);
  assert.equal(writes,0);
});
