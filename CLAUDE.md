# Bramble

Open-source baby name swipe app. Couples (or groups) swipe through names independently and find mutual likes. Started as a free Nameberry alternative; intended for public release once Phase 1 lands.

See:
- `ROADMAP.md` — phased plan, all phases
- `ARCHITECTURE.md` — stack decisions and rationale
- `PHASE-0.md` — Phase 0 scope (shipped)
- `PHASE-1.md` — current scope of work

## Quick start

```bash
pnpm install
pnpm dev          # Vite dev server (local KV via wrangler)
pnpm check        # wrangler types + svelte-check (zero warnings required)
pnpm lint         # Biome (ignores .svelte; svelte-check covers those via pnpm check)
pnpm test         # Vitest (node env)
pnpm build        # production build via adapter-cloudflare
pnpm build:names  # regenerate static/names.json from data/ssa + data/btn
```

## Stack

- **Frontend**: SvelteKit + TypeScript + Tailwind
- **Hosting**: Cloudflare Pages (uses `@sveltejs/adapter-cloudflare`, which gives us Workers for server routes)
- **Storage**: Cloudflare KV (D1 deferred to a later phase)
- **Lint/format**: Biome
- **Data**: SSA national + Behind the Name (CC BY-SA), preprocessed at build time into `static/names.json`

## Layout

- `src/routes/` — SvelteKit pages and form actions
- `src/lib/` — shared utilities (filters, components, types)
- `src/lib/server/` — server-only modules; never import from client code
- `static/names.json` — preprocessed name dataset served from CDN edge
- `scripts/build-names.ts` — build-time dataset preprocessor (Node via tsx)
- `data/` — gitignored cache for raw SSA + BTN inputs

## Conventions

- TypeScript strict. No `any` without justification.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- One concern per commit. Small commits beat clever ones.
- Server-only logic lives in `src/lib/server/`. Anything in there must never be imported by client code.
- No new runtime dependencies without flagging in your plan first. Build-time deps are fine.
- Vitest is wired (node env). New non-trivial logic ships with tests; trivial UI tweaks don't need them.

## Working style

- Always produce a brief plan before writing code for any non-trivial task. Stop and wait for approval.
- When in doubt, do less. Resist sneaking in features beyond the current phase scope (see `PHASE-N.md`).
- Don't write README features that don't exist yet.
- Terse output. Skip the recap of what you just did unless asked.
- If you hit a decision point not covered in the docs, ask rather than guess.

## Deploy

Push to `main` triggers GH Actions → Cloudflare Pages. Run `pnpm lint && pnpm check && pnpm test && pnpm build` locally before pushing — broken main means broken prod.

## Licensing

- App code: MIT
- Bundled name dataset: CC BY-SA 4.0 (inherited from Behind the Name)
- Attribution to SSA and Behind the Name in README and app footer
