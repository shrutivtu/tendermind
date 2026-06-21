# TenderMind — Final Polish Instructions

> Handoff brief for the coding agent. The app is **already deployed and fully working**
> (Vercel web + Render API + Supabase/pgvector + Claude/OpenAI). This list takes it from
> "works and looks good" to "portfolio showpiece." Work in small, meaningful commits.
> Do NOT regress anything below under "already good."

## Verified live (do not rebuild — already good)

- Full pipeline works end to end: search → Scout SSE stream → redirect → persistent session → Analyst polling → complete.
- Landing page: navbar, hero ("€420 billion in EU contracts"), stat row, "How it works" 3 steps, CTA. Clean.
- Search streaming screen: "Scout Agent Running", candidates/matches counters, and a **terminal-style "Claude's reasoning" panel** that streams live. This is a standout — keep and lean into it.
- Session page: company-searched card, stat cards (found/evaluated/pursue/skip), tender cards with circular score rings, fit badges, country, recommendation chips, Claude rationale.
- Score rings are already color-coded by tier (e.g. 92 = green "Perfect fit", ~78 = blue "Good fit").
- Responsive: stat cards reflow to a 2×2 grid on mobile (tested at 414px). Header holds up.
- README is strong (CI badge, tech-stack table, architecture diagram, API reference, design decisions).

---

## Priority 1 — Conversion + credibility (do first)

### 1.1 Demo mode (highest impact for job applications)
- [ ] Add a **one-click "Try a sample search"** button on `/search` (and a CTA on landing) that pre-fills a company description and runs the pipeline, so a recruiter sees the full experience without typing or spending your API budget.
- [ ] Optionally cache/seed one completed sample session and link it as "See an example result" so the demo works instantly even if API keys hit limits.

### 1.2 README live demo
- [ ] Add a **"Live demo"** link + button at the very top of the README (under the title), pointing to the Vercel URL and the sample session.
- [ ] Add 2–3 screenshots and a short demo GIF (landing, streaming/reasoning panel, evaluated session).

### 1.3 Loading / empty / error states
- [ ] Replace the plain `Loading session…` text on `/sessions/[id]` with a **skeleton** of the stat cards + tender cards.
- [ ] Add a friendly empty state when a search returns 0 matches.
- [ ] Add an error state if the API/SSE connection fails (retry button), instead of a silent hang.

---

## Priority 2 — Frontend polish (shows the detail-oriented frontend skill)

- [ ] **Card entrance animation:** stagger tender cards fading/sliding in on the session page (respect `prefers-reduced-motion`).
- [ ] **Animate score rings** filling from 0 on load.
- [ ] **Stat-card color semantics:** make colors consistent and meaningful — Pursue = green, Skip = muted/red, Evaluated = accent, Tenders found = neutral. Right now the palette is slightly arbitrary.
- [ ] **Recommendation chips:** consider swapping the emoji (🤔 ⏭ 🎯) for clean inline SVG icons for consistent cross-OS rendering and a more B2B feel. Keep the text labels.
- [ ] **Win-probability / fit visualization:** when a card is expanded, show the Analyst's risks vs strengths as color-coded chips and the win probability as a small gauge or bar.
- [ ] **Micro-interactions:** hover/focus transitions on cards and buttons, smooth expand/collapse on the ▼ tender rows.
- [ ] **Add OG/social image + favicon** so shared links look intentional.

---

## Priority 3 — Engineering hardening (backs the resume + CI badge)

- [ ] **Tests (Vitest):** cover the SSE parsing (`lib/scout-stream.ts`, `lib/analyst-stream.ts`), the Scout similarity helpers, and the search form. Wire `test` into `turbo.json` so the CI badge means something.
- [ ] **Component refactor:** `apps/web/src/app/search/page.tsx` is one large file. Extract `SearchForm`, `CountrySelect`, `ReasoningTerminal`, `MatchCard`, `ScoreRing`, `StatCard`, `RecommendationChip` into `components/`. Build a small `components/ui` primitive set (Button, Badge, Card, Skeleton).
- [ ] **Env validation:** validate required env vars at API + worker startup with `zod`, failing fast with a clear message.
- [ ] **API hardening:** rate limiting + input validation on every Fastify route.

---

## Suggested commit order (daily-sized)

1. Skeleton + empty + error states (1.3)
2. Demo mode / sample search (1.1)
3. README live-demo link + screenshots + GIF (1.2)
4. Component extraction from search page (P2/P3)
5. ui primitives + stat-card color semantics (P2)
6. Score-ring + card entrance animations (P2)
7. Expanded-card risks/strengths + win-probability viz (P2)
8. Recommendation-chip icons + micro-interactions + OG image (P2)
9. Vitest suite for stream parsing + scout helpers (P3)
10. Env validation + rate limiting (P3)

Each step = one clean, conventionally-named commit/PR. Outcome: a deployed, tested, animated, demo-able product with a README that sells it at a glance.
