/**
 * Storage readiness check backing the container HEALTHCHECK.
 *
 * The Docker healthcheck used to probe `GET /`, whose load function only reads
 * cookies. That made it a liveness probe: the container reported healthy with a
 * corrupt database, an unwritable /data volume, or a failed migration, while
 * every write returned a 500.
 *
 * On the node target migrations run lazily inside getNodeStorage(), so simply
 * obtaining a Storage is itself part of the check — an unwritable volume fails
 * there, before any query runs.
 *
 * The query is deliberately the cheapest thing that proves the schema exists:
 * it runs every 30s for the life of the container. Selecting from `sessions`
 * (created by 0001_init.sql) fails loudly if migrations never applied, and is
 * portable across D1 and better-sqlite3 — unlike the migration bookkeeping
 * tables, which differ per target.
 */

import type { Storage } from './storage/types.js';

export interface HealthResult {
	ok: boolean;
	/** Failure reason, present only when `ok` is false. */
	error?: string;
}

/**
 * The body `/healthz` puts on the wire.
 *
 * Deliberately drops `error`. The endpoint is unauthenticated and the reason
 * is a raw storage message: SQLite failures embed the database path, so
 * `unable to open database file: /data/bramble.sqlite` would be readable by
 * anyone who can reach the probe. The reason still goes to the container log,
 * which is where an operator debugging an unhealthy container is looking.
 *
 * Both outcomes share one shape, so a caller can parse the response without
 * branching on which one it got.
 */
export function publicHealthBody(result: HealthResult): {
	status: 'ok' | 'error';
} {
	return { status: result.ok ? 'ok' : 'error' };
}

/**
 * Runs a trivial read against storage.
 *
 * Never throws — a health probe that throws is indistinguishable from a server
 * that is down, and the caller needs the reason to put in the response body.
 */
export async function checkStorage(storage: Storage): Promise<HealthResult> {
	try {
		await storage.db.prepare('SELECT id FROM sessions LIMIT 1').bind().all();
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
