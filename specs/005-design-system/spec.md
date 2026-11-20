# 005 — Terracotta Intelligence Design System

## Requirements
- **FR-080** Tailwind v4 `@theme` tokens (user chose to keep Tailwind): primary #C46D50, deep #A85139, soft #F0D2C1, ivory #F8F4EE, sandstone #D4B58B, sage #859886, midnight #17191D, elevated #23262A, secondary #303137, warm text #F6F0E8. Semantic success/warning/danger/info.
- **FR-081** Light and dark themes via `data-theme`, default from `prefers-color-scheme`, toggle persisted in localStorage (guarded by try/catch).
- **FR-082** Fonts: Space Grotesk (headings), Inter (body), tabular numerals for figures.
- **FR-083** Collapsible sidebar with only implemented sections: Command Center, Leads, Pipeline, Outreach, Follow-Ups, Settings. No dead nav items.
- **FR-084** Top bar: workspace name, search (filters leads), theme toggle, AI status (reflects real runs), user menu.
- **FR-085** Accessible: visible focus rings, dialogs with focus trap + Esc, aria labels, contrast ≥ 4.5:1 for text, `prefers-reduced-motion` respected, transitions 150–250ms.
- **FR-086** Responsive: sidebar becomes drawer < 1024px; tables scroll within container; no page-level horizontal overflow.
- **FR-087** Terracotta reserved for primary actions, active nav, selection, key insights, chart highlights.

## Manual verification
Toggle theme; resize to 375px; tab through nav; enable reduced motion.
