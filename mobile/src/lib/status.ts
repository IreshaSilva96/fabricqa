// Turns plans and roll inspections into the words and tones shown on screen.
import type { Tone } from '../components/StatusChip';
import type { Plan, RollInspection } from './inspection';

export function itemStatus(plan: Plan | null | undefined, uid?: string): { label: string; tone: Tone } {
  if (!plan) return { label: 'NOT STARTED', tone: 'neutral' };
  switch (plan.status) {
    case 'in_progress':
      return plan.assigneeId === uid
        ? { label: `ROUND ${plan.currentRound} · YOU`, tone: 'progress' }
        : { label: `ROUND ${plan.currentRound} · ${plan.assigneeName.toUpperCase()}`, tone: 'progress' };
    case 'waiting':
      return { label: 'WAITING FOR SUPERVISOR', tone: 'warning' };
    case 'accepted':
      return { label: 'ACCEPTED', tone: 'pass' };
    case 'rejected':
      return { label: 'REJECTED', tone: 'fail' };
  }
}

export function rollStatus(ri: RollInspection | undefined): { label: string; tone: Tone } {
  if (!ri) return { label: 'NOT STARTED', tone: 'neutral' };
  if (ri.status === 'in_progress') return { label: 'IN PROGRESS', tone: 'progress' };
  return ri.result === 'pass'
    ? { label: `PASS · ${ri.score.toFixed(1)}`, tone: 'pass' }
    : { label: `FAIL · ${ri.score.toFixed(1)}`, tone: 'fail' };
}

// Dates are always MM/DD/YYYY and times 24-hour HH:MM, the same on every phone
const pad = (n: number) => String(n).padStart(2, '0');

export const dateOf = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

export const timeOf = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const dateTimeOf = (ms: number | null) => (ms ? `${dateOf(ms)} ${timeOf(ms)}` : '—');

// A batch's status comes from its items (spec): rejected if any item is rejected,
// needs decision if any is waiting, accepted when every item is accepted.
export function batchStatus(plans: Plan[], itemCount: number): { label: string; tone: Tone } {
  if (plans.some((p) => p.status === 'rejected')) return { label: 'REJECTED', tone: 'fail' };
  if (plans.some((p) => p.status === 'waiting')) return { label: 'NEEDS DECISION', tone: 'warning' };
  if (plans.length === itemCount && plans.every((p) => p.status === 'accepted')) return { label: 'ACCEPTED', tone: 'pass' };
  if (plans.length === 0) return { label: 'NOT STARTED', tone: 'neutral' };
  return { label: `IN PROGRESS · ${plans.filter((p) => p.status === 'accepted').length}/${itemCount} ITEMS DONE`, tone: 'progress' };
}
