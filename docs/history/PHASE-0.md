# Phase 0: Personal Tool

Goal: maintainer and partner swipe independently through names on their phones, see mutual matches.

## Done when

- App deploys to Cloudflare Pages on a custom subdomain.
- Two phones can join the same session via different URLs (`?p=alex`, `?p=laura`).
- Each partner can swipe through ~3000 names independently. Votes persist to KV.
- Matches view shows the intersection of "yes" votes.
- No accounts, no filters, no name detail pages, no PWA. Bare minimum to swipe.

## Tasks

### 1. Project scaffold

- `pnpm create svelte@latest .` — pick SvelteKit, TypeScript, no built-in test/lint (we'll add Biome).
- Install `@sveltejs/adapter-cloudflare`, configure in `svelte.config.js`.
- Install Tailwind via the official SvelteKit setup.
- Install Biome; add `lint` and `format` scripts.
- `wrangler.toml` with KV namespace binding (call it `VOTES`).
- Verify `pnpm dev` works and `wrangler pages dev` works.
- Commit: `chore: initial SvelteKit scaffold with Cloudflare adapter`.

### 2. Name dataset

- `scripts/build-names.ts` — Node script (run with `tsx` or similar).
- Downloads SSA `names.zip` from `https://www.ssa.gov/oact/babynames/names.zip`. Cache locally to avoid re-downloading.
- Parses `yobYYYY.txt` files for years 1995–2024. Format is `name,sex,number` per line.
- Filters to (name, sex) combos with ≥100 occurrences in at least one year of that window.
- Computes `peakYear` and `totalCount` across the window per (name, sex).
- Optional: joins against Behind the Name's downloadable name+gender+origin file if present in `data/btn/`. If the BTN data isn't there, just emit names without origin/meaning. Document how to fetch it manually in a comment.
- Emits `static/names.json` with shape: `[{ name, sex, peakYear, totalCount, origin?, meaning? }]`.
- Run once, commit `static/names.json`. Don't run on every build.
- Commit: `feat: name dataset preprocessing pipeline`.

### 3. Session and KV layer

- `src/lib/server/sessions.ts` — typed wrapper around the KV binding.
- Functions: `createSession()`, `getSessionMeta(id)`, `addPartner(sessionId, slug)`, `getVotes(sessionId, partnerSlug)`, `appendVotes(sessionId, partnerSlug, votes)`, `getMatches(sessionId)`.
- KV keys:
  - `session:{id}:meta` → `{ createdAt: number, partnerSlugs: string[] }`
  - `session:{id}:partner:{slug}` → `{ votes: Array<{name, sex, vote, ts}>, updatedAt: number }`
- Append flow: read existing array, push new entries, write back. Last-write-wins is fine for two devices that aren't both swiping the same names simultaneously.
- Commit: `feat: KV-backed session and vote storage`.

### 4. Swipe UI

- Route: `/s/[sessionId]/+page.svelte`.
- Reads partner slug from `?p=` query param. If missing, show a "join as…" form that redirects with `?p={slug}`.
- On load, fetches `static/names.json` (CDN-cached) and shuffles it deterministically using sessionId as seed (so partners see same order — nice-to-have, not required for correctness).
- Renders one card at a time. Card shows name and a small gender icon. Nothing else in Phase 0.
- Pointer events for drag: `pointerdown`, `pointermove`, `pointerup`. Translate the card with `transform`. Threshold: 80px horizontal = vote registered, snap back if under threshold.
- Left = no, right = yes, up = super (record as `super`, treat as `yes` for matching).
- Keyboard shortcuts: ←, →, ↑.
- Local pending queue. Flush to server every 5 seconds OR every 10 votes, whichever comes first. POST to `/s/[sessionId]/vote`.
- Commit: `feat: swipe deck and vote submission`.

### 5. Match view

- Route: `/s/[sessionId]/matches/+page.server.ts`.
- Server load: read all partner keys for the session, intersect their `yes`/`super` votes by name.
- Render: alphabetical list. Tap a name to mark "actually no" (removes from local view; Phase 0 doesn't bother persisting this).
- Commit: `feat: match view`.

### 6. Session creation flow

- `/+page.svelte` — landing page with one button: "Start a session."
- POST creates a session UUID, redirects to `/s/{id}?p=alex` (placeholder slug — user edits in URL bar or via the join form).
- "Share" affordance: copies `/s/{id}` (no `?p`) to clipboard for the partner to open and pick their own slug.
- Commit: `feat: session creation and share`.

### 7. Deploy

- GitHub Actions workflow: on push to `main`, run `wrangler pages deploy`.
- Set up KV namespace in Cloudflare dashboard, bind in `wrangler.toml`.
- Subdomain CNAME setup is the maintainer's job — flag this in the final summary.
- Commit: `ci: Cloudflare Pages deploy on main`.

## Anti-tasks

Do not implement in Phase 0:

- Auth / accounts / magic links
- Filters of any kind
- Name detail pages, modals, or "more info" UI
- Undo
- PWA manifest or service worker
- Animations beyond a `transform` on the active card
- Stats beyond mutual-match count
- Name pronunciation
- Tests (except for the SSA preprocessor if you find a non-obvious bug)
- Anything in `ROADMAP.md` Phase 1 or later

If you think something is required that's listed here, stop and ask.

## Decisions deferred to maintainer

These are project-level, not technical, so don't block the scaffold:

- Final project name (currently "Bramble" — placeholder)
- Final domain or subdomain
- When to flip the repo public

These are technical decisions the maintainer wants surfaced when relevant:

- Whether to use `pnpm` vs `npm` (prefer `pnpm`, but not strict)
- Whether to host the BTN download in the repo or fetch on demand in the build script (the BTN license requires attribution but does allow redistribution)
