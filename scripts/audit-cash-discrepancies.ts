/**
 * Auditoría de descuadres de caja.
 *
 * Para cada caja registradora de los últimos 30 días, compara:
 *   - Ingresos de caja (excluyendo eliminados)
 *   - Ventas del mismo día (excluyendo canceladas)
 *   - Pagos de créditos del mismo día
 *
 * Reporta diferencias y posibles causas (entradas editadas, manuales, etc.)
 *
 * Uso: npx ts-node scripts/audit-cash-discrepancies.ts
 */
import 'dotenv/config';
import { connect, disconnect, Schema, model } from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';
  await connect(uri);
  console.log(`Conectado a ${uri}\n`);

  const Sale = model('Sale', new Schema({}, { strict: false }), 'sales');
  const CashRegister = model('CashRegister', new Schema({}, { strict: false }), 'cash_registers');
  const CreditAccount = model('CreditAccount', new Schema({}, { strict: false }), 'credit_accounts');

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  const sinceDateStr = sinceDate.toISOString().split('T')[0]; // cash register stores date as 'YYYY-MM-DD' string

  const registers: any[] = await CashRegister.find({ date: { $gte: sinceDateStr } }).sort({ date: 1 }).lean();
  console.log(`Cajas registradoras encontradas: ${registers.length}\n`);

  const allSales: any[] = await Sale.find({ date: { $gte: sinceDate } }).lean();
  const allCredits: any[] = await CreditAccount.find({}).lean();

  // Index payments by date for quick lookup
  type PaymentRecord = { amount: number; date: Date; method: string; cashEntryId?: string };
  const allCreditPayments: PaymentRecord[] = [];
  for (const credit of allCredits) {
    for (const p of credit.payments || []) {
      allCreditPayments.push({
        amount: p.amount,
        date: new Date(p.paymentDate),
        method: p.paymentMethodName || '',
        cashEntryId: p.cashRegisterEntryId,
      });
    }
  }

  let totalDiscrepancy = 0;
  let daysWithDiscrepancy = 0;
  let editedEntriesGlobal = 0;
  let manualEntriesGlobal = 0;
  const flaggedDays: any[] = [];

  for (const register of registers) {
    // register.date is a 'YYYY-MM-DD' string. Build day window from it.
    const dayStart = new Date(`${register.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const activeEntries = (register.entries || []).filter((e: any) => !e.isDeleted);
    const cashIncome = activeEntries.filter((e: any) => e.type === 'INCOME').reduce((s: number, e: any) => s + e.amount, 0);
    const cashExpense = activeEntries.filter((e: any) => e.type === 'EXPENSE').reduce((s: number, e: any) => s + e.amount, 0);

    // Sales of this day (not cancelled, not on credit)
    const daySales = allSales.filter((s) => {
      const d = new Date(s.date);
      return d >= dayStart && d < dayEnd && !s.isCancelled && !s.isCredit;
    });
    const salesTotal = daySales.reduce((sum, s) => sum + (s.total || 0), 0);

    // Credit payments of this day
    const dayCreditPayments = allCreditPayments.filter((p) => p.date >= dayStart && p.date < dayEnd);
    const creditPaymentsTotal = dayCreditPayments.reduce((sum, p) => sum + p.amount, 0);

    // Manual entries: those without referenceId (created via Ingreso/Egreso button)
    const manualIncomes = activeEntries.filter((e: any) => e.type === 'INCOME' && !e.referenceId);
    const manualExpenses = activeEntries.filter((e: any) => e.type === 'EXPENSE' && !e.referenceId);
    const manualIncomeTotal = manualIncomes.reduce((s: number, e: any) => s + e.amount, 0);
    const manualExpenseTotal = manualExpenses.reduce((s: number, e: any) => s + e.amount, 0);

    // Edited entries
    const editedEntries = activeEntries.filter((e: any) => Array.isArray(e.editHistory) && e.editHistory.length > 0);

    // Expected income from automated sources
    const expectedAutoIncome = salesTotal + creditPaymentsTotal;
    const actualAutoIncome = cashIncome - manualIncomeTotal;
    const autoDiscrepancy = Math.round((actualAutoIncome - expectedAutoIncome) * 100) / 100;

    editedEntriesGlobal += editedEntries.length;
    manualEntriesGlobal += manualIncomes.length + manualExpenses.length;

    if (Math.abs(autoDiscrepancy) > 0.01 || editedEntries.length > 0) {
      daysWithDiscrepancy += autoDiscrepancy !== 0 ? 1 : 0;
      totalDiscrepancy += autoDiscrepancy;

      flaggedDays.push({
        date: register.date,
        registerId: register._id.toString(),
        status: register.status,
        opening: register.openingBalance || 0,
        cashIncome: Math.round(cashIncome * 100) / 100,
        cashExpense: Math.round(cashExpense * 100) / 100,
        salesTotal: Math.round(salesTotal * 100) / 100,
        creditPaymentsTotal: Math.round(creditPaymentsTotal * 100) / 100,
        manualIncomeTotal: Math.round(manualIncomeTotal * 100) / 100,
        manualExpenseTotal: Math.round(manualExpenseTotal * 100) / 100,
        expectedAutoIncome: Math.round(expectedAutoIncome * 100) / 100,
        actualAutoIncome: Math.round(actualAutoIncome * 100) / 100,
        autoDiscrepancy,
        editedEntriesCount: editedEntries.length,
        manualIncomesCount: manualIncomes.length,
        manualExpensesCount: manualExpenses.length,
        editedEntries: editedEntries.map((e: any) => ({
          id: e._id?.toString(),
          description: e.description,
          currentAmount: e.amount,
          editHistory: e.editHistory,
          referenceType: e.referenceType,
          referenceId: e.referenceId?.toString(),
        })),
      });
    }
  }

  console.log('========================================');
  console.log('         RESUMEN GLOBAL');
  console.log('========================================');
  console.log(`Cajas analizadas: ${registers.length}`);
  console.log(`Días con descuadre o ediciones: ${flaggedDays.length}`);
  console.log(`Días con sobrante/faltante real: ${daysWithDiscrepancy}`);
  console.log(`Descuadre total acumulado: S/ ${totalDiscrepancy.toFixed(2)} ${totalDiscrepancy > 0 ? '(SOBRANTE)' : totalDiscrepancy < 0 ? '(FALTANTE)' : ''}`);
  console.log(`Entradas editadas en total: ${editedEntriesGlobal}`);
  console.log(`Entradas manuales en total: ${manualEntriesGlobal}`);
  console.log('');

  if (flaggedDays.length === 0) {
    console.log('✅ Sin descuadres detectados ni entradas editadas en los últimos 30 días.\n');
  } else {
    console.log('========================================');
    console.log('         DETALLE POR DÍA');
    console.log('========================================');
    for (const day of flaggedDays) {
      console.log(`\n📅 ${day.date}  [${day.status}]`);
      console.log(`   Apertura: S/ ${day.opening}`);
      console.log(`   Caja - ingresos: S/ ${day.cashIncome} | egresos: S/ ${day.cashExpense}`);
      console.log(`   Ventas contado del día: S/ ${day.salesTotal}`);
      console.log(`   Pagos de créditos del día: S/ ${day.creditPaymentsTotal}`);
      console.log(`   Manual ingresos: S/ ${day.manualIncomeTotal} (${day.manualIncomesCount} entradas)`);
      console.log(`   Manual egresos: S/ ${day.manualExpenseTotal} (${day.manualExpensesCount} entradas)`);
      console.log(`   Esperado automático: S/ ${day.expectedAutoIncome}`);
      console.log(`   Real automático: S/ ${day.actualAutoIncome}`);
      const diffLabel = day.autoDiscrepancy > 0 ? '⬆️ SOBRANTE' : day.autoDiscrepancy < 0 ? '⬇️ FALTANTE' : '✓ OK';
      console.log(`   ${diffLabel}: S/ ${day.autoDiscrepancy.toFixed(2)}`);

      if (day.editedEntriesCount > 0) {
        console.log(`   ✏️  Entradas editadas: ${day.editedEntriesCount}`);
        for (const e of day.editedEntries) {
          console.log(`      - "${e.description}" → monto actual S/ ${e.currentAmount}`);
          console.log(`        ref: ${e.referenceType || 'manual'} ${e.referenceId || ''}`);
          for (const h of e.editHistory) {
            console.log(`        editado: S/ ${h.previousAmount} → S/ ${h.newAmount} | razón: ${h.reason} | por: ${h.editedBy || '?'}`);
          }
        }
      }
    }
  }

  await disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
