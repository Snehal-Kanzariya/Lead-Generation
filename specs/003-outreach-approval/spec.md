# 003 — Outreach Drafting & Human Approval

## Requirements
- **FR-040** "Draft outreach" for an analyzed lead calls Claude to produce an email draft (subject, body) and a short LinkedIn/WhatsApp-style message, following: observation → customer problem → possible impact → recommendation → proof → low-pressure next step.
- **FR-041** Drafts may only cite evidence rows and portfolio items on file; the prompt forbids invented numbers, urgency, fear, guarantees (C3, C4). Server rejects drafts containing a blocklist of manipulation phrases ("act now", "last chance", "guaranteed", "100%") and flags them for regeneration once.
- **FR-042** Draft states: `draft → approved → sent` or `rejected`. Only the user can transition. Body is editable while `draft`.
- **FR-043** "Mark as sent" is a manual record (user sent it themselves); it sets lead stage Contacted, stores `sent_at`, creates an activity, and auto-creates a follow-up task +5 days.
- **FR-044** Leads with `do_not_contact` cannot get drafts approved or marked sent (409).
- **FR-045** Response logging: user records a reply (positive/neutral/negative + text) → stage Responded, activity logged; used for reply-rate analytics.
- **FR-046** Each draft run is an `agent_run` (Outreach Specialist).

## Acceptance criteria
- **AC-040** Transition draft→sent without approval → 409.
- **AC-041** do_not_contact lead: approve → 409.
- **AC-042** Mark sent sets stage Contacted and creates a task due +5 days.
- **AC-043** Draft containing "guaranteed" is flagged by the checker.
- **AC-044** Logging a reply sets stage Responded and counts toward reply metrics.

## Out of scope
Sending email/LinkedIn automatically, sequences, inbox sync.
