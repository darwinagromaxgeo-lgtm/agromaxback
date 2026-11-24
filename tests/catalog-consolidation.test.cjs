require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoProductRepository } = require('../dist/infrastructure/database/mongodb/repositories/mongo-product.repository');

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
