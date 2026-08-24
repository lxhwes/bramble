# Bramble

A free, open-source baby name app for couples. Swipe independently, find mutual matches.

> Status: v1 shipped — daily-driven by the maintainer and partner. Hardening for public launch.

## Try it

Live demo: [bramble.oovoid.com](https://bramble.oovoid.com)

![Swipe view showing the name "Calliope" on a card with no / super / yes buttons below](docs/screenshots/swipe.png)

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

SvelteKit + TypeScript + Tailwind. Two build targets:

- **Docker / Node** (`BRAMBLE_TARGET=node`) — the primary, maintained deployment path. `better-sqlite3` SQLite file for votes and session meta, in-process rate limiter. No Cloudflare account needed. See [Self-host](#self-host) below.
- **Cloudflare Pages** (`BRAMBLE_TARGET=cloudflare`, default) — the maintainer's own hosted instance. D1 for vote storage, KV for hot session state, edge WAF for rate limiting.

The name dataset is preprocessed at build time into a static JSON blob — no runtime API calls.

## Self-host

```bash
docker compose up -d
# App is available at http://localhost:3000
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BRAMBLE_TARGET` | yes | `cloudflare` | Must be `node` for self-host |
| `ORIGIN` | yes | `http://localhost:3000` (via compose) | Full origin URL (e.g. `https://names.example.com`) — needed for CSRF on form POSTs (session create, shortlist add/remove). Compose defaults to localhost; override it for any non-local deployment |
| `BRAMBLE_DB_PATH` | no | `/data/bramble.sqlite` | Path to the SQLite database file |
| `PORT` | no | `3000` | Port the HTTP server listens on |
| `BRAMBLE_RETENTION_DAYS` | no | `90` | Inactive-session prune window in days |
| `ADDRESS_HEADER` | no | — | Header to read client IP from (e.g. `X-Forwarded-For`) when behind a reverse proxy |
| `XFF_DEPTH` | no | — | Number of trusted reverse proxies in the `X-Forwarded-For` chain |
| `BRAMBLE_MIGRATIONS_DIR` | no | `/app/migrations` (in the image) | Directory holding the SQL migration files |

Migrations run automatically on first startup for the node target.

### Cron jobs

Add these to the host's crontab (or equivalent). Both run against the container, so the SQLite file inside the `/data` volume is reachable:

```bash
# Prune sessions inactive for more than BRAMBLE_RETENTION_DAYS days — run daily
0 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app node build/prune.js

# SQLite backup — written into the /data volume (copy it off-box separately as needed)
30 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app sqlite3 "$BRAMBLE_DB_PATH" ".backup '/data/bramble-$(date +\%F).sqlite'"
```

### Horizontal scaling caveat

The in-process rate limiter is per-process. If you run multiple replicas behind a load balancer, add a reverse-proxy rate limit (e.g. nginx `limit_req`) in front.

## Development

```bash
pnpm install
pnpm db:migrate:local  # apply D1 migrations to the local emulator (Cloudflare target)
pnpm dev               # vite dev server (local KV + D1 via wrangler)
pnpm check             # wrangler types + svelte-check (zero warnings)
pnpm lint              # Biome
pnpm test              # vitest
pnpm build             # production build (BRAMBLE_TARGET=cloudflare by default)
pnpm build:names       # regenerate static/names.json from data/ssa + data/btn
```

The commands above run against the Cloudflare local emulator. To run the Node / self-host target locally, see the [Node setup in CONTRIBUTING.md](CONTRIBUTING.md#local-setup) (`BRAMBLE_TARGET=node pnpm build:node` + `node build/index.js`).

PWA flows: test via `pnpm build && pnpm preview` (service worker registration is skipped in dev).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. The short version: follow [Conventional Commits](https://www.conventionalcommits.org/) and make sure `pnpm lint && pnpm check && pnpm test` passes before opening a PR.

## Project docs

- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack decisions
- [docs/PHASE-1.6.md](docs/PHASE-1.6.md) — self-host target (in progress)
- [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md), [docs/PHASE-1.5.md](docs/PHASE-1.5.md) — shipped phase scopes

## License

App code: MIT — see [LICENSE](LICENSE).
Bundled name dataset: CC BY-SA 4.0 (per Behind the Name attribution).

Name data sourced from the [US Social Security Administration](https://www.ssa.gov/oact/babynames/) (public domain) and [Behind the Name](https://www.behindthename.com/) (CC BY-SA 4.0). Attribution is rendered in-app on the About page.
