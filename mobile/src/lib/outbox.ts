// Offline queue ("outbox"). Every inspector change is saved on the phone first and uploaded
// in order when there is a connection, so inspecting never depends on the network.
//
//   enqueue(op) -> saved to phone storage -> processQueue() uploads it when online
//
// Uploads are idempotent (each op checks whether it already reached the server), so a
// connection dropping halfway never creates duplicates.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { setCached, updateCached } from './cache';
import { classify } from './inference';
import type { DefectLabel, Severity } from './defects';

const STORAGE_KEY = 'outbox:v1';
const photoKey = (defectId: string) => `outbox:photo:${defectId}`;
const MAX_AI_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 15000;

// What a queued roll inspection looks like (times in ms)
export type QueuedRollInspection = {
  id: string; rollNumber: string; itemId: string; batchNumber: string; poNumber: string; round: number;
  inspectorId: string; inspectorName: string; status: 'in_progress' | 'ended';
  startedAt: number; endedAt: number | null;
  fabricType: string; color: string; widthCm: number; lengthMeters: number;
  defectCount: number; points: number; score: number; result: 'pass' | 'fail' | null;
};

// What a queued defect looks like (the Firestore fields, with capturedAt in ms)
export type QueuedDefect = {
  id: string; rollInspectionId: string; rollNumber: string; itemId: string; batchNumber: string;
  inspectorId: string; capturedAt: number;
  aiLabel: DefectLabel | null; aiConfidence: number | null; needsManualCheck: boolean; modelVersion: string | null;
  finalLabel: DefectLabel; severity: Severity; points: number; falseAlarm: boolean; overridden: boolean;
  positionMeters: number | null;
};

export type Op =
  | { opId: string; kind: 'startRoll'; itemId: string; ri: QueuedRollInspection }
  | { opId: string; kind: 'saveDefect'; itemId: string; defect: QueuedDefect; photoBase64: string; needsAi: boolean; aiAttempts: number }
  | { opId: string; kind: 'deleteDefect'; itemId: string; defectId: string; rollInspectionId: string }
  | {
      opId: string; kind: 'endRoll'; itemId: string; rollInspectionId: string; round: number; rollNumber: string;
      endedAt: number; defectCount: number; points: number; score: number; result: 'pass' | 'fail';
    };

// The same shapes without opId (it is added when queued); spread over each kind of change
type WithoutId<T> = T extends unknown ? Omit<T, 'opId'> : never;
export type NewOp = WithoutId<Op>;

export type FailedOp = { op: Op; error: string; at: number };
export type SyncSnapshot = { pending: number; failed: number; syncing: boolean };

let queue: Op[] = [];
let failed: FailedOp[] = [];
let syncing = false;
let loaded = false;
let snapshot: SyncSnapshot = { pending: 0, failed: 0, syncing: false };
const listeners = new Set<() => void>();

const newOpId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function notify() {
  snapshot = { pending: queue.length, failed: failed.length, syncing };
  listeners.forEach((l) => l());
}

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, failed }));
  notify();
}

async function ensureLoaded() {
  if (loaded) return;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    queue = saved.queue ?? [];
    failed = saved.failed ?? [];
  }
  loaded = true;
  notify();
}

// ---------- public API ----------

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = () => snapshot;
export const pendingOps = (): Op[] => [...queue];
export const failedOps = (): FailedOp[] => [...failed];
export const pendingForItem = (itemId: string) => queue.filter((o) => o.itemId === itemId).length;

// Called once when the app starts: load the queue, then sync whenever the app
// comes back online or back to the foreground.
let started = false;
export async function startOutbox() {
  if (started) return;
  started = true;
  await ensureLoaded();
  NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) processQueue();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') processQueue();
  });
  processQueue();
}

export async function enqueue(op: NewOp): Promise<void> {
  await ensureLoaded();
  if (op.kind === 'saveDefect') {
    // The photo is stored under its own key; the queue only keeps a small record
    await AsyncStorage.setItem(photoKey(op.defect.id), op.photoBase64);
    op = { ...op, photoBase64: '' };
  }
  queue.push({ ...op, opId: newOpId() } as Op);
  await persist();
  processQueue();
}

// A defect captured and then deleted before it was uploaded never needs to reach the server
export async function cancelQueuedDefect(defectId: string): Promise<boolean> {
  await ensureLoaded();
  const before = queue.length;
  queue = queue.filter((o) => !(o.kind === 'saveDefect' && o.defect.id === defectId));
  if (queue.length === before) return false;
  await AsyncStorage.removeItem(photoKey(defectId));
  await persist();
  return true;
}

export async function retryFailed() {
  await ensureLoaded();
  queue = [...failed.map((f) => f.op), ...queue];
  failed = [];
  await persist();
  processQueue();
}

export async function discardFailed() {
  for (const f of failed) if (f.op.kind === 'saveDefect') await AsyncStorage.removeItem(photoKey(f.op.defect.id));
  failed = [];
  await persist();
}

