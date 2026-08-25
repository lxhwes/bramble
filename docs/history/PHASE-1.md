# Phase 1: Personal Experience Slice

**Status:** shipped 2026-05-03. All 7 tasks below landed; pre-Phase-1 housekeeping (Vitest scaffold, doc cross-references) shipped earlier the same day. A follow-up wave landed the same day with pairing UX polish, web share + QR fallback, coral/sage brand palette, super-like attribution on matches, tap-button vote input, partner-progress badge, and live match toast — see `ROADMAP.md` Phase 1 entry for the full follow-up list.

Goal: maintainer + spouse use Bramble daily without papercuts. Resume across reloads, undo, filters, name detail, share, smoother UX. Still personal-tool-grade — no auth, no D1, no public launch.

## Done when

- Reload anywhere mid-deck and pick up at the same card.
- `Z` or an Undo button reverses the last vote (up to 5 deep).
- Filter by gender, peak decade, popularity tier, and starts-with letter; deck rebuilds in place; filter state survives reload via URL query params.
- Tap a card to open a bottom-sheet with meaning, origin, peak year, and total count (origin/meaning shown when BTN data present, "—" otherwise).
- A "Share" button on the swipe page copies the bare `/s/{id}` URL to clipboard. A "Switch partner" link returns to the join form.
- Name dataset includes `meaning` and `origin` fields when BTN data has been merged locally.
- Landing page shows a "Resume your session" link when a recent-session cookie is present.
- Cards are bigger, animate smoothly, and tint red/green/blue with swipe direction.

## Tasks

### 1. BTN data integration `acd1cf1`

- Update `scripts/build-names.ts` to merge a BTN export (CSV or JSON, whichever the maintainer drops into `data/btn/`) by name, attaching `origin` (string) and `meaning` (string) when matched.
- Document the manual fetch URL + expected file shape in a top-of-script comment.
- BTN raw files stay gitignored under `data/btn/`. Only the processed `static/names.json` ships.
- Re-run the script if BTN data is present locally; commit the updated `static/names.json` and the script changes. If no BTN data is available yet, ship the script changes only — names.json regenerates later.
- Commit: `feat(data): merge Behind the Name origin and meaning`.

### 2. Deck cursor / resume `151c253`

- Cursor is implicit: skip names whose `(name, sex)` already appears in the partner's `votes` array.
- The server `+page.server.ts` for `/s/[sessionId]/` already loads partner votes via `getVotes`; pass them to the page component, build a `Set<"name|sex">` of voted keys, filter the shuffled deck through it.
- No new KV keys, no new server functions. Pure client-side derivation.
- Commit: `feat(swipe): resume from last unvoted name on reload`.

### 3. Undo (last 5) `d5445f8`

- Hold the most recent 5 votes in a local `undoStack` BEFORE they enter the flush queue. Older votes graduate from the stack to the queue and flush as today.
- "Undo" pops the last vote off the stack, restores the card to the deck head, and rewinds the deck index by one. Disabled when the stack is empty.
- Bind to `Z` keyboard (in addition to ←/→/↑) plus a small Undo button on the swipe UI.
- Server contract unchanged — no delete endpoint needed because un-undone votes never get sent.
- Commit: `feat(swipe): undo last five swipes`.

### 4. Filters `eb519cc` (+ fix `f14cc3f`)

- Filter dimensions:
  - Gender: `m` / `f` / `both` (default both).
  - Peak decade: `1990s` / `2000s` / `2010s` / `2020s` / `any` (default any).
  - Popularity tier (derived from `totalCount`): `rare` / `common` / `very-common` / `any`. Thresholds defined as constants in `src/lib/filters.ts`; tune to give roughly equal-sized buckets.
  - Starts with: single ASCII letter, optional.
- Filter state lives in URL query params: `?p=alex&g=f&era=2010s&pop=common&start=A`.
- A compact filter bar above the deck. Updating any control replaces the URL via `goto(..., { replaceState: true, keepFocus: true, noScroll: true })`.
- When the filtered set changes, re-derive the deck (deterministic shuffle of the filtered subset, then skip-voted as in task 2). Active card resets to the new index 0.
- Commit: `feat(swipe): filter deck by gender, era, popularity, starts-with`.

### 5. Share + switch partner `02946bc`

- "Share" button on the swipe page (top-right): copies `${origin}/s/${sessionId}` (no `?p=`, no filters) to clipboard via `navigator.clipboard.writeText`. Shows a 2-second toast confirming.
- "Switch partner" link: navigates to `/s/{id}` (no `?p=`), which already triggers the join form per Task 4 of Phase 0.
- Commit: `feat(swipe): share session URL and switch partner`.

### 6. Name detail bottom-sheet `838cce5`

- Tap on the active card (distinct from drag: `pointerup` with abs(dx) < 5 AND abs(dy) < 5 AND dt < 250ms) opens the sheet.
- Sheet content: name, gender, peak year, total count, origin (or `—`), meaning (or `—`).
- Dismiss: tap outside, swipe down on the sheet, or `Escape`.
- Use the native `<dialog>` element with `showModal()`. No new dependencies.
- Commit: `feat(swipe): name detail bottom-sheet`.

### 7. UX polish `54dfe19`

- Card: max 80vw × 60vh, larger type, heavier shadow, colored tint that ramps with swipe distance (red ≤−80, green ≥80, blue when dy ≤ −80).
- Snap-back uses a spring transition (`transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)`).
- Match view: card layout, gender badge, light divider between matches.
- Landing page: when a `bramble_last_session` cookie is set (written by the create-session form action's redirect), show a "Resume your session" link above the "Start a session" button. Cookie is `Path=/; Max-Age=2592000; SameSite=Lax`.
- Commit: `feat(ui): polish swipe deck, match view, and landing`.

## Pre-Phase-1 housekeeping (do first, in two separate commits, parallelizable)

- **Tests**: install Vitest as devDep. Add `pnpm test` script. Configure for `node` environment for now. Add a smoke test on `src/lib/server/sessions.ts` that exercises `createSession` → `addPartner` → `appendVotes` → `getMatches` against an in-memory KV mock. Commit: `test: vitest scaffold and sessions.ts smoke tests`.
- **Docs**: fix `docs/ROADMAP.md` / `docs/PHASE-0.md` / `docs/ARCHITECTURE.md` references in `README.md` and the project instructions to point at the root-level files. Commit: `docs: fix root-level doc cross-references`.

## Anti-tasks (NOT in Phase 1)

- D1 migration. KV is fine for two people.
- Magic-link auth. It's just maintainer + spouse.
- PWA / service worker. Deferred to Phase 1.5.
- Stats page / disagreement list / export.
- Multi-partner sessions.
- Recommendation algorithm.
- SEO, public README, live demo links, GitHub repo public.
- Anything in `ROADMAP.md` Phase 2 or later.

If a task seems implied but isn't here, stop and ask.

## Decisions deferred to maintainer

- BTN data acquisition. Phase 1 ships either with merged origin/meaning (if BTN drops into `data/btn/` before deploy) or with the bottom-sheet showing `—` for those fields. Either is acceptable; the script is forward-compatible.
- Popularity tier thresholds. The first agent sets reasonable defaults; tune after a week of usage.
