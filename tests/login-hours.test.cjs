require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { LoginUseCase } = require('../dist/application/use-cases/auth/login.use-case');

const user = {
  id: 'test-vendor', username: 'synthetic-seller', fullName: 'Vendedor sintético',
  password: bcrypt.hashSync('synthetic-password', 4), role: 'VENDEDOR', isActive: true,
  branchAssignments: [{ branchId: 'sausal-test', role: 'VENDEDOR' }],
};
const repository = account => ({ findByUsername: async username => username === account.username ? account : null });
const jwt = { sign: payload => JSON.stringify(payload) };

test('vendor login accepts 06:00–21:00 every day including Sunday in Peru and keeps assigned roles and branches', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T11:00:00Z') });
  const login = new LoginUseCase(repository(user), jwt);
  const cases = [
    ['2026-11-20T10:59:00Z', false], // Friday 05:59 Lima.
    ['2026-11-20T11:00:00Z', true],  // 06:00.
    ['2026-11-20T12:00:00Z', true],  // 07:00, previously blocked.
    ['2026-11-20T21:31:00Z', true],  // 16:31, previously blocked.
    ['2026-11-21T01:59:00Z', true],  // Friday 20:59 although UTC is Saturday.
    ['2026-11-21T02:00:00Z', true],  // Friday 21:00.
    ['2026-11-21T02:01:00Z', false], // Friday 21:01.
    ['2026-11-21T11:00:00Z', true],  // Saturday 06:00.
    ['2026-11-22T10:59:00Z', false], // Sunday 05:59 Lima.
    ['2026-11-22T11:00:00Z', true],  // Sunday 06:00.
    ['2026-11-22T15:00:00Z', true],  // Sunday 10:00.
    ['2026-11-23T02:00:00Z', true],  // Sunday 21:00 while UTC is Monday.
    ['2026-11-23T02:01:00Z', false], // Sunday 21:01.
    ['2026-11-23T11:00:00Z', true],  // Monday 06:00.
  ];
  for (const [instant, allowed] of cases) {
    context.mock.timers.setTime(new Date(instant).getTime());
    if (allowed) {
      const result = await login.execute(user.username, 'synthetic-password');
      assert.equal(result.user.role, 'VENDEDOR');
      assert.deepEqual(result.user.branchAssignments, user.branchAssignments);
      assert.equal(JSON.parse(result.accessToken).role, 'VENDEDOR');
    } else await assert.rejects(login.execute(user.username, 'synthetic-password'), /6:00 a\. m\. a 9:00 p\. m\./, instant);
  }
});

test('administrator login remains available outside vendor hours and credentials still apply', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-22T07:00:00Z') }); // Sunday 02:00 Lima.
  const admin = { ...user, role: 'ADMIN', branchAssignments: [] };
  const login = new LoginUseCase(repository(admin), jwt);
  assert.equal((await login.execute(admin.username, 'synthetic-password')).user.role, 'ADMIN');
  await assert.rejects(login.execute(admin.username, 'incorrect-password'), /Credenciales inválidas/);
  await assert.rejects(new LoginUseCase(repository({ ...admin, isActive: false }), jwt).execute(admin.username, 'synthetic-password'), /Credenciales inválidas/);
  await assert.rejects(login.execute('missing-user', 'synthetic-password'), /Credenciales inválidas/);
});
