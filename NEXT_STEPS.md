# TenderMind — Next Steps (Portfolio-Grade Roadmap)

> Handoff brief for an AI coding agent. Goal: take TenderMind from a strong prototype to an
> undeniable portfolio flagship — tested, deployed, beautiful, and documented. Work in small,
> meaningful commits (one logical change per commit) so the git history reads as real iterative work.

## Project context (don't re-derive)

TenderMind is AI-powered EU procurement intelligence for SMEs. Turborepo monorepo:

- `apps/web` — Next.js 14 (App Router), Tailwind, TypeScript. Pages: `/`, `/search`, `/sessions/[id]`, `/dashboard`.
- `apps/api` — Fastify API. Two-agent pipeline: **Scout** (`src/agents/scout.ts`, OpenAI embeddings + pgvector cosine search, streams over SSE) and **Analyst** (`src/agents/analyst.ts`, Claude tool use, background job). Routes: `agents`, `profiles`, `sessions`.
- `workers/` — `ingestion`, `cpv-loader`, `award-sync`.
- `packages/shared` — shared types/utils.
- DB: Supabase Postgres + pgvector. Migrations in `apps/api/src/db/migrations`.

Current gaps: no tests, no CI, not deployed, UI components live inline in page files (`apps/web/src/app/search/page.tsx` is ~618 lines; `components/ui` and `components/agents` are empty), basic styling, 2-commit history.

**Quality bar for every task:** typed (no `any`), small components, accessible (keyboard + aria), responsive, loading/empty/error states handled, conventional-commit messages.

---

## Workstream 1 — Reliability foundation (do first)

### 1.1 Testing (Vitest)
- [ ] Add Vitest + `@testing-library/react` to `apps/web` and `apps/api`.
- [ ] Unit-test the Scout similarity/embedding helpers and any pure functions in `apps/api/src/lib`.
- [ ] Unit-test the SSE parsing in `apps/web/src/lib/scout-stream.ts` and `analyst-stream.ts`.
- [ ] Component-test the search form (validation, country filter, submit).
- [ ] Add a `test` script to each package and wire into `turbo.json`.
- [ ] Target: a meaningful suite (not 100% coverage theatre) — the agent pipeline logic and stream parsing are the highest-value things to cover.

### 1.2 CI (GitHub Actions)
- [ ] Add `.github/workflows/ci.yml`: on push/PR run `install → lint → type-check → test → build`.
- [ ] Cache pnpm/npm + turbo cache. Matrix optional.
- [ ] Add a status badge to the README.

### 1.3 Security & config hygiene
- [ ] Confirm no secrets are committed (`.env` is gitignored — keep it that way).
- [ ] Validate all required env vars at startup with `zod` (fail fast with a clear message).
- [ ] Add rate limiting to the Fastify API and basic input validation on every route.

---

## Workstream 2 — Architecture cleanup

- [ ] Extract inline UI from `apps/web/src/app/search/page.tsx` into `components/`:
  `SearchForm`, `CountrySelect`, `ResultCard`, `ResultsList`, `EvaluationPanel`, `WinProbability`, `RiskStrengthChips`.
- [ ] Build a tiny design-system layer in `components/ui` (Button, Badge, Card, Spinner, Skeleton) and use it everywhere.
- [ ] Co-locate types in `src/types`; remove duplication.
- [ ] Keep each page file thin (orchestration only).

---

## Workstream 3 — Make it beautiful (frontend showcase)

This is the part that signals frontend skill. Aim for "pixel-perfect, intentional."

- [ ] **Landing page:** replace the plain centered hero with a polished hero — animated network/constellation background (canvas, `"use client"`, respects `prefers-reduced-motion`), strong type scale, a live stat or two.
- [ ] **Design system:** define a real palette + dark theme via CSS variables, consistent spacing, Inter + a display font. Document tokens.
- [ ] **Streaming search UX:** results cards animate in as Scout streams them (staggered fade/slide); show a live "searching…" state with a result counter; skeletons before first result.
- [ ] **Analyst output:** turn bid/no-bid into a visual — a win-probability gauge/ring, color-coded risk vs strength chips, a clear recommendation banner.
- [ ] **States:** design empty, loading, and error states for every page (no raw spinners).
- [ ] **Polish:** micro-interactions on hover/focus, smooth transitions, mobile layout pass, focus rings, keyboard nav.
- [ ] **Detail page** (`/sessions/[id]`): clean, shareable layout with the evaluation front and center.

---

## Workstream 4 — Ship it (live demo)

- [ ] Deploy `apps/web` to Vercel.
- [ ] Deploy `apps/api` to Railway or Fly.io.
- [ ] Supabase for Postgres + pgvector (seed a sample dataset so the demo works without credentials).
- [ ] Add a **demo mode / sample company** so a visitor can click one button and see the full pipeline run without typing.
- [ ] Wire env vars in both hosts; confirm SSE works through the proxy.

---

## Workstream 5 — Tell the story (README + demo)

- [ ] Add screenshots and a short demo GIF/video to the README (hero, streaming search, evaluation).
- [ ] Add a "Live demo" link and a "Tech stack" section with badges.
- [ ] Add a "How the two-agent pipeline works" section (you already have the diagram — keep it).
- [ ] Add `LICENSE` (MIT) and a short `CONTRIBUTING`/run-locally section.
- [ ] Pin the repo on the GitHub profile.

---

## Suggested order (daily-sized chunks)

1. CI pipeline + first tests (1.2, 1.1)
2. Env validation + rate limiting (1.3)
3. Component extraction from search page (2)
4. Design-system primitives + dark theme (2, 3)
5. Landing hero + animation (3)
6. Streaming results UX polish (3)
7. Analyst visualization (win-probability gauge, chips) (3)
8. Empty/loading/error states pass (3)
9. Deploy web + api + Supabase, add demo mode (4)
10. README screenshots/GIF + LICENSE + badges (5)

Each step = a clean PR/commit. By the end: tested, CI-green, deployed, beautiful, documented.
