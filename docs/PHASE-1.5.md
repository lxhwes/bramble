# Phase 1.5: Public launch prep

**Status:** Wave 1 shipped 2026-05-04 (W1.5 partial — see Outstanding). Wave 2 partial — W2.1 and W2.4 shipped 2026-05-04; W2.2a shipped 2026-05-05; W2.2b and W2.3 deferred. Wave 3 partial — W3.0 shipped 2026-05-05; W3.1–W3.7 planned, runs in parallel with W2.2b's soak window. See `ROADMAP.md` for the phase goal and DoD; this file is the executable task list.

Goal: foundational work that's a precondition for inviting strangers — D1 migration, magic-link auth, PWA, stats, export, shortlist mode, runner deps bump, public repo.

## Recommended wave (parallel, ship independently)

Six items below touch disjoint files and can land in any order. Plan rationale lives in `~/.claude/plans/review-docs-roadmap-md-and-plan-glittery-perlis.md`.

### W1.1 — GH Actions runner deps bump `9789564`

- File: `.github/workflows/deploy.yml`.
- Bump `actions/checkout@v4` → `v6`, `actions/setup-node@v4` → `v6`, `pnpm/action-setup@v4` → `v6`, `cloudflare/wrangler-action@v3` (already on v3, pin to latest patch).
- Keep Node 22 (already past Node 20 EOL deadline of 2026-09-16).
- Verify deploy job stays green on a throwaway branch before merging.
- Commit: `chore(ci): bump GitHub Actions runner deps`.

### W1.2 — PWA scaffold `5bfe3af`

- New: `static/manifest.webmanifest`, `static/icons/*`, `src/service-worker.ts`, `src/lib/pwa/cache.ts` (+ test), `src/lib/components/InstallBanner.svelte`.
- Modify: `src/app.html` (manifest link tag).
- Service worker versions its cache name with a build-time `__APP_VERSION__` constant. Ship a `/sw-clear` route that unregisters the SW and clears caches — kill switch before flipping repo public.
- First commit: `test(pwa): cache version helper` + the helper.
- Subsequent commits: `feat(pwa): manifest and icons`, `feat(pwa): service worker with versioned cache`, `feat(pwa): install banner`, `feat(pwa): /sw-clear kill switch`.

### W1.3 — Export shortlist (JSON + printable HTML) `309db1d`

- New: `src/routes/s/[sessionId]/matches/export.json/+server.ts`, `src/routes/s/[sessionId]/matches/export.html/+server.ts`, `src/lib/export/shortlist.ts` (+ test).
- Modify: `src/routes/s/[sessionId]/matches/+page.svelte` — add export button.
- Read-only path. Reuses `getMatches` from `src/lib/server/sessions.ts`. JSON shape: `{ sessionId, generatedAt, matches: [{ name, sex, partners: [...] }] }`. HTML view is a single-page printable layout with `@media print` styles.
- First commit: `test(export): buildShortlistJson` + helper.
- Then: `feat(export): JSON shortlist endpoint`, `feat(export): printable HTML shortlist`, `feat(matches): export button`.

### W1.4 — Stats page `2023182`

- New: `src/routes/s/[sessionId]/stats/+page.server.ts`, `+page.svelte`, `src/lib/stats/aggregate.ts` (+ test).
- Read-only against existing `getVotes` / `getMatches`. Computes:
  - Like rate per partner (yes + super) / total.
  - Mutual likes count.
  - Disagreement list: names where one partner said yes/super and another said no.
- First commit: `test(stats): computeStats` returning `{ likeRate, mutualLikes, disagreements }`.
- Then: `feat(stats): stats route + aggregations`.

### W1.5 — README polish + flip repo public `0880100` (partial)

- File: `README.md`.
- Add: live demo link, screenshot, license blurb (MIT app code, CC BY-SA dataset), attribution to SSA + Behind the Name, `pnpm dev` quick start, link to `docs/ROADMAP.md`.
- Run `gh secret-scanning` against the repo before flipping visibility.
- Hold the visibility flip until W1.2's `/sw-clear` kill switch has shipped — first-impression visitors should not be able to be poisoned by a stale service worker.
- Commit: `docs(readme): polish for public launch`.
- Repo-visibility flip is a manual GitHub setting, not a commit.

### W1.6 — D1 scaffolding (PR-1 of 3) `988f5b7`

- New: `migrations/0001_init.sql`, `src/lib/server/db.ts`.
- Modify: `wrangler.toml` (add `[[d1_databases]]` binding for `DB`).
- Schema: `users`, `sessions`, `partners`, `votes`, `name_meta` per ROADMAP.
- No callers yet. Does **not** modify `src/lib/server/sessions.ts`. Unblocks Wave 2 without coordinating a cutover.
- First commit: `test(db): schema applies cleanly` against an in-memory better-sqlite3 fixture.
- Then: `feat(db): D1 binding + initial migration`.

## Outstanding (Wave 1)

- **W1.5 README polish — public-launch copy.** The "Status: early development — Phase 0" line is intentionally untouched per maintainer instruction; live demo link and screenshot are likewise deferred. These flip together with the repo's GitHub visibility setting in a follow-up commit when the maintainer is ready.
- **W1.2 PWA icons.** `static/icons/icon-192.png` and `icon-512.png` are solid-coral placeholders. Replace with real branded artwork before public launch.
- **W1.1 CI verification.** The actions bump landed on `main`; first push validates the bumped runners on a real deploy.

## Wave 2 (sequenced after W1.6 lands)

Hold all of these until W1.6 has merged so `sessions.ts` stays clear of merge conflicts during the parallel wave.

### W2.1 — D1 dual-write (PR-2 of 3) `99e73a6`

