# Roadmap

Phases are sequential. Each has a clear DoD; do not bleed work between phases.

## Phase 0 — Personal Tool

Goal: maintainer and partner swipe asynchronously on their phones, see mutual matches.

Scope: SvelteKit scaffold, preprocessed names dataset, URL-shared sessions, KV-backed votes, swipe deck, match view, deploy to a Cloudflare Pages subdomain. No accounts, no filters, no name detail pages, no PWA. See `PHASE-0.md` for the executable task list.

DoD: two phones can join the same session via different `?p=` URLs, swipe a few hundred names each, and see the intersection.

## Phase 1 — Public MVP

Goal: a friend can use Bramble for their own couple without hand-holding.

- Migrate vote storage from KV to D1; KV stays for hot session state (deck cursor, etc.).
- Schema: `users`, `sessions`, `partners`, `votes`, `name_meta`.
- Magic-link auth via Resend or similar. Anonymous sessions still work without auth.
- Filters: gender, era (peak decade), starts-with, popularity tier, length.
- Undo (last 5 swipes). Resume (deck cursor persists per partner).
- Name detail bottom-sheet on tap: meaning, origin, popularity sparkline, "if you liked this, try…".
- Stats page: like rate, mutual likes, disagreement list.
- PWA: manifest, service worker caches bundle and dataset, install banner.
- Export shortlist (JSON + printable HTML).
- Open the GitHub repo. README links to live demo.

DoD: post link in name-nerd subreddits; get unprompted "I used this with my partner" replies; nothing breaks under that load.

## Phase 2 — Feature Parity with Free Nameberry

Goal: a stranger arrives via Google for "Norse boy names," lands on a name detail page, signs up, completes a couple swipe session.

- Migrate to Astro with Svelte islands. Pre-render every name as `/name/{slug}` for SEO. This is the single biggest growth lever.
- User-created lists (public or private, taggable). Auto-generate ~30 starter themed lists from the dataset using clustering.
- Search by meaning (full-text on the meaning field), by origin, by sound (metaphone or double-metaphone).
- Recommendation algorithm: collaborative filter on swipe history. After ~50 swipes per partner, deck reweights toward names liked by similar users.
- Couple style analysis: cluster joint likes by latent features (era, origin, sound, popularity); produce a 2–3 sentence summary via an LLM call. Equivalent to Nameberry's "Baby Name DNA."
- Multi-partner sessions (more than 2 swipers per session).
- Trending data surfaced from internal vote stream.

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
