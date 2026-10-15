// Inspection data: plans (one per item), roll inspections and defects.
// Roll and defect changes go through the offline outbox; reads merge the server copy (or the
// copy saved on the phone) with changes still waiting to upload, so the screens always show
// the inspector's latest work. Every upload is checked by the Firestore security rules.
import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { cached } from './cache';
import { Item, Roll, toMillis } from './data';
import { DefectLabel, Severity, severityFor } from './defects';
import { Prediction } from './inference';
import { cancelQueuedDefect, enqueue, getQueuedPhoto, pendingOps, QueuedDefect } from './outbox';
import { Evaluation, evaluateRound, pickRandom, pointsFor, Recommendation, rollPasses, rollScore, sampleSize } from './scoring';

export type Person = { uid: string; name: string };

export type PlanStatus = 'in_progress' | 'waiting' | 'accepted' | 'rejected';

export type RoundInfo = {
  round: number;
  kind: 'sample' | 'full';
  rolls: string[];
  assigneeId: string;
  assigneeName: string;
  assignedBy: string | null;   // supervisor name for escalated rounds; null for round 1
  startedAt: number;
  endedAt: number | null;
  evaluation: Evaluation | null;
  recommendation: Recommendation | null;
};

export type Decision = { outcome: 'accepted' | 'rejected'; decidedBy: string; decidedById: string; decidedAt: number; note: string };

export type Plan = {
  itemId: string;
  batchNumber: string;
  poNumber: string;
  fabricType: string;
  color: string;
  status: PlanStatus;
  currentRound: number;
  currentRolls: string[];      // rolls sampled for the current round
  inspectedRolls: string[];    // every roll sampled so far, so no roll is sampled twice
  assigneeId: string;
  assigneeName: string;
  rounds: RoundInfo[];
  decision: Decision | null;
  updatedAt: number;
};

export type RollInspection = {
  id: string;
  rollNumber: string;
  itemId: string;
  batchNumber: string;
  poNumber: string;
  round: number;
  inspectorId: string;
  inspectorName: string;
  status: 'in_progress' | 'ended';
  startedAt: number;
  endedAt: number | null;
  fabricType: string;
  color: string;
  widthCm: number;
  lengthMeters: number;
  defectCount: number;
  points: number;
  score: number;
  result: 'pass' | 'fail' | null;
  pending?: boolean;          // started or ended on this phone, not uploaded yet
};

export type Defect = {
  id: string;
  rollInspectionId: string;
  rollNumber: string;
  inspectorId: string;
  capturedAt: number;
  aiLabel: DefectLabel | null;
  aiConfidence: number | null;
  finalLabel: DefectLabel;
  severity: Severity;
  points: number;
  falseAlarm: boolean;
  overridden: boolean;
  positionMeters: number | null;
  pending?: boolean;          // saved on this phone, not uploaded yet
  aiPending?: boolean;        // captured offline; the AI checks it when it uploads
};

export const rollInspectionId = (itemId: string, round: number, rollNumber: string) => `${itemId}_${round}_${rollNumber}`;

// ---------- reads ----------

export function fetchPlan(itemId: string) {
  return cached<Plan | null>(`plan:${itemId}`, async () => {
    const snap = await getDoc(doc(db, 'inspectionPlans', itemId));
    return snap.exists() ? (snap.data() as Plan) : null;
  });
}

export function fetchPlansByBatch(batchNumber: string) {
  return cached<Record<string, Plan>>(`plans:${batchNumber}`, async () => {
    const snap = await getDocs(query(collection(db, 'inspectionPlans'), where('batchNumber', '==', batchNumber)));
    const result: Record<string, Plan> = {};
    snap.docs.forEach((d) => (result[d.id] = d.data() as Plan));
    return result;
  });
}

