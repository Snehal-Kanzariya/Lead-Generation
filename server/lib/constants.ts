export const STAGES = [
  "Discovered", "Researched", "Qualified", "Outreach Prepared", "Contacted",
  "Responded", "Meeting Scheduled", "Proposal Sent", "Negotiation", "Won", "Lost",
] as const;
export type Stage = (typeof STAGES)[number];

/** Progress rank; Lost has no rank (-1) so it never counts as having "reached" later stages. */
export function stageRank(stage: string): number {
  return stage === "Lost" ? -1 : STAGES.indexOf(stage as Stage);
}
export const PROMPT_VERSION = "2026-11-v1";
