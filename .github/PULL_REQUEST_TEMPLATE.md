<!-- Keep PRs small and focused: one concern per PR. -->

## What and why

<!-- What does this change do, and what problem does it solve? Link an issue if there is one. -->

## Checklist

- [ ] Tests added/updated for non-trivial logic, and `pnpm test` passes
- [ ] `pnpm lint && pnpm check` are green (zero warnings)
- [ ] `pnpm build:cf` and `pnpm build:node` both succeed
- [ ] Conventional Commit messages (`type(scope): description`)
- [ ] No new runtime dependencies (or justified in this PR)
- [ ] No `src/lib/server/` code imported by client code
