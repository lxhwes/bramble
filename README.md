# Bramble

A free, open-source baby name app for couples. Swipe independently, find mutual matches.

> Status: v1 shipped — daily-driven by the maintainer and partner. Hardening for public launch.

## Try it

[live demo coming soon]

<!-- TODO: screenshot before public flip -->

## Why

Existing name apps charge for the swipe-and-match feature, even though the underlying data is largely public. Bramble is a free alternative built on open datasets:

- US Social Security Administration — name frequencies back to 1880 (public domain)
- Behind the Name — name origin and related names (CC BY-SA 4.0)

## Features

- Anonymous, URL-shared sessions — no signup, no accounts, no PII
- ~10k names from SSA + Behind the Name
- Independent swiping with live mutual-match toasts
- Filters: gender, era, popularity, starts-with letter (filter state survives reload)
- Resume mid-deck, undo last 5 swipes, tap-to-vote alongside swipe + keyboard
- Shortlist mode — pin favorites, export as JSON or printable HTML
- Stats page — like rate, mutual likes, disagreements
- Installable PWA with offline cache
- QR code + Web Share API for in-person handoff

## Stack

SvelteKit + TypeScript + Tailwind on Cloudflare Pages. Cloudflare D1 for vote storage, Cloudflare KV for hot session state. The name dataset is preprocessed at build time from SSA + Behind the Name into a static JSON blob bundled with the app — no runtime API calls, served from the edge.

## Development

```bash
pnpm install
pnpm db:migrate:local  # apply D1 migrations to the local emulator
pnpm dev               # vite dev server (local KV + D1 via wrangler)
pnpm check             # wrangler types + svelte-check (zero warnings)
pnpm lint              # Biome
pnpm test              # vitest
pnpm build             # production build via adapter-cloudflare
pnpm build:names       # regenerate static/names.json from data/ssa + data/btn
```

PWA flows: test via `pnpm build && pnpm preview` (service worker registration is skipped in dev).

## Project docs

- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack decisions
- [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md), [docs/PHASE-1.5.md](docs/PHASE-1.5.md) — shipped phase scopes

## License

App code: MIT — see [LICENSE](LICENSE).
Bundled name dataset: CC BY-SA 4.0 (per Behind the Name attribution).

Name data sourced from the [US Social Security Administration](https://www.ssa.gov/oact/babynames/) (public domain) and [Behind the Name](https://www.behindthename.com/) (CC BY-SA 4.0). Attribution is rendered in-app on the About page.