// Work currently assigned to this inspector ("Assigned to you" on Home)
export function fetchAssignedPlans(uid: string) {
  return cached<Plan[]>(`assigned:${uid}`, async () => {
    const snap = await getDocs(
      query(collection(db, 'inspectionPlans'), where('assigneeId', '==', uid), where('status', '==', 'in_progress'))
    );
    return snap.docs.map((d) => d.data() as Plan).sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

const toRollInspection = (id: string, d: any): RollInspection => ({
  ...d,
  id,
  startedAt: toMillis(d.startedAt) ?? (typeof d.startedAt === 'number' ? d.startedAt : 0),
  endedAt: toMillis(d.endedAt) ?? (typeof d.endedAt === 'number' ? d.endedAt : null),
});

const toDefect = (id: string, d: any): Defect => ({
  ...d,
  id,
  capturedAt: toMillis(d.capturedAt) ?? (typeof d.capturedAt === 'number' ? d.capturedAt : 0),
});

// Reads that also work with nothing saved yet (e.g. a roll started offline)
async function safe<T>(read: () => Promise<{ data: T }>, fallback: T): Promise<T> {
  try {
    return (await read()).data;
  } catch {
    return fallback;
  }
}

// Applies queued (not yet uploaded) roll starts and ends on top of what the server returned
function mergeRollInspection(ri: RollInspection | null, id: string): RollInspection | null {
  let result = ri;
  for (const op of pendingOps()) {
    if (op.kind === 'startRoll' && op.ri.id === id && !result) result = { ...op.ri, pending: true };
    if (op.kind === 'endRoll' && op.rollInspectionId === id && result) {
      result = {
        ...result, status: 'ended', endedAt: op.endedAt, defectCount: op.defectCount,
        points: op.points, score: op.score, result: op.result, pending: true,
      };
    }
  }
  return result;
}

const sortByPosition = (list: Defect[]) =>
  list.sort((a, b) => (a.positionMeters ?? Infinity) - (b.positionMeters ?? Infinity));

function mergeDefects(list: Defect[], riId: string): Defect[] {
  const ops = pendingOps();
  const deleted = new Set(ops.filter((o) => o.kind === 'deleteDefect').map((o) => (o as { defectId: string }).defectId));
  const result = list.filter((d) => !deleted.has(d.id));
  for (const op of ops) {
    if (op.kind === 'saveDefect' && op.defect.rollInspectionId === riId && !result.some((d) => d.id === op.defect.id)) {
      result.push({ ...op.defect, pending: true, aiPending: op.needsAi });
    }
  }
  return sortByPosition(result);
}

// ---------- reads ----------

export async function fetchRollInspections(itemId: string, round: number) {
  const base = await safe(
    () =>
      cached<Record<string, RollInspection>>(`ris:${itemId}:${round}`, async () => {
        const snap = await getDocs(query(collection(db, 'rollInspections'), where('itemId', '==', itemId), where('round', '==', round)));
        const result: Record<string, RollInspection> = {};
        snap.docs.forEach((d) => (result[d.data().rollNumber] = toRollInspection(d.id, d.data())));
        return result;
      }),
    {} as Record<string, RollInspection>
  );
  const merged: Record<string, RollInspection> = {};
  for (const [rollNumber, ri] of Object.entries(base)) merged[rollNumber] = toRollInspection(ri.id, ri);
  for (const op of pendingOps()) {
    if (op.kind === 'startRoll' && op.ri.itemId === itemId && op.ri.round === round && !merged[op.ri.rollNumber]) {
      merged[op.ri.rollNumber] = { ...op.ri, pending: true };
    }
  }
  for (const rollNumber of Object.keys(merged)) {
    merged[rollNumber] = mergeRollInspection(merged[rollNumber], merged[rollNumber].id)!;
  }
  return { data: merged };
}

export async function fetchRollInspection(id: string) {
  const base = await safe(
    () =>
      cached<RollInspection | null>(`ri:${id}`, async () => {
        const snap = await getDoc(doc(db, 'rollInspections', id));
        return snap.exists() ? toRollInspection(snap.id, snap.data()) : null;
      }),
    null
  );
  return { data: mergeRollInspection(base ? toRollInspection(id, base) : null, id) };
}

// Sorted by position along the roll; false alarms (no position) last
export async function fetchDefects(riId: string) {
  const base = await safe(
    () =>
      cached<Defect[]>(`defects:${riId}`, async () => {
        const snap = await getDocs(query(collection(db, 'defects'), where('rollInspectionId', '==', riId)));
        return snap.docs.map((d) => toDefect(d.id, d.data()));
      }),
    [] as Defect[]
  );
  return { data: mergeDefects(base.map((d) => toDefect(d.id, d)), riId) };
}

export async function fetchDefect(id: string) {
  const queued = pendingOps().find((o) => o.kind === 'saveDefect' && o.defect.id === id);
  if (queued && queued.kind === 'saveDefect') return { data: { ...queued.defect, pending: true, aiPending: queued.needsAi } as Defect };
  const base = await safe(
    () =>
      cached<Defect | null>(`defect:${id}`, async () => {
        const snap = await getDoc(doc(db, 'defects', id));
        return snap.exists() ? toDefect(snap.id, snap.data()) : null;
      }),
    null
  );
  return { data: base ? toDefect(id, base) : null };
}

// Photos are loaded only when a defect is opened (never in lists).
// A photo still waiting to upload is shown from the phone.
export async function fetchDefectPhoto(id: string): Promise<string | null> {
  const queued = await getQueuedPhoto(id);
  if (queued) return queued;
  const snap = await getDoc(doc(db, 'defectPhotos', id));
  return snap.exists() ? (snap.data().photo as string) : null;
}

// ---------- writes ----------

// Starts round 1 for an item: owner = this inspector, random 10% sample.
// A transaction makes sure only the first inspector can start it.
export async function startItemInspection(item: Item, inspector: Person): Promise<Plan> {
  const rollsSnap = await getDocs(query(collection(db, 'rolls'), where('itemId', '==', item.itemId)));
  const rollNumbers = rollsSnap.docs.map((d) => d.id);
  const sample = pickRandom(rollNumbers, sampleSize(rollNumbers.length));
  const now = Date.now();

  const plan: Plan = {
    itemId: item.itemId,
    batchNumber: item.batchNumber,
    poNumber: item.poNumber,
    fabricType: item.fabricType,
    color: item.color,
    status: 'in_progress',
    currentRound: 1,
    currentRolls: sample,
    inspectedRolls: sample,
    assigneeId: inspector.uid,
    assigneeName: inspector.name,
    rounds: [{
      round: 1, kind: 'sample', rolls: sample, assigneeId: inspector.uid, assigneeName: inspector.name,
      assignedBy: null, startedAt: now, endedAt: null, evaluation: null, recommendation: null,
    }],
    decision: null,
    updatedAt: now,
  };

  const ref = doc(db, 'inspectionPlans', item.itemId);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) throw new Error(`${existing.data().assigneeName} has already started this item.`);
    tx.set(ref, plan);
  });
  return plan;
}

