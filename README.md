# Kiln

**Turn the right leads into clients.** Kiln is an evidence-first sales workspace for freelancers and small agencies:
discover local businesses, research their public situation, get an explainable opportunity assessment, draft
human-approved outreach and proposals, and track everything through a CRM pipeline.

Built **spec-first**: see [`specs/`](specs/README.md) (constitution, feature specs with FR/AC ids, plan, tasks, roadmap).

> Product name lives in one place: `src/brand.ts` (plus `package.json`). Check trademark and domain availability before using it publicly.

## What it does
1. **Discover** businesses by type and city (Google Places, or free OpenStreetMap). Possible-growth signals are hedged hypotheses.
2. **Analyze** a lead: fetches its public website, records verified observations, and asks the LLM for an assessment. Claims must cite evidence; the score is computed on the server from your weights.
3. **Draft outreach and proposals** for you to review. Kiln never sends anything: you approve, send it yourself, then mark it sent.
4. **Track** leads on a Kanban pipeline with follow-ups, replies, activity timeline, and a dashboard that shows only real data.

## Stack
React 19 + TypeScript + Tailwind v4 + Vite · Express 5 + `node:sqlite` · Gemini (free tier) or Claude, server-side only.

## Setup
```bash
npm install
cp .env.example .env      # then fill in values
npm run dev               # API :8787 + web :5173
```
Requires Node 22.13+ (built-in SQLite).

### Environment
| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | Free key from https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Default `gemini-3.1-flash-lite` (fast). Falls back to `gemini-3.5-flash`, then `gemini-3.8-flash`. |
| `LLM_PROVIDER` | `gemini` or `anthropic` (auto-detected from whichever key is set) |
| `ANTHROPIC_API_KEY` | Optional. API usage is billed separately from a Claude Pro subscription. |
| `GOOGLE_PLACES_API_KEY` | Recommended for discovery (Places API (New); has a free monthly allowance but needs a billing account) |
| `DISCOVERY_SOURCE` | `places`, `osm`, or `none`. Default: places if keyed, else osm. |
| `JWT_SECRET` | 16+ random characters |

Without any AI key, everything works except Analyze / Draft / Proposal (clear 503 message).

### Free-tier notes
- Gemini's free tier can return 429/503 under load and may use prompts for training; do not paste sensitive client data.
- Google Search grounding was **not** available on the free Gemini key we tested, so discovery uses Places or OpenStreetMap, not AI search.
- OpenStreetMap's public servers are often busy; the Discover page shows a clear message if so.
- Do not scrape Google result pages. Use Places.

## Scripts
`npm run dev` · `npm test` (tests are named by spec AC id) · `npm run build` · `npm run lint` · `npm start` (build and serve from one Node process)

## Principles (specs/000-constitution.md)
Evidence is labelled verified / hypothesis / unknown · no invented proof or prices · the app never sends messages · dashboard shows only real data · secrets stay on the server · respect opt-outs and local outreach laws (India TRAI/DPDP, CAN-SPAM, GDPR).

## Deployment
The API needs a persistent Node process and disk (SQLite), so it will not run on Vercel serverless as-is. Use a small VM, Railway, Render or Fly, or migrate to Postgres first (see `specs/ROADMAP.md`).

## Legacy
`legacy/App.prototype.tsx` is the original mock-data prototype, kept for reference and not built.
