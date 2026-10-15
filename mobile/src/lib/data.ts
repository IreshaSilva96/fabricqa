// Master data reads (POs, batches, items, rolls). Read-only in the app.
// Timestamps become plain numbers (ms) so results can be cached as JSON on the phone.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { db } from './firebase';
import { cached } from './cache';

export type Batch = {
  batchNumber: string;
  poNumbers: string[];
  itemCount: number;
  rollCount: number;
  receivedDate: number;
};

export type Item = {
  itemId: string;
  batchNumber: string;
  poNumber: string;
  itemCode: string;
  fabricType: string;
  color: string;
  widthCm: number;
  rollCount: number;
  deadline: number | null; // from the item's PO
};

export type Roll = {
  rollNumber: string;
  supplierRollNumber: string;
  itemId: string;
  batchNumber: string;
  poNumber: string;
  fabricType: string;
  color: string;
  widthCm: number;
  lengthMeters: number;
};

export const toMillis = (value: any): number | null => (value?.toMillis ? value.toMillis() : null);

export function fetchDeadlines() {
  return cached<Record<string, number | null>>('deadlines', async () => Object.fromEntries(await poDeadlines()));
}

async function poDeadlines(): Promise<Map<string, number | null>> {
  const snap = await getDocs(collection(db, 'pos'));
  return new Map(snap.docs.map((d) => [d.id, toMillis(d.data().deadline)]));
}

const toItem = (d: any, deadlines: Map<string, number | null>): Item => ({
  itemId: d.itemId,
  batchNumber: d.batchNumber,
  poNumber: d.poNumber,
  itemCode: d.itemCode,
  fabricType: d.fabricType,
  color: d.color,
  widthCm: d.widthCm,
  rollCount: d.rollCount,
  deadline: deadlines.get(d.poNumber) ?? null,
});

export function fetchBatches() {
  return cached<Batch[]>('batches', async () => {
    const snap = await getDocs(query(collection(db, 'batches'), orderBy('receivedDate', 'desc')));
    return snap.docs.map((d) => {
      const b = d.data();
      return {
        batchNumber: b.batchNumber,
        poNumbers: b.poNumbers ?? [],
        itemCount: b.itemCount,
        rollCount: b.rollCount,
        receivedDate: toMillis(b.receivedDate) ?? 0,
      };
    });
  });
}

export function fetchItems(batchNumber: string) {
  return cached<Item[]>(`items:${batchNumber}`, async () => {
    const [snap, deadlines] = await Promise.all([
      getDocs(query(collection(db, 'items'), where('batchNumber', '==', batchNumber))),
      poDeadlines(),
    ]);
    return snap.docs.map((d) => toItem(d.data(), deadlines)).sort((a, b) => a.itemId.localeCompare(b.itemId));
  });
}

export function fetchItem(itemId: string) {
  return cached<Item | null>(`item:${itemId}`, async () => {
    const [snap, deadlines] = await Promise.all([getDoc(doc(db, 'items', itemId)), poDeadlines()]);
    return snap.exists() ? toItem(snap.data(), deadlines) : null;
  });
}

// Sorted on the phone: where() + orderBy() on different fields would need a Firestore index
export function fetchRolls(itemId: string) {
  return cached<Roll[]>(`rolls:${itemId}`, async () => {
    const snap = await getDocs(query(collection(db, 'rolls'), where('itemId', '==', itemId)));
    return snap.docs.map((d) => d.data() as Roll).sort((x, y) => x.rollNumber.localeCompare(y.rollNumber));
  });
}

export function fetchRoll(rollNumber: string) {
  return cached<Roll | null>(`roll:${rollNumber}`, async () => {
    const snap = await getDoc(doc(db, 'rolls', rollNumber));
    return snap.exists() ? (snap.data() as Roll) : null;
  });
}

// Finds a roll by internal number (R-1042-01-07, or just 1042-01-07) or supplier number (SUP-77812).
// Online: asks Firestore. Offline: searches the roll lists already saved on the phone.
export async function findRoll(term: string): Promise<Roll | null> {
  let q = term.trim().toUpperCase();
  if (!q) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) {
    const [batch, item, n] = q.split('-');
    q = `R-${batch}-${item.padStart(2, '0')}-${n.padStart(2, '0')}`;
  }

  const net = await NetInfo.fetch();
  if (net.isConnected && net.isInternetReachable !== false) {
    try {
      const byId = await getDoc(doc(db, 'rolls', q));
      if (byId.exists()) return byId.data() as Roll;
      const bySupplier = await getDocs(query(collection(db, 'rolls'), where('supplierRollNumber', '==', q), limit(1)));
      return bySupplier.empty ? null : (bySupplier.docs[0].data() as Roll);
    } catch {
      // fall through to the saved copies
    }
  }

  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('cache:rolls:'));
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    const rolls = (JSON.parse(raw).data ?? []) as Roll[];
    const hit = rolls.find((r) => r.rollNumber === q || r.supplierRollNumber === q);
    if (hit) return hit;
  }
  return null;
}
