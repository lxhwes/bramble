# Phase 1.6: Self-host target

**Status:** in progress since 2026-05-29. Not yet shipped.

Goal: make self-host (Docker + Node + SQLite) the primary maintained deployment path, keep the maintainer's Cloudflare instance green, and flip the repo public. See `ROADMAP.md` for the phase goal and DoD; this file is the executable task list. Plan rationale lives in `~/.claude/plans/i-want-to-finish-spicy-clock.md`.

**Storage backend: SQLite only.** No Postgres — D1 and `better-sqlite3` share the SQLite dialect and `?` placeholders, so the seam stays thin. Cloudflare stays on D1 + KV; the Node target backs onto a single `better-sqlite3` file.

## Sequencing

Wave 0 blocks everything. Wave 1 is serial after 0. Wave 2 items are internally parallel. Wave 3 is serial after 2 (it's the DoD gate). Waves 4 (docs) and 5 (publishing hygiene) run parallel with 3 — land W5.1 (CI) first. Wave 6 (public flip) is the final serial gate.

`src/hooks.server.ts` is touched by both W0.3 (storage factory) and W2.1 (rate limiter) — keep it to one `handle` via `sequence()`.

## Wave 0 — Storage seam (prerequisite)

Until routes stop reading `platform.env.*`, a Node build runs but every server route 500s. Nothing below is useful until this lands.

### W0.1 — Storage interfaces ``

- New: `src/lib/server/storage/types.ts` — `BrambleStatement { bind(...).all<T>()/.first<T>()/.run() }`, `BrambleDB { prepare(sql) }`, `BrambleKV { get<T>(key,'json'); put(key,value); delete(key) }`, `Storage { db; kv }`. Strict subsets of D1/KV so Cloudflare bindings satisfy them with zero wrapping.
- First commit: `test(storage): interface conformance for D1 + sqlite shims`.
- Then: `feat(storage): thin BrambleDB/BrambleKV interfaces`.

### W0.2 — Node SQLite adapter + migration runner ``

- New: `src/lib/server/storage/node.ts` (Node-only) — module singleton: open `better-sqlite3`, `pragma('journal_mode = WAL')`, `pragma('foreign_keys = ON')` (connection-scoped — the cascade prune depends on it), run migrations, expose the promoted `makeSqliteAdapter` (the `db.test.ts` shim hardened with statement caching + real `changes`) and a SQLite-backed `BrambleKV`.
- New: `src/lib/server/storage/migrate.ts` (Node-only) — `_migrations` tracking table, replay `migrations/*.sql` in order via `db.exec()` inside a transaction. No migration library.
- New: `migrations/0003_kv.sql` — `kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`. Runs on both targets (D1 ignores the unused table; keeps schema identical for tests).
- Promote `better-sqlite3` devDep → dependency (excluded from the Cloudflare bundle via dynamic import).
- Tests: `src/lib/server/storage/node.test.ts` (end-to-end session/vote/match/prune over in-memory better-sqlite3), `migrate.test.ts` (idempotency + FK cascade).
- Commits: `test(storage): node adapter end-to-end`, `feat(storage): better-sqlite3 node adapter + kv table`, `feat(storage): startup migration runner`.

### W0.3 — Factory + boot singleton ``

- New: `src/lib/server/storage/index.ts` — `getStorage(event): Storage`. Cloudflare returns `{ db: platform.env.DB, kv: platform.env.VOTES }`; Node dynamically imports `./node.js` and calls `getNodeStorage()`.
- `src/hooks.server.ts` handles rate limiting only (W2.1). The Node storage singleton is created lazily on the first `getStorage()` call, which is when migrations run. A migration failure surfaces as a request-level 500, not a container-start failure.
- Commit: `feat(storage): getStorage factory + lazy node singleton`.

### W0.4 — Type-widen + dual-write convergence ``

- `src/lib/server/db.ts` shortlist helpers: `D1Database` → `BrambleDB`.
- `src/lib/server/sessions.ts`: `SessionEnv.db` → `BrambleDB | null`, `.kv` → `BrambleKV`. Converge the W2.2b dual-write: `appendVotes` writes votes to SQL (required), drops the KV `partner:{slug}` write; `getVotes` reads SQL, drops the KV fallback. KV keeps only `session:{id}:meta`.
- `src/lib/server/prune.ts`: `D1Database` → `BrambleDB`; add `kv.delete(metaKey(id))` for pruned sessions; accept `Storage`.
- `scripts/patch-worker.ts`: mirror the `kv.delete` into the inlined prune snippet (keep the CF twin in sync).
- Commits: `refactor(storage): widen db/sessions/prune to Bramble interfaces`, `feat(db): SQL is source of truth; KV holds session meta only`.

### W0.5 — Migrate route call sites ``

- Swap all ~15 `{ kv: platform.env.VOTES, db: platform.env.DB }` and bare `platform.env.DB` call sites to `getStorage(event)`. Routes: `src/routes/+page.server.ts`, `src/routes/s/[sessionId]/+page.server.ts`, `.../vote/+server.ts`, `.../shortlist/+page.server.ts`, `.../shortlist/export.*`, `.../matches/*`, `.../stats/+page.server.ts`.
- Mechanical; behaviour identical on Cloudflare.
- Gate: `pnpm build` (CF) green, `pnpm check` + `pnpm test` pass.
- Commit: `refactor(routes): read storage via getStorage(event)`.

## Wave 1 — Adapter switch + build scripts

### W1.1 — BRAMBLE_TARGET adapter selection ``

- `svelte.config.js`: top-level `await import()` of `@sveltejs/adapter-node` vs `@sveltejs/adapter-cloudflare` keyed on `process.env.BRAMBLE_TARGET` (default `cloudflare`).
- New devDep `@sveltejs/adapter-node` (build-time only).
- Commit: `feat(build): select adapter by BRAMBLE_TARGET`.

### W1.2 — Build scripts + patch-worker guard ``

- `scripts/patch-worker.ts`: early no-op when `BRAMBLE_TARGET === 'node'` (CF behaviour byte-identical).
- `package.json`: keep `build` = CF (unchanged); add `build:node` / `build:cf`.
- Verify `BRAMBLE_TARGET=node pnpm build:node` serves locally against a SQLite file.
- Commit: `build: node-target build scripts`.

## Wave 2 — Node parity for Cloudflare-only features

Internally parallel.

### W2.1 — In-process rate limiter ``

- `src/hooks.server.ts` (Node only): in-memory fixed-window per (IP, rule) mirroring the WAF thresholds — `POST /s/{id}/vote` 30/60s, `POST /` 5/60s → 429 + `Retry-After`. IP via `event.getClientAddress()`. No new dep.
- Cloudflare short-circuits (edge WAF runs first). Per-process; multi-replica out of scope (documented).
- First commit: `test(ratelimit): fixed-window limiter`.
- Then: `feat(ratelimit): in-process limiter for node target`.

### W2.2 — Prune CLI + retention env ``

- New: `scripts/prune-cli.ts` (run via `tsx`) calling the unchanged `pruneInactiveSessions`; `pnpm prune` script.
- Parameterize `prune.ts` `RETENTION_MS` via `BRAMBLE_RETENTION_DAYS` (default 90) with a test.
- Commits: `feat(prune): BRAMBLE_RETENTION_DAYS env`, `feat(prune): node prune CLI`.

## Wave 3 — Container (DoD gate)

### W3.1 — Dockerfile + compose ``

- Multi-stage Dockerfile (`node:22-bookworm-slim`): builder stage installs toolchain + `pnpm build:node`; runtime stage is toolchain-free, copies `build/`, the compiled native module, `migrations/`, prune/migrate scripts, entrypoint. `sqlite3` CLI in the runtime image for the documented backup path.
- Entrypoint: `node build/index.js` only — no separate migrate step. Migrations run lazily on the first request inside `getNodeStorage()`.
- `docker-compose.yml`: single `app` service, named volume `bramble-data:/data`, `restart: unless-stopped`.
- Env vars: `BRAMBLE_TARGET=node`, `PORT`, `BRAMBLE_DB_PATH`, **`ORIGIN`** (required — adapter-node rejects cross-origin form POSTs; session-create and vote are form actions), `ADDRESS_HEADER`/`XFF_DEPTH` (client IP behind a proxy, for the rate limiter), `BRAMBLE_RETENTION_DAYS`, `PUBLIC_CF_ANALYTICS_TOKEN` (leave unset).
- **Gate (ROADMAP DoD):** `docker compose up` on a clean host → two browsers join one `/s/{id}` with different `?p=` slugs → swipe → mutual match appears, shortlist add/remove + JSON/HTML export, no Cloudflare account.
- Commit: `feat(docker): self-host image + compose`.

## Wave 4 — Docs (parallel with Wave 3)

### W4.1 — Feature matrix + architecture updates `5d0291f, ac8c1d5`

- `ARCHITECTURE.md`: new "Cloudflare-vs-Node feature matrix" (storage, adapter, rate limiting, cron, backups, analytics, client IP, migrations). Update Rate-limiting / Session-retention / backup sections to note the Node path. Replace the "evaluate a self-host fallback" hedge with the concrete design. Document `sqlite3 .backup` host cron (online-safe vs `cp`).
- Commit: `docs(arch): cloudflare-vs-node feature matrix`.

### W4.2 — README self-host section `5d0291f, 4b02ac8`

- `README.md`: Self-host section (`docker compose up`, env table, prune/backup cron, multi-replica caveat), Contributing pointer, stack line notes both targets.
- Commit: `docs(readme): self-host section`.

## Wave 5 — Publishing hygiene (parallel; W5.1 first)

### W5.1 — CI test gate ``

- New `.github/workflows/ci.yml` on `pull_request` → install / lint / check / test / `build:cf` / `build:node`.
- Add `pnpm test` to `deploy.yml` before build.
- Commit: `ci: gate PRs with tests and both-target builds`.

### W5.2 — package.json metadata ``

- Remove `private: true`; add `description`, `repository`, `author`, `license: "MIT"`, `homepage`/`bugs`, `engines: { node: ">=22", pnpm: ">=10" }` (note `engine-strict=true` — match real versions).
- Commit: `chore(pkg): public-repo metadata`.

### W5.3 — Contributor essentials ``

- New: `CONTRIBUTING.md` (commit conventions, both-target local setup, lint/check/test gate), `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md` (short — no PII, no auth, where to report), `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, `.env.example`.
- Commit: `docs: contributing, code of conduct, security, templates`.

### W5.4 — Real PWA icons + root cleanup ``

- Replace placeholder `static/icons/icon-192.png` / `icon-512.png` with real artwork (the one art item gating the flip).
- Remove stray root files: `logo-ideas.md`, the long-named Midjourney PNG.
- Commit: `chore(assets): real PWA icons; remove scratch files`.

## Wave 6 — Public flip

### W6.1 — Flip repo public ``

- Final serial gate: Wave 3 DoD met, CI green on both builds, hygiene + real icons done.
- `gh secret-scanning` pass before flipping visibility.
- Repo visibility → public (manual GitHub setting, not a commit). README links the live demo.

## Outstanding

Items shipped without resolution in this phase; carry to the next phase or address explicitly.

- `storage/index.ts` Cloudflare branch uses a `as unknown as` double cast (`platform.env.DB as unknown as Storage['db']`) to assign the D1 binding. A structural `satisfies` check or explicit conformance test would catch future D1 type drift at compile time. Deferred — no runtime impact, low urgency.

## Anti-tasks (NOT in Phase 1.6)

- Postgres or any second self-host DB backend (SQLite only).
- Phases 2–4 work (parked).
- Distributed / multi-replica rate limiting (single-container only; document the nginx `limit_req` escape hatch).
- A full "deploy to Cloudflare yourself" community guide — at most a short README paragraph reusing the existing `deploy.yml` prerequisites comment.
- Retention configurability beyond the `BRAMBLE_RETENTION_DAYS` env var.

If a task seems implied but isn't here, stop and ask.

## Decisions deferred to maintainer

- Whether to stage the KV-write removal (W0.4) as a separate follow-up commit if zero risk on the hosted instance is preferred over converging now. Default: converge now — the W2.2a soak from 2026-05-05 has long elapsed.
- Version bump at the public flip (`0.0.1` → `0.1.0`?) — cosmetic.
- Whether multi-replica self-host needs first-class support, or stays documented-out-of-scope.
