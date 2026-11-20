# 006 — Free-tier LLM (Gemini), Discovery & Proposals, Rebrand

Extends 002 (analysis), 003 (outreach). Supersedes the "no discovery / no proposals" out-of-scope notes in those specs.

## User stories
- I can run the app on a free Gemini key instead of paid Claude.
- I type "salons in Pune" and get real businesses with possible growth signals, then add the good ones as leads.
- For an analyzed lead I can generate a proposal draft to review and send myself.

## Requirements
- **FR-100 Provider abstraction.** `LLM_PROVIDER=gemini|anthropic`. Default: gemini if `GEMINI_API_KEY` set, else anthropic if `ANTHROPIC_API_KEY` set. Same JSON-in/JSON-out contract (`askJson`) for both; all existing validation (zod, grounding, scoring) unchanged.
- **FR-101 Gemini client.** REST call with key in header (never URL), `responseMimeType: application/json`, ordered model fallback (`GEMINI_MODEL` then built-in fallbacks), retry with backoff on 429/503, clear error text when quota is exhausted. Token usage recorded on agent runs.
- **FR-102 Discovery sources.** `POST /api/discover {query, location, limit<=10}`. Source chosen by `DISCOVERY_SOURCE` (places|osm|gemini_search|none), else Google Places if `GOOGLE_PLACES_API_KEY` is set, else OpenStreetMap (free, no key, best-effort: public Overpass servers are often busy). Gemini Google-Search grounding is opt-in only: the free Gemini key was tested and returns 429 for grounding on every model. Listing sources are marked `verified_listing: true`; AI search results are unverified and dropped if they carry no source URL. No scraping of Google result pages.
- **FR-103 Signals, not claims.** Each result has `signals[]` of *possible* growth/need indicators derived by rule from listing data (e.g. many reviews + high rating, no website listed, low review volume). Wording is hedged; "growing" is never stated as fact (C2).
- **FR-104 Add to leads.** `POST /api/discover/add` inserts selected results as leads (stage Discovered, source "Google Places" or "AI search (unverified)", signals + source URLs in notes) with duplicate skipping per FR-006. Never auto-analyzes or auto-contacts.
- **FR-105 Proposal draft.** `POST /api/leads/:id/proposal` requires an assessment. Produces sections: Your situation, What we confirmed, Recommended approach, Scope of delivery, What we will measure, Timeline, Investment, Next steps. Investment uses only the catalogue `price_range` of the recommended service, otherwise "To be confirmed after a discovery call". No invented outcomes, testimonials or numbers; manipulation phrases flagged (FR-041 checker). Stored, editable, copyable. Never sent by the system.
- **FR-106 Agent honesty.** Proposal runs are logged as agent `Proposal Writer`; discovery runs as `Market Researcher`; both appear in the dashboard agent panel from real runs only (C7).
- **FR-107 Rebrand.** Product is named **Kiln**. The name lives in one client module (`src/brand.ts`) and package metadata.

## Acceptance criteria
- **AC-100** Provider resolution: gemini key present → gemini; only anthropic key → anthropic; none → not configured.
- **AC-101** Gemini request builder puts the key in a header, requests JSON, and enables the search tool only when asked.
- **AC-102** Signals function: no website → "no website listed"; 200 reviews + 4.6 → well-reviewed signal; empty data → no signals; never contains the word "growing" as an assertion.
- **AC-103** Source selection: Places key → places; nothing set → osm; `DISCOVERY_SOURCE=none` → `/api/discover` returns 503.
- **AC-104** Adding the same business twice skips the second and reports it.
- **AC-105** Proposal without analysis → 400.
- **AC-106** Investment section is overridden to the catalogue price or the "to be confirmed" text, never model-invented figures.

## Out of scope
Automatic sending, scraping, contact-email enrichment, bulk campaigns.

## Notes / risks
- Free tiers can return 429/503 and may use prompts for training. Do not paste sensitive client data. Google Search grounding is NOT available on the free Gemini key we tested; Places is the dependable discovery path, OSM the free best-effort one.
- Gemini-grounded business lists can contain mistakes. They are labelled unverified and every lead still goes through evidence collection from its own website.
