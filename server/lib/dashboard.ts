import { STAGES, stageRank } from "./constants.ts";

export interface DLead { id: number; name: string; stage: string; deal_value: number; source: string | null; do_not_contact: number; score: number | null; confidence: number | null; recommended_service: string | null; opener: string | null }
export interface DActivity { lead_id: number; kind: string; to_stage: string | null; created_at: string }
export interface DDraft { lead_id: number; status: string }
export interface DReply { sentiment: string }
export interface DTask { id: number; lead_id: number | null; title: string; due_date: string | null; done: number }
export interface DRun { agent: string; status: string; error: string | null; input_tokens: number; output_tokens: number; started_at: string; lead_id: number | null }
export interface DEvidence { lead_id: number; statement: string; source_url: string | null }

export interface DashInput {
  leads: DLead[]; activities: DActivity[]; drafts: DDraft[]; replies: DReply[]; tasks: DTask[];
  runs: DRun[]; evidence: DEvidence[]; today: string; // yyyy-mm-dd
}
export interface FocusItem { kind: string; text: string; lead_id: number | null }

const rank = (s: string) => stageRank(s);
const R_QUAL = rank("Qualified");
const R_MEET = rank("Meeting Scheduled");
const R_PROP = rank("Proposal Sent");
const R_NEG = rank("Negotiation");

export const AGENTS = ["Market Researcher", "Opportunity Analyst", "Outreach Specialist", "Proposal Writer"] as const;

export const METRIC_DEFINITIONS: Record<string, string> = {
  researched: "Leads with at least one saved AI opportunity assessment.",
  qualified: "Leads currently at Qualified or any later stage (excluding Lost).",
  awaiting_review: "Outreach drafts not yet approved or rejected.",
  outreach_sent: "Drafts you marked as sent (you send them yourself).",
  responses: "Replies you logged.",
  positive_reply_rate: "Positive replies / outreach sent. Blank until something is sent.",
  meetings: "Leads that ever reached Meeting Scheduled or later.",
  proposals: "Leads that ever reached Proposal Sent or later.",
  active_deals: "Leads currently between Meeting Scheduled and Negotiation.",
  pipeline_value: "Estimated: sum of deal value for leads at Proposal Sent or Negotiation. Not revenue.",
  confirmed_revenue: "Sum of deal value on leads marked Won.",
  pending_followups: "Open follow-up tasks (overdue shown separately).",
};

function daysBetween(a: string, b: string) { return Math.floor((Date.parse(b) - Date.parse(a)) / 86400000); }

