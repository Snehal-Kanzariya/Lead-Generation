# Shiv Growth OS

An evidence-first sales workspace for a small agency: find a business, research its public situation, get an
explainable opportunity assessment, draft human-approved outreach, and track it through a CRM pipeline.

Built **spec-first** — see [`specs/`](specs/README.md) (constitution, feature specs with FR/AC ids, plan, tasks, roadmap).

## Stack
React 19 + TypeScript + Tailwind v4 + Vite · Express 5 + `node:sqlite` · Claude via `@anthropic-ai/sdk` (server-side only).

## Setup
```bash
npm install
cp .env.example .env        # then fill in values
npm run dev                 # API :8787 + web :5173
```
Needs Node 22.13+ (built-in SQLite).

`.env`:
| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com. **API usage is billed separately from a Claude Pro subscription — add credit under Plans & Billing.** |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-5-5` |
| `JWT_SECRET` | 16+ random chars |
| `PORT` | Default 8787 |

Without an API key everything works except Analyze / Draft (they return a clear 503).

## Scripts
`npm run dev` · `npm test` (tests are named by spec AC id) · `npm run build` · `npm run lint` · `npm start` (build + serve everything from one Node process)

## Principles (see specs/000-constitution.md)
Evidence is labelled verified/hypothesis/unknown · no invented proof · the app never sends messages (you approve, send yourself, then mark sent) · dashboard shows only real data · secrets stay on the server.

## Deployment note
The API needs a persistent Node process and disk (SQLite). It will not run as-is on Vercel serverless; use a small VM/Railway/Render/Fly, or migrate to Postgres first (see ROADMAP).

## Legacy
`legacy/App.prototype.tsx` is the original mock-data prototype (voice-call simulator), kept for reference and not built.
