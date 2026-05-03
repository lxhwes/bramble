# Bramble

Open-source baby name swipe app. Couples (or groups) swipe through names independently and find mutual likes. Started as a free Nameberry alternative; intended for public release once Phase 1 lands.

See:
- `docs/ROADMAP.md` — phased plan, all phases
- `docs/ARCHITECTURE.md` — stack decisions and rationale
- `docs/PHASE-0.md` — current scope of work

## Stack

- **Frontend**: SvelteKit + TypeScript + Tailwind
- **Hosting**: Cloudflare Pages (uses `@sveltejs/adapter-cloudflare`, which gives us Workers for server routes)
- **Storage**: Cloudflare KV in Phase 0, migrating to D1 in Phase 1
- **Lint/format**: Biome
- **Data**: SSA national + Behind the Name (CC BY-SA), preprocessed at build time into `static/names.json`

## Conventions

- TypeScript strict. No `any` without justification.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- One concern per commit. Small commits beat clever ones.
- Server-only logic lives in `src/lib/server/`. Anything in there must never be imported by client code.
- No new runtime dependencies without flagging in your plan first. Build-time deps are fine.
- No tests in Phase 0 unless logic is genuinely tricky (e.g. the SSA preprocessor). Phase 1 introduces a real test setup.

## Working style

- Always produce a brief plan before writing code for any non-trivial task. Stop and wait for approval.
- When in doubt, do less. Phase 0 is intentionally minimal; resist sneaking in Phase 1+ features.
- Don't write README features that don't exist yet.
- Terse output. Skip the recap of what you just did unless asked.
- If you hit a decision point not covered in the docs, ask rather than guess.

## Licensing

- App code: MIT
- Bundled name dataset: CC BY-SA 4.0 (inherited from Behind the Name)
- Attribution to SSA and Behind the Name in README and app footer
