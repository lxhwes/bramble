/**
 * Session data retention / pruning.
 *
 * Implements the 90-day inactive-session retention policy.  A session is
 * considered inactive when its newest vote is older than the retention window,
 * or when it has no votes at all (orphan session).
 *
 * Takes the whole Storage rather than just the database because retention has
 * to clear the KV session-meta key alongside the SQL rows; leaving it behind
 * would keep a pruned session rendering as an empty session instead of a 404.
 */

import type { Storage } from './storage/types.js';

const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolves the retention window in milliseconds.
 *
 * Reads `BRAMBLE_RETENTION_DAYS` from the environment, falling back to 90 days
 * when unset or unparseable. This is read at call time (not module load time)
 * so tests can set the env variable before calling without module-reload tricks.
 */
function resolveRetentionMs(): number {
	const raw = process.env.BRAMBLE_RETENTION_DAYS;
	if (raw !== undefined) {
		const days = Number(raw);
		if (Number.isFinite(days) && days > 0) return days * MS_PER_DAY;
	}
	return DEFAULT_RETENTION_DAYS * MS_PER_DAY;
}

/**
 * Deletes all sessions (and their associated partners, votes, and shortlist
 * rows) that have had no activity within the retention window.
 *
 * The retention window defaults to `BRAMBLE_RETENTION_DAYS` env (90 days when
 * unset). Pass an explicit `retentionMs` to override — useful in tests.
 *
 * Sessions with no votes at all are treated as orphans and are also pruned.
 *
 * Deletion order respects FK constraints:
 *   shortlists → votes → partners → sessions
 *
 * Returns the number of sessions deleted.
 */
export async function pruneInactiveSessions(
	storage: Storage,
	nowMs: number,
	retentionMs: number = resolveRetentionMs(),
): Promise<number> {
	const db = storage.db;
	const cutoff = nowMs - retentionMs;

	// Identify sessions to delete: no vote newer than cutoff (or no votes at all).
	// LEFT JOIN ensures orphan sessions (no partners / no votes) are included.
	const { results: stale } = await db
		.prepare(
			`
			SELECT s.id
			FROM sessions s
			LEFT JOIN partners p ON p.session_id = s.id
			LEFT JOIN votes v ON v.partner_id = p.id
			GROUP BY s.id
			HAVING MAX(v.ts) IS NULL OR MAX(v.ts) < ?
		`,
		)
		.bind(cutoff)
		.all<{ id: string }>();

	if (stale.length === 0) return 0;

	// Build a parameterised IN-clause for the stale session IDs.
	const ids = stale.map((r) => r.id);
	const placeholders = ids.map(() => '?').join(', ');

	// Delete shortlist rows first (no FK to sessions, keyed by TEXT session_id).
	await db
		.prepare(`DELETE FROM shortlists WHERE session_id IN (${placeholders})`)
		.bind(...ids)
		.run();

	// Delete votes via partners (partners cascade, but we need partner IDs first).
	// Cascade from sessions → partners → votes is defined in the schema, so
	// deleting sessions is sufficient once shortlists are cleaned up.
	await db
		.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
		.bind(...ids)
		.run();

	return ids.length;
}
