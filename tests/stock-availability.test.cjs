require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GetStockAvailabilityUseCase } = require('../dist/application/use-cases/stock/get-stock-availability.use-case');

function fixture() {
  const branches = [
    { id: 'ascope', code: 'ASC', name: 'Ascope', companyIds: ['company'], isActive: true },
    { id: 'paijan', code: 'PAI', name: 'Paiján', companyIds: ['company'], isActive: true },
    { id: 'sausal', code: 'SAU', name: 'Sausal', companyIds: ['company'], isActive: true },
    { id: 'inactive', code: 'OLD', name: 'Inactiva', companyIds: ['company'], isActive: false },
    { id: 'foreign', code: 'OTH', name: 'Otra empresa', companyIds: ['other'], isActive: true },
  ];
  const product = { id: 'product', name: 'Producto', unit: 'UND', isActive: true, prices: [
    { priceTierId: 'retail', price: 10 },
    { priceTierId: 'retail', companyId: 'company', price: 12 },
    { priceTierId: 'retail', companyId: 'company', branchId: 'paijan', price: 15 },
  ] };
  const service = new GetStockAvailabilityUseCase({ findAll: async () => branches }, { findById: async () => product }, { findAcrossBranches: async () => [{ branchId: 'sausal', quantity: 20 }] });
  return { service, branches };
}

test('branch consultation is available without selecting a product and excludes inactive or unrelated companies', async () => {
  const { service } = fixture();
  const branches = await service.listBranches('company', 'sausal');
  assert.deepEqual(branches.map(branch => branch.branchName), ['Ascope', 'Paiján', 'Sausal']);
  assert.deepEqual(branches.filter(branch => branch.isCurrent).map(branch => branch.branchId), ['sausal']);
  assert.ok(branches.every(branch => !('quantity' in branch)), 'An unselected product must not display invented zero quantities');
});
test('availability includes zero-stock branches and preserves prices specific to each branch', async () => {
  const { service } = fixture();
  const result = await service.execute('product', 'company', 'sausal');
  assert.deepEqual(result.branches.map(branch => branch.quantity), [0, 0, 20]);
  assert.deepEqual(result.branches.map(branch => branch.prices[0].price), [12, 15, 12]);
});
test('the branch list and stock query validate the active branch and company consistently', async () => {
  const { service } = fixture();
  for (const consult of [() => service.listBranches('other', 'sausal'), () => service.execute('product', 'other', 'sausal')]) await assert.rejects(consult, error => error.getStatus() === 400);
  for (const branch of ['missing', 'inactive']) await assert.rejects(() => service.listBranches('company', branch), error => error.getStatus() === 404);
});
