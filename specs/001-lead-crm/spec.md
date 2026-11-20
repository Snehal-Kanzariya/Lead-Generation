# 001 — Lead CRM, Auth & Workspace

## User stories
- As the founder I can register/log in and get a private workspace.
- I can add, import (CSV), search, filter and edit leads, and move them through the pipeline.
- I can record notes, follow-up tasks and deal values, and see an activity timeline.

## Requirements
- **FR-001** Register with email+password (min 8 chars); creates a user and a workspace. Passwords hashed (bcrypt). Login returns a signed JWT (7d).
- **FR-002** All `/api/*` routes except auth/health require a valid token; data is scoped to the token's `workspace_id` (C9).
- **FR-003** Lead fields: name (required), industry, website, city, country, phone, email, source, stage, deal_value, notes, tags, owner, do_not_contact.
- **FR-004** Pipeline stages: Discovered, Researched, Qualified, Outreach Prepared, Contacted, Responded, Meeting Scheduled, Proposal Sent, Negotiation, Won, Lost. New leads start at Discovered.
- **FR-005** Moving to Lost requires a `lost_reason`. Moving to Won records `won_at`; deal_value of Won leads counts as confirmed revenue.
- **FR-006** Duplicate leads (same normalized website host, or same name+city) in a workspace are rejected on create and skipped on import with a report.
- **FR-007** CSV import accepts header row with any subset of known columns (case-insensitive); returns `{created, skipped, errors}`. CSV export returns all leads.
- **FR-008** Every stage change, note, task and draft event writes an activity row; timeline per lead.
- **FR-009** Follow-up tasks: title, due date, lead (optional), done flag. Overdue = not done and due < today.
- **FR-010** UI offers Kanban (drag or stage menu) and table views, with search and stage/industry filter.

## Acceptance criteria
- **AC-001** Registering twice with the same email fails with 409.
- **AC-002** A request without a token → 401; user A cannot read/update user B's lead (404).
- **AC-003** Creating a duplicate lead (same website host) → 409; import reports it as skipped.
- **AC-004** Setting stage Lost without reason → 400; with reason → persisted.
- **AC-005** CSV with quoted commas and unknown columns imports valid rows and reports row errors.
- **AC-006** Stage change creates an activity entry visible in lead detail.

## Out of scope
Roles/permissions, SSO, billing, multi-user invites.

## Manual verification
Register → add lead → drag to Contacted → refresh page → state persists.
