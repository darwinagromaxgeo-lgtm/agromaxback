const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
const missing = value => value == null || ['', '-', 'S/L', 'S/F'].includes(normalize(value));
function dateOnly(value) { return value.toISOString().slice(0, 10); }
function expiration(value) {
  if (missing(value)) return { raw: String(value ?? ''), precision: 'SIN DATO' };
  if (value instanceof Date && Number.isFinite(value.getTime())) return { raw: dateOnly(value), precision: 'DIA', start: dateOnly(value), end: dateOnly(value) };
  const text = normalize(value).toLowerCase();
  const months = { en: 1, ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marz: 3, marzo: 3, ab: 4, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ag: 8, ago: 8, agos: 8, agosto: 8, set: 9, setiembre: 9, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 };
  const match = text.match(/^([a-z]+)[.\s\/-]*(\d{4}|\d{2})$/);
  if (match && months[match[1]]) {
    const month = months[match[1]];
    const year = Number(match[2]) + (match[2].length === 2 ? 2000 : 0);
    return { raw: String(value), precision: 'MES', start: `${year}-${String(month).padStart(2, '0')}-01`, end: dateOnly(new Date(Date.UTC(year, month, 0))) };
  }
  return { raw: String(value), precision: 'REVISAR' };
}
function quantity(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? { value, unit: '' } : { error: 'Cantidad numérica inválida' };
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(sobres?|caj(?:as?)?|bolsas?|sacos?|unidades?)?$/i);
  if (!match) return { error: 'Cantidad o combinación de unidades pendiente de interpretar' };
  const number = Number(match[1].replace(',', '.'));
  return { value: number, unit: match[2] ? normalize(match[2]) : '' };
}
function analyze(buffer, asOf = new Date().toISOString().slice(0, 10)) {
  const reviewDate = new Date(`${asOf}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(reviewDate.getTime()) || dateOnly(reviewDate) !== asOf) throw new Error('La fecha de revisión debe ser válida y tener formato YYYY-MM-DD');
  const book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const records = [];
  const groups = new Map();
  const sourceDate = '2026-09-22';
  const workbookHash = createHash('sha256').update(buffer).digest('hex');
  const sheets = [];
  for (const sheet of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1, defval: '' });
    if (!normalize(rows[4]?.[1]).includes('PRODUCTO') || !normalize(rows[4]?.[6]).includes('CANTIDAD')) throw new Error(`Encabezados no reconocidos en ${sheet}`);
    if (!String(rows[2]?.[0]).includes('22 / 09 / 2026')) throw new Error(`Verifica la fecha del inventario en ${sheet}`);
    let count = 0;
    rows.forEach((row, index) => {
      if (typeof row[0] !== 'number' || !String(row[1] ?? '').trim()) return;
      const name = String(row[1]).trim(); const presentation = String(row[2] ?? '').trim();
      const key = `${normalize(name)}|${normalize(presentation)}`;
      const expiry = expiration(row[5]); const amount = quantity(row[6]);
      const state = normalize(row[7]);
      const issues = [];
      if (missing(presentation)) issues.push('Falta presentación');
      if (missing(row[4])) issues.push('Sin lote informado');
      if (expiry.precision === 'SIN DATO') issues.push('Sin vencimiento informado');
      if (expiry.precision === 'REVISAR') issues.push('Vencimiento sin interpretar');
      if (expiry.precision === 'MES') issues.push('Vencimiento solo mes/año; no asignar un día exacto sin confirmación');
      if (state === 'V') issues.push('Marcado V: excluir de stock disponible para venta');
      if (state === 'D') issues.push('Marcado D: revisar deterioro antes de habilitar para venta');
      if (expiry.end && expiry.end < asOf) issues.push(`Vencido por fecha a ${asOf}`);
      if (!['B', 'D', 'V'].includes(state)) issues.push('Estado no reconocido');
      if (amount.error) issues.push(amount.error);
      if (amount.unit) issues.push('Confirmar unidad de conteo frente a presentación de venta');
      if (Number.isFinite(amount.value) && !Number.isInteger(amount.value)) issues.push('Cantidad fraccionada: confirmar unidad');
      if (String(row[8] ?? '').trim()) issues.push('Revisar observaciones de empaque o estado');
      const record = { key, source: `${sheet}!${index + 1}`, sheet, row: index + 1, item: row[0], name, presentation, location: String(row[3] ?? ''), lot: String(row[4] ?? ''), expiry, quantityRaw: String(row[6] ?? ''), quantityRead: amount.value, quantityUnit: amount.unit, state, notes: String(row[8] ?? ''), issues };
      records.push(record); count++;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    sheets.push({ name: sheet, records: count });
  }
  const candidates = [...groups].map(([key, rows], index) => {
    const first = rows[0];
    const duplicate = rows.length > 1;
    if (duplicate) rows.forEach(row => row.issues.push('Producto/presentación repetido: no sumar cantidades automáticamente'));
    return { key, importKey: `SAUSAL-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`, index: index + 1, name: first.name, presentation: first.presentation,
      proposedName: missing(first.presentation) ? first.name : `${first.name} — ${first.presentation}`,
      sources: rows.map(row => row.source), locations: [...new Set(rows.map(row => row.location).filter(Boolean))],
      requiresCountReview: duplicate || rows.some(row => row.quantityUnit || row.quantityRead === undefined || !Number.isInteger(row.quantityRead) || row.notes),
      stockAvailable: null, taxType: null, salePrice: null, category: null, saleUnit: null,
    };
  });
  return { sourceDate, asOf, workbookHash, branch: 'Sausal', sheets, records, candidates, summary: { sourceRows: records.length, variants: candidates.length,
    markedExpired: records.filter(row => row.state === 'V').length,
    expiredByDate: records.filter(row => row.expiry.end && row.expiry.end < asOf).length,
    duplicateVariants: candidates.filter(row => row.sources.length > 1).length,
    ambiguousCountRows: records.filter(row => row.quantityUnit || row.notes).length,
    unparsedExpirations: records.filter(row => row.expiry.precision === 'REVISAR').length,
    missingLots: records.filter(row => missing(row.lot)).length,
    missingExpirations: records.filter(row => row.expiry.precision === 'SIN DATO').length,
    pricesProvided: false, taxProvided: false, databaseWrites: 0,
  } };
}
function writeReview(plan, output) {
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const book = XLSX.utils.book_new();
  const catalog = plan.candidates.map(candidate => ({
    'Clave de carga': candidate.importKey, 'Sucursal destino': plan.branch, 'Nombre original': candidate.name, 'Presentación original': candidate.presentation,
    'Nombre propuesto': candidate.proposedName, 'Unidad de venta (completar)': '', 'Categoría (completar)': '', 'Afectación IGV (completar)': '',
    'Precio minorista (completar)': '', 'Precio especial (opcional)': '', 'Stock disponible confirmado (completar)': '',
    'Ubicaciones de origen': candidate.locations.join(' / '), 'Filas de origen': candidate.sources.join(' / '),
    'Revisar conteo': candidate.requiresCountReview ? 'SI' : '', 'Estado de carga': 'PENDIENTE DE DATOS; NO IMPORTADO',
  }));
  const inventory = plan.records.map(record => ({
    'Hoja': record.sheet, 'Fila': record.row, 'Item': record.item, 'Nombre': record.name, 'Presentación': record.presentation, 'Ubicación': record.location,
    'Lote original': record.lot, 'Vencimiento original': record.expiry.raw, 'Precisión de fecha': record.expiry.precision, 'Inicio de período (referencia)': record.expiry.start || '', 'Fin de período (referencia)': record.expiry.end || '',
    'Cantidad original': record.quantityRaw, 'Cantidad leída (NO stock asignado)': record.quantityRead ?? '', 'Unidad indicada en conteo': record.quantityUnit || '',
    'Estado original': record.state, 'Observaciones originales': record.notes, 'Incidencias': record.issues.join(' | '),
  }));
  const issues = inventory.filter(row => row.Incidencias);
  const summary = [
    ['Sucursal destino', plan.branch], ['Fecha del conteo físico', plan.sourceDate], ['Fecha de revisión', plan.asOf],
    ['Filas físicas originales', plan.summary.sourceRows], ['Productos/presentaciones candidatos', plan.summary.variants],
    ['Marcados V en el archivo', plan.summary.markedExpired], ['Con vencimiento anterior a la revisión', plan.summary.expiredByDate],
    ['Variantes con filas repetidas', plan.summary.duplicateVariants], ['Cantidades con unidad explícita u observaciones', plan.summary.ambiguousCountRows],
    ['Vencimientos no interpretados', plan.summary.unparsedExpirations], ['Sin lote informado', plan.summary.missingLots], ['Sin vencimiento informado', plan.summary.missingExpirations],
    ['Precios e IGV', 'NO FIGURAN EN EL ARCHIVO'], ['Stock', 'NO SE HA CARGADO; confirmar vigencia del conteo y unidades'],
    ['Productos existentes', 'NO MODIFICADOS'], ['Cantidad de escrituras a base de datos por esta preparación', 0],
    ['Duplicados', 'Conservar ambas filas para revisión; no sumar ni descartar automáticamente'],
    ['Vencimiento mes/año', 'Los límites de período son solo referencias. No se asignó un día exacto al lote.'],
    ['Archivo origen SHA-256', plan.workbookHash],
  ];
  for (const [name, rows] of [['Resumen', summary], ['Catalogo_para_completar', catalog], ['Inventario_original', inventory], ['Revisar', issues]]) {
    const sheet = name === 'Resumen' ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = Array.from({ length: name === 'Resumen' ? 2 : Object.keys(rows[0] || {}).length }, () => ({ wch: 26 }));
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  const filename = path.join(output, 'Agromax_Sausal_Revision_de_Carga.xlsx');
  XLSX.writeFile(book, filename); fs.chmodSync(filename, 0o600);
  fs.writeFileSync(path.join(output, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600 });
  return filename;
}
module.exports = { analyze, expiration, quantity, writeReview };
if (require.main === module) {
  const [input, output, asOf] = process.argv.slice(2);
  if (!input || !output) throw new Error('Uso: node scripts/prepare-sausal-inventory.cjs archivo.xlsx directorio-salida [YYYY-MM-DD]');
  const plan = analyze(fs.readFileSync(input), asOf);
  const filename = writeReview(plan, output);
  console.log(JSON.stringify({ ...plan.summary, sourceDate: plan.sourceDate, asOf: plan.asOf, workbook: filename }));
}
