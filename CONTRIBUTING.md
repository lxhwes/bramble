# Contributing to Bramble

Thanks for your interest. Bramble is a small, open-source baby-name swipe app for couples. This guide covers local setup, the quality gate, and commit conventions.

Scope lives in `docs/ROADMAP.md` (phase-level) and `docs/PHASE-1.6.md` (the active task list). If a change doesn't map to a roadmap item, open an issue first.

## Local setup

Bramble has two build targets, selected by `BRAMBLE_TARGET` (default `cloudflare`). Self-host (Node) is the primary deployment path; the Cloudflare target is the maintainer's own hosted instance.

### Node / self-host target

```bash
pnpm install
BRAMBLE_TARGET=node pnpm build:node
BRAMBLE_DB_PATH=./data/bramble.sqlite ORIGIN=http://localhost:3000 PORT=3000 node build/index.js
```

Or run the container:

```bash
docker compose up
```

See `.env.example` for the full list of environment variables and the README "Self-host" section for details.

### Cloudflare target (the maintainer's hosted instance)

```bash
pnpm install
pnpm db:migrate:local   # apply D1 migrations to the local emulator
pnpm dev                # Vite dev server with local KV + D1 via wrangler
```

## Quality gate

Run all of these green before opening a PR:

```bash
pnpm lint
pnpm check
pnpm test
pnpm build:cf
pnpm build:node
```

CI runs the same gate on every pull request. A broken `main` means broken production, so the gate is not optional.

- Zero warnings. `pnpm check` (wrangler types + svelte-check) and `pnpm lint` (Biome) must be clean.
- New non-trivial logic ships with tests (Vitest, node env). Trivial UI tweaks don't need them.

## Commit conventions

- Conventional Commits: `type(scope): description` — types are `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`.
- One concern per commit. Small commits beat clever ones.
- For bug fixes, include a test that fails without the fix.
- `test(scope):` commits come before the `feat(scope):` they cover (TDD).

## Code rules

- TypeScript strict. No `any` without justification.
- Server-only logic lives in `src/lib/server/`. Nothing in there may be imported by client code.
- No new runtime dependencies without flagging them in your PR description and explaining why the standard library or an existing dependency won't do. Build-time dependencies are fine.

## Reporting bugs and requesting features

Use the issue templates. For security reports, see `SECURITY.md`.
