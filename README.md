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
- ~6,300 names from SSA + Behind the Name
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

One container and one SQLite file on a named volume. No Cloudflare account, no external services.

### Prerequisites

- Docker Engine 24 or newer
- Docker Compose v2.24 or newer — check with `docker compose version`. The compose file uses `env_file:` with `required: false`, which older releases reject.

### Quick start

No clone and no build — grab the compose file and start it:

```bash
curl -O https://raw.githubusercontent.com/lxhwes/bramble/main/docker-compose.yml
docker compose up -d
```

Bramble is then on <http://localhost:3000>. Images are published to [GHCR](https://github.com/lxhwes/bramble/pkgs/container/bramble) for `linux/amd64` and `linux/arm64`.

For anything you care about, pin a version rather than tracking `latest` — set `image: ghcr.io/lxhwes/bramble:0.1.0` in the compose file. Under 0.x a minor release may break compatibility, which is why there is deliberately no moving `:0` tag to follow.

#### Building from source instead

```bash
git clone https://github.com/lxhwes/bramble.git
cd bramble
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

The first build compiles `better-sqlite3` from source and takes a few minutes; later builds reuse the layer cache. There is no dataset step — `static/names.json` is committed. `pnpm build:names` exists only for regenerating it from the upstream sources, which self-hosting never requires.

### Configuration

Copy `.env.example` to `.env` and edit it. Everything set there reaches the container.

For any deployment other than `http://localhost:3000`, **set `ORIGIN` to the URL people will actually visit**. Getting it wrong is the most common self-host problem — see [Troubleshooting](#troubleshooting).

#### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BRAMBLE_TARGET` | build-time only | `cloudflare` | Selects the adapter and is baked into the bundle at build time. The published image is already built with `node`; setting it at runtime changes nothing |
| `ORIGIN` | yes | `http://localhost:3000` (via compose) | Full origin URL (e.g. `https://names.example.com`) — needed for CSRF on form POSTs (session create, shortlist add/remove). Compose defaults to localhost; override it for any non-local deployment |
| `BRAMBLE_DB_PATH` | no | `/data/bramble.sqlite` | Path to the SQLite database file |
| `PORT` | no | `3000` | Port the HTTP server listens on |
| `BRAMBLE_RETENTION_DAYS` | no | `90` | Inactive-session prune window in days |
| `ADDRESS_HEADER` | no | — | Header to read client IP from (e.g. `X-Forwarded-For`) when behind a reverse proxy |
| `XFF_DEPTH` | no | — | Number of trusted reverse proxies in the `X-Forwarded-For` chain |
| `BRAMBLE_MIGRATIONS_DIR` | no | `/app/migrations` (in the image) | Directory holding the SQL migration files |

Migrations run automatically on the node target — lazily, on the first request after startup rather than at boot.

### Running behind a reverse proxy

Terminate TLS at the proxy and forward to the container. With Caddy:

```caddy
names.example.com {
	reverse_proxy localhost:3000
}
```

Then in `.env`:

```bash
ORIGIN=https://names.example.com
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1
```

`XFF_DEPTH` is the number of proxies you control, counted from the right of the `X-Forwarded-For` chain: Caddy alone is `1`, Caddy behind Cloudflare is `2`. Without both variables the app sees the proxy's IP instead of the client's, and every visitor shares one rate-limit bucket.

nginx needs `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` to build the same chain.

### Backups

The image ships the `sqlite3` CLI, so `.backup` can run against a live database (safe under WAL):

```bash
docker compose exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/backup.sqlite"'
docker compose cp app:/data/backup.sqlite ./backup.sqlite
```

Keep that command single-quoted. Double quotes let the *host* shell expand `$BRAMBLE_DB_PATH`, which is only set inside the container. `sqlite3` then opens an empty temporary database and writes a backup file that looks valid and contains no tables.

To restore: stop the container, put the file back into the volume as `bramble.sqlite`, start it again.

### Cron jobs

Add these to the host's crontab. Both run inside the container, so the SQLite file in the `/data` volume is reachable. Note that `%` must be backslash-escaped in crontab entries.

```bash
# Prune sessions inactive for more than BRAMBLE_RETENTION_DAYS days — daily
0 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app node build/prune.js

# Nightly backup into the /data volume — copy it off-box separately
30 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/bramble-$(date +\%F).sqlite"'
```

