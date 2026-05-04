/**
 * Typed D1 binding wrapper.
 *
 * Exports:
 *   - Row interfaces mirroring the schema in migrations/0001_init.sql.
 *   - `getDb(platform)` — returns the D1Database bound as `DB`.
 *
 * No business logic lives here. This module is the boundary between
 * SvelteKit's platform object and the typed query layer that Wave 2 will add.
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
