export interface Issue { text: string; evidence_ids: number[] }
export interface Hypothesis { text: string; kind: "impact" | "owner_concern" | "priority" }

/** FR-023: issues must cite real evidence, otherwise they become hypotheses; unknown portfolio ids dropped. */
export function applyGrounding(
  issues: Issue[], hypotheses: Hypothesis[], portfolioIds: number[],
  validEvidence: Set<number>, validPortfolio: Set<number>,
) {
  const grounded: Issue[] = [];
  const hyps = [...hypotheses];
  for (const i of issues) {
    const ids = i.evidence_ids.filter((id) => validEvidence.has(id));
    if (ids.length > 0) grounded.push({ text: i.text, evidence_ids: ids });
    else hyps.push({ text: i.text, kind: "impact" });
  }
  return { issues: grounded, hypotheses: hyps, portfolio_proof_ids: portfolioIds.filter((id) => validPortfolio.has(id)) };
}
