# Self-hosting Bramble

Operating a self-hosted instance: reverse proxies, backups, scheduled jobs,
upgrades, and what to check when something is wrong.

The README covers [getting an instance
running](../README.md#run-it) — prerequisites, quick start, and the
environment variables. This document picks up from there.

## Contents

- [Running behind a reverse proxy](#running-behind-a-reverse-proxy)
- [Backups](#backups)
- [Scheduled jobs](#scheduled-jobs)
- [Upgrading](#upgrading)
- [Troubleshooting](#troubleshooting)
- [Horizontal scaling caveat](#horizontal-scaling-caveat)

## Running behind a reverse proxy

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

## Backups

The image ships the `sqlite3` CLI, so `.backup` can run against a live database (safe under WAL):

```bash
docker compose exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/backup.sqlite"'
docker compose cp app:/data/backup.sqlite ./backup.sqlite
```

Keep that command single-quoted. Double quotes let the *host* shell expand `$BRAMBLE_DB_PATH`, which is only set inside the container. `sqlite3` then opens an empty temporary database and writes a backup file that looks valid and contains no tables.

To restore: stop the container, put the file back into the volume as `bramble.sqlite`, start it again.

## Scheduled jobs

Add these to the host's crontab. Both run inside the container, so the SQLite file in the `/data` volume is reachable. Note that `%` must be backslash-escaped in crontab entries.

```bash
# Prune sessions inactive for more than BRAMBLE_RETENTION_DAYS days — daily
0 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app node build/prune.js

# Nightly backup into the /data volume — copy it off-box separately
30 4 * * * docker compose -f /path/to/docker-compose.yml exec -T app sh -c 'sqlite3 "$BRAMBLE_DB_PATH" ".backup /data/bramble-$(date +\%F).sqlite"'
```

Neither job is set up for you. Nothing prunes and nothing is backed up until you add them.

## Upgrading

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

Read the [changelog](../CHANGELOG.md) before upgrading. Anything an operator has to do before pulling a release is written under that release's `### Upgrade notes`.

`docker compose down` is safe. **`docker compose down -v` is not** — `-v` deletes the `bramble-data` volume and every session stored in it.

## Troubleshooting

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

**`docker compose up` rejects the compose file.**
`env_file:` with `required: false` needs Compose v2.24 or newer. Check with `docker compose version`.

## Horizontal scaling caveat

The in-process rate limiter is per-process. If you run multiple replicas behind a load balancer, add a reverse-proxy rate limit (e.g. nginx `limit_req`) in front.

Bramble is built for a single container and one SQLite file. Multiple replicas sharing one SQLite volume is not a configuration the project tests or supports.
