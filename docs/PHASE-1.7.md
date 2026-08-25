# Phase 1.7 — Release and packaging

Status: shipped 2026-08-25 (v0.1.0)

Phase 1.6 made self-hosting work. It did not make it *installable*: every
self-hoster still had to clone the repo and compile `better-sqlite3` from
source, and there was nothing to pin. This phase makes a versioned artifact.

Phase 1.6 is scope-locked, which is why this is a separate phase rather than
tasks appended to it.

## Goal

A stranger can run a specific, named version of Bramble without cloning
anything, and can tell what changed between versions.

## Scope

### W1 — Artifact

- **W1.1** Multi-architecture container images on GHCR (`linux/amd64`,
  `linux/arm64`), built on native runners rather than under QEMU, published on
  `v*` tag push. — `9dfaa93`
- **W1.2** OCI labels on the runtime stage so the package links back to the
  repo. `licenses` is the SPDX expression `MIT AND CC-BY-SA-4.0`, because the
  image redistributes the dataset. — `a587c23`
- **W1.3** `docker-compose.yml` pulls the published image; the build path moves
  to `docker-compose.build.yml`. Deliberately not named
  `docker-compose.override.yml`, which Compose auto-loads. — `d625112`

### W2 — Confidence

- **W2.1** Docker build plus runtime smoke test in CI, running in parallel with
  the existing job. Build-only proves little here: `build/prune.js` broke in
  production twice without CI noticing. — `1bd012d`
- **W2.2** `scripts/smoke-test.sh`, runnable locally against any image tag. — `65decff`
- **W2.3** Dependabot for npm, GitHub Actions, and Docker, with minor and patch
  grouped. This also covers the Node 20 EOL runner deadline recorded in the
  ROADMAP under Phase 1.5. — `17ea3dd`

### W3 — Legibility

- **W3.1** `CHANGELOG.md` in Keep a Changelog format, with a non-standard
  `### Upgrade notes` subsection — for an app with a persistent volume and
  forward-only migrations, "what must I do before pulling" is the line that
  matters most. — `4661ee8`
- **W3.2** A `verify` job asserting the tag matches `package.json` and that
  `CHANGELOG.md` has a matching section. — `9dfaa93`
- **W3.3** Release ritual documented in `CONTRIBUTING.md`. — `4661ee8`
- **W3.4** LICENSE restored to pristine MIT so GitHub reports `mit` rather than
  `other`; dataset terms move to `LICENSE-DATA.md`, and
  `static/names.LICENSE.txt` ships inside the image. — `2787a16`

## DoD

- `docker compose up -d` works from a downloaded compose file, with no clone and
  no local build.
- `ghcr.io/lxhwes/bramble:0.1.0` runs on both amd64 and arm64.
- A tag push publishes the image and then creates a GitHub release from the
  changelog section, in that order.
- CI fails if the image does not boot, cannot write to `/data`, or cannot run
  `node build/prune.js`.
- `gh api repos/lxhwes/bramble --jq .license.key` returns `mit`.

## Anti-tasks

- No release automation tool. semantic-release would derive the changelog from
  commit subjects, but the entries that matter to a self-hoster are prose.
  Changesets exists for monorepos publishing npm packages; Bramble publishes
  none.
- No Docker Hub mirror, no SBOM or provenance attestations, no `:edge` tag.
- No bare `{{major}}` image tag. Under 0.x a minor bump may break
  compatibility, so a moving `:0` tag would be actively harmful.
- No changes to the Cloudflare deploy path. `deploy.yml` and `wrangler.toml` are
  untouched; the hosted instance stays the live demo.

## Outstanding

Anything needing action is a GitHub issue now, not a bullet here:

- **#17** — Google Fonts are fetched from a third party in `src/app.html`. Filed
  after this phase closed and larger than the "not self-contained offline" note
  it started as: the About page tells self-hosters the instance collects no
  telemetry of any kind, while every page view contacts Google. Same class of
  defect as the Cloudflare Analytics disclosure fixed in `07a8c39`.
- **#20** — the prune logic is hand-duplicated between `prune.ts` and the
  `SCHEDULED_SNIPPET` in `patch-worker.ts`, with no parity check.
- **#22** — `getStorage`'s target branch is untested; `vitest.config.ts` defines
  no `__BRAMBLE_TARGET__`.

Left as notes, since neither needs doing:

- `static/og.png` is thin. Not referenced by the manifest, does not gate a
  release.
- The pnpm version `10.18.3` is pinned in four places (`Dockerfile`, `ci.yml`,
  `deploy.yml`, `engines`). A single `packageManager` field would collapse them.

Shipped after the tag, so not counted against this phase's DoD: the Node 24 LTS
move, the Dependabot ignore rule that replaced a silently-broken one, and the OCI
label fix. All three are in `CHANGELOG.md` under Unreleased.
