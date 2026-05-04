# Phase 1.5: Public launch prep

**Status:** planned. See `ROADMAP.md` for the phase goal and DoD; this file is the executable task list.

Goal: foundational work that's a precondition for inviting strangers — D1 migration, magic-link auth, PWA, stats, export, shortlist mode, runner deps bump, public repo.

## Recommended wave (parallel, ship independently)

Six items below touch disjoint files and can land in any order. Plan rationale lives in `~/.claude/plans/review-docs-roadmap-md-and-plan-glittery-perlis.md`.

### W1.1 — GH Actions runner deps bump

- File: `.github/workflows/deploy.yml`.
- Bump `actions/checkout@v4` → `v6`, `actions/setup-node@v4` → `v6`, `pnpm/action-setup@v4` → `v6`, `cloudflare/wrangler-action@v3` (already on v3, pin to latest patch).
- Keep Node 22 (already past Node 20 EOL deadline of 2026-09-16).
- Verify deploy job stays green on a throwaway branch before merging.
- Commit: `chore(ci): bump GitHub Actions runner deps`.

### W1.2 — PWA scaffold

- New: `static/manifest.webmanifest`, `static/icons/*`, `src/service-worker.ts`, `src/lib/pwa/cache.ts` (+ test), `src/lib/components/InstallBanner.svelte`.
- Modify: `src/app.html` (manifest link tag).
- Service worker versions its cache name with a build-time `__APP_VERSION__` constant. Ship a `/sw-clear` route that unregisters the SW and clears caches — kill switch before flipping repo public.
- First commit: `test(pwa): cache version helper` + the helper.
- Subsequent commits: `feat(pwa): manifest and icons`, `feat(pwa): service worker with versioned cache`, `feat(pwa): install banner`, `feat(pwa): /sw-clear kill switch`.

### W1.3 — Export shortlist (JSON + printable HTML)

- New: `src/routes/s/[sessionId]/matches/export.json/+server.ts`, `src/routes/s/[sessionId]/matches/export.html/+server.ts`, `src/lib/export/shortlist.ts` (+ test).
- Modify: `src/routes/s/[sessionId]/matches/+page.svelte` — add export button.
- Read-only path. Reuses `getMatches` from `src/lib/server/sessions.ts`. JSON shape: `{ sessionId, generatedAt, matches: [{ name, sex, partners: [...] }] }`. HTML view is a single-page printable layout with `@media print` styles.
- First commit: `test(export): buildShortlistJson` + helper.
- Then: `feat(export): JSON shortlist endpoint`, `feat(export): printable HTML shortlist`, `feat(matches): export button`.

### W1.4 — Stats page

- New: `src/routes/s/[sessionId]/stats/+page.server.ts`, `+page.svelte`, `src/lib/stats/aggregate.ts` (+ test).
- Read-only against existing `getVotes` / `getMatches`. Computes:
  - Like rate per partner (yes + super) / total.
  - Mutual likes count.
  - Disagreement list: names where one partner said yes/super and another said no.
- First commit: `test(stats): computeStats` returning `{ likeRate, mutualLikes, disagreements }`.
- Then: `feat(stats): stats route + aggregations`.

### W1.5 — README polish + flip repo public

- File: `README.md`.
- Add: live demo link, screenshot, license blurb (MIT app code, CC BY-SA dataset), attribution to SSA + Behind the Name, `pnpm dev` quick start, link to `docs/ROADMAP.md`.
- Run `gh secret-scanning` against the repo before flipping visibility.
- Hold the visibility flip until W1.2's `/sw-clear` kill switch has shipped — first-impression visitors should not be able to be poisoned by a stale service worker.
- Commit: `docs(readme): polish for public launch`.
- Repo-visibility flip is a manual GitHub setting, not a commit.

### W1.6 — D1 scaffolding (PR-1 of 3)

- New: `migrations/0001_init.sql`, `src/lib/server/db.ts`.
- Modify: `wrangler.toml` (add `[[d1_databases]]` binding for `DB`).
- Schema: `users`, `sessions`, `partners`, `votes`, `name_meta` per ROADMAP.
- No callers yet. Does **not** modify `src/lib/server/sessions.ts`. Unblocks Wave 2 without coordinating a cutover.
- First commit: `test(db): schema applies cleanly` against an in-memory better-sqlite3 fixture.
- Then: `feat(db): D1 binding + initial migration`.

## Wave 2 (sequenced after W1.6 lands)

Hold all of these until W1.6 has merged so `sessions.ts` stays clear of merge conflicts during the parallel wave.

### W2.1 — D1 dual-write (PR-2 of 3)

- Modify: `src/lib/server/sessions.ts:appendVotes` — write to both KV and D1. Reads still hit KV.
- Vitest fixture compares both stores for parity.
- Commit: `feat(db): dual-write votes to KV and D1`.

### W2.2 — D1 read cutover (PR-3 of 3)

- Flip reads to D1. KV becomes hot-state-only (cursor, recent-votes ring buffer).
- Remove the dual-write fallback once parity holds in production for a week.
- Commit: `feat(db): read votes from D1; KV demoted to hot state`.

### W2.3 — Magic-link auth via Resend

- Depends on `users` and `sessions` tables existing in D1.
- New: `src/routes/auth/login/+page.svelte`, `src/routes/auth/callback/+server.ts`, `src/lib/server/auth.ts`.
- Modify: `src/hooks.server.ts` to read auth cookie and populate `event.locals.user`.
- Anonymous sessions still work without auth; first sign-in merges the anonymous session into the user account.
- Commit chain: `feat(auth): magic-link infrastructure`, `feat(auth): /auth/login + Resend send`, `feat(auth): /auth/callback + session merge`.

### W2.4 — Post-deck shortlist mode

- Depends on D1 (`shortlists` table).
- New: `/s/[id]/shortlist` route — narrows matches to a top 5 via head-to-head comparisons.
- Commit: `feat(shortlist): top-5 narrowing pass over matches`.

## Anti-tasks (NOT in Phase 1.5)

- Astro migration or per-name SEO routes (Phase 2).
- Recommendation algorithm / collaborative filter (Phase 2).
- Search by meaning / origin / sound (Phase 2).
- Couple style analysis / Baby Name DNA (Phase 2).
- User-created lists or themed-list auto-generation (Phase 2).
- Multi-partner sessions as a UX affordance (already works at the URL level — see ROADMAP).
- BTN data drop into `data/btn/` — that's Phase 1's outstanding item, not 1.5 work.

If a task seems implied but isn't here, stop and ask.

## Decisions deferred to maintainer

- Resend vs. another magic-link provider for W2.3.
- Whether to ship `name_meta` rows into D1 (30k+ rows) or keep them in `static/names.json` and only put per-session vote/match data in D1.
- Final repo-public flip date — gated on W1.2 + W1.5 landing.
