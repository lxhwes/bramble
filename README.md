# Bramble

A free, open-source baby name app for couples. Swipe independently, find mutual matches.

> Status: early development — Phase 0. Not yet usable.

## Why

Existing name apps charge for the swipe-and-match feature. The underlying data is largely public — the US Social Security Administration releases name frequencies back to 1880, and Behind the Name distributes name origin and meaning data under CC BY-SA 4.0. Bramble is a free alternative built on those open datasets.

## Stack

SvelteKit on Cloudflare Pages and Workers, with name data preprocessed from SSA and Behind the Name into a static JSON dataset bundled with the app.

## Development

```bash
pnpm install
pnpm dev               # vite dev server (local KV via wrangler)
pnpm check             # wrangler types + svelte-check (zero warnings)
pnpm test              # vitest
pnpm build             # production build via adapter-cloudflare
pnpm build:names       # regenerate static/names.json from data/ssa + data/btn
```

See [docs/ROADMAP.md](docs/ROADMAP.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md), and [docs/PHASE-1.5.md](docs/PHASE-1.5.md) for the project plan and architecture notes.

## License

App code: MIT. Bundled name dataset: CC BY-SA 4.0 (per Behind the Name attribution requirements).

Name data sourced from the [US Social Security Administration](https://www.ssa.gov/oact/babynames/) (public domain) and [Behind the Name](https://www.behindthename.com/) (CC BY-SA 4.0).