// Starts a roll inspection on the phone; it uploads when there is a connection
export async function startRollInspection(plan: Plan, roll: Roll, inspector: Person): Promise<string> {
  const id = rollInspectionId(plan.itemId, plan.currentRound, roll.rollNumber);
  if ((await fetchRollInspection(id)).data) return id; // already started
  await enqueue({
    kind: 'startRoll',
    itemId: plan.itemId,
    ri: {
      id,
      rollNumber: roll.rollNumber,
      itemId: plan.itemId,
      batchNumber: plan.batchNumber,
      poNumber: plan.poNumber,
      round: plan.currentRound,
      inspectorId: inspector.uid,
      inspectorName: inspector.name,
      status: 'in_progress',
      startedAt: Date.now(),
      endedAt: null,
      // snapshot of the roll, so the record stays accurate if master data changes later
      fabricType: roll.fabricType,
      color: roll.color,
      widthCm: roll.widthCm,
      lengthMeters: roll.lengthMeters,
      defectCount: 0,
      points: 0,
      score: 0,
      result: null,
    },
  });
  return id;
}

export type NewDefect = {
  rollInspection: RollInspection;
  inspectorId: string;
  capturedAt: number;
  photoBase64: string;
  prediction: Prediction | null; // null when offline or the AI was unreachable: it checks later
  finalLabel: DefectLabel;
  positionMeters: number | null;
};