### Upgrading

Back up first, every time:

```bash
docker compose exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/pre-upgrade.sqlite"'
docker compose pull
docker compose up -d
```

Building from source instead:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Migrations are forward-only and apply on the first request after the restart, so that first page load can be slightly slower than usual.

`docker compose down` is safe. **`docker compose down -v` is not** — `-v` deletes the `bramble-data` volume and every session stored in it.

### Troubleshooting

**I can swipe, but I can't start a session.**
`ORIGIN` doesn't match the origin the browser is using. adapter-node rejects cross-origin form POSTs, and session create plus shortlist add/remove are form POSTs. Voting is a JSON `fetch`, which the origin check does not cover, which is exactly why swiping keeps working. Set `ORIGIN` to the full public origin — scheme included, no trailing slash — then `docker compose up -d`.

**Everyone gets 429s at once.**
Behind a proxy without `ADDRESS_HEADER`, every request appears to come from the proxy, so all visitors share a single bucket: 5 session creates and 30 votes per minute for the whole site. See [Running behind a reverse proxy](#running-behind-a-reverse-proxy).

**Is it actually healthy?**
`GET /healthz` runs a real query against the database, and it is what the container's `HEALTHCHECK` probes — so `healthy` in `docker compose ps` means storage works, not merely that the process is up.

```bash
curl -s localhost:3000/healthz
# {"status":"ok"}
```

A 503 means storage is unreachable, and the body is `{"status":"error"}`. The endpoint is unauthenticated, so the reason is kept out of the response — find it in `docker compose logs app`.

**Writes fail with a 500, or the container never turns healthy.**
Check `docker compose logs app`. An unwritable `/data` volume, a corrupt SQLite file, and a failed migration all surface there.

### Horizontal scaling caveat

The in-process rate limiter is per-process. If you run multiple replicas behind a load balancer, add a reverse-proxy rate limit (e.g. nginx `limit_req`) in front.

## Development

```bash
pnpm install
```

### Node / self-host target

The primary deployment path, so develop against it by default. `BRAMBLE_TARGET` is read at build time, which includes the dev server:

```bash
BRAMBLE_TARGET=node BRAMBLE_DB_PATH=./data/bramble.sqlite pnpm dev
```

Migrations apply to that SQLite file on the first request. For a production-shaped run instead of the dev server:

```bash
pnpm build:node
BRAMBLE_DB_PATH=./data/bramble.sqlite ORIGIN=http://localhost:3000 PORT=3000 node build/index.js
```

### Cloudflare target

Only needed when working on the hosted demo:

```bash
pnpm db:migrate:local  # apply D1 migrations to the local emulator
pnpm dev               # Vite dev server with local KV + D1 via wrangler
```

### Quality gate

```bash
pnpm lint              # Biome
pnpm check             # wrangler types + svelte-check (zero warnings)
pnpm test              # Vitest
pnpm build:cf          # both targets must stay green
pnpm build:node
```

`pnpm build:names` regenerates `static/names.json` from the upstream sources — see [docs/DATA.md](docs/DATA.md). It is only needed when changing the dataset itself.

PWA flows: test via `pnpm build && pnpm preview` (service worker registration is skipped in dev).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. The short version: follow [Conventional Commits](https://www.conventionalcommits.org/) and make sure `pnpm lint && pnpm check && pnpm test` passes before opening a PR.

## Project docs

- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack decisions
- [docs/DATA.md](docs/DATA.md) — where the name dataset comes from and how to rebuild it
- [docs/BRAND.md](docs/BRAND.md) — palette and icon regeneration
- [CHANGELOG.md](CHANGELOG.md) — what changed in each release
- [docs/history/](docs/history/) — task lists for shipped phases, kept for context

## License

- App code: MIT — see [LICENSE](LICENSE).
- Bundled name dataset (`static/names.json`): CC BY-SA 4.0 — see [LICENSE-DATA.md](LICENSE-DATA.md).

Name data comes from the [US Social Security Administration](https://www.ssa.gov/oact/babynames/) (public domain) and [Behind the Name](https://www.behindthename.com/) (CC BY-SA 4.0). Attribution is rendered in-app on the About page and ships beside the data at `/names.LICENSE.txt`. Share-alike is viral, so if you redistribute the dataset — including by publishing a container image — that attribution has to travel with it.
