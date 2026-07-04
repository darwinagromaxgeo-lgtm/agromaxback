/**
 * Diagnóstico: encuentra sale items cuyo `product` referencia a un producto
 * que ya no existe en la colección `products`.
 *
 * Uso: npx ts-node scripts/find-orphan-products.ts
 */
import 'dotenv/config';
import { connect, disconnect, Schema, model, Types } from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';
  await connect(uri);
  console.log(`Conectado a ${uri}\n`);

  const Sale = model('Sale', new Schema({}, { strict: false }), 'sales');
  const Product = model('Product', new Schema({}, { strict: false }), 'products');

  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const sales: any[] = await Sale.find({ date: { $gte: monthAgo } }).lean();
  console.log(`Ventas del último mes: ${sales.length}\n`);

  // Recolectar todos los productIds únicos referenciados en items
  const refIds = new Set<string>();
  const itemsWithoutProduct: any[] = [];

  for (const s of sales) {
    if (s.isCancelled) continue;
    for (const item of s.items || []) {
      if (!item.product) {
        itemsWithoutProduct.push({ saleId: s._id, item });
        continue;
      }
      refIds.add(item.product.toString());
    }
  }

  // Verificar cuáles existen
  const existing: any[] = await Product.find({ _id: { $in: Array.from(refIds).map((id) => new Types.ObjectId(id)) } }, { _id: 1, name: 1 }).lean();
  const existingIds = new Set(existing.map((p) => p._id.toString()));

  const orphans = Array.from(refIds).filter((id) => !existingIds.has(id));

  console.log('=== RESULTADO ===');
  console.log(`Productos referenciados únicos: ${refIds.size}`);
  console.log(`Productos existentes: ${existingIds.size}`);
  console.log(`Productos HUÉRFANOS (eliminados): ${orphans.length}`);
  console.log(`Items SIN campo product: ${itemsWithoutProduct.length}\n`);

  if (orphans.length > 0) {
    console.log('--- Productos huérfanos ---');
    for (const orphanId of orphans) {
      const matchingSales = sales.filter((s) => !s.isCancelled && s.items?.some((i: any) => i.product?.toString() === orphanId));
      const totalQty = matchingSales.reduce((sum, s) => sum + s.items.filter((i: any) => i.product?.toString() === orphanId).reduce((a: number, i: any) => a + i.quantity, 0), 0);
      const totalRev = matchingSales.reduce((sum, s) => sum + s.items.filter((i: any) => i.product?.toString() === orphanId).reduce((a: number, i: any) => a + i.subtotal, 0), 0);
      console.log(`\n  productId: ${orphanId}`);
      console.log(`  ventas en el mes: ${matchingSales.length}`);
      console.log(`  cantidad total: ${totalQty}`);
      console.log(`  revenue total: S/${totalRev}`);
      console.log(`  primeras 3 ventas:`);
      matchingSales.slice(0, 3).forEach((s) => {
        console.log(`    - saleId=${s._id}, fecha=${s.date}, total=${s.total}, voucher=${s.voucherType}, client=${s.client}`);
      });
    }
  }

  if (itemsWithoutProduct.length > 0) {
    console.log('\n--- Items sin campo product (primeros 5) ---');
    itemsWithoutProduct.slice(0, 5).forEach(({ saleId, item }) => {
      console.log(`  saleId=${saleId}, item=${JSON.stringify(item)}`);
    });
  }

  await disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
