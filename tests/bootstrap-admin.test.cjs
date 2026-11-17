const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapAdminSettings } = require('../dist/infrastructure/config/bootstrap-admin.config');

test('production bootstrap requires a configured password and preserves its exact value', () => {
  assert.throws(() => bootstrapAdminSettings({ NODE_ENV: 'production' }), /BOOTSTRAP_ADMIN_PASSWORD/);
  assert.throws(() => bootstrapAdminSettings({ NODE_ENV: 'production', BOOTSTRAP_ADMIN_PASSWORD: 'admin123' }), /12 caracteres/);
  const password = 'test-only-password-2026';
  const result = bootstrapAdminSettings({ NODE_ENV: 'production', BOOTSTRAP_ADMIN_USERNAME: ' gerente ', BOOTSTRAP_ADMIN_PASSWORD: password });
  assert.equal(result.username, 'gerente'); assert.equal(result.password, password);
});
