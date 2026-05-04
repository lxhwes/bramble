/**
 * Typed D1 binding wrapper.
 *
 * Exports:
 *   - Row interfaces mirroring the D1 schema (migrations/0001_init.sql, 0002_shortlist.sql).
 *   - `getDb(platform)` — returns the D1Database bound as `DB`.
 *   - Shortlist helpers: addToShortlist, removeFromShortlist, getShortlist.
 *
 * No business logic lives here. This module is the boundary between
 * SvelteKit's platform object and the typed query layer.
 */

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

export interface User {
	id: string;
	email: string;
	/** Unix milliseconds. */
	created_at: number;
}

export interface Session {
	id: string;
	/** NULL for anonymous sessions. */
	user_id: string | null;
	/** Unix milliseconds. */
	created_at: number;
}

export interface Partner {
	id: string;
	session_id: string;
	/** Human-readable slug chosen at join time (e.g. "alex"). */
	slug: string;
	/** Unix milliseconds. */
	created_at: number;
}

export interface Vote {
	id: string;
	partner_id: string;
	name: string;
	/** 'M' or 'F' — mirrors the sex field in the names dataset. */
	sex: 'M' | 'F';
	/** 'yes', 'no', or 'super'. */
	vote: 'yes' | 'no' | 'super';
	/** Unix milliseconds; the time the vote was cast. */
	ts: number;
}

export interface NameMeta {
	name: string;
	/** 'M' or 'F'. */
	sex: 'M' | 'F';
	/** Calendar year in which this name peaked in popularity. */
	peak_year: number | null;
	/** Total SSA-reported births across all recorded years. */
	total: number | null;
	origin: string | null;
	meaning: string | null;
}

export interface Shortlist {
	id: number;
	session_id: string;
	name: string;
	/** 'M' or 'F'. */
	sex: 'M' | 'F';
	/** Unix milliseconds. */
	created_at: number;
}

// ---------------------------------------------------------------------------
// Binding accessor
// ---------------------------------------------------------------------------

/**
 * Returns the D1Database bound to the `DB` environment variable.
 *
 * Pass `platform` directly from a SvelteKit load function or server handler:
 *   const db = getDb(platform);
 *
 * Throws if `platform` is undefined (i.e. when running in a non-Worker
 * environment such as a Node adapter or unit tests). Callers that run in
 * both environments should guard with a null-check before calling this.
 */
export function getDb(platform: App.Platform): D1Database {
	return platform.env.DB;
}

// ---------------------------------------------------------------------------
// Shortlist helpers
// ---------------------------------------------------------------------------

/**
 * Adds a name to the session shortlist.
 *
 * Uses INSERT OR IGNORE so repeated calls are safe (idempotent).
 */
export async function addToShortlist(
	db: D1Database,
	sessionId: string,
	name: string,
	sex: 'M' | 'F',
): Promise<void> {
	await db
		.prepare(
			'INSERT OR IGNORE INTO shortlists (session_id, name, sex, created_at) VALUES (?, ?, ?, ?)',
		)
		.bind(sessionId, name, sex, Date.now())
		.run();
}

/**
 * Removes a name from the session shortlist.
 *
 * No-op if the row does not exist.
 */
export async function removeFromShortlist(
	db: D1Database,
	sessionId: string,
	name: string,
	sex: 'M' | 'F',
): Promise<void> {
	await db
		.prepare(
			'DELETE FROM shortlists WHERE session_id = ? AND name = ? AND sex = ?',
		)
		.bind(sessionId, name, sex)
		.run();
}

/**
 * Returns all shortlisted names for a session, ordered by insertion time.
 */
export async function getShortlist(
	db: D1Database,
	sessionId: string,
): Promise<Shortlist[]> {
	const { results } = await db
		.prepare(
			'SELECT id, session_id, name, sex, created_at FROM shortlists WHERE session_id = ? ORDER BY created_at ASC',
		)
		.bind(sessionId)
		.all<Shortlist>();
	return results;
}
