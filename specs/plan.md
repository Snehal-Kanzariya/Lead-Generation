# Plan (satisfies specs 001–005)

## Architecture
- **Client:** React 19 + TypeScript + Tailwind v4 + Vite. `src/` split into `theme`, `api`, `components`, `pages`. Vite proxies `/api` → `localhost:8787`.
- **Server:** Express + TypeScript (run with tsx) under `server/`. SQLite via Node's built-in `node:sqlite` (file `server/data/app.db`, git-ignored). JWT bearer auth. `express-rate-limit` on auth and AI routes. zod validation.
- **AI:** `@anthropic-ai/sdk`, model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), key from `ANTHROPIC_API_KEY` (server only). Prompts live in `server/ai/prompts.ts` with `PROMPT_VERSION`.
- **Pure logic modules** (unit-tested): `scoring.ts`, `grounding.ts`, `ssrf.ts`, `csv.ts`, `dashboard.ts`, `outreachGuard.ts`.

## Data model (all rows carry `workspace_id`)
users, workspaces, leads, evidence, assessments, drafts, replies, tasks, activities, agent_runs, services, portfolio_items.

## Decisions
- Keep Tailwind (user choice). Old prototype archived at `legacy/App.prototype.tsx` (mock data, not mounted).
- No auto-sending; no discovery scraping (ToS/legal risk) — discovery = manual add + CSV import + website evidence fetch.
- Single owner per workspace for MVP; `workspace_id` everywhere keeps SaaS path open.
