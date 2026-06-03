<!-- Keep PRs small and focused: one concern per PR. -->

## What and why

<!-- What does this change do, and which ROADMAP / PHASE item does it map to? -->

## Checklist

- [ ] Maps to an item in `docs/ROADMAP.md` or `docs/PHASE-*.md` (or links an issue)
- [ ] Tests added/updated for non-trivial logic, and `pnpm test` passes
- [ ] `pnpm lint && pnpm check` are green (zero warnings)
- [ ] `pnpm build:cf` and `pnpm build:node` both succeed
- [ ] Conventional Commit messages (`type(scope): description`)
- [ ] No new runtime dependencies (or justified in this PR)
- [ ] No `src/lib/server/` code imported by client code
