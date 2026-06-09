# Roadmap

Phases are sequential. Each has a clear DoD; do not bleed work between phases.

## Phase 0 — Personal Tool (shipped 2026-05-02)

Goal: maintainer and partner swipe asynchronously on their phones, see mutual matches.

Scope: SvelteKit scaffold, preprocessed names dataset, URL-shared sessions, KV-backed votes, swipe deck, match view, deploy to a Cloudflare Pages subdomain. No accounts, no filters, no name detail pages, no PWA. See `PHASE-0.md` for the executable task list.

DoD met: two phones joined the same session, swiped, saw the intersection.

## Phase 1 — Personal-tool polish (shipped 2026-05-03)

Goal: maintainer + spouse use Bramble daily without papercuts. Personal-tool-grade — no auth, no D1, no public launch.

Shipped under `PHASE-1.md` (filters, resume, undo, name detail bottom-sheet, share + switch partner, BTN merge script, UX polish) plus a same-day follow-up wave: resume cookie refresh on join, partner-progress badge, live match toast, slug persistence + collision detection, web share API + QR fallback, coral/sage brand palette + DM Sans, super-like attribution on the matches view, tap-button vote input.

Outstanding under this phase: closed out 2026-05-05 during the 1.5 cycle with a narrower data model than originally planned. Behind the Name's lookup API does not expose etymology or meaning text — those fields are website-only — so origin/meaning were dropped entirely. The CC-BY-SA bulk export `data/btn/btn_givennames_synonyms.txt` ships its `related` (synonym/variant) column instead, which now surfaces as a "Related" row in the bottom-sheet when present. See commits `b6e20bc` / `7762d22` / `b447a37`.

DoD met:
- Two phones, same session: resume mid-deck across reloads without losing position.
- Filter bar (gender, era, popularity, starts-with) survives reload via URL params.
- Undo button + `Z` key reverse the last 5 votes before they flush to the server.
- Tap a card to open a bottom-sheet with peak year, total count, and (when BTN has synonyms) a "Related" names row. Origin/meaning rows were originally planned but dropped 2026-05-05 — BTN does not expose that data via any redistributable channel.
- Share button copies the bare `/s/{id}` URL; switch-partner returns to the join form.
- Landing page surfaces a resume link when the `bramble_last_session` cookie is set.
- Coral/sage brand palette + DM Sans, polished swipe animations, larger cards.
- Live "It's a match!" toast on the swipe page when a new mutual lands; partner-progress badge in the toolbar.
- Web share API on supported devices with QR fallback for in-person handoff.
- Super-like attribution rendered on the matches view.
- Tap buttons for yes/no/super alongside swipe + keyboard.
- Slug persistence + collision detection on the join form.

## Phase 1.5 — Public launch prep

Foundational work that's a precondition for inviting strangers. Originally bundled into Phase 1 in this roadmap, then explicitly deferred when the personal-tool slice took priority.

- Migrate vote storage from KV to D1; KV stays for hot session state (deck cursor, etc.).
- Schema: `sessions`, `partners`, `votes`, `shortlists` (the originally-planned `users`/`name_meta` tables were dropped along with magic-link auth and the BTN data model narrowing).
- Stats page: like rate, mutual likes, disagreement list.
- Match decision aids: recency sort + "new" badges, first-liker attribution, detail-sheet reuse on matches/shortlist/disagreement rows, shortlist export parity, agreement rate stat, stats link from matches header. All derivations against existing D1/KV data — no schema migration.
- PWA: manifest, service worker caches bundle and dataset, install banner.
- Export shortlist (JSON + printable HTML).
- Post-deck shortlist pass: once partners have a matches set, give them a "narrow this to a top 5" mode. Different intent (decision) than the main deck (discovery). Storage probably a new KV key per session, or localStorage if it stays personal.
- Bump GitHub Actions runner deps before Node 20 EOL (hard deadline 2026-09-16): `actions/checkout`, `actions/setup-node`, `cloudflare/wrangler-action`, `pnpm/action-setup`.
- About page + shared footer rendering SSA / Behind the Name attribution in-app (not just README). Closes the CLAUDE.md attribution gap.
- OpenGraph + Twitter card meta tags so shared session URLs unfurl with brand artwork.
- Cloudflare Web Analytics — first-party, cookie-less; consistent with the About page's "no third-party analytics" promise.
- Session TTL / data retention: prune sessions inactive for 90 days on a schedule; About page copy stays honest about the actual retention window.
- Rate limiting on session create and vote append (Cloudflare rules) so the public flip can't be cheaply abused.
- Custom 404 / error page on-brand (coral/sage, DM Sans).
- Robots.txt + initial sitemap.xml (`/`, `/about`); per-name URLs come in Phase 2.
- D1 backup posture: rely on Cloudflare Time Travel (7-day automatic PITR) plus pre-migration manual `wrangler d1 export`. Documented in `ARCHITECTURE.md`; no automation to build.
- Open the GitHub repo. README links to live demo.

DoD: post link in name-nerd subreddits; get unprompted "I used this with my partner" replies; nothing breaks under that load.

Outstanding at handoff to 1.6: functional code is complete. Remaining is the real PWA icon artwork (`static/icons/icon-192.png`, `icon-512.png` — currently placeholders, the one art item gating the public flip; favicon/og/screenshot are present and acceptable), maintainer dashboard ops (Web Analytics token, Cron Trigger, WAF rules), and the W2.2b dual-write removal — all rolled into Phase 1.6 rather than tracked here.

## Phase 1.6 — Self-host target (in progress since 2026-05-29)

