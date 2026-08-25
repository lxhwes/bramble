/**
 * CLI entry point for manual or cron-driven session pruning on the Node target.
 *
 * Opens the Node SQLite storage (same path as the running server), calls
 * pruneInactiveSessions, logs the result, and exits 0.
 *
 * Usage:
 *   BRAMBLE_DB_PATH=/data/bramble.sqlite pnpm prune:node
 *
 * The script name is "prune:node", not "prune", because `pnpm prune` is a
 * built-in pnpm command (it prunes node_modules) and would shadow this one.
 *
 * Retention window: BRAMBLE_RETENTION_DAYS env (default 90). This is the same
 * env that the running server reads — set once, applies everywhere.
 *
 * The Cloudflare cron path (scripts/patch-worker.ts) uses its own inlined
 * 90-day constant and does not read this env; it runs at the edge and cannot
 * access process.env.
 */

import { pruneInactiveSessions } from '../src/lib/server/prune.js';
import { getNodeStorage } from '../src/lib/server/storage/node.js';

const storage = getNodeStorage();
const count = await pruneInactiveSessions(storage, Date.now());
console.log(`[prune] pruned ${count} inactive session(s)`);
process.exit(0);
