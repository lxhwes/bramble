# Bramble

Open-source baby name swipe app. Couples (or groups) swipe through names independently and find mutual likes. Started as a free Nameberry alternative; intended for public release once Phase 1 lands.

See:
- `docs/ROADMAP.md` — phased plan, all phases
- `docs/ARCHITECTURE.md` — stack decisions and rationale
- `docs/PHASE-0.md` — Phase 0 scope (shipped)
- `docs/PHASE-1.md` — Phase 1 scope (shipped)
- `docs/PHASE-1.5.md` — Phase 1.5 scope (active phase)

## Quick start

```bash
pnpm install
pnpm db:migrate:local # apply D1 migrations to the local emulator (after fresh checkout or new migration)
pnpm dev          # Vite dev server (local KV + D1 via wrangler)
pnpm check        # wrangler types + svelte-check (zero warnings required)
pnpm lint         # Biome (ignores .svelte; svelte-check covers those via pnpm check)
pnpm test         # Vitest (node env)
pnpm build        # production build via adapter-cloudflare
pnpm build:names  # regenerate static/names.json from data/ssa + data/btn
```

## Stack

- **Frontend**: SvelteKit + TypeScript + Tailwind
- **Hosting**: Cloudflare Pages (uses `@sveltejs/adapter-cloudflare`, which gives us Workers for server routes)
- **Storage**: Cloudflare KV for hot session state (deck cursor, etc.); Cloudflare D1 for vote storage (Phase 1.5 migration in progress, see `migrations/`)
- **Lint/format**: Biome
- **Data**: SSA national + Behind the Name (CC BY-SA), preprocessed at build time into `static/names.json`

## Cloudflare tooling

This project deploys to Cloudflare. Prefer the installed Cloudflare MCP/skills over shell calls or pre-trained knowledge:
- KV reads/writes against deployed env → `mcp__plugin_cloudflare_cloudflare-bindings__kv_*`
- Production log inspection → `mcp__plugin_cloudflare_cloudflare-observability__query_worker_observability`
- Wrangler config/CLI changes → load `cloudflare:wrangler` skill
- Server route / adapter-cloudflare review → load `cloudflare:workers-best-practices` skill
- Phase 1 polish perf passes → load `cloudflare:web-perf` skill

Full routing table: `@memory/cloudflare-platform.md`. For local dev (`pnpm dev`, `wrangler dev`), shell `wrangler` is still correct — these MCP tools target deployed accounts.

## Layout

- `src/routes/` — SvelteKit pages and form actions
- `src/lib/` — shared utilities (filters, components, types)
- `src/lib/server/` — server-only modules; never import from client code
- `static/names.json` — preprocessed name dataset served from CDN edge
- `scripts/build-names.ts` — build-time dataset preprocessor (Node via tsx)
- `migrations/` — D1 schema migrations; apply with `wrangler d1 migrations apply bramble`
- `data/` — gitignored cache for raw SSA + BTN inputs

## Conventions

- TypeScript strict. No `any` without justification.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- One concern per commit. Small commits beat clever ones.
- Server-only logic lives in `src/lib/server/`. Anything in there must never be imported by client code.
- No new runtime dependencies without flagging in your plan first. Build-time deps are fine.
- Vitest is wired (node env). New non-trivial logic ships with tests; trivial UI tweaks don't need them.

## Work tracking

Three tiers, each with one job. Don't cross them.

- **`docs/ROADMAP.md`** — phase-level scope. Per phase: goal, scope, DoD (concrete bullets, restated even after shipping), status (`planned` / `in progress since YYYY-MM-DD` / `shipped YYYY-MM-DD`). Authoritative for what's in/out.
- **`docs/PHASE-N.md`** — executable task list for the current phase. Tasks get commit hashes as they ship. Scope-locked: nothing added mid-phase; deferrals move to the next phase's ROADMAP entry. Keep an "Outstanding" subsection for items the phase shipped without.
- **Project memory** (`~/.claude/projects/-Users-ahowes-code-bramble/memory/`) — cross-session knowledge only: feedback rules, design-intent flags ("looks like a bug, isn't"), external references. Not a backlog.

Movement rules:

- Backlog discovered mid-phase → next-phase entry in ROADMAP, not memory.
- Hard deadlines (e.g. action-runner EOL) → ROADMAP, not memory.
- A "still pending" memory entry is a smell — convert it to a ROADMAP item. Keep the memory only if the *reason* it's deferred is non-obvious cross-session knowledge.
- Behavior intentionally NOT a bug → memory, design-intent type.
- Phase ships → restate DoD as concrete bullets in ROADMAP. Never just "DoD met."

## Working style

- Always produce a brief plan before writing code for any non-trivial task. Stop and wait for approval.
- When in doubt, do less. Resist sneaking in features beyond the current phase scope (see `docs/PHASE-N.md`).
- Don't write README features that don't exist yet.
- Terse output. Skip the recap of what you just did unless asked.
- If you hit a decision point not covered in the docs, ask rather than guess.

## Deploy

Push to `main` triggers GH Actions → Cloudflare Pages. Run `pnpm lint && pnpm check && pnpm test && pnpm build` locally before pushing — broken main means broken prod.

## Licensing

- App code: MIT
- Bundled name dataset: CC BY-SA 4.0 (inherited from Behind the Name)
- Attribution to SSA and Behind the Name in README and app footer
