/**
 * KV-backed session and vote storage.
 *
 * Key schema:
 *   session:{sessionId}:meta           → SessionMeta
 *   session:{sessionId}:partner:{slug} → PartnerVotes
 *
 * All functions accept the KV namespace as the first argument so callers can
 * pass `platform.env.VOTES` from their +page.server.ts / +server.ts handler
 * without this module holding any global state.
 */

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

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function metaKey(sessionId: string): string {
	return `session:${sessionId}:meta`;
}

function partnerKey(sessionId: string, slug: string): string {
	return `session:${sessionId}:partner:${slug}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new session and persists its metadata to KV.
 * Returns the newly generated sessionId (a UUID v4).
 */
export async function createSession(kv: KVNamespace): Promise<string> {
	const sessionId = crypto.randomUUID();
	const meta: SessionMeta = {
		createdAt: Date.now(),
		partnerSlugs: [],
	};
	await kv.put(metaKey(sessionId), JSON.stringify(meta));
	return sessionId;
}

/**
 * Retrieves session metadata. Returns null if the session does not exist.
 */
export async function getSessionMeta(
	kv: KVNamespace,
	sessionId: string,
): Promise<SessionMeta | null> {
	return kv.get<SessionMeta>(metaKey(sessionId), 'json');
}

/**
 * Adds a partner slug to the session's partnerSlugs list (idempotent).
 *
 * Throws if the session does not exist — callers must create the session
 * before adding partners so we never silently create orphaned partner records.
 */
export async function addPartner(
	kv: KVNamespace,
	sessionId: string,
	slug: string,
): Promise<void> {
	const meta = await getSessionMeta(kv, sessionId);
	if (meta === null) {
		throw new Error(`Session not found: ${sessionId}`);
	}
	if (meta.partnerSlugs.includes(slug)) {
		// Already registered — nothing to do.
		return;
	}
	meta.partnerSlugs.push(slug);
	await kv.put(metaKey(sessionId), JSON.stringify(meta));
}

/**
 * Retrieves all votes for a given partner within a session.
 * Returns null if no votes have been recorded yet for this partner.
 */
export async function getVotes(
	kv: KVNamespace,
	sessionId: string,
	partnerSlug: string,
): Promise<PartnerVotes | null> {
	return kv.get<PartnerVotes>(partnerKey(sessionId, partnerSlug), 'json');
}

/**
 * Appends vote entries for a partner (read-modify-write).
 *
 * Last-write-wins: the new entries are pushed onto the existing array and the
 * whole blob is written back. This is safe for Phase 0 where each partner
 * swipes from a single device and simultaneous writes to the same key are
 * not expected.
 */
export async function appendVotes(
	kv: KVNamespace,
	sessionId: string,
	partnerSlug: string,
	votes: VoteEntry[],
): Promise<void> {
	const existing = await getVotes(kv, sessionId, partnerSlug);
	const updated: PartnerVotes = {
		votes: existing ? [...existing.votes, ...votes] : [...votes],
		updatedAt: Date.now(),
	};
	await kv.put(partnerKey(sessionId, partnerSlug), JSON.stringify(updated));
}

/**
 * Computes the set of names that every known partner in the session voted
 * 'yes' or 'super' on. For each match, `superSlugs` lists the partners who
 * specifically voted 'super' on that name (subset of partnerSlugs).
 *
 * If the session has fewer than 2 partners, matches is always an empty array
 * because there is no one to match with.
 */
export async function getMatches(
	kv: KVNamespace,
	sessionId: string,
): Promise<{
	partnerSlugs: string[];
	matches: Array<{ name: string; sex: 'M' | 'F'; superSlugs: string[] }>;
}> {
	const meta = await getSessionMeta(kv, sessionId);
	if (meta === null || meta.partnerSlugs.length < 2) {
		return {
			partnerSlugs: meta?.partnerSlugs ?? [],
			matches: [],
		};
	}

	// Load each partner's votes in parallel.
	const allVotes = await Promise.all(
		meta.partnerSlugs.map((slug) => getVotes(kv, sessionId, slug)),
	);

	// Build a set of "name|sex" keys that each partner liked (yes or super)
	// and a parallel set of keys that each partner specifically super-liked.
	// A name must appear in every partner's liked set to be a match.
	const likedSets = allVotes.map((pv) => {
		const liked = new Set<string>();
		const supered = new Set<string>();
		if (pv !== null) {
			for (const entry of pv.votes) {
				if (entry.vote === 'yes' || entry.vote === 'super') {
					liked.add(`${entry.name}|${entry.sex}`);
				}
				if (entry.vote === 'super') {
					supered.add(`${entry.name}|${entry.sex}`);
				}
			}
		}
		return { liked, supered };
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
		return { name, sex: sex as 'M' | 'F', superSlugs };
	});

	return { partnerSlugs: meta.partnerSlugs, matches };
}
