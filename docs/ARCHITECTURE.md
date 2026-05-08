# Architecture

## Tech stack

### SvelteKit on Cloudflare Pages

SvelteKit gives us SSR, routing, and a single-language mental model. The Cloudflare adapter compiles server routes to Workers, so "frontend" and "backend" share one repo, one deploy, and one runtime context. No separate API service.

We may migrate to Astro at Phase 2 when per-name SEO pages become the dominant route count. Until then, SvelteKit's DX is the right tradeoff.

### Cloudflare KV

KV is dead simple: one key, one value, eventually consistent. Phases 0 and 1 have no relational data and no query needs beyond "fetch this session's blobs," just per-session arrays. Storing votes as `session:{id}:partner:{slug}` → JSON array fits KV perfectly.

D1 is deferred to the public-launch prep phase — see `ROADMAP.md` Phase 1.5. When real users, multi-session history, and queries like "all sessions for this user" arrive, those tables move to D1. KV will continue to hold hot session state where eventual consistency is fine and key-shape is predictable.

### No auth in Phase 0

Sessions are identified by a UUID in the URL. Partners within a session are identified by a slug in `?p=`. That's enough trust for two people who already share a relationship and a phone plan. Phase 1 adds magic-link auth as opt-in.

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
users (id, email, created_at)
sessions (id, owner_user_id, name, created_at)
partners (id, session_id, user_id?, slug, display_name)
votes (id, partner_id, name_slug, vote, created_at)
name_meta (name, sex, peak_year, total, ...)  -- dormant; populated only if maintainer decides to move name attributes out of static/names.json
```

`users`, `sessions`, `partners`, and `votes` are live (W1.6 + W2.1 + W2.2a). `name_meta` exists in `migrations/0001_init.sql` but is unwritten. Its `origin` / `meaning` columns are vestigial post-2026-05-05 BTN closeout; if `name_meta` is ever populated, a follow-up migration will drop those columns and add a `related` column.

KV continues to hold the hot deck cursor per partner.

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
- **No external auth provider** (Auth0, Clerk). Magic links via email are the right primitive for a baby name app; users will use it for a few months and never again.
- **No analytics in Phase 0–1.** If/when needed, Cloudflare Web Analytics (cookieless).
