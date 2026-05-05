# Roadmap

Phases are sequential. Each has a clear DoD; do not bleed work between phases.

## Phase 0 — Personal Tool (shipped 2026-05-02)

Goal: maintainer and partner swipe asynchronously on their phones, see mutual matches.

Scope: SvelteKit scaffold, preprocessed names dataset, URL-shared sessions, KV-backed votes, swipe deck, match view, deploy to a Cloudflare Pages subdomain. No accounts, no filters, no name detail pages, no PWA. See `PHASE-0.md` for the executable task list.

DoD met: two phones joined the same session, swiped, saw the intersection.

## Phase 1 — Personal-tool polish (shipped 2026-05-03)

Goal: maintainer + spouse use Bramble daily without papercuts. Personal-tool-grade — no auth, no D1, no public launch.

Shipped under `PHASE-1.md` (filters, resume, undo, name detail bottom-sheet, share + switch partner, BTN merge script, UX polish) plus a same-day follow-up wave: resume cookie refresh on join, partner-progress badge, live match toast, slug persistence + collision detection, web share API + QR fallback, coral/sage brand palette + DM Sans, super-like attribution on the matches view, tap-button vote input.

Outstanding under this phase: BTN dataset still needs a manual export drop into `data/btn/` to populate origin/meaning. Bottom-sheet shows `—` for those fields until then.

DoD met:
- Two phones, same session: resume mid-deck across reloads without losing position.
- Filter bar (gender, era, popularity, starts-with) survives reload via URL params.
- Undo button + `Z` key reverse the last 5 votes before they flush to the server.
- Tap a card to open a bottom-sheet with origin, meaning, peak year, total count.
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
- Schema: `users`, `sessions`, `partners`, `votes`, `name_meta`.
- Magic-link auth via Resend or similar. Anonymous sessions still work without auth. Privacy policy ships with this — auth introduces PII, so deferring auth defers the policy.
- Stats page: like rate, mutual likes, disagreement list.
- PWA: manifest, service worker caches bundle and dataset, install banner.
- Export shortlist (JSON + printable HTML).
- Post-deck shortlist pass: once partners have a matches set, give them a "narrow this to a top 5" mode. Different intent (decision) than the main deck (discovery). Storage probably a new KV key per session, or localStorage if it stays personal.
- Bump GitHub Actions runner deps before Node 20 EOL (hard deadline 2026-09-16): `actions/checkout`, `actions/setup-node`, `cloudflare/wrangler-action`, `pnpm/action-setup`.
- About page + shared footer rendering SSA / Behind the Name attribution in-app (not just README). Closes the CLAUDE.md attribution gap.
- OpenGraph + Twitter card meta tags so shared session URLs unfurl with brand artwork.
- Cloudflare Web Analytics — first-party, cookie-less; consistent with the About page's "no third-party analytics" promise.
- Session TTL / data retention: prune inactive sessions on a schedule; About page copy stays honest about the actual retention window.
- Rate limiting on session create and vote append (Cloudflare rules) so the public flip can't be cheaply abused.
- Custom 404 / error page on-brand (coral/sage, DM Sans).
- Robots.txt + initial sitemap.xml (`/`, `/about`); per-name URLs come in Phase 2.
- D1 backup posture: decide between accepted-loss-and-document, scheduled R2 export, or on-demand backup. **TBD.**
- Open the GitHub repo. README links to live demo.

DoD: post link in name-nerd subreddits; get unprompted "I used this with my partner" replies; nothing breaks under that load.

## Phase 2 — Feature Parity with Free Nameberry

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
