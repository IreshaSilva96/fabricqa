// Factory inspection policy. Every threshold lives here, so the policy can change
// without touching the logic or retraining the model.
export const INSPECTION_RATE = 0.10;        // share of an item's rolls sampled per round
export const POINTS = { major: 4, minor: 1, none: 0 } as const; // 4-point system; false alarm = 0
export const ROLL_FAIL_SCORE = 40;          // points per 100 sq yd above which a roll fails
export const ESCALATION_FAIL_RATE = 0.10;   // escalate if MORE than this share of a round's rolls failed
export const MAX_AUTO_ROUNDS = 2;           // after this, the supervisor decides with no recommendation

// Supervisor risk ranking (0-100): fabric quality + how widespread + deadline urgency
export const RISK_WEIGHTS = { quality: 50, spread: 30 } as const;
export const RISK_URGENCY = [
  { withinDays: 1, points: 20 },
  { withinDays: 3, points: 12 },
  { withinDays: 7, points: 6 },
] as const;