export const getQueuedPhoto = (defectId: string) => AsyncStorage.getItem(photoKey(defectId));

// ---------- the sync loop ----------

const PERMANENT = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'already-exists'];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)),
  ]);
}

export async function processQueue(): Promise<void> {
  await ensureLoaded();
  if (syncing || queue.length === 0 || !auth.currentUser) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) return;

  syncing = true;
  notify();
  try {
    while (queue.length > 0) {
      const op = queue[0];
      try {
        // A deferred AI check may wait for the free server to wake up (~1 min), so it gets longer
        const ms = op.kind === 'saveDefect' && op.needsAi ? 75000 : UPLOAD_TIMEOUT_MS;
        const keep = await withTimeout(run(op), ms);
        if (keep === 'retry-later') break; // e.g. AI server still waking up
        queue.shift();
        await persist();
      } catch (e: any) {
        if (PERMANENT.includes(e?.code)) {
          // The server refused it (e.g. the item was reassigned). Park it so the rest can sync.
          failed.push({ op, error: e?.message ?? String(e), at: Date.now() });
          queue.shift();
          await persist();
        } else {
          break; // connection problem: try again on the next trigger
        }
      }
    }
  } finally {
    syncing = false;
    notify();
  }
}

// Uploads one change. Each case first checks whether it already reached the server.
async function run(op: Op): Promise<'done' | 'retry-later'> {
  switch (op.kind) {
    case 'startRoll': {
      const ref = doc(db, 'rollInspections', op.ri.id);
      if (!(await getDoc(ref)).exists()) {
        const { id, ...fields } = op.ri;
        await setDoc(ref, {
          ...fields,
          startedAt: Timestamp.fromMillis(fields.startedAt),
          endedAt: null,
          syncedAt: serverTimestamp(),
        });
      }
      await setCached(`ri:${op.ri.id}`, op.ri);
      await updateCached<Record<string, QueuedRollInspection>>(`ris:${op.ri.itemId}:${op.ri.round}`, (m) => ({ ...m, [op.ri.rollNumber]: op.ri }));
      return 'done';
    }

    case 'saveDefect': {
      const ref = doc(db, 'defects', op.defect.id);
      if ((await getDoc(ref)).exists()) {
        await AsyncStorage.removeItem(photoKey(op.defect.id));
        return 'done';
      }

      // Captured offline: ask the AI now, so its suggestion is recorded for the accuracy figures.
      // The inspector's own decision (finalLabel) is never changed.
      const photo = (await AsyncStorage.getItem(photoKey(op.defect.id))) ?? '';
      let d = op.defect;
      if (op.needsAi) {
        try {
          const p = await classify(photo, 60000);
          d = {
            ...d,
            aiLabel: p.label,
            aiConfidence: p.confidence,
            needsManualCheck: p.needsManualCheck,
            modelVersion: p.modelVersion,
            overridden: d.finalLabel !== p.label,
          };
        } catch {
          op.aiAttempts += 1;
          if (op.aiAttempts < MAX_AI_ATTEMPTS) {
            await persist();
            return 'retry-later';
          }
          // AI unreachable after several tries: upload without an AI suggestion
        }
      }

      const { id, ...fields } = d;
      const batch = writeBatch(db);
      batch.set(ref, { ...fields, capturedAt: Timestamp.fromMillis(fields.capturedAt), syncedAt: serverTimestamp() });
      batch.set(doc(db, 'defectPhotos', id), { defectId: id, inspectorId: d.inspectorId, photo });
      await batch.commit();
      await AsyncStorage.removeItem(photoKey(id));
      await updateCached<QueuedDefect[]>(`defects:${d.rollInspectionId}`, (list) => [...list.filter((x) => x.id !== id), d]);
      await setCached(`defect:${id}`, d);
      return 'done';
    }

    case 'deleteDefect': {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'defects', op.defectId));
      batch.delete(doc(db, 'defectPhotos', op.defectId));
      await batch.commit();
      await updateCached<QueuedDefect[]>(`defects:${op.rollInspectionId}`, (list) => list.filter((x) => x.id !== op.defectId));
      return 'done';
    }

    case 'endRoll': {
      const ref = doc(db, 'rollInspections', op.rollInspectionId);
      const snap = await getDoc(ref);
      const result = {
        status: 'ended' as const, endedAt: op.endedAt, defectCount: op.defectCount,
        points: op.points, score: op.score, result: op.result,
      };
      if (snap.exists() && snap.data().status !== 'ended') {
        await updateDoc(ref, { ...result, endedAt: Timestamp.fromMillis(op.endedAt) });
      }
      await updateCached<QueuedRollInspection>(`ri:${op.rollInspectionId}`, (ri) => ({ ...ri, ...result }));
      await updateCached<Record<string, QueuedRollInspection>>(`ris:${op.itemId}:${op.round}`, (m) =>
        m[op.rollNumber] ? { ...m, [op.rollNumber]: { ...m[op.rollNumber], ...result } } : m
      );
      return 'done';
    }
  }
}
