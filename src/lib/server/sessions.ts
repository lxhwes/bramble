/**
 * Session and vote storage.
 *
 * Key schema (KV):
 *   session:{sessionId}:meta → SessionMeta
 *
 * That is the only key the app reads or writes. Votes used to be mirrored to
 * `session:{id}:partner:{slug}` as a safety net during the D1 cutover; that
 * dual-write was removed in W0.4.
 *
 * SQL (the source of truth):
 *   sessions  — one row per createSession call
 *   partners  — one row per addPartner call
 *   votes     — one row per vote in appendVotes
 *
 * Read/write strategy: votes are read from and written to SQL only.
 *
 * Failure semantics differ by operation, deliberately:
 *   - `appendVotes` throws. With no second store, swallowing a write failure
 *     would be silent, permanent vote loss. The client keeps the batch and
 *     retries on any non-2xx, and UNIQUE(partner_id, name, sex) with
 *     INSERT OR IGNORE makes a replayed batch idempotent.
 *   - `createSession` and `addPartner` stay best-effort. Their rows are
 *     reconstructed by the repair path in `appendVotes`, so failing a user's
 *     session-create on a transient blip would cost more than it buys.
 *
 * API design: functions accept a `SessionEnv` (an alias of `Storage`) rather
 * than a bare KV namespace. Callers get one from `getStorage()`.
 */

import type { BrambleDB, Storage } from './storage/types.js';

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
 * Storage environment for session operations.
 *
 * An alias of `Storage` rather than a second definition that can drift. `db` is
 * required: with SQL as the sole vote store there is no KV-only mode, so the
 * compiler enforces the invariant instead of a runtime guard.
 */
export type SessionEnv = Storage;

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
 * Zero rows → `null`. This covers:
 *   - Unknown partners (no partner row exists).
 *   - Sessions predating the W2.1 dual-write, whose votes only ever existed in
 *     KV — accepted data loss, and already unreadable since the W2.2a read
 *     cutover.
 */
export async function getVotes(
	env: SessionEnv,
	sessionId: string,
	partnerSlug: string,
): Promise<PartnerVotes | null> {
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
 * Resolves the partner row id, recreating the session and partner rows if they
 * are missing.
 *
 * `createSession` and `addPartner` write their SQL rows best-effort, so a
 * transient failure there could leave a live session with no partner row. That
 * used to mean votes were silently dropped; with SQL as the only store it would
 * be outright data loss on the swipe path, so the miss is repaired instead.
 *
 * The repair is bounded by requiring session meta to exist in KV — the same
 * invariant `addPartner` enforces. Without it an unauthenticated POST to an
 * arbitrary session id could mint rows.
 *
 * Deliberately does not check `meta.partnerSlugs.includes(slug)`: KV is
 * eventually consistent on Cloudflare, so a vote landing in another colo may
 * not see the `addPartner` write yet, and rejecting would lose real votes. The
 * slug is already validated by the route.
 */
async function resolvePartnerId(
	env: SessionEnv,
	sessionId: string,
	partnerSlug: string,
): Promise<string> {
	const db = env.db;
	const lookup = () =>
		db
			.prepare('SELECT id FROM partners WHERE session_id = ? AND slug = ?')
			.bind(sessionId, partnerSlug)
			.first<{ id: string }>();

	const existing = await lookup();
	if (existing !== null) return existing.id;

	const meta = await getSessionMeta(env, sessionId);
	if (meta === null) {
		throw new Error(`Session not found: ${sessionId}`);
	}

	// The sessions row must exist first: FKs are enforced on both targets, so
	// the partners insert fails without it. Reuse the real createdAt rather than
	// inventing one — session age is meaningful to retention.
	await db
		.prepare(
			'INSERT OR IGNORE INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)',
		)
		.bind(sessionId, null, meta.createdAt)
		.run();
	await insertPartnerD1(db, sessionId, partnerSlug);

	const repaired = await lookup();
	if (repaired === null) {
		throw new Error(
			`Failed to resolve partner row (session=${sessionId}, slug=${partnerSlug})`,
		);
	}
	return repaired.id;
}

/**
 * Appends vote entries for a partner.
 *
 * Writes one row per vote via INSERT OR IGNORE against
 * UNIQUE(partner_id, name, sex), so replaying a batch is idempotent — which is
 * what makes it safe for this to throw and for the client to retry.
 */
export async function appendVotes(
	env: SessionEnv,
	sessionId: string,
	partnerSlug: string,
	votes: VoteEntry[],
): Promise<void> {
	if (votes.length === 0) return;

	const db = env.db;
	const partnerId = await resolvePartnerId(env, sessionId, partnerSlug);

	for (const v of votes) {
		const voteId = crypto.randomUUID();
		await db
			.prepare(
				'INSERT OR IGNORE INTO votes (id, partner_id, name, sex, vote, ts) VALUES (?, ?, ?, ?, ?, ?)',
			)
			.bind(voteId, partnerId, v.name, v.sex, v.vote, v.ts)
			.run();
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
