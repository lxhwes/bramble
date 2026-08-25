/**
 * Post-build script: injects the scheduled session-pruning handler into the
 * SvelteKit adapter-cloudflare generated _worker.js.
 *
 * The adapter exports `export default { fetch }`.  Cloudflare Workers (module
 * format) support a separate top-level `scheduled` export alongside the default
 * fetch handler.  This script appends that export to the generated file.
 *
 * Why a postbuild script instead of a Vite plugin:
 *   The adapter runs inside the Vite `closeBundle` hook.  A second plugin that
 *   also uses `closeBundle` has no guaranteed ordering guarantee relative to
 *   the adapter.  Running this explicitly as a postbuild step (after `vite build`
 *   exits) guarantees the adapter has already written its output.
 *
 * Usage: called automatically at the end of the `build:cf` npm script.
 *
 * NOTE: the snippet below is a hand-maintained twin of the prune logic in
 * src/lib/server/prune.ts, and it is the ONLY scheduled handler that reaches
 * production — nothing imports a TypeScript version of it. Nothing checks that
 * the two agree either: change one, change both, and eyeball the tail of
 * _worker.js after `pnpm build:cf`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// No-op for Node builds: there is no _worker.js to patch.
if (
	process.env.BRAMBLE_TARGET === 'node' ||
	!existsSync(join(import.meta.dirname, '../.svelte-kit/cloudflare/_worker.js'))
) {
	console.log('[patch-worker] skipping — not a Cloudflare build');
	process.exit(0);
}

const WORKER_PATH = join(
	import.meta.dirname,
	'../.svelte-kit/cloudflare/_worker.js',
);

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// Inline the pruning logic so we don't need to import from the SvelteKit
// server bundle (which has an opaque internal structure after adapter build).
const SCHEDULED_SNIPPET = `
// ---------------------------------------------------------------------------
// Scheduled handler — session pruning (90-day retention).
// Injected by scripts/patch-worker.ts after the SvelteKit adapter build.
// ---------------------------------------------------------------------------

const PRUNE_RETENTION_MS = ${RETENTION_MS};

async function pruneInactiveSessions(db, kv, nowMs) {
  const cutoff = nowMs - PRUNE_RETENTION_MS;
  const { results: stale } = await db
    .prepare(\`
      SELECT s.id
      FROM sessions s
      LEFT JOIN partners p ON p.session_id = s.id
      LEFT JOIN votes v ON v.partner_id = p.id
      GROUP BY s.id
      HAVING MAX(v.ts) < ? OR (MAX(v.ts) IS NULL AND s.created_at < ?)
    \`)
    .bind(cutoff, cutoff)
    .all();

  if (stale.length === 0) return 0;

  const ids = stale.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(', ');

  // KV meta first — see the ordering rationale in src/lib/server/prune.ts.
  // Sequential: each delete is a subrequest against a per-invocation cap, so a
  // loop makes partial progress rather than failing wholesale.
  for (const id of ids) {
    await kv.delete(\`session:\${id}:meta\`);
  }

  await db
    .prepare(\`DELETE FROM shortlists WHERE session_id IN (\${placeholders})\`)
    .bind(...ids)
    .run();

  await db
    .prepare(\`DELETE FROM sessions WHERE id IN (\${placeholders})\`)
    .bind(...ids)
    .run();

  return ids.length;
}

async function scheduled(_event, env, ctx) {
  ctx.waitUntil(
    (async () => {
      if (!env.DB || !env.VOTES) {
        console.warn('[prune] DB or VOTES binding not available; skipping');
        return;
      }
      const count = await pruneInactiveSessions(env.DB, env.VOTES, Date.now());
      console.log(\`[prune] pruned \${count} inactive session(s)\`);
    })(),
  );
}

export { scheduled };
`;

const existing = readFileSync(WORKER_PATH, 'utf8');
writeFileSync(WORKER_PATH, existing + SCHEDULED_SNIPPET, 'utf8');
console.log('[patch-worker] scheduled handler injected into _worker.js');
