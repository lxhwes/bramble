# Changelog

All notable changes to Bramble are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **About the version number.** Bramble has been in daily use since early 2026,
> so `0.1.0` is not a claim that it is half-finished. It is the first *release*:
> the first time the self-host contract — environment variable names, the `/data`
> layout, the image tag scheme, the `node build/prune.js` entry point — has been
> written down and tagged. That contract has never had to survive an upgrade,
> because there has never been a second release. `0.x` says it may still move
> underneath you, which is honest, and leaves `1.0.0` to mean it has held still.

## [Unreleased]

## [0.1.0] - 2026-08-25

First tagged release and first published container image.

### Added

- **Self-hosting as the primary deployment path.** A single container backed by
  one SQLite file on a named volume. No Cloudflare account and no external
  services.
- **Multi-architecture images on GHCR** for `linux/amd64` and `linux/arm64`, so
  a self-hoster no longer compiles `better-sqlite3` from source. Pull
  `ghcr.io/lxhwes/bramble:0.1.0`.
- **`/healthz`**, a storage-backed health probe used by the image's own
  `HEALTHCHECK`. It runs a real query, so a corrupt database, an unwritable
  `/data` volume, or a failed migration marks the container unhealthy instead of
  letting it report ready while every write fails.
- **Data retention** via `BRAMBLE_RETENTION_DAYS` (default 90), applied by
  `node build/prune.js` on a cron schedule you control.
- **Reverse-proxy support** through `ADDRESS_HEADER` and `XFF_DEPTH`, so the
  in-process rate limiter keys on the real client IP.
- **Documentation for operators**: prerequisites, a reverse-proxy example, an
  upgrade path, backup and restore, and troubleshooting organised by symptom.
  See the README's Self-host section.
- **`docs/DATA.md`** covering where the name dataset comes from, the filters
  that decide what ships, and how to rebuild it.
- **`LICENSE-DATA.md`** and `static/names.LICENSE.txt`, which document the
  CC BY-SA 4.0 terms on the bundled dataset and travel inside the image.
- **Code of conduct** (Contributor Covenant 2.1).

### Changed

- SQL is the sole store for votes. Votes were previously written both as rows
  and as a re-serialised blob in the key-value store, where nothing read them
  and retention never deleted them — so a self-hosted SQLite file grew without
  bound despite a bounded retention window. The key-value store now holds only
  session metadata, and retention clears it.
- A failed vote write now returns 500 instead of being swallowed. The client
  keeps the batch on any non-2xx and retries on its 5-second flush interval, and
  the insert is idempotent, so this converts silent loss into a retry.

### Fixed

- Sessions with no votes yet are no longer deleted the moment the prune job
  runs. Creating a session and sharing the link before anyone votes is the
  normal flow; a nightly cron landing in that gap used to delete a session
  minutes old, despite every document promising a window measured in days.
- The documented SQLite backup command wrote an empty database. It let the host
  shell expand `$BRAMBLE_DB_PATH`, which is only set inside the container, so in
  cron's environment `sqlite3` opened a temporary database and produced a
  valid-looking backup file containing no tables.
- `ADDRESS_HEADER` and `XFF_DEPTH` set in `.env` never reached the container, so
  behind a reverse proxy every visitor shared one rate-limit bucket — five
  session creates per minute for the entire site.
- The About page told every self-hosted instance that its data lived in
  Cloudflare KV and that Cloudflare Web Analytics was running. Both are true
  only of the maintainer's hosted demo, so a self-host operator was publishing a
  false privacy disclosure. These statements are now specific to the build
  target.
- `pnpm prune` silently ran pnpm's built-in dependency pruner rather than the
  retention script. The script is now `pnpm prune:node`.

### Upgrade notes

Nothing to upgrade from — this is the first release. For releases after this
one, back up `/data` before pulling:

```bash
docker compose exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/pre-upgrade.sqlite"'
docker compose pull && docker compose up -d
```

Migrations are forward-only and apply on the first request after a restart.
`docker compose down -v` deletes the volume and every session in it.

[Unreleased]: https://github.com/lxhwes/bramble/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lxhwes/bramble/releases/tag/v0.1.0