// Saves a defect and its photo on the phone; they upload together when there is a connection
export async function saveDefect(d: NewDefect): Promise<string> {
  const id = doc(collection(db, 'defects')).id; // generated on the phone, works offline
  const aiLabel = d.prediction?.label ?? null;
  const falseAlarm = d.finalLabel === 'defect_free';
  const defect: QueuedDefect = {
    id,
    rollInspectionId: d.rollInspection.id,
    rollNumber: d.rollInspection.rollNumber,
    itemId: d.rollInspection.itemId,
    batchNumber: d.rollInspection.batchNumber,
    inspectorId: d.inspectorId,
    capturedAt: d.capturedAt,
    aiLabel,
    aiConfidence: d.prediction?.confidence ?? null,
    needsManualCheck: d.prediction?.needsManualCheck ?? true,
    modelVersion: d.prediction?.modelVersion ?? null,
    finalLabel: d.finalLabel,
    severity: severityFor(d.finalLabel),
    points: pointsFor(d.finalLabel),
    falseAlarm,
    overridden: aiLabel !== null && d.finalLabel !== aiLabel,
    positionMeters: falseAlarm ? null : d.positionMeters,
  };
  await enqueue({
    kind: 'saveDefect', itemId: defect.itemId, defect, photoBase64: d.photoBase64,
    needsAi: d.prediction === null, aiAttempts: 0,
  });
  return id;
}

// Removes a defect captured by mistake (allowed only while the roll is in progress).
// If it hasn't uploaded yet, it is simply dropped from the queue.
export async function deleteDefect(defect: Defect): Promise<void> {
  if (await cancelQueuedDefect(defect.id)) return;
  const itemId = (defect as Defect & { itemId?: string }).itemId ?? defect.rollInspectionId.split('_')[0];
  await enqueue({ kind: 'deleteDefect', itemId, defectId: defect.id, rollInspectionId: defect.rollInspectionId });
}

// Scores the roll from its defects and locks it (on the phone first, uploaded when online)
export async function endRollInspection(ri: RollInspection, defects: Defect[]) {
  const points = defects.reduce((sum, d) => sum + d.points, 0);
  const score = rollScore(points, ri.lengthMeters, ri.widthCm);
  const result: 'pass' | 'fail' = rollPasses(score) ? 'pass' : 'fail';
  await enqueue({
    kind: 'endRoll', itemId: ri.itemId, rollInspectionId: ri.id, round: ri.round, rollNumber: ri.rollNumber,
    endedAt: Date.now(), defectCount: defects.filter((d) => !d.falseAlarm).length, points, score, result,
  });
  return { points, score, result };
}

// Ends the current round and records the app's recommendation for the supervisor
export async function endItemInspection(plan: Plan, rollInspections: RollInspection[]) {
  const current = plan.rounds.find((r) => r.round === plan.currentRound);
  const evaluation = evaluateRound(
    rollInspections.map((r) => ({ passed: r.result === 'pass', score: r.score })),
    plan.currentRound,
    current?.kind ?? 'sample'
  );
  const now = Date.now();
  const rounds = plan.rounds.map((r) =>
    r.round === plan.currentRound
      ? {
          ...r,
          endedAt: now,
          evaluation: {
            inspected: evaluation.inspected, failed: evaluation.failed,
            failRate: evaluation.failRate, avgScore: evaluation.avgScore,
          },
          recommendation: evaluation.recommendation,
        }
      : r
  );
  await updateDoc(doc(db, 'inspectionPlans', plan.itemId), { status: 'waiting', rounds, updatedAt: now });
  return evaluation;
}