export function computeDashboard(d: DashInput) {
  const { leads, today } = d;
  const reached = new Map<number, number>();
  const lastToStage = new Map<string, string>();
  for (const a of d.activities) {
    if (a.kind !== "stage_change" || !a.to_stage) continue;
    reached.set(a.lead_id, Math.max(reached.get(a.lead_id) ?? -1, rank(a.to_stage)));
    const k = `${a.lead_id}:${a.to_stage}`;
    const prev = lastToStage.get(k);
    if (!prev || a.created_at > prev) lastToStage.set(k, a.created_at);
  }
  for (const l of leads) reached.set(l.id, Math.max(reached.get(l.id) ?? -1, rank(l.stage)));

  const count = (f: (l: DLead) => boolean) => leads.filter(f).length;
  const sent = d.drafts.filter((x) => x.status === "sent").length;
  const positive = d.replies.filter((r) => r.sentiment === "positive").length;
  const open = d.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due_date && t.due_date < today);

  const metrics = {
    total_leads: leads.length,
    researched: count((l) => l.score !== null),
    qualified: count((l) => rank(l.stage) >= R_QUAL),
    awaiting_review: d.drafts.filter((x) => x.status === "draft").length,
    outreach_sent: sent,
    responses: d.replies.length,
    positive_reply_rate: sent > 0 ? Math.round((positive / sent) * 1000) / 10 : null,
    meetings: count((l) => (reached.get(l.id) ?? -1) >= R_MEET),
    proposals: count((l) => (reached.get(l.id) ?? -1) >= R_PROP),
    active_deals: count((l) => rank(l.stage) >= R_MEET && rank(l.stage) <= R_NEG),
    pipeline_value: leads.filter((l) => l.stage === "Proposal Sent" || l.stage === "Negotiation").reduce((s, l) => s + l.deal_value, 0),
    confirmed_revenue: leads.filter((l) => l.stage === "Won").reduce((s, l) => s + l.deal_value, 0),
    pending_followups: open.length,
    overdue_followups: overdue.length,
  };

  const funnel = STAGES.map((s) => ({ stage: s, count: leads.filter((l) => l.stage === s).length }));

  const srcMap = new Map<string, { source: string; leads: number; won: number }>();
  for (const l of leads) {
    const k = l.source?.trim() || "Unspecified";
    const e = srcMap.get(k) ?? { source: k, leads: 0, won: 0 };
    e.leads++;
    if (l.stage === "Won") e.won++;
    srcMap.set(k, e);
  }

  const eligible = leads
    .filter((l) => l.score !== null && l.stage !== "Won" && l.stage !== "Lost" && !l.do_not_contact)
    .sort((a, b) => (b.score! - a.score!) || ((b.confidence ?? 0) - (a.confidence ?? 0)));
  const top = eligible[0];
  const best = top
    ? {
        lead_id: top.id, name: top.name, score: top.score, confidence: top.confidence,
        service: top.recommended_service, estimated_value: top.deal_value || null, opener: top.opener,
        evidence: d.evidence.filter((e) => e.lead_id === top.id).slice(0, 3),
      }
    : null;

  const focus: FocusItem[] = [];
  const nameOf = (id: number | null) => leads.find((l) => l.id === id)?.name ?? "a lead";
  for (const t of open.filter((t) => t.due_date && t.due_date <= today).slice(0, 5)) {
    const label = t.due_date! < today ? "Overdue" : "Due today";
    focus.push({ kind: "followup", text: `${label}: ${t.title}${t.lead_id ? ` - ${nameOf(t.lead_id)}` : ""}`, lead_id: t.lead_id });
  }
  const draftsWaiting = d.drafts.filter((x) => x.status === "draft");
  if (draftsWaiting.length)
    focus.push({ kind: "review", text: `Review ${draftsWaiting.length} outreach draft${draftsWaiting.length > 1 ? "s" : ""}`, lead_id: draftsWaiting[0].lead_id });
  const hasDraft = new Set(d.drafts.map((x) => x.lead_id));
  const needDraft = leads.filter(
    (l) => l.score !== null && rank(l.stage) >= rank("Researched") && rank(l.stage) < rank("Contacted") && !hasDraft.has(l.id) && !l.do_not_contact && l.score >= 60,
  );
  for (const l of needDraft.slice(0, 3)) focus.push({ kind: "draft", text: `Prepare outreach for ${l.name} (score ${l.score})`, lead_id: l.id });
  const unresearched = leads.filter((l) => l.score === null && l.stage === "Discovered");
  if (unresearched.length)
    focus.push({ kind: "research", text: `Research ${Math.min(3, unresearched.length)} of ${unresearched.length} discovered lead${unresearched.length > 1 ? "s" : ""}`, lead_id: unresearched[0].id });
  for (const l of leads.filter((l) => l.stage === "Proposal Sent")) {
    const at = lastToStage.get(`${l.id}:Proposal Sent`);
    if (at && daysBetween(at, today) > 7) focus.push({ kind: "stalled", text: `Proposal to ${l.name} has had no movement for ${daysBetween(at, today)} days`, lead_id: l.id });
  }
  if (leads.length === 0) focus.push({ kind: "start", text: "Add your first lead or import a CSV to begin", lead_id: null });

  const agents = AGENTS.map((name) => {
    const runs = d.runs.filter((r) => r.agent === name).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const last = runs[0];
    return {
      name,
      status: runs.some((r) => r.status === "running") ? "running" : "idle",
      last_task: last ? `${last.status} at ${last.started_at.slice(0, 16).replace("T", " ")}` : null,
      last_error: runs.find((r) => r.status === "failed")?.error ?? null,
      runs: runs.length,
      failed: runs.filter((r) => r.status === "failed").length,
      input_tokens: runs.reduce((s, r) => s + r.input_tokens, 0),
      output_tokens: runs.reduce((s, r) => s + r.output_tokens, 0),
    };
  });

  return { metrics, definitions: METRIC_DEFINITIONS, funnel, lead_sources: [...srcMap.values()], best, focus, agents };
}
