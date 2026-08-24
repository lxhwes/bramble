# Architecture

## Tech stack

### SvelteKit, two deploy targets

SvelteKit gives us SSR, routing, and a single-language mental model — "frontend" and "backend" share one repo, one runtime context, no separate API service. The same app builds for two targets, selected by `BRAMBLE_TARGET` at build time:

- **Node / self-host (primary).** `@sveltejs/adapter-node` produces a plain Node HTTP server backed by a single `better-sqlite3` file. This is the deployment path the project documents and maintains — `docker compose up` with no external accounts. See the [feature matrix](#cloudflare-vs-node-feature-matrix) below.
- **Cloudflare Pages (the maintainer's host).** `@sveltejs/adapter-cloudflare` compiles server routes to Workers backed by D1 + KV. It is how the maintainer runs the live instance; it is not a prerequisite for anyone else.

We may migrate to Astro at Phase 2 when per-name SEO pages become the dominant route count. Until then, SvelteKit's DX is the right tradeoff.

### Storage: SQLite everywhere, behind one seam

The storage implementation is behind a `getStorage()` seam in `src/lib/server/storage/`. The Node target uses a `better-sqlite3` file (votes + a `kv` table). The Cloudflare target uses D1 for vote storage and KV for hot session state (deck cursor per partner, `slug → sessionId` lookup, session meta blob). Both are SQLite under the hood, so business-logic SQL is portable and the seam stays thin. `better-sqlite3` is excluded from the Cloudflare Worker bundle via build-time dead-code elimination.

D1 became the source of truth for vote reads in Phase 1.5 (W2.2a, 2026-05-05); Phase 0 ran KV-only. The KV `session:{id}:partner:{slug}` vote blob is still dual-written on both targets as a safety net — `appendVotes` writes it and `getVotes` falls back to it. Phase 1.6's W0.4 convergence will drop that write/read so KV holds only the `session:{id}:meta` blob; until W0.4 ships (its task in `PHASE-1.6.md` carries no commit hash yet), SQL is authoritative for reads but not yet the sole store.

### No auth

Sessions are identified by a UUID in the URL. Partners within a session are identified by a slug in `?p=`. That's enough trust for two people who already share a relationship and a phone plan. Magic-link auth was considered for Phase 1.5 (W2.3) and dropped 2026-05-08 — URL-shared anonymous sessions are now the permanent access pattern. No PII is collected, so no privacy policy is required.

### Static name dataset

Names data is bundled as a single `static/names.json` produced by `scripts/build-names.ts`. Built once, committed to the repo, served from the CDN edge. No runtime API calls, no rate limits, works offline.

The build script merges:
- **SSA national data** (`names.zip` from ssa.gov) — public domain, gives us name + sex + year frequency from 1880 onward.
- **Behind the Name bulk synonyms export** (`data/btn/btn_givennames_synonyms.txt`) — name + gender + comma-separated related-name synonyms. The bulk file declares CC BY-SA 4.0 in its own header (a separate license grant from BTN's website terms). BTN's lookup API does not expose etymology or meaning text — those are website-only — so origin/meaning are not part of the bundled dataset.

For Phase 0 we filter to names appearing ≥100 times in any year between 1995 and 2024. Yields ~3–5k names, manageable card deck size, reasonable popularity floor.

## Cloudflare vs Node feature matrix

| Concern | Node (self-host, primary) | Cloudflare (maintainer's host) | Notes |
|---|---|---|---|
| Storage | `better-sqlite3` SQLite file + `kv` table | D1 (votes) + KV (hot session meta) | Both behind the `getStorage()` seam in `src/lib/server/storage/` |
| Build adapter | `@sveltejs/adapter-node` | `@sveltejs/adapter-cloudflare` | Selected by `BRAMBLE_TARGET` in `svelte.config.js` |
| Rate limiting | In-process fixed-window limiter in `src/hooks.server.ts` | Cloudflare edge WAF (dashboard-configured) | Same thresholds; node limiter is per-process |
| Cron / pruning | `node build/prune.js` on a host cron (via `docker compose exec`) | Cloudflare Cron Trigger via `wrangler.toml` + `patch-worker.ts` | Both call the same `pruneInactiveSessions()` helper |
| Backups | `sqlite3 .backup` host cron | D1 Time Travel (7-day PITR) | Same accepted-loss posture |
| Web Analytics | None — no telemetry of any kind | Cloudflare Web Analytics, auto-injected by Pages | Self-host collects nothing; nothing to configure |
| Client IP | `ADDRESS_HEADER` / `XFF_DEPTH` env vars | Cloudflare header, handled by edge | Needed for accurate rate-limit keying behind a reverse proxy |
| Migrations | Auto-applied lazily on startup | `wrangler d1 migrations apply` + `patch-worker.ts` scheduled handler | Node target runs migrations on first boot |

## Data model

### Phase 0 (KV only)

```
session:{sessionId}:partner:{partnerSlug}
  → { votes: [{ name, sex, vote: "yes"|"no"|"super", ts }], updatedAt }

session:{sessionId}:meta
  → { createdAt, partnerSlugs: [string] }
```

That's it. Match view loads all partner keys for a session, intersects the `yes` votes by name, returns the list.

### Phase 1.5 (D1)

```sql
sessions (id, owner_user_id?, name, created_at)
partners (id, session_id, user_id?, slug, display_name)
votes (id, partner_id, name_slug, vote, created_at)
shortlists (session_id, partner_slug, name_slug, added_at)  -- migration 0002
```

The live tables are `sessions`, `partners`, `votes` (W1.6 + W2.1 + W2.2a) and `shortlists` (W2.4). KV continues to hold the hot deck cursor per partner and the `slug → sessionId` lookup.

Two tables in `migrations/0001_init.sql` are vestigial:
- `users` — was the basis for the dropped W2.3 magic-link auth. Now unused; a future migration may drop it.
- `name_meta` — was meant to hold name attributes; dormant since the 2026-05-05 BTN closeout. Its `origin`/`meaning` columns rely on data BTN does not redistribute. If it's ever populated, a follow-up migration will drop those columns and add a `related` column.

## Rate limiting

Two Cloudflare WAF rate limiting rules protect the write surface. Both are configured in the Cloudflare dashboard and live outside the repo — a maintainer must apply them manually after each new zone setup.

### Rules

| Rule | Path | Method | Threshold | Action |
|------|------|--------|-----------|--------|
| vote-append | `/s/*/vote` | POST | 30 req / 1 min / IP | Block for 1 minute |
| session-create | `/` | POST | 5 req / 1 min / IP | Block for 1 minute |

### Dashboard steps

1. Cloudflare dashboard → your zone → **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
2. For **vote-append**:
   - Name: `vote-append`
   - Expression: `(http.request.uri.path matches "^/s/[^/]+/vote$" and http.request.method eq "POST")`
   - Characteristic: `IP`
   - Requests: `30` per `1 minute`
   - Action: **Block** — Duration: `1 minute`
3. For **session-create**:
   - Name: `session-create`
   - Expression: `(http.request.uri.path eq "/" and http.request.method eq "POST")`
   - Characteristic: `IP`
   - Requests: `5` per `1 minute`
   - Action: **Block** — Duration: `1 minute`

### No app-side middleware (Cloudflare target)

These rules are enforced at the Cloudflare edge before the Worker runs, so no `hooks.server.ts` middleware is needed for the Cloudflare target.

### In-process rate limiter (node target)

`src/hooks.server.ts` implements a fixed-window in-process rate limiter that is active only when `BRAMBLE_TARGET=node`. It mirrors the WAF thresholds exactly:

| Rule | Path | Method | Threshold |
|------|------|--------|-----------|
| vote-append | `/s/*/vote` | POST | 30 req / 60 s / IP |
| session-create | `/` | POST | 5 req / 60 s / IP |

Because the limiter is in-process, it is per-replica. Running multiple replicas behind a load balancer requires an additional reverse-proxy rate limit (e.g. nginx `limit_req`).

## Session retention

Sessions and their votes are deleted after a configurable inactivity window (default 90 days, set via `BRAMBLE_RETENTION_DAYS`). The 90-day default was chosen because swipe activity is decision-driven: once a couple picks a name (or moves on), the vote history loses meaning, and indefinite retention is just storage drift.

### Implementation

- `pruneInactiveSessions(db, nowMs)` in `src/lib/server/prune.ts` deletes from `votes`/`partners`/`shortlists`/`sessions` for sessions whose newest vote is older than `BRAMBLE_RETENTION_DAYS` days, plus orphan sessions with no votes at all.
- **Node target**: pruning runs as `node build/prune.js` on a host cron — typically `docker compose exec -T app node build/prune.js`. `scripts/prune-cli.ts` is the source; `scripts/bundle-prune.ts` compiles it to `build/prune.js` during `build:node` so the runtime image needs no `tsx`/`pnpm`/`scripts/`. Daily granularity is fine for a 90-day window; being off by one day is inconsequential.
- **Cloudflare target**: `src/lib/server/scheduled.ts` is the Cloudflare scheduled-event entry that calls the prune helper. The cron schedule lives in `wrangler.toml` `[triggers]`: `crons = ["0 4 * * *"]` — daily at 04:00 UTC.

### Why `scripts/patch-worker.ts` exists

`@sveltejs/adapter-cloudflare` (v7) generates `.svelte-kit/cloudflare/_worker.js` itself during the SvelteKit build and does not expose an extension point for adding a `scheduled` export from application code. `scripts/patch-worker.ts` is a postbuild step (wired up in `package.json` as `postbuild`) that appends a self-contained `scheduled` export — with the prune SQL inlined — to the generated `_worker.js`. This is intentional, not a build hack: deleting it would silently disable the cron handler.

If a future SvelteKit/adapter-cloudflare release adds first-class scheduled-handler support, the patch script becomes deletable. Until then, treat it as part of the build pipeline.

### Pages dashboard activation

For Cloudflare Pages projects, the `[triggers]` block in `wrangler.toml` is honoured by `wrangler pages dev` (local) only. Production cron must also be activated in the Cloudflare dashboard under Pages → Settings → Functions → Cron Triggers — same posture as the WAF rate-limit rules above.

## Web Analytics

Cloudflare Web Analytics — first-party, cookie-less, free tier — is the only telemetry, and it runs on the hosted demo instance only. It is **injected by the Cloudflare Pages dashboard** (Settings → Web Analytics), not by application code. The app-side beacon snippet and its `PUBLIC_CF_ANALYTICS_TOKEN` env var were removed on 2026-05-12 so that auto-injection is the single source of truth and cannot double-count.

**Self-host collects no telemetry at all.** There is no beacon, no token, and nothing to configure or opt out of — the Node build has no analytics code path. The About page discloses analytics only on the Cloudflare build.

No Google Analytics, no Plausible, no Sentry.

## Backup posture

### Cloudflare target

Cloudflare D1 Time Travel provides automatic point-in-time recovery for the last 7 days. That's the canonical backup. Restore via `wrangler d1 time-travel restore bramble --timestamp=<iso8601>`.

Pre-migration discipline: maintainer runs `wrangler d1 export bramble --output=backups/<date>-pre-migration.sql` before any risky migration as a belt-and-suspenders snapshot. The export file is gitignored — store it locally or upload to R2 if longer retention matters for that specific migration.

### Node target

SQLite file is backed up via `sqlite3 .backup` on a host cron. Same accepted-loss posture: older-than-last-backup data loss is accepted.

Bramble is personal-tool grade; swipe votes lose meaning shortly after a name decision is made, and a hard recovery scenario isn't worth automation cost. No off-platform replication.

## Deployment

### Self-host (primary)

- `docker compose up -d` builds the Node image and starts a single container backed by a SQLite volume. Migrations run lazily on the first request; no separate migrate step.
- Required env: `ORIGIN` (adapter-node CSRF). See the README [Self-host](../README.md#self-host) section for the full env table and host cron jobs (prune + backup).

### Cloudflare (the maintainer's host)

- `wrangler pages deploy` from CI on push to `main`.
- Subdomain on `oovoid.com` configured by maintainer (CNAME to the Pages project).
- Branch deploys for PRs (Pages does this automatically).

## Why the maintainer runs on Cloudflare

Self-host is the documented path for everyone else; Cloudflare is the maintainer's personal host, chosen for reasons specific to that one deployment:

- Maintainer is already a Cloudflare power user; mental overhead is zero.
- Free tier covers everything Phase 0–1 needs.
- KV, D1, R2, Workers, Pages, Email Routing all in one platform — no glue services.
- Wrangler CLI integrates cleanly into local dev (`pnpm dev` proxies to local KV/D1).

## Things deliberately not used

- **No Vercel.** Same shape as Cloudflare for our purposes; no reason to fragment.
- **No Supabase / Postgres.** Overkill for this data shape. The Cloudflare target uses D1; the self-host target uses `better-sqlite3`. Postgres is intentionally unsupported on both paths.
- **No React.** Fine framework, but Svelte's single-file components and lower ceremony fit a solo project better.
- **No auth at all.** URL-shared anonymous sessions are the access pattern. Magic-link auth was scoped for Phase 1.5 (W2.3) and dropped 2026-05-08 — couples who already share a phone plan don't need an account, and no auth means no PII means no privacy policy.
- **No third-party analytics** (Google Analytics, Plausible, Mixpanel). Cloudflare Web Analytics is first-party and cookieless — see § Web Analytics.
