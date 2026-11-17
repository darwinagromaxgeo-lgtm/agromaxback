const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { analyze, expiration, quantity, writeReview } = require('../scripts/prepare-sausal-inventory.cjs');

function workbook({ invalidHeader = false } = {}) {
  const book = XLSX.utils.book_new();
  for (let sheet = 1; sheet <= 5; sheet++) {
    const rows = [
      ['AGROMAX SAUSAL'], ['INVENTARIO'], ['Fecha: 22 / 09 / 2026'], [],
      ['Item', invalidHeader && sheet === 4 ? 'Desconocido' : 'Código / Nombre del Producto', 'Presentación', 'Ubicación', 'Lote', 'Fecha Vencimiento', 'Cantidad Física Real (Conteo)', 'Estado', 'Observaciones'],
    ];
    if (sheet === 1) rows.push(
      [1, 'Fuzzil', '1 Kg (10 sob)', 'T', '00250828', 'Mar. 28', '22 sobres', 'B', ''],
      [2, 'Fuzzil', '1 Kg (10 sob)', 'T', '00250828', 'Mar. 28', '01', 'B', ''],
    );
    else if (sheet === 2) rows.push([1, 'Haxan', '50 gr', 'T', '20240322', 'Marz. 26', '05', 'V', '']);
    else if (sheet === 3) rows.push([1, 'Yarda', '1 Kg', 'T', '231128', 'Agos. 26', '02', 'V', '']);
    else if (sheet === 4) rows.push([1, 'Producto deteriorado', '1 Lt', 'T', '-', '-', '2.5', 'D', 'Revisar empaque']);
    else rows.push([1, 'Producto vigente', '1 Lt', 'T', '0001', new Date('2027-11-30T00:00:00Z'), 3, 'B', '']);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), `LISTA ${sheet}`);
  }
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

test('conserva todas las hojas y los conteos incompatibles sin sumar sobres y cajas', () => {
  const plan = analyze(workbook(), '2026-11-17');
  assert.equal(plan.sheets.length, 5);
  assert.equal(plan.summary.sourceRows, 6);
  assert.equal(plan.summary.variants, 5);
  assert.equal(plan.summary.duplicateVariants, 1);
  assert.deepEqual(plan.records.slice(0, 2).map(row => [row.source, row.quantityRaw, row.quantityRead, row.quantityUnit]), [
    ['LISTA 1!6', '22 sobres', 22, 'SOBRES'], ['LISTA 1!7', '01', 1, ''],
  ]);
  assert.equal(plan.records[0].lot, '00250828');
  assert.ok(plan.records[0].issues.some(issue => issue.includes('no sumar')));
  assert.deepEqual(plan.candidates[0].sources, ['LISTA 1!6', 'LISTA 1!7']);
  assert.ok(plan.candidates[0].requiresCountReview);
  assert.equal(plan.summary.databaseWrites, 0);
  for (const candidate of plan.candidates) {
    for (const field of ['stockAvailable', 'taxType', 'salePrice', 'category', 'saleUnit']) assert.equal(candidate[field], null);
  }
  assert.equal(plan.summary.taxProvided, false);
  assert.equal(plan.summary.pricesProvided, false);
});

test('distingue vencimiento mensual y diario y detecta deteriorados sin asignar stock', () => {
  const plan = analyze(workbook(), '2026-11-17');
  assert.equal(plan.summary.markedExpired, 2);
  assert.equal(plan.summary.expiredByDate, 2);
  assert.equal(plan.summary.unparsedExpirations, 0);
  assert.deepEqual(expiration('Agos. 26'), { raw: 'Agos. 26', precision: 'MES', start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(expiration('Feb. 28'), { raw: 'Feb. 28', precision: 'MES', start: '2028-02-01', end: '2028-02-29' });
  assert.equal(plan.records.at(-1).expiry.precision, 'DIA');
  assert.equal(plan.records.at(-1).expiry.end, '2027-11-30');
  assert.equal(expiration('fecha ilegible').precision, 'REVISAR');
  assert.equal(expiration('-').precision, 'SIN DATO');
  assert.ok(plan.records[4].issues.some(issue => issue.includes('Marcado D')));
  assert.ok(plan.candidates[3].requiresCountReview);
});

test('no interpreta cantidades mixtas ni negativas y rechaza una fecha de revisión inválida', () => {
  for (const raw of ['2 cajas + 3 sobres', 'ilegible', -1, Infinity]) assert.ok(quantity(raw).error);
  assert.deepEqual(quantity('603 bolsas'), { value: 603, unit: 'BOLSAS' });
  assert.deepEqual(quantity('2,5'), { value: 2.5, unit: '' });
  assert.throws(() => analyze(workbook(), '2026-02-30'), /fecha de revisión/i);
  assert.throws(() => analyze(workbook({ invalidHeader: true }), '2026-11-17'), /LISTA 4/);
});

test('exporta una revisión con datos fiscales vacíos y toda la procedencia del inventario', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agromax-sausal-review-'));
  try {
    const plan = analyze(workbook(), '2026-11-17');
    const filename = writeReview(plan, directory);
    const book = XLSX.readFile(filename);
    const catalog = XLSX.utils.sheet_to_json(book.Sheets.Catalogo_para_completar, { defval: '' });
    const inventory = XLSX.utils.sheet_to_json(book.Sheets.Inventario_original);
    assert.equal(catalog.length, 5);
    assert.equal(inventory.length, 6);
    assert.equal(inventory[0]['Lote original'], '00250828');
    assert.equal(inventory[0]['Cantidad original'], '22 sobres');
    for (const row of catalog) {
      assert.equal(row['Sucursal destino'], 'Sausal');
      assert.equal(row['Afectación IGV (completar)'], '');
      assert.equal(row['Precio minorista (completar)'], '');
      assert.equal(row['Stock disponible confirmado (completar)'], '');
      assert.match(row['Estado de carga'], /NO IMPORTADO/);
    }
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json')));
    assert.equal(saved.workbookHash, plan.workbookHash);
    assert.deepEqual(saved.candidates[0].sources, plan.candidates[0].sources);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
