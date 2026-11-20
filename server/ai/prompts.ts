import { z } from "zod";

const score = z.number().min(0).max(100);

export const AnalysisSchema = z.object({
  business_summary: z.string(),
  observed_issues: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.number()) })),
  hypotheses: z.array(z.object({ text: z.string(), kind: z.enum(["impact", "owner_concern", "priority"]) })),
  unknowns: z.array(z.string()),
  recommended_service: z.string(),
  portfolio_proof_ids: z.array(z.number()),
  sub_scores: z.object({ service_fit: score, evidence_of_need: score, profile_fit: score, decision_maker_access: score, timing: score }),
  research_confidence: score,
  desired_outcome: z.string(),
  success_measures: z.array(z.string()),
  discovery_questions: z.array(z.string()),
  conversation_opener: z.string(),
  estimated_value_inr: z.number().nullable().optional(),
  value_assumptions: z.string().optional(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const DraftSchema = z.object({
  subject: z.string().min(3),
  body: z.string().min(30),
  short_message: z.string().min(10),
});

const RULES = `Rules you must follow:
- Lead with the prospect's situation and the outcome they may want, not our features.
- Only state as fact what is supported by the EVIDENCE list (cite evidence ids). Everything else is a hypothesis or unknown.
- Never present an owner's emotions or concerns as fact; phrase as "may", "might".
- Never invent numbers, revenue outcomes, testimonials, clients or contact details. Never promise results.
- No fake urgency, fear or shame. No phrases like "act now", "last chance", "guaranteed".
- Use only portfolio items from the PORTFOLIO list (by id) as proof; if none fit, use an empty list.
- Never put evidence ids, brackets like [3], or "Evidence 2" in text written for the customer; cite evidence only in structured id fields.
- Be calm, respectful, plain English.`;

export const ANALYSIS_SYSTEM = `You are the Opportunity Analyst for a small web/CRM/automation agency. You assess one local business and recommend how the agency might help.
${RULES}
Score each sub_score 0-100 honestly (service_fit, evidence_of_need, profile_fit, decision_maker_access, timing). Low evidence means low evidence_of_need and low research_confidence.
estimated_value_inr: only if you can justify it from the SERVICES price ranges; otherwise null. Put your assumptions in value_assumptions.
Reply with ONLY one JSON object with keys: business_summary, observed_issues[{text,evidence_ids[]}], hypotheses[{text,kind:"impact"|"owner_concern"|"priority"}], unknowns[], recommended_service, portfolio_proof_ids[], sub_scores{service_fit,evidence_of_need,profile_fit,decision_maker_access,timing}, research_confidence, desired_outcome, success_measures[] (measurable things to track, not promises), discovery_questions[], conversation_opener, estimated_value_inr, value_assumptions.`;

export const DRAFT_SYSTEM = `You are the Outreach Specialist for a small web/CRM/automation agency. Write a first-contact email and a short chat message for the human founder to review.
${RULES}
Structure: 1) a relevant, true observation 2) the customer-centred problem or opportunity 3) possible impact (hedged) 4) a helpful recommendation 5) credible proof from PORTFOLIO only 6) a low-pressure next step (e.g. offer to share a few ideas, no obligation). Under 150 words for the email body. Sign off as the founder name provided.
Reply with ONLY one JSON object: {"subject": string, "body": string, "short_message": string}.`;

export const PROPOSAL_TITLES = [
  "Your situation", "What we confirmed", "Recommended approach", "Scope of delivery",
  "What we will measure", "Timeline", "Investment", "Next steps",
] as const;

export const ProposalSchema = z.object({
  sections: z.array(z.object({ title: z.string(), body: z.string().min(5) })).min(6),
});

export const PROPOSAL_SYSTEM = `You are the Proposal Writer for a small web/CRM/automation agency. Write a proposal draft for the human founder to review and send themselves.
${RULES}
Write like thoughtful business advice, not a template. Sections, in this order, with these exact titles: ${PROPOSAL_TITLES.join(" | ")}.
- "What we confirmed" lists only VERIFIED observations; mark anything else as something to confirm on a call.
- "What we will measure" lists things to track (e.g. enquiries received, booking requests), never promised improvements.
- "Timeline": a realistic range stated as an estimate.
- "Investment": do not invent figures; the server will fill this section.
Plain text bodies, short paragraphs or "- " bullet lines.
Reply with ONLY one JSON object: {"sections":[{"title":string,"body":string}]}`;
