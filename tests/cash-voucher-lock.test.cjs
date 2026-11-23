const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditEntryUseCase } = require('../dist/application/use-cases/cash-register/edit-entry.use-case');

function fixture(overrides = {}) {
  const entry = { id: 'entry', type: 'INCOME', category: 'SALE', amount: 118, description: 'Venta', referenceId: 'sale', referenceType: 'Sale', voucherType: 'BOLETA', voucherSeries: 'BAG3', voucherNumber: '00000001', paymentMethodId: 'cash', paymentMethodName: 'Efectivo', isDeleted: false, editHistory: [], ...overrides };
  const writes = [];
  const register = { id: 'register', status: 'OPEN', entries: [entry] };
  const repository = { findById: async () => register, updateOpenEntry: async (...args) => { writes.push(args); return register; } };
  const methods = { findById: async id => ({ id, name: 'Efectivo', isActive: true }) };
  return { entry, writes, edit: new EditEntryUseCase(repository, methods), payload: { amount: entry.amount, reason: 'Corrección solicitada por el administrador' } };
}

test('linked receipts cannot change type, series or number, including clearing values, without a cash write', async () => {
  for (const source of [
    { referenceId: 'sale', referenceType: 'Sale', category: 'SALE' },
    { referenceId: 'credit', referenceType: 'CreditAccount', category: 'CREDIT_PAYMENT' },
    { referenceId: 'purchase', referenceType: 'Purchase', category: 'PURCHASE' },
    { referenceId: undefined, referenceType: undefined, category: 'SALE' },
    { referenceId: undefined, referenceType: undefined, category: 'CREDIT_PAYMENT' },
  ]) {
    for (const voucherType of ['NONE', 'BOLETA', 'FACTURA']) {
      const f = fixture({ ...source, voucherType });
      for (const changed of [
        { voucherType: voucherType === 'NONE' ? 'BOLETA' : 'NONE' },
        { voucherType: voucherType === 'FACTURA' ? 'BOLETA' : 'FACTURA' },
        { voucherSeries: 'FAG9' }, { voucherSeries: '' },
        { voucherNumber: '99999999' }, { voucherNumber: '' },
      ]) await assert.rejects(f.edit.execute('register', 'entry', { ...f.payload, ...changed }, 'admin'), /comprobante.*operación original/);
      assert.equal(f.writes.length, 0, 'Rejected changes must not update cash, revision or history');
      assert.equal(f.entry.voucherType, voucherType);
    }
  }
});

test('identifying a missing payment method retains the linked amount and unchanged voucher', async () => {
  const f = fixture({ paymentMethodId: undefined, paymentMethodName: undefined });
  await f.edit.execute('register', 'entry', { ...f.payload, paymentMethodId: 'cash', voucherType: 'BOLETA', voucherSeries: 'BAG3', voucherNumber: '00000001' }, 'admin');
  assert.equal(f.writes.length, 1);
  const update = f.writes[0][2];
  assert.equal(update.paymentMethodName, 'Efectivo');
  for (const field of ['amount', 'voucherType', 'voucherSeries', 'voucherNumber']) assert.equal(Object.hasOwn(update, field), false);
  assert.equal(update.$push.editHistory.previousAmount, 118);
  assert.equal(update.$push.editHistory.newAmount, 118);
});

test('source-linked amounts remain protected, including legacy sales without a reference id', async () => {
  for (const source of [{}, { referenceId: undefined, referenceType: undefined }, { category: 'PURCHASE', referenceType: 'Purchase' }]) {
    const f = fixture(source);
    await assert.rejects(f.edit.execute('register', 'entry', { ...f.payload, amount: 1 }, 'admin'), /monto.*operación vinculada/);
    assert.equal(f.writes.length, 0);
  }
});

test('a manual expense can still correct its supporting receipt with a required audit reason', async () => {
  const f = fixture({ category: 'OPERATING_EXPENSE', type: 'EXPENSE', referenceId: undefined, referenceType: undefined, voucherType: 'NONE', voucherSeries: undefined, voucherNumber: undefined });
  await f.edit.execute('register', 'entry', { ...f.payload, voucherType: 'FACTURA', voucherSeries: 'F001', voucherNumber: '00000012' }, 'admin');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][2].voucherType, 'FACTURA');
  assert.equal(f.writes[0][2].voucherSeries, 'F001');
  assert.equal(f.writes[0][2].voucherNumber, '00000012');
  assert.equal(f.writes[0][2].$push.editHistory.reason, f.payload.reason);
});
