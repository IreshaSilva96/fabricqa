// Supervisor data: all plans, item history, inspectors, and the four decisions.
import { collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from './firebase';
import { cached } from './cache';
import { toMillis } from './data';
import { Defect, Person, Plan, RollInspection, RoundInfo } from './inspection';
import { pickRandom, Risk, riskScore, sampleSize } from './scoring';

export type Action = 'escalate' | 'full' | 'accept' | 'reject';

export function fetchAllPlans() {
  return cached<Plan[]>('allPlans', async () => {
    const snap = await getDocs(collection(db, 'inspectionPlans'));
    return snap.docs.map((d) => d.data() as Plan);
  });
}

// Every roll inspection of an item, across all rounds (history)
export function fetchItemRollInspections(itemId: string) {
  return cached<RollInspection[]>(`itemRis:${itemId}`, async () => {
    const snap = await getDocs(query(collection(db, 'rollInspections'), where('itemId', '==', itemId)));
    return snap.docs
      .map((d) => {
        const data = d.data();
        return { ...data, id: d.id, startedAt: toMillis(data.startedAt) ?? 0, endedAt: toMillis(data.endedAt) } as RollInspection;
      })
      .sort((a, b) => a.round - b.round || a.rollNumber.localeCompare(b.rollNumber));
  });
}

export function fetchItemDefects(itemId: string) {
  return cached<Defect[]>(`itemDefects:${itemId}`, async () => {
    const snap = await getDocs(query(collection(db, 'defects'), where('itemId', '==', itemId)));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id, capturedAt: toMillis(d.data().capturedAt) ?? 0 }) as Defect);
  });
}

export function fetchInspectors() {
  return cached<Person[]>('inspectors', async () => {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'inspector')));
    return snap.docs.map((d) => ({ uid: d.id, name: d.data().name as string })).sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Combines every evaluated round of an item (each round's average weighted by its roll count)
export function planStats(plan: Plan, deadline: number | null) {
  const evaluated = plan.rounds.filter((r) => r.evaluation);
  const inspected = evaluated.reduce((s, r) => s + (r.evaluation?.inspected ?? 0), 0);
  const failed = evaluated.reduce((s, r) => s + (r.evaluation?.failed ?? 0), 0);
  const scoreSum = evaluated.reduce((s, r) => s + (r.evaluation?.avgScore ?? 0) * (r.evaluation?.inspected ?? 0), 0);
  const avgScore = inspected ? Math.round((scoreSum / inspected) * 10) / 10 : 0;
  const daysToDeadline = deadline === null ? null : Math.ceil((deadline - Date.now()) / 86400000);
  return { inspected, failed, avgScore, failRate: inspected ? failed / inspected : 0, daysToDeadline };
}

export function planRisk(plan: Plan, deadline: number | null): Risk {
  const s = planStats(plan, deadline);
  return riskScore(s.avgScore, s.failRate, s.daysToDeadline);
}

export const latestRound = (plan: Plan): RoundInfo | undefined => plan.rounds[plan.rounds.length - 1];

// Applies a supervisor decision. The transaction re-reads the plan, so if another supervisor
// decided first, this one is refused instead of overwriting it.
export async function decide(
  plan: Plan,
  action: Action,
  supervisor: Person,
  options: { assignee?: Person; note?: string; rollCount: number }
): Promise<void> {
  const ref = doc(db, 'inspectionPlans', plan.itemId);
  const now = Date.now();

  // Rolls not inspected yet (read before the transaction; master data doesn't change)
  let remaining: string[] = [];
  if (action === 'escalate' || action === 'full') {
    const rollsSnap = await getDocs(query(collection(db, 'rolls'), where('itemId', '==', plan.itemId)));
    const done = new Set(plan.inspectedRolls);
    remaining = rollsSnap.docs.map((d) => d.id).filter((r) => !done.has(r));
    if (remaining.length === 0) throw new Error('Every roll of this item has already been inspected.');
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as Plan | undefined;
    if (!current || current.status !== 'waiting') {
      throw new Error(
        current?.decision ? `Already decided by ${current.decision.decidedBy}.` : 'This item is no longer waiting for a decision.'
      );
    }

    if (action === 'accept' || action === 'reject') {
      tx.update(ref, {
        status: action === 'accept' ? 'accepted' : 'rejected',
        decision: {
          outcome: action === 'accept' ? 'accepted' : 'rejected',
          decidedBy: supervisor.name,
          decidedById: supervisor.uid,
          decidedAt: now,
          note: options.note?.trim() ?? '',
        },
        updatedAt: now,
      });
      return;
    }

    const assignee = options.assignee ?? { uid: current.assigneeId, name: current.assigneeName };
    const rolls = action === 'full' ? remaining : pickRandom(remaining, sampleSize(options.rollCount));
    const round = current.currentRound + 1;
    const newRound: RoundInfo = {
      round,
      kind: action === 'full' ? 'full' : 'sample',
      rolls,
      assigneeId: assignee.uid,
      assigneeName: assignee.name,
      assignedBy: supervisor.name,
      startedAt: now,
      endedAt: null,
      evaluation: null,
      recommendation: null,
    };
    tx.update(ref, {
      status: 'in_progress',
      currentRound: round,
      currentRolls: rolls,
      inspectedRolls: [...current.inspectedRolls, ...rolls],
      assigneeId: assignee.uid,
      assigneeName: assignee.name,
      rounds: [...current.rounds, newRound],
      updatedAt: now,
    });
  });
}
