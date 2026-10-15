// FabricQA seed script (v2: batches -> items -> rolls)
// ---------------------------------------------------
// In production, this master data comes from Dynamics 365 F&O: POs are raised there, and the
// internal roll numbers are generated when a GRN is posted. An Azure Logic App would sync it to
// Firestore every ~10 minutes. The app only READS master data.
//
// This script simulates that sync using the Firebase Admin SDK (which bypasses the security rules).
//
//   node seed.js           overwrite the master data (pos, batches, items, rolls)
//   node seed.js --reset   ALSO delete all inspection data (plans, roll inspections, defects, photos)
//                          - use before a clean demo; it cannot be undone

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

initializeApp({ credential: cert(require('./serviceAccountKey.json')) });
const db = getFirestore();

const RESET = process.argv.includes('--reset');
const INSPECTION_RATE = 0.10; // 10% of each item's rolls are sampled per round

const MASTER_COLLECTIONS = ['pos', 'batches', 'items', 'rolls'];
const INSPECTION_COLLECTIONS = [
  'inspectionPlans', 'rollInspections', 'defects', 'defectPhotos',
  'inspections', 'inspectionPhotos', // old test collections from before the redesign
];

const daysFromToday = (days) => {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return Timestamp.fromDate(d);
};

// Deadlines are relative to the day the script runs, so "due in N days" stays realistic for demos
const purchaseOrders = [
  { poNumber: 'PO-1001', supplier: 'Supplier A Textiles', deadline: daysFromToday(2) },
  { poNumber: 'PO-1002', supplier: 'Supplier B Mills', deadline: daysFromToday(9) },
  { poNumber: 'PO-1004', supplier: 'Supplier C Knits', deadline: daysFromToday(5) },
];

// One batch = one delivery. A batch can hold items from several POs.
const batches = [
  {
    batchNumber: 'B-1042', receivedDaysAgo: 1,
    items: [
      { poNumber: 'PO-1001', itemCode: 'CT-NVY-150', fabricType: 'Cotton twill', color: 'Navy', widthCm: 147, rollCount: 37 },
      { poNumber: 'PO-1002', itemCode: 'PP-WHT-145', fabricType: 'Poplin', color: 'White', widthCm: 145, rollCount: 20 },
    ],
  },
  {
    batchNumber: 'B-1047', receivedDaysAgo: 2,
    items: [
      { poNumber: 'PO-1002', itemCode: 'DN-IND-150', fabricType: 'Denim', color: 'Indigo', widthCm: 150, rollCount: 25 },
    ],
  },
  {
    batchNumber: 'B-1051', receivedDaysAgo: 0,
    items: [
      { poNumber: 'PO-1004', itemCode: 'JK-GRY-180', fabricType: 'Jersey knit', color: 'Grey', widthCm: 180, rollCount: 12 },
      { poNumber: 'PO-1001', itemCode: 'CT-BLK-150', fabricType: 'Cotton twill', color: 'Black', widthCm: 147, rollCount: 8 },
    ],
  },
];

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

async function writeInChunks(writes) {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    writes.slice(i, i + 450).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

async function main() {
  const toClear = RESET ? [...MASTER_COLLECTIONS, ...INSPECTION_COLLECTIONS] : MASTER_COLLECTIONS;
  for (const name of toClear) {
    const n = await deleteCollection(name);
    if (n) console.log(`Cleared ${n} documents from ${name}`);
  }

  const writes = [];
  const syncedAt = Timestamp.now();
  let supplierRollSeq = 77800;
  let itemTotal = 0;
  let rollTotal = 0;

  for (const po of purchaseOrders) {
    writes.push({ ref: db.collection('pos').doc(po.poNumber), data: { ...po, syncedAt } });
  }

  for (const b of batches) {
    const batchDigits = b.batchNumber.slice(2); // "B-1042" -> "1042"
    writes.push({
      ref: db.collection('batches').doc(b.batchNumber),
      data: {
        batchNumber: b.batchNumber,
        poNumbers: [...new Set(b.items.map((i) => i.poNumber))],
        itemCount: b.items.length,
        rollCount: b.items.reduce((sum, i) => sum + i.rollCount, 0),
        receivedDate: daysFromToday(-b.receivedDaysAgo),
        syncedAt,
      },
    });

    b.items.forEach((item, index) => {
      const itemId = `${b.batchNumber}-${String(index + 1).padStart(2, '0')}`; // e.g. B-1042-01
      itemTotal++;
      writes.push({
        ref: db.collection('items').doc(itemId),
        data: {
          itemId,
          batchNumber: b.batchNumber,
          poNumber: item.poNumber,
          itemCode: item.itemCode,
          fabricType: item.fabricType,
          color: item.color,
          widthCm: item.widthCm,
          rollCount: item.rollCount,
          inspectionRate: INSPECTION_RATE,
          syncedAt,
        },
      });

      for (let n = 1; n <= item.rollCount; n++) {
        // Internal roll number, e.g. R-1042-01-07 = batch 1042, item 01, roll 07
        const rollNumber = `R-${batchDigits}-${String(index + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
        rollTotal++;
        writes.push({
          ref: db.collection('rolls').doc(rollNumber),
          data: {
            rollNumber,
            supplierRollNumber: `SUP-${supplierRollSeq++}`,
            itemId,
            batchNumber: b.batchNumber,
            poNumber: item.poNumber,
            fabricType: item.fabricType,
            color: item.color,
            widthCm: item.widthCm - (n % 3),        // actual width varies slightly per roll
            lengthMeters: 40 + ((n * 7) % 21),      // 40-60 m, varied but repeatable
            syncedAt,
          },
        });
      }
    });
  }

  await writeInChunks(writes);
  console.log(
    `Seeded ${purchaseOrders.length} POs, ${batches.length} batches, ${itemTotal} items and ${rollTotal} rolls.` +
      (RESET ? ' All inspection data was cleared.' : '')
  );
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
