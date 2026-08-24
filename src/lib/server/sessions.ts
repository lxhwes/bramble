/**
 * Session and vote storage.
 *
 * Key schema (KV — hot state, fallback when D1 unavailable):
 *   session:{sessionId}:meta           → SessionMeta
 *   session:{sessionId}:partner:{slug} → PartnerVotes
 *
 * D1 (canonical read source when env.db is present):
 *   sessions  — one row per createSession call
 *   partners  — one row per addPartner call
 *   votes     — one row per vote in appendVotes
 *
 * Read strategy: `getVotes` reads from D1 when `env.db !== null`; falls back
 * to KV otherwise (local dev, unit tests that omit the D1 fixture).
 *
 * Write strategy: `appendVotes` still dual-writes to both KV and D1.  The KV
 * write will be removed once W2.2a has soaked in production for ~one week
 * (see W2.2b in PHASE-1.5.md).
 *
 * API design: functions accept a `SessionEnv` object `{ kv, db }` rather than
 * a bare `KVNamespace`.  Callers pass `{ kv: platform.env.VOTES, db: platform.env.DB }`.
 * `db` is nullable so callers and tests can omit it when D1 is unavailable.
 *
 * D1 writes are best-effort: any failure is logged via console.warn and
 * swallowed.  A D1 failure must not break the swipe path.
 */

import type { BrambleDB, BrambleKV } from './storage/types.js';

export type Vote = 'yes' | 'no' | 'super';

export interface VoteEntry {
	name: string;
	sex: 'M' | 'F';
	vote: Vote;
	/** Unix timestamp in milliseconds. */
	ts: number;
}

export interface SessionMeta {
	createdAt: number;
	partnerSlugs: string[];
}

export interface PartnerVotes {
	votes: VoteEntry[];
	updatedAt: number;
}

/**
 * Combined storage environment for session operations.
 *
 * `db` is nullable so callers in environments where D1 is not wired up (local
 * dev without a real binding, unit tests that only exercise KV paths) can pass
 * `null` safely.
 */
