# Tasks (check off as implemented and verified)

## Server
- [x] T1 db schema + migrations (FR-002,003,004,008)
- [x] T2 auth routes + middleware (FR-001,002; AC-001,002)
- [x] T3 leads CRUD, dedupe, stage rules, activities (FR-003–006,008; AC-003,004,006)
- [x] T4 CSV import/export (FR-007; AC-005)
- [x] T5 tasks routes (FR-009)
- [x] T6 ssrf + evidence fetch (FR-020,021; AC-024)
- [x] T7 scoring + grounding (FR-023,024; AC-020–023)
- [x] T8 analysis route + agent runs + failure handling (FR-022,025,026; AC-025,026)
- [x] T9 drafts/approval/sent/replies (FR-040–046; AC-040–044)
- [x] T10 dashboard computation (FR-060–064; AC-060–063)
- [x] T11 services/portfolio catalogue (FR-028)
## Client
- [x] T12 theme + layout shell (FR-080–087)
- [x] T13 auth screens
- [x] T14 Command Center
- [x] T15 Leads table + add/import + detail drawer w/ Value Canvas
- [x] T16 Pipeline kanban
- [x] T17 Outreach review queue
- [x] T18 Follow-ups
- [x] T19 Settings (catalogue)
## Delivery
- [x] T20 tests green, lint, tsc, build
- [x] T21 README, .env.example, .gitignore, commit, push

## Verification status (2026-11-20)
- Automated: 23 tests pass (`npm test`), `tsc`, `oxlint` (warnings only), production build.
- Manual: register, add lead, drawer, pipeline, dark/light theme checked in browser.
- NOT verified: live Claude analysis/drafting (Anthropic API credit balance was zero), phone-width layout, drag-and-drop between kanban columns, CSV import via the UI.
