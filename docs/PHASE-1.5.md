# Phase 1.5: Public launch prep

**Status:** Wave 1 shipped 2026-05-04 (W1.5 partial — see Outstanding). Wave 2 partial — W2.1 and W2.4 shipped 2026-05-04; W2.2a shipped 2026-05-05; W2.2b waiting on prod soak; W2.3 dropped 2026-05-08. Wave 3 partial — W3.0 shipped 2026-05-05; W3.5/W3.6/W3.7 shipped 2026-05-06; W3.1–W3.4 planned, runs in parallel with W2.2b's soak window. Out-of-band: Phase 1's outstanding BTN data drop closed out 2026-05-05 with a narrower data model (related synonyms only, no origin/meaning) — see `ROADMAP.md` Phase 1 entry. Phase 1.6 self-host target slotted between Phase 1.5 close and the W1.5 repo-public flip — see `ROADMAP.md`. See `ROADMAP.md` for the phase goal and DoD; this file is the executable task list.

Goal: foundational work that's a precondition for inviting strangers — D1 migration, PWA, stats, export, shortlist mode, runner deps bump, public repo.

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
- **W1.3 Favicon.** `static/favicon.svg` is a coral-on-cream "b" placeholder. Replace with the real mark once logo selection from `logo-ideas.md` is finalized.
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

### W2.3 — Magic-link auth via Resend — dropped 2026-05-08

- Removed from scope. URL-shared anonymous sessions remain the only access pattern. Without auth there is no PII collection, so the dependent privacy-policy item also drops.
- The `users` table in `migrations/0001_init.sql` is now vestigial alongside `name_meta`. A follow-up migration may drop them if the maintainer wants the schema clean.

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

- Retention window: **90 days since last vote** (decided 2026-05-05).
- Implement as a Cloudflare Cron Trigger hitting a scheduled handler that deletes inactive sessions, partners, votes, and shortlist rows in one D1 transaction.
- Update About page copy to state the 90-day retention window.
- First commit: `test(sessions): pruneInactiveSessions` + helper.
- Then: `feat(sessions): scheduled session pruning`.

### W3.4 — Rate limiting

- Cloudflare Rate Limiting rules on `POST /` (session create) and the vote-append path. Suggested: 30 req/min/IP for vote append, 5 req/min/IP for session create.
- Configure via Cloudflare dashboard if possible; otherwise minimal middleware in `src/hooks.server.ts`.
- Commit: `chore(infra): rate-limit session create and vote append` (only if app-side change is needed; dashboard rules don't require a commit).

### W3.5 — Custom 404 / error page `93b5a1a`

- New: `src/routes/+error.svelte` — branded error page covering 404 and 5xx.
- Coral/sage palette + DM Sans, with links back to `/` and `/about`.
- Shipped 2026-05-06.

### W3.6 — Robots.txt + sitemap.xml `8802c4b`

- `static/robots.txt` — allow-all for now; tighten in Phase 2 when per-name routes ship. (Predated W3.6; left in place.)
- New: `src/routes/sitemap.xml/+server.ts` — initial sitemap with `/` and `/about`, absolute URLs derived from the request origin. Phase 2 extends with per-name URLs.
- Shipped 2026-05-06.

### W3.7 — D1 backup posture (decided 2026-05-05) `fa6ad14`

- Cloudflare D1 Time Travel provides automatic point-in-time recovery for the last 7 days; that's the canonical backup. Restore via `wrangler d1 time-travel restore`.
- Pre-migration discipline: maintainer runs `wrangler d1 export bramble --output=...` before any risky migration as a belt-and-suspenders snapshot.
- Older-than-7-day data loss is accepted (personal-tool grade; swipe votes lose meaning after a name decision).
- Implementation: short subsection in `ARCHITECTURE.md` capturing this policy. No automation to build.
- Shipped 2026-05-06.

## Anti-tasks (NOT in Phase 1.5)

- Astro migration or per-name SEO routes (Phase 2).
- Recommendation algorithm / collaborative filter (Phase 2).
- Search by meaning / origin / sound (Phase 2).
- Couple style analysis / Baby Name DNA (Phase 2).
- User-created lists or themed-list auto-generation (Phase 2).
- Multi-partner sessions as a UX affordance (already works at the URL level — see ROADMAP).

If a task seems implied but isn't here, stop and ask.

## Decisions deferred to maintainer

- Whether to populate the `name_meta` D1 table or keep all name attributes in `static/names.json`. The table's `origin`/`meaning` columns (per `migrations/0001_init.sql`) are vestigial after the 2026-05-05 BTN closeout — the live attributes are now `peak_year`, `total`, and `related` (the latter not in the migration). If the maintainer ever decides to populate `name_meta`, a follow-up migration would drop `origin`/`meaning` and add `related` (likely as a JSON-encoded TEXT column).
- Whether to drop the now-vestigial `users` table (alongside `name_meta`) in a schema cleanup migration after W2.3 was dropped 2026-05-08.
- Final repo-public flip date — gated on W1.2 + W1.5 landing.