- Modify: `src/lib/server/sessions.ts:appendVotes` — write to both KV and D1. Reads still hit KV.
- Vitest fixture compares both stores for parity.
- Commit: `feat(db): dual-write votes to KV and D1`.

### W2.2a — D1 read cutover `f165d51`

- Modify: `src/lib/server/sessions.ts` — `getVotes` now reads from D1 via JOIN on partners (session_id + slug → partner_id → votes), ordered by `ts ASC`.
- `getMatches` auto-flips since it delegates to `getVotes`. KV dual-write retained as safety net.
- `updatedAt` = max(votes.ts) for the partner; result is `null` when D1 has no rows (covers old KV-only sessions — accepted data loss).
- Falls back to KV when `env.db` is null so unit tests without a D1 fixture keep working.
- Commit: `feat(db): read votes from D1; KV demoted to hot state`.

### W2.2b — Remove dual-write fallback — deferred

- Remove the KV dual-write from `appendVotes` once W2.2a has soaked in production for ~one week.
- Commit: `feat(db): remove KV dual-write; D1 is canonical`.
- **Held:** waiting for ~one week production soak of W2.2a.

### W2.3 — Magic-link auth via Resend — deferred

- Depends on `users` and `sessions` tables existing in D1.
- New: `src/routes/auth/login/+page.svelte`, `src/routes/auth/callback/+server.ts`, `src/lib/server/auth.ts`.
- Modify: `src/hooks.server.ts` to read auth cookie and populate `event.locals.user`.
- Anonymous sessions still work without auth; first sign-in merges the anonymous session into the user account.
- Commit chain: `feat(auth): magic-link infrastructure`, `feat(auth): /auth/login + Resend send`, `feat(auth): /auth/callback + session merge`.
- **Held:** needs maintainer input on Resend API key, sender domain, and email template before scaffolding can begin.

### W2.4 — Post-deck shortlist mode `b1ff684`

- Adds `shortlists` table via migration 0002.
- New: `/s/[id]/shortlist` route. UX is tap-to-add/remove — server-authoritative via SvelteKit form actions with `use:enhance`.
- Head-to-head tournament narrowing was descoped to Phase 3+; v1 ships the simpler tap-toggle.

## Wave 3 (parallel, runs during W2.2b soak)

Launch-readiness items. Disjoint files; can land in any order. All must merge before the repo-public flip in W1.5.

### W3.0 — About page + footer attribution `47010f7` `c7520ec` `6a1a878`

- New: `src/lib/components/Footer.svelte` (+ test), `src/routes/about/+page.svelte`.
- Modify: `src/routes/+layout.svelte` — render `<Footer />` after children.
- Closes the CLAUDE.md attribution gap: SSA + Behind the Name + CC BY-SA 4.0 now render in-app, not just README.
- Shipped 2026-05-05.

### W3.1 — OpenGraph + Twitter card meta tags

- Modify: `src/routes/+layout.svelte` `<svelte:head>` (or `src/app.html`) — add `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`, `twitter:image`.
- New: `static/og.png` (1200×630) — branded coral/sage hero artwork.
- Verify unfurl in iMessage, Slack, and Twitter/X against the deployed URL before declaring done.
- Commit: `feat(meta): opengraph and twitter card tags`.

### W3.2 — Cloudflare Web Analytics

- Add the Cloudflare Web Analytics beacon (free, first-party, cookie-less) to `src/app.html`.
- Beacon token comes from the Cloudflare dashboard; treat as non-secret but inject via build-time env var rather than hardcoding.
- About page promises "no third-party analytics" — CF is first-party, consistent with that promise.
- Commit: `feat(analytics): cloudflare web analytics beacon`.

### W3.3 — Session TTL / data retention

- Decide retention window (default suggestion: 90 days since last vote).
- Implement as a Cloudflare Cron Trigger hitting a scheduled handler that deletes inactive sessions, partners, votes, and shortlist rows in one D1 transaction.
- Update About page copy to state the actual retention window once decided.
- First commit: `test(sessions): pruneInactiveSessions` + helper.
- Then: `feat(sessions): scheduled session pruning`.

### W3.4 — Rate limiting

- Cloudflare Rate Limiting rules on `POST /` (session create) and the vote-append path. Suggested: 30 req/min/IP for vote append, 5 req/min/IP for session create.
- Configure via Cloudflare dashboard if possible; otherwise minimal middleware in `src/hooks.server.ts`.
- Commit: `chore(infra): rate-limit session create and vote append` (only if app-side change is needed; dashboard rules don't require a commit).

### W3.5 — Custom 404 / error page

- New: `src/routes/+error.svelte` — branded error page covering 404 and 5xx.
- Coral/sage palette + DM Sans, with links back to `/` and `/about`.
- Commit: `feat(errors): custom error page`.

### W3.6 — Robots.txt + sitemap.xml

- New: `static/robots.txt` — allow-all for now; tighten in Phase 2 when per-name routes ship.
- New: `src/routes/sitemap.xml/+server.ts` — initial sitemap with `/` and `/about`. Phase 2 extends with per-name URLs.
- Commit: `feat(seo): robots.txt and initial sitemap`.

### W3.7 — D1 backup posture (decision)

- **TBD.** Three viable options:
  1. Accepted loss — document the policy in `ARCHITECTURE.md`. Personal-tool grade. Zero infra.
  2. Scheduled R2 export — Cron Trigger runs `wrangler d1 export` and writes to an R2 bucket weekly. Cheap; survives D1 corruption.
  3. On-demand maintainer backup — manual command, no automation. Lowest cost; relies on discipline.
- Hold implementation until decision is made; do not pick speculatively.

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
- W3.3 retention window (default proposal: 90 days since last vote).
- W3.7 D1 backup posture — pick one of the three options listed under W3.7.
