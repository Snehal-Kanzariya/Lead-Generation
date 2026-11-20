# 002 — Opportunity Intelligence & Client Value Canvas

## User stories
- As the founder I press "Analyze" on a lead and get an evidence-backed opportunity assessment I can trust and edit.

## Requirements
- **FR-020 Evidence collection.** If the lead has a website, the server fetches the public homepage (5s timeout, 1MB cap, http/https only) and records factual observations: reachable/status, HTTPS, title, meta description, viewport meta, presence of contact form / booking / WhatsApp / phone / email links, last-modified header if present. Each evidence row stores `kind`, `statement`, `source_url`, `observed_at`, `status=verified`. No website → one evidence row "No website recorded" (source: user input).
- **FR-021 SSRF guard.** Refuse private/loopback/link-local hosts and non-http(s) schemes.
- **FR-022 Claude analysis.** Server sends lead info + evidence list + the founder's service catalogue + portfolio list to Claude and requires JSON output validated by schema: `business_summary`, `observed_issues[] {text, evidence_ids}`, `hypotheses[] {text, kind: impact|owner_concern|priority}`, `unknowns[]`, `recommended_service`, `portfolio_proof_ids[]`, `sub_scores {service_fit, evidence_of_need, profile_fit, decision_maker_access, timing}` (0–100 each), `research_confidence` (0–100), `desired_outcome`, `success_measures[]`, `discovery_questions[]`, `conversation_opener`.
- **FR-023 Validation of grounding.** `observed_issues` whose `evidence_ids` do not reference existing evidence are downgraded to hypotheses. `portfolio_proof_ids` not in the catalogue are dropped (C3).
- **FR-024 Explainable scoring.** `opportunity_score = 0.25·service_fit + 0.25·evidence_of_need + 0.20·profile_fit + 0.15·decision_maker_access + 0.15·timing`, computed server-side. Weights are constants. `research_confidence` is stored and shown separately; if there are zero verified evidence rows, confidence is capped at 30.
- **FR-025 Auditability.** Each analysis creates an `agent_run` (agent, status running→succeeded/failed, model, tokens in/out, error, prompt_version).
- **FR-026 Failure handling.** Missing API key → 503 with clear message; invalid JSON → one retry, then failed run and 502. Lead is never modified by a failed run.
- **FR-027 Client Value Canvas.** Lead detail shows: What we know (verified evidence), What we suspect (hypotheses), What matters to them (hypotheses labelled), How we can help, How to start a conversation, What success could look like. User can edit hypotheses/notes after calls (`canvas_notes` persisted).
- **FR-028 Service & portfolio catalogue.** Workspace settings hold services (name, outcome statement, indicative price range) and portfolio items (title, url, relevant industries); seeded with defaults from the founder's portfolio positioning, clearly editable.
- **FR-029** Successful analysis moves a Discovered lead to Researched; scores ≥ 60 and confidence ≥ 50 may be marked Qualified by the user (never automatic).

## Acceptance criteria
- **AC-020** Score function with known inputs returns the exact weighted value.
- **AC-021** Confidence capped at 30 with no verified evidence.
- **AC-022** Issue citing a non-existent evidence id is moved to hypotheses.
- **AC-023** Portfolio ids not in catalogue are stripped.
- **AC-024** SSRF guard rejects `127.0.0.1`, `10.x`, `169.254.x`, `localhost`, `file:`.
- **AC-025** Analysis without API key returns 503 and leaves lead unchanged.
- **AC-026** Invalid model JSON fails validation and produces a failed agent run.

## Out of scope
Scraping Google Maps/LinkedIn, contact enrichment, automatic discovery crawlers (ROADMAP).
