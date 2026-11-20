# Spec-Driven Development — Shiv Growth OS

This project is built **spec first**. Specs are the source of truth; code and tests follow them.

## Workflow

1. **Constitution** (`000-constitution.md`) — non-negotiable principles. Every spec must comply.
2. **Spec** (`NNN-feature/spec.md`) — user stories, numbered requirements (`FR-xxx`), acceptance criteria (`AC-xxx`), out-of-scope.
3. **Plan** (`plan.md`) — architecture and data decisions that satisfy the spec.
4. **Tasks** (`tasks.md`) — ordered, checkable tasks; each cites the `FR`/`AC` it satisfies.
5. **Implement** — code references requirement IDs in comments only where non-obvious.
6. **Verify** — automated tests are named with their `AC` id (`server/tests/*.test.ts`); manual checks listed in each spec's "Manual verification".
7. **Change** — to change behaviour, edit the spec first, then tasks, then code.

## Index

| Spec | Purpose |
|---|---|
| 000-constitution | Principles: honesty, human approval, real data, privacy |
| 001-lead-crm | Auth, workspace, leads, pipeline, tasks, CSV |
| 002-opportunity-intelligence | Evidence, Claude analysis, scoring, Client Value Canvas |
| 003-outreach-approval | Draft → review → approve → manually mark sent |
| 004-command-center | Dashboard, KPIs, Today's Focus, agent activity |
| 005-design-system | Terracotta Intelligence theme, a11y, responsive |
| ROADMAP | Deferred scope and 90-day plan |

Traceability: `npm run test` runs tests whose names start with `AC-`.