export interface SessionEnv {
	kv: BrambleKV;
	db: BrambleDB | null;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Key for a session's metadata blob.
 *
 * Exported because `prune.ts` deletes these keys for pruned sessions, and the
 * two modules must not drift on the key format.
 */
export function sessionMetaKey(sessionId: string): string {
	return `session:${sessionId}:meta`;
}

function partnerKey(sessionId: string, slug: string): string {
	return `session:${sessionId}:partner:${slug}`;
}

// ---------------------------------------------------------------------------
// D1 helpers (best-effort, never throw)
// ---------------------------------------------------------------------------

/**
 * Wraps a D1 write promise so that any rejection is logged and swallowed.
 * Returns void in all cases.
 */
async function tryD1(
	label: string,
	write: () => Promise<unknown>,
): Promise<void> {
	try {
		await write();
	} catch (err) {
		console.warn(`[sessions] D1 dual-write failed (${label}):`, err);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new session and persists its metadata to KV.
 * Also shadow-writes a row to D1 `sessions` (best-effort).
 * Returns the newly generated sessionId (a UUID v4).
 */
export async function createSession(env: SessionEnv): Promise<string> {
	const sessionId = crypto.randomUUID();
	const now = Date.now();
	const meta: SessionMeta = {
		createdAt: now,
		partnerSlugs: [],
	};
	await env.kv.put(sessionMetaKey(sessionId), JSON.stringify(meta));

	if (env.db !== null) {
		const db = env.db;
		await tryD1('createSession', () =>
			db
				.prepare(
					'INSERT OR IGNORE INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)',
				)
				.bind(sessionId, null, now)
				.run(),
		);
	}

	return sessionId;
}

/**
 * Retrieves session metadata. Returns null if the session does not exist.
 */
export async function getSessionMeta(
	env: SessionEnv,
	sessionId: string,
): Promise<SessionMeta | null> {
	return env.kv.get<SessionMeta>(sessionMetaKey(sessionId), 'json');
}

/**
 * Adds a partner slug to the session's partnerSlugs list (idempotent).
 * Also shadow-writes a row to D1 `partners` (best-effort, INSERT OR IGNORE).
 *
 * Throws if the session does not exist — callers must create the session
 * before adding partners so we never silently create orphaned partner records.
 */
export async function addPartner(
	env: SessionEnv,
	sessionId: string,
	slug: string,
): Promise<void> {
	const meta = await getSessionMeta(env, sessionId);
	if (meta === null) {
		throw new Error(`Session not found: ${sessionId}`);
	}
	if (meta.partnerSlugs.includes(slug)) {
		// Already registered in KV — nothing to do on KV, but still try D1
		// in case a previous D1 write failed (idempotent via INSERT OR IGNORE).
		if (env.db !== null) {
			const db = env.db;
			await tryD1('addPartner:existing', () =>
				insertPartnerD1(db, sessionId, slug),
			);
		}
		return;
	}
	meta.partnerSlugs.push(slug);
	await env.kv.put(sessionMetaKey(sessionId), JSON.stringify(meta));

	if (env.db !== null) {
		const db = env.db;
		await tryD1('addPartner', () => insertPartnerD1(db, sessionId, slug));
	}
}

async function insertPartnerD1(
	db: BrambleDB,
	sessionId: string,
	slug: string,
): Promise<void> {
	const partnerId = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			'INSERT OR IGNORE INTO partners (id, session_id, slug, created_at) VALUES (?, ?, ?, ?)',
		)
		.bind(partnerId, sessionId, slug, now)
		.run();
}

/**
 * Retrieves all votes for a given partner within a session.
 *
 * When `env.db` is present, reads from D1 (canonical source). The query
 * joins through `partners` so only a `session_id + slug` pair is required —
 * callers never need to know the internal `partner_id`. Rows are ordered by
 * `ts ASC` so the returned array reflects the chronological swipe order.
 *
 * `updatedAt` is the maximum `ts` across all returned vote rows.
 *
 * Zero D1 rows → `null`. This covers:
 *   - Unknown partners (no partner row exists in D1).
 *   - Old KV-only sessions that pre-date W2.1 dual-write — accepted data loss.
 *
 * When `env.db` is null, falls back to KV exactly as before. Unit tests that
 * pass `{ kv, db: null }` are unaffected.
 */
export async function getVotes(
	env: SessionEnv,
	sessionId: string,
	partnerSlug: string,
): Promise<PartnerVotes | null> {
	if (env.db === null) {
		return env.kv.get<PartnerVotes>(partnerKey(sessionId, partnerSlug), 'json');
	}

	const { results } = await env.db
		.prepare(
			`SELECT v.name, v.sex, v.vote, v.ts
			FROM votes v
			JOIN partners p ON p.id = v.partner_id
			WHERE p.session_id = ? AND p.slug = ?
			ORDER BY v.ts ASC`,
		)
		.bind(sessionId, partnerSlug)
		.all<{ name: string; sex: 'M' | 'F'; vote: Vote; ts: number }>();

	if (results.length === 0) {
		return null;
	}

	return {
		votes: results.map((r) => ({
			name: r.name,
			sex: r.sex,
			vote: r.vote,
			ts: r.ts,
		})),
		updatedAt: Math.max(...results.map((r) => r.ts)),
	};
}

/**
 * Appends vote entries for a partner (read-modify-write on KV).
 * Also shadow-writes each vote to D1 `votes` via INSERT OR IGNORE (best-effort).
 *
 * Last-write-wins: the new entries are pushed onto the existing KV array.
 * D1 uses UNIQUE(partner_id, name, sex) to ensure idempotency — re-sending
 * the same votes does not create duplicate rows.
 */
export async function appendVotes(
	env: SessionEnv,
	sessionId: string,
	partnerSlug: string,
	votes: VoteEntry[],
): Promise<void> {
	const existing = await getVotes(env, sessionId, partnerSlug);
	const updated: PartnerVotes = {
		votes: existing ? [...existing.votes, ...votes] : [...votes],
		updatedAt: Date.now(),
	};
	await env.kv.put(partnerKey(sessionId, partnerSlug), JSON.stringify(updated));

	if (env.db !== null && votes.length > 0) {
		const db = env.db;
		await tryD1('appendVotes', async () => {
			// Look up the partner_id from D1 using the KV session id + slug.
			const partnerRow = await db
				.prepare('SELECT id FROM partners WHERE session_id = ? AND slug = ?')
				.bind(sessionId, partnerSlug)
				.first<{ id: string }>();

			if (partnerRow === null) {
				// Partner row is missing in D1 (e.g. addPartner D1 write previously
				// failed). Log and skip — the KV write above already succeeded.
				console.warn(
					`[sessions] D1 dual-write skipped for votes: partner not found in D1 (session=${sessionId}, slug=${partnerSlug})`,
				);
				return;
			}

			for (const v of votes) {
				const voteId = crypto.randomUUID();
				await db
					.prepare(
						'INSERT OR IGNORE INTO votes (id, partner_id, name, sex, vote, ts) VALUES (?, ?, ?, ?, ?, ?)',
					)
					.bind(voteId, partnerRow.id, v.name, v.sex, v.vote, v.ts)
					.run();
			}
		});
	}
}

/**
 * Computes the set of names that every known partner in the session voted
 * 'yes' or 'super' on. For each match, `superSlugs` lists the partners who
 * specifically voted 'super' on that name (subset of partnerSlugs).
 *
 * If the session has fewer than 2 partners, matches is always an empty array
 * because there is no one to match with.
 *
 * Delegates reads to `getVotes`, which reads from D1 when `env.db` is present
 * and falls back to KV otherwise.
 */
export async function getMatches(
	env: SessionEnv,
	sessionId: string,
): Promise<{
	partnerSlugs: string[];
	matches: Array<{
		name: string;
		sex: 'M' | 'F';
		superSlugs: string[];
		/**
		 * Timestamp at which every partner had voted yes/super on this name —
		 * i.e. the moment the match crystallized. Max of the yes-or-super `ts`
		 * across partners.
		 */
		firstMatchedAt: number;
		/**
		 * Slug of the partner whose yes-or-super on this name has the lowest
		 * `ts`. Ties are broken by `partnerSlugs` order from session meta.
		 */
		firstLikedBy: string;
	}>;
}> {
	const meta = await getSessionMeta(env, sessionId);
	if (meta === null || meta.partnerSlugs.length < 2) {
		return {
			partnerSlugs: meta?.partnerSlugs ?? [],
			matches: [],
		};
	}

	// Load each partner's votes in parallel.
	const allVotes = await Promise.all(
		meta.partnerSlugs.map((slug) => getVotes(env, sessionId, slug)),
	);

	// Build per-partner indices: liked keys, super-liked keys, and a key→ts
	// lookup for yes/super entries (needed for firstMatchedAt + firstLikedBy).
	const likedSets = allVotes.map((pv) => {
		const liked = new Set<string>();
		const supered = new Set<string>();
		const likeTs = new Map<string, number>();
		if (pv !== null) {
			for (const entry of pv.votes) {
				const key = `${entry.name}|${entry.sex}`;
				if (entry.vote === 'yes' || entry.vote === 'super') {
					liked.add(key);
					likeTs.set(key, entry.ts);
				}
				if (entry.vote === 'super') {
					supered.add(key);
				}
			}
		}
		return { liked, supered, likeTs };
	});

	// Intersect: start from the first set and keep only keys present in all.
	const [first, ...rest] = likedSets;
	const intersection = new Set<string>(
		[...first.liked].filter((key) => rest.every((s) => s.liked.has(key))),
	);

	const matches = [...intersection].map((key) => {
		const [name, sex] = key.split('|');
		// The key was constructed as `${name}|${'M'|'F'}` so sex is always valid.
		const superSlugs = meta.partnerSlugs.filter((_, i) =>
			likedSets[i].supered.has(key),
		);

		// Per-partner yes/super timestamps for this match. The key is present in
		// every partner's liked set (intersection), so likeTs.get is non-null.
		const perPartnerTs = likedSets.map((s) => s.likeTs.get(key) as number);
		const firstMatchedAt = Math.max(...perPartnerTs);

		// First liker = partner with lowest ts. Ties resolved by partnerSlugs
		// order (Array#indexOf returns the first match), which mirrors meta order.
		let firstIdx = 0;
		for (let i = 1; i < perPartnerTs.length; i++) {
			if (perPartnerTs[i] < perPartnerTs[firstIdx]) firstIdx = i;
		}
		const firstLikedBy = meta.partnerSlugs[firstIdx];

		return {
			name,
			sex: sex as 'M' | 'F',
			superSlugs,
			firstMatchedAt,
			firstLikedBy,
		};
	});

	return { partnerSlugs: meta.partnerSlugs, matches };
}
