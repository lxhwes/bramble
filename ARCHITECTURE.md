# Architecture

## Tech stack

### SvelteKit on Cloudflare Pages

SvelteKit gives us SSR, routing, and a single-language mental model. The Cloudflare adapter compiles server routes to Workers, so "frontend" and "backend" share one repo, one deploy, and one runtime context. No separate API service.

We may migrate to Astro at Phase 2 when per-name SEO pages become the dominant route count. Until then, SvelteKit's DX is the right tradeoff.

### Cloudflare KV (Phase 0) → D1 (Phase 1)

KV is dead simple: one key, one value, eventually consistent. Phase 0 has no relational data, no need for queries, just per-session blobs. Storing votes as `session:{id}:partner:{slug}` → JSON array fits KV perfectly.

Phase 1 introduces real users, multi-session history, and queries like "all sessions for this user." That's D1. KV stays for hot session state where eventual consistency is fine and key-shape is predictable.

### No auth in Phase 0

Sessions are identified by a UUID in the URL. Partners within a session are identified by a slug in `?p=`. That's enough trust for two people who already share a relationship and a phone plan. Phase 1 adds magic-link auth as opt-in.

### Static name dataset

Names data is bundled as a single `static/names.json` produced by `scripts/build-names.ts`. Built once, committed to the repo, served from the CDN edge. No runtime API calls, no rate limits, works offline.

The build script merges:
- **SSA national data** (`names.zip` from ssa.gov) — public domain, gives us name + sex + year frequency from 1880 onward.
- **Behind the Name CC BY-SA download** — name + gender + origin + meaning + synonyms.

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

### Phase 1 (D1, sketch only)

```sql
users (id, email, created_at)
sessions (id, owner_user_id, name, created_at)
partners (id, session_id, user_id?, slug, display_name)
votes (id, partner_id, name_slug, vote, created_at)
name_meta (slug, name, sex, origin, meaning, ...)
```

KV continues to hold the hot deck cursor per partner.

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
