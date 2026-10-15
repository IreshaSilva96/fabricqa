// The constraint algorithms: sampling, roll scoring and round evaluation.
// Pure functions (no Firebase), so they are easy to test and to explain.
import {
  ESCALATION_FAIL_RATE, INSPECTION_RATE, MAX_AUTO_ROUNDS, POINTS, RISK_URGENCY, RISK_WEIGHTS, ROLL_FAIL_SCORE,
} from './config';
import { DefectLabel, severityFor } from './defects';

export const pointsFor = (label: DefectLabel): number => POINTS[severityFor(label)];

// 4-point system: points per 100 square yards = points x 3600 / (length in yd x width in in)
export function rollScore(points: number, lengthMeters: number, widthCm: number): number {
  const yards = lengthMeters * 1.0936133;
  const inches = widthCm * 0.3937008;
  if (yards <= 0 || inches <= 0) return 0;
  return Math.round(((points * 3600) / (yards * inches)) * 10) / 10;
}

export const rollPasses = (score: number): boolean => score <= ROLL_FAIL_SCORE;

// 10% of the item's rolls, rounded up, at least 1
export const sampleSize = (rollCount: number): number => Math.max(1, Math.ceil(rollCount * INSPECTION_RATE));

// Fisher-Yates shuffle, then take the first n: every roll has the same chance of being picked
export function pickRandom<T>(pool: T[], n: number): T[] {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

export type Recommendation = 'accept' | 'escalate' | 'decide' | 'reject';
export type Evaluation = { inspected: number; failed: number; failRate: number; avgScore: number };

// A sample round: escalate if too many rolls failed (rounds 1-2), otherwise accept.
// After the automatic rounds, or for a 100% check, the result is accept or a decision.
export function evaluateRound(
  results: { passed: boolean; score: number }[],
  round: number,
  kind: 'sample' | 'full'
): Evaluation & { recommendation: Recommendation } {
  const inspected = results.length;
  const failed = results.filter((r) => !r.passed).length;
  const failRate = inspected ? failed / inspected : 0;
  const avgScore = inspected ? Math.round((results.reduce((s, r) => s + r.score, 0) / inspected) * 10) / 10 : 0;
  let recommendation: Recommendation;
  if (failRate <= ESCALATION_FAIL_RATE) recommendation = 'accept';
  else if (kind === 'full') recommendation = 'reject';
  else if (round < MAX_AUTO_ROUNDS) recommendation = 'escalate';
  else recommendation = 'decide';
  return { inspected, failed, failRate, avgScore, recommendation };
}

export type Risk = { total: number; quality: number; spread: number; urgency: number };

// Supervisor ranking. Quality: how bad the fabric is (average roll score vs the fail limit, capped).
// Spread: how many rolls failed. Urgency: how close the PO deadline is. Each part is shown on screen.
export function riskScore(avgScore: number, failRate: number, daysToDeadline: number | null): Risk {
  const quality = Math.min(RISK_WEIGHTS.quality, (RISK_WEIGHTS.quality * avgScore) / ROLL_FAIL_SCORE);
  const spread = RISK_WEIGHTS.spread * failRate;
  const urgency =
    daysToDeadline === null ? 0 : RISK_URGENCY.find((u) => daysToDeadline <= u.withinDays)?.points ?? 0;
  return {
    total: Math.round(quality + spread + urgency),
    quality: Math.round(quality),
    spread: Math.round(spread),
    urgency,
  };
}