Goal: a maintained fork-and-run path that needs no Cloudflare account. As of this phase, **self-host (Docker + Node + SQLite) is the primary deployment story** the project documents and maintains. The maintainer's Cloudflare Pages instance stays green with minimal effort — it is the maintainer's host, not the lead. The repo-public flip is gated on this so first-time visitors are never forced to depend on the maintainer's Cloudflare tenancy.

This is also where the project gets a pin in it: after 1.6 lands and the repo goes public, Bramble is "done for now." Phases 2–4 are parked (see below).

Effort is contained because D1 is SQLite under the hood, `better-sqlite3` is already a devDep (the test path uses a D1-compatible shim that becomes the production Node adapter), and storage already flows through a `SessionEnv { kv, db }` seam. **SQLite only** — no Postgres; D1 and `better-sqlite3` share the SQLite dialect and `?` placeholders, so business-logic SQL is portable and the seam stays thin.

- Storage seam: thin `BrambleDB` / `BrambleKV` interfaces (strict subsets of D1/KV, so Cloudflare bindings satisfy them with zero wrapping). A `getStorage(event)` helper returns `{ db, kv }` on either target. Node impl backs onto `better-sqlite3` plus a `kv` table.
- Converge the W2.2b dual-write: SQL is the source of truth on both targets, KV holds only `session:{id}:meta`. (Closes the half-migrated W2.2a state; the production soak window from 2026-05-05 has long elapsed.)
- Adapter switch: `BRAMBLE_TARGET=node|cloudflare` picks `@sveltejs/adapter-node` or `@sveltejs/adapter-cloudflare` at build time. Default stays `cloudflare`. `better-sqlite3` is excluded from the Cloudflare bundle via dynamic import (native module).
- Dockerfile (multi-stage `node:22-bookworm-slim` for the `better-sqlite3` native build) plus `docker-compose.yml` with a single service and a SQLite volume. Migrations run lazily on the first request inside `getNodeStorage()` — there is no separate migrate step at container start. Documented env vars including required `ORIGIN` (adapter-node CSRF on form POSTs).
- Node-side equivalents for Cloudflare-only Phase 1.5 features: in-process fixed-window rate limiter in `hooks.server.ts` (replaces W3.4 WAF rules), a prune CLI (`scripts/prune-cli.ts`, bundled to `build/prune.js` so the container runs `node build/prune.js` with no `tsx`/`scripts/`) + documented host cron (replaces W3.3 Cron Trigger), conditional Web Analytics beacon already skipped on Node (W3.2), `sqlite3 .backup` host cron documented (replaces W3.7 Time Travel). Retention parameterized via `BRAMBLE_RETENTION_DAYS` (default 90).
- Feature matrix in `ARCHITECTURE.md` recording Cloudflare-vs-Node behaviour for every Phase 1.5+ feature. New phases must fill it in.
- README "Self-host" section, contributor essentials (CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / templates / `.env.example`), CI test gate, real PWA icons, and a `PHASE-1.6.md` executable task list.

DoD:
- `docker compose up` on a clean host brings up the app on a documented port with no Cloudflare account.
- Two browsers join the same session and see mutual matches; shortlist add/remove and JSON/HTML export work.
- In-process rate limiting and daily prune work on the Node target.
- The maintainer's Cloudflare deploy stays green via the unchanged `pnpm build` → `wrangler pages deploy` path; `better-sqlite3` never enters the Workers bundle.
- `pnpm test` and `pnpm check` pass on both target builds; CI gates pull requests.
- Repo is public with contributor essentials in place.

> **Phases 2–4 are parked after 1.6.** They capture the long-term vision but carry no committed work. The project is intentionally small and "done for now" once self-host ships and the repo is public. Revisit only if real demand appears.

## Phase 2 — Feature Parity with Free Nameberry

> **Parked after 1.6.** Phases 2–4 below are the long-term vision, not committed work. No active development until real demand justifies un-parking them.

Goal: a stranger arrives via Google for "Norse boy names," lands on a name detail page, signs up, completes a couple swipe session.

- Migrate to Astro with Svelte islands. Pre-render every name as `/name/{slug}` for SEO. This is the single biggest growth lever.
- User-created lists (public or private, taggable). Auto-generate ~30 starter themed lists from the dataset using clustering.
- Search by meaning (full-text on the meaning field), by origin, by sound (metaphone or double-metaphone).
- Recommendation algorithm: collaborative filter on swipe history. After ~50 swipes per partner, deck reweights toward names liked by similar users.
- Couple style analysis: cluster joint likes by latent features (era, origin, sound, popularity); produce a 2–3 sentence summary via an LLM call. Equivalent to Nameberry's "Baby Name DNA."
- Trending data surfaced from internal vote stream.

(Multi-partner sessions already work at the URL level — `partnerSlugs: string[]` in KV meta and `getMatches` intersects across all partners. Not a Phase 2 deliverable; surface as a UX affordance only if a planned 3+ swiper experience justifies it.)

## Phase 3 — Differentiation

Goal: things Nameberry doesn't do, or does badly.

- Veto budget: each partner gets N hard-no tokens that override the other's hard yes.
- Last-name fit checker: stress pattern, syllable rhythm, initial-collision, monogram check.
- Sibling-set planner: given existing kids' names, score new candidates on harmony.
- Honor-name slot: family names pulled into middle-name suggestions.
- Pronunciation: browser `SpeechSynthesis` for free.
- Decade-vibe slider.
- Embeddable shortlist widget for friend voting.
- Public read-only API, rate-limited, documented.

## Phase 4 — iOS App (stretch)

Capacitor wrap of the PWA. Push notifications for new mutual matches as the native hook. Free with optional tip jar. Native SwiftUI rebuild only if usage justifies it.

## Permanent non-goals

- Forums / community moderation
- Editorial blog content
- Newsletter
- Paid tiers
