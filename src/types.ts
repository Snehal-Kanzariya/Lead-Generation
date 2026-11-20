export const STAGES = [
  "Discovered", "Researched", "Qualified", "Outreach Prepared", "Contacted",
  "Responded", "Meeting Scheduled", "Proposal Sent", "Negotiation", "Won", "Lost",
] as const;
export type Stage = (typeof STAGES)[number];

export interface Lead {
  id: number; name: string; industry: string | null; website: string | null; city: string | null; country: string | null;
  phone: string | null; email: string | null; source: string | null; stage: Stage; deal_value: number; notes: string;
  canvas_notes: string; tags: string[]; owner: string | null; do_not_contact: boolean; lost_reason: string | null;
  updated_at: string; score: number | null; confidence: number | null; recommended_service: string | null; opener: string | null;
}
export interface Evidence { id: number; kind: string; statement: string; source_url: string | null; observed_at: string; status: string }
export interface Assessment {
  business_summary: string;
  observed_issues: { text: string; evidence_ids: number[] }[];
  hypotheses: { text: string; kind: "impact" | "owner_concern" | "priority" }[];
  unknowns: string[]; recommended_service: string; desired_outcome: string; success_measures: string[];
  discovery_questions: string[]; conversation_opener: string; value_assumptions?: string; estimated_value_inr?: number | null;
  sub_scores: Record<string, number>; opportunity_score: number; research_confidence: number; created_at: string;
}
export interface Draft {
  id: number; lead_id: number; lead_name?: string; subject: string; body: string; short_message: string;
  status: "draft" | "approved" | "sent" | "rejected"; flags: string[]; created_at: string; do_not_contact?: boolean;
}
export interface Proposal { id: number; sections: { title: string; body: string }[]; flags: string[]; created_at: string }
export interface Task { id: number; lead_id: number | null; lead_name?: string | null; title: string; due_date: string | null; done: number }
export interface Activity { id: number; kind: string; text: string; created_at: string; to_stage: string | null }
export interface Reply { id: number; sentiment: string; text: string; created_at: string }
export interface Portfolio { id: number; title: string; url: string; industries: string; summary: string }
export interface Service { id: number; name: string; outcome: string; price_range: string }
export interface LeadDetail {
  lead: Lead; evidence: Evidence[]; assessment: Assessment | null; portfolio: Portfolio[];
  drafts: Draft[]; replies: Reply[]; tasks: Task[]; activities: Activity[]; proposals: Proposal[];
}
export interface Dashboard {
  metrics: Record<string, number | null>;
  definitions: Record<string, string>;
  funnel: { stage: string; count: number }[];
  lead_sources: { source: string; leads: number; won: number }[];
  best: { lead_id: number; name: string; score: number; confidence: number; service: string | null; estimated_value: number | null; opener: string | null; evidence: { statement: string; source_url: string | null }[] } | null;
  focus: { kind: string; text: string; lead_id: number | null }[];
  agents: { name: string; status: string; last_task: string | null; last_error: string | null; runs: number; failed: number; input_tokens: number; output_tokens: number }[];
}
export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
