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
 * Usage: called automatically via the `postbuild` npm script.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

async function pruneInactiveSessions(db, nowMs) {
  const cutoff = nowMs - PRUNE_RETENTION_MS;
  const { results: stale } = await db
    .prepare(\`
      SELECT s.id
      FROM sessions s
      LEFT JOIN partners p ON p.session_id = s.id
      LEFT JOIN votes v ON v.partner_id = p.id
      GROUP BY s.id
      HAVING MAX(v.ts) IS NULL OR MAX(v.ts) < ?
    \`)
    .bind(cutoff)
    .all();

  if (stale.length === 0) return 0;

  const ids = stale.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(', ');

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
      const db = env.DB;
      if (!db) {
        console.warn('[prune] D1 binding DB not available; skipping');
        return;
      }
      const count = await pruneInactiveSessions(db, Date.now());
      console.log(\`[prune] pruned \${count} inactive session(s)\`);
    })(),
  );
}

export { scheduled };
`;

const existing = readFileSync(WORKER_PATH, 'utf8');
writeFileSync(WORKER_PATH, existing + SCHEDULED_SNIPPET, 'utf8');
console.log('[patch-worker] scheduled handler injected into _worker.js');
