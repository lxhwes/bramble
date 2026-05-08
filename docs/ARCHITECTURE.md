# Architecture

## Tech stack

### SvelteKit on Cloudflare Pages

SvelteKit gives us SSR, routing, and a single-language mental model. The Cloudflare adapter compiles server routes to Workers, so "frontend" and "backend" share one repo, one deploy, and one runtime context. No separate API service.

We may migrate to Astro at Phase 2 when per-name SEO pages become the dominant route count. Until then, SvelteKit's DX is the right tradeoff.

### Cloudflare D1 + KV

D1 is the source of truth for vote storage as of Phase 1.5 (W2.2a, 2026-05-05). KV continues to hold hot session state where eventual consistency is fine and key-shape is predictable: deck cursor per partner, `slug → sessionId` lookup, session meta blob.

Phase 0 ran KV-only. The public-launch-prep cutover (W1.6/W2.1/W2.2a) added the D1 schema and migrated votes; KV dual-write is retained as a safety net pending W2.2b's removal after a one-week production soak.

### No auth

Sessions are identified by a UUID in the URL. Partners within a session are identified by a slug in `?p=`. That's enough trust for two people who already share a relationship and a phone plan. Magic-link auth was considered for Phase 1.5 (W2.3) and dropped 2026-05-08 — URL-shared anonymous sessions are now the permanent access pattern. No PII is collected, so no privacy policy is required.

### Static name dataset

Names data is bundled as a single `static/names.json` produced by `scripts/build-names.ts`. Built once, committed to the repo, served from the CDN edge. No runtime API calls, no rate limits, works offline.

The build script merges:
- **SSA national data** (`names.zip` from ssa.gov) — public domain, gives us name + sex + year frequency from 1880 onward.
- **Behind the Name bulk synonyms export** (`data/btn/btn_givennames_synonyms.txt`) — name + gender + comma-separated related-name synonyms. The bulk file declares CC BY-SA 4.0 in its own header (a separate license grant from BTN's website terms). BTN's lookup API does not expose etymology or meaning text — those are website-only — so origin/meaning are not part of the bundled dataset.

For Phase 0 we filter to names appearing ≥100 times in any year between 1995 and 2024. Yields ~3–5k names, manageable card deck size, reasonable popularity floor.

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

### No app-side middleware

These rules are enforced at the Cloudflare edge before the Worker runs, so no `hooks.server.ts` middleware is needed. If Bramble gains a self-host target (Phase 1.6), a lightweight in-process fallback should be evaluated at that point.

## Session retention

Sessions and their votes are deleted 90 days after the last vote. The 90-day window was chosen because swipe activity is decision-driven: once a couple picks a name (or moves on), the vote history loses meaning, and indefinite retention is just storage drift.

### Implementation

- `pruneInactiveSessions(db, nowMs)` in `src/lib/server/prune.ts` deletes from `votes`/`partners`/`shortlists`/`sessions` for sessions whose newest vote is older than 90 days, plus orphan sessions with no votes at all.
- `src/lib/server/scheduled.ts` is the Cloudflare scheduled-event entry that calls the prune helper.
- The cron schedule lives in `wrangler.toml` `[triggers]`: `crons = ["0 4 * * *"]` — daily at 04:00 UTC. Daily granularity is fine for a 90-day window; being off by one day is inconsequential.

### Why `scripts/patch-worker.ts` exists

`@sveltejs/adapter-cloudflare` (v7) generates `.svelte-kit/cloudflare/_worker.js` itself during the SvelteKit build and does not expose an extension point for adding a `scheduled` export from application code. `scripts/patch-worker.ts` is a postbuild step (wired up in `package.json` as `postbuild`) that appends a self-contained `scheduled` export — with the prune SQL inlined — to the generated `_worker.js`. This is intentional, not a build hack: deleting it would silently disable the cron handler.

If a future SvelteKit/adapter-cloudflare release adds first-class scheduled-handler support, the patch script becomes deletable. Until then, treat it as part of the build pipeline.

### Pages dashboard activation

For Cloudflare Pages projects, the `[triggers]` block in `wrangler.toml` is honoured by `wrangler pages dev` (local) only. Production cron must also be activated in the Cloudflare dashboard under Pages → Settings → Functions → Cron Triggers — same posture as the WAF rate-limit rules above.

## Web Analytics

Cloudflare Web Analytics — first-party, cookie-less, free tier — is the only telemetry. Beacon snippet lives in `src/routes/+layout.svelte`'s `<svelte:head>`, gated on the optional `PUBLIC_CF_ANALYTICS_TOKEN` env var (`$env/dynamic/public`). When the variable is unset (local dev, PR previews, self-host), no beacon is rendered. The token is non-secret and is set in the Cloudflare Pages dashboard under Settings → Environment Variables.

No Google Analytics, no Plausible, no Sentry. The About page's "no third-party analytics" promise is enforceable because Cloudflare Web Analytics is first-party and reads no cookies.

## D1 backup posture

Cloudflare D1 Time Travel provides automatic point-in-time recovery for the last 7 days. That's the canonical backup. Restore via `wrangler d1 time-travel restore bramble --timestamp=<iso8601>`.

Pre-migration discipline: maintainer runs `wrangler d1 export bramble --output=backups/<date>-pre-migration.sql` before any risky migration as a belt-and-suspenders snapshot. The export file is gitignored — store it locally or upload to R2 if longer retention matters for that specific migration.

Older-than-7-day data loss is accepted. Bramble is personal-tool grade; swipe votes lose meaning shortly after a name decision is made, and a hard recovery scenario beyond a week of history isn't worth the automation cost. No backup automation, no cron-driven exports, no off-platform replication.

## Deployment

- `wrangler pages deploy` from CI on push to `main`.
- Subdomain on `oovoid.com` configured by maintainer (CNAME to the Pages project).
- Branch deploys for PRs (Pages does this automatically).

## Why Cloudflare specifically

- Maintainer is already a Cloudflare power user; mental overhead is zero.
- Free tier covers everything Phase 0–1 needs.
- KV, D1, R2, Workers, Pages, Email Routing all in one platform — no glue services.
- Wrangler CLI integrates cleanly into local dev (`pnpm dev` proxies to local KV/D1).

## Things deliberately not used

- **No Vercel.** Same shape as Cloudflare for our purposes; no reason to fragment.
- **No Supabase / Postgres.** Overkill for this data shape. D1 is plenty.
- **No React.** Fine framework, but Svelte's single-file components and lower ceremony fit a solo project better.
- **No auth at all.** URL-shared anonymous sessions are the access pattern. Magic-link auth was scoped for Phase 1.5 (W2.3) and dropped 2026-05-08 — couples who already share a phone plan don't need an account, and no auth means no PII means no privacy policy.
- **No third-party analytics** (Google Analytics, Plausible, Mixpanel). Cloudflare Web Analytics is first-party and cookieless — see § Web Analytics.
