export const WEIGHTS = {
  service_fit: 0.25,
  evidence_of_need: 0.25,
  profile_fit: 0.2,
  decision_maker_access: 0.15,
  timing: 0.15,
} as const;
export type SubScores = Record<keyof typeof WEIGHTS, number>;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** FR-024: explainable weighted score, computed server-side. */
export function opportunityScore(s: SubScores): number {
  let total = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) total += WEIGHTS[k] * clamp(s[k]);
  return Math.round(total * 10) / 10;
}

/** FR-024: no verified evidence => confidence capped at 30. */
export function cappedConfidence(confidence: number, verifiedEvidenceCount: number): number {
  const c = clamp(confidence);
  return verifiedEvidenceCount === 0 ? Math.min(c, 30) : c;
}
