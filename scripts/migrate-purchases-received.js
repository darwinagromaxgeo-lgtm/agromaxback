/**
 * Migración: marcar compras existentes como RECEIVED
 * Las compras creadas antes del nuevo flujo ya actualizaron el stock,
 * por lo que se marcan como recibidas completamente.
 *
 * Uso: node scripts/migrate-purchases-received.js
 */

const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fertilizantes';

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('✓ Conectado a MongoDB');

  const purchases = mongoose.connection.collection('purchases');

  // Marcar como RECEIVED todas las que no tienen receptionStatus
  const result = await purchases.updateMany(
    { receptionStatus: { $exists: false } },
    [
      {
        $set: {
          receptionStatus: 'RECEIVED',
          items: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $mergeObjects: ['$$item', { receivedQty: '$$item.quantity' }],
              },
            },
          },
        },
      },
    ],
  );

  console.log(`✓ ${result.modifiedCount} compras migradas a estado RECEIVED`);
  await mongoose.disconnect();
}

migrate().catch(err => { console.error('Error:', err); process.exit(1); });
