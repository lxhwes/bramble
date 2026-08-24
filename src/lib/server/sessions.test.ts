import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { SessionEnv, VoteEntry } from './sessions.js';
import {
	addPartner,
	appendVotes,
	createSession,
	getMatches,
	getVotes,
} from './sessions.js';
import type { BrambleDB, BrambleKV } from './storage/types.js';

// ---------------------------------------------------------------------------
// In-memory KV mock
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory store that satisfies BrambleKV:
 * `get(key, 'json')`, `put(key, stringValue)`, `delete(key)`.
 */
class MockKV implements BrambleKV {
	private store = new Map<string, string>();

	get<T = unknown>(key: string, _type: 'json'): Promise<T | null> {
		const raw = this.store.get(key) ?? null;
		if (raw === null) return Promise.resolve(null);
		return Promise.resolve(JSON.parse(raw) as T);
	}

	put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this.store.delete(key);
		return Promise.resolve();
	}
}

/** Returns a MockKV typed as BrambleKV. */
function mockKv(): { kv: BrambleKV; raw: MockKV } {
	const raw = new MockKV();
	return { kv: raw, raw };
}

// ---------------------------------------------------------------------------
// In-memory D1 mock (backed by better-sqlite3)
// ---------------------------------------------------------------------------

/**
 * Opens a fresh in-memory SQLite database with the Bramble schema applied.
 * Returns a BrambleDB wrapping better-sqlite3.
 */
function openMockDb(): { db: BrambleDB; raw: Database.Database } {
	const migrationPath = join(
		import.meta.dirname,
		'../../../migrations/0001_init.sql',
	);
	const sql = readFileSync(migrationPath, 'utf8');
	const raw = new Database(':memory:');
	// Production enforces FKs on both targets (D1 by default, node.ts sets the
	// pragma on the connection). The partner-repair path depends on the
	// partners -> sessions constraint actually biting, so the fixture must match.
	raw.pragma('foreign_keys = ON');
	raw.exec(sql);

	const db: BrambleDB = {
		prepare(query: string) {
			let boundValues: unknown[] = [];
			const stmt = {
				bind(...values: unknown[]) {
					boundValues = values;
					return stmt;
				},
				async run() {
					const info = raw.prepare(query).run(...boundValues);
					return { meta: { changes: info.changes } };
				},
				async first<T = unknown>(): Promise<T | null> {
					const row = raw.prepare(query).get(...boundValues) as T | undefined;
					return row ?? null;
				},
				async all<T = unknown>(): Promise<{ results: T[] }> {
					const rows = raw.prepare(query).all(...boundValues) as T[];
					return { results: rows };
				},
			};
			return stmt;
		},
	};

	return { db, raw };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVote(
	name: string,
	sex: 'M' | 'F',
	vote: VoteEntry['vote'],
): VoteEntry {
	return { name, sex, vote, ts: Date.now() };
}

/**
 * Build a SessionEnv.
 *
 * There is no KV-only variant any more: SQL is the sole store for votes, so a
 * SessionEnv without a database cannot serve a read.
 */
function kvAndDb(): {
	env: SessionEnv;
	rawKv: MockKV;
	rawDb: Database.Database;
} {
	const { kv, raw: rawKv } = mockKv();
	const { db, raw: rawDb } = openMockDb();
	return { env: { kv, db }, rawKv, rawDb };
}

// ---------------------------------------------------------------------------
// Core session/vote/match behaviour
// ---------------------------------------------------------------------------

describe('sessions.ts — core behaviour', () => {
	it('createSession returns a UUID and writes meta with partnerSlugs:[] and numeric createdAt', async () => {
		const { env, rawKv } = kvAndDb();
		const id = await createSession(env);

		expect(typeof id).toBe('string');
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);

		// Read back directly via the mock's get to verify the write
		const stored = await rawKv.get<{
			partnerSlugs: string[];
			createdAt: number;
		}>(`session:${id}:meta`, 'json');
		expect(stored).not.toBeNull();
		expect(stored?.partnerSlugs).toEqual([]);
		expect(typeof stored?.createdAt).toBe('number');
	});

	it('addPartner is idempotent — calling twice with the same slug yields partnerSlugs.length === 1', async () => {
		const { env, rawKv } = kvAndDb();
		const id = await createSession(env);

		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'alex');

		const stored = await rawKv.get<{ partnerSlugs: string[] }>(
			`session:${id}:meta`,
			'json',
		);
		expect(stored?.partnerSlugs).toHaveLength(1);
		expect(stored?.partnerSlugs[0]).toBe('alex');
	});

	it('addPartner throws when called on a non-existent session', async () => {
		const { env } = kvAndDb();
		await expect(addPartner(env, 'no-such-session', 'alex')).rejects.toThrow(
			'Session not found: no-such-session',
		);
	});

	it('appendVotes accumulates — two calls of 2 votes each yields 4 votes', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		const batch1: VoteEntry[] = [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Aaliyah', 'F', 'yes'),
		];
		const batch2: VoteEntry[] = [
			makeVote('Beatrice', 'F', 'no'),
			makeVote('Bruno', 'M', 'super'),
		];

		await appendVotes(env, id, 'alex', batch1);
		await appendVotes(env, id, 'alex', batch2);

		// Read back through the public API rather than the KV blob: SQL
		// accumulates by INSERT, so there is no array to inspect.
		const stored = await getVotes(env, id, 'alex');
		expect(stored?.votes).toHaveLength(4);
	});

	it('getMatches returns the intersection of yes/super votes across partners', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		// alex likes Aaden and Aaliyah; laura likes Aaden and Beatrice
		await appendVotes(env, id, 'alex', [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Aaliyah', 'F', 'yes'),
		]);
		await appendVotes(env, id, 'laura', [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Beatrice', 'F', 'yes'),
		]);

		const result = await getMatches(env, id);
		expect(result.matches).toHaveLength(1);
		// Match shape includes firstMatchedAt + firstLikedBy (W4.1/W4.2); the
		// dedicated tests below cover those fields, so this assertion only
		// pins the legacy intersection shape.
		expect(result.matches[0]).toMatchObject({
			name: 'Aaden',
			sex: 'M',
			superSlugs: [],
		});
	});

	it('getMatches treats super as yes for matching purposes', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(env, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].name).toBe('Aaden');
	});

	it('getMatches lists the slug of a single partner who super-liked the match', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		// alex super-likes; laura just likes
		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(env, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches[0].superSlugs).toEqual(['alex']);
	});

	it('getMatches lists every slug when all partners super-liked the match', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(env, id, 'laura', [makeVote('Aaden', 'M', 'super')]);

		const result = await getMatches(env, id);
		// Sorted to keep the assertion stable regardless of partner iteration order.
		expect([...result.matches[0].superSlugs].sort()).toEqual(['alex', 'laura']);
	});

	it('getMatches returns superSlugs:[] when nobody super-liked the match', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);
		await appendVotes(env, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches[0].superSlugs).toEqual([]);
	});

	it('getMatches returns empty matches when there is only one partner', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Match decision aids — W4.1 firstMatchedAt + W4.2 firstLikedBy
// ---------------------------------------------------------------------------

describe('getMatches — match decision aids', () => {
	it('firstMatchedAt is the max of yes-or-super ts across partners (the moment the match crystallizes)', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		// alex liked at t=100; laura liked at t=500 → match crystallizes at t=500
		await appendVotes(env, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 100 },
		]);
		await appendVotes(env, id, 'laura', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 500 },
		]);

		const result = await getMatches(env, id);
		expect(result.matches[0].firstMatchedAt).toBe(500);
	});

	it('firstLikedBy is the slug of the partner with the lowest yes-or-super ts', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		// laura is the first liker (t=100 < t=500)
		await appendVotes(env, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 500 },
		]);
		await appendVotes(env, id, 'laura', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 100 },
		]);

		const result = await getMatches(env, id);
		expect(result.matches[0].firstLikedBy).toBe('laura');
	});

	it('firstLikedBy ties break by partnerSlugs order from session meta', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex'); // added first → wins ties
		await addPartner(env, id, 'laura');

		// Identical timestamps → tie goes to whichever appears first in partnerSlugs
		await appendVotes(env, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 200 },
		]);
		await appendVotes(env, id, 'laura', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: 200 },
		]);

		const result = await getMatches(env, id);
		expect(result.matches[0].firstLikedBy).toBe('alex');
	});

	it('firstMatchedAt + firstLikedBy via D1 read path (db !== null)', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		await appendVotes(env, id, 'alex', [
			{ name: 'Mia', sex: 'F', vote: 'super', ts: 100 },
		]);
		await appendVotes(env, id, 'laura', [
			{ name: 'Mia', sex: 'F', vote: 'yes', ts: 800 },
		]);

		const result = await getMatches(env, id);
		expect(result.matches[0].firstMatchedAt).toBe(800);
		expect(result.matches[0].firstLikedBy).toBe('alex');
	});
});

// ---------------------------------------------------------------------------
// D1 parity tests — KV stays canonical, D1 mirrors each write
// ---------------------------------------------------------------------------

describe('sessions.ts — SQL writes', () => {
	it('createSession inserts a row into D1 sessions', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);

		const row = rawDb
			.prepare('SELECT id, user_id, created_at FROM sessions WHERE id = ?')
			.get(id) as { id: string; user_id: null; created_at: number } | undefined;

		expect(row).not.toBeUndefined();
		expect(row?.id).toBe(id);
		expect(row?.user_id).toBeNull();
		expect(typeof row?.created_at).toBe('number');
	});

	it('addPartner inserts a row into D1 partners linked to the session', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		const row = rawDb
			.prepare(
				'SELECT id, session_id, slug FROM partners WHERE session_id = ? AND slug = ?',
			)
			.get(id, 'alex') as
			| { id: string; session_id: string; slug: string }
			| undefined;

		expect(row).not.toBeUndefined();
		expect(row?.session_id).toBe(id);
		expect(row?.slug).toBe('alex');
	});

	it('appendVotes inserts one row per vote into D1 votes linked to the partner', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		await appendVotes(env, id, 'alex', [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Aaliyah', 'F', 'super'),
		]);

		const partnerRow = rawDb
			.prepare('SELECT id FROM partners WHERE session_id = ? AND slug = ?')
			.get(id, 'alex') as { id: string } | undefined;

		expect(partnerRow).toBeDefined();
		const voteRows = rawDb
			.prepare(
				'SELECT name, sex, vote FROM votes WHERE partner_id = ? ORDER BY name',
			)
			.all(partnerRow?.id) as Array<{
			name: string;
			sex: string;
			vote: string;
		}>;

		expect(voteRows).toHaveLength(2);
		// ORDER BY name: 'Aaden' < 'Aaliyah' alphabetically.
		expect(voteRows[0]).toMatchObject({ name: 'Aaden', sex: 'M', vote: 'yes' });
		expect(voteRows[1]).toMatchObject({
			name: 'Aaliyah',
			sex: 'F',
			vote: 'super',
		});
	});

	it('full flow — createSession → addPartner → appendVotes — meta in KV, votes in SQL', async () => {
		const { env, rawKv, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		const votes: VoteEntry[] = [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Beatrice', 'F', 'no'),
		];
		await appendVotes(env, id, 'alex', votes);

		// Verify KV
		const kvMeta = await rawKv.get<{ partnerSlugs: string[] }>(
			`session:${id}:meta`,
			'json',
		);
		expect(kvMeta?.partnerSlugs).toEqual(['alex', 'laura']);

		// Verify D1 session row
		const sessionRow = rawDb
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get(id) as { id: string } | undefined;
		expect(sessionRow?.id).toBe(id);

		// Verify D1 partners
		const partnerRows = rawDb
			.prepare('SELECT slug FROM partners WHERE session_id = ? ORDER BY slug')
			.all(id) as Array<{ slug: string }>;
		expect(partnerRows.map((r) => r.slug)).toEqual(['alex', 'laura']);

		// Verify D1 votes for alex
		const alexPartner = rawDb
			.prepare('SELECT id FROM partners WHERE session_id = ? AND slug = ?')
			.get(id, 'alex') as { id: string } | undefined;
		expect(alexPartner).toBeDefined();
		const d1Votes = rawDb
			.prepare(
				'SELECT name, sex, vote FROM votes WHERE partner_id = ? ORDER BY name',
			)
			.all(alexPartner?.id) as Array<{
			name: string;
			sex: string;
			vote: string;
		}>;
		expect(d1Votes).toHaveLength(2);
		expect(d1Votes[0]).toMatchObject({ name: 'Aaden', sex: 'M', vote: 'yes' });
		expect(d1Votes[1]).toMatchObject({
			name: 'Beatrice',
			sex: 'F',
			vote: 'no',
		});
	});

	it('idempotency — re-running appendVotes with the same votes does not duplicate D1 rows', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		const votes: VoteEntry[] = [makeVote('Aaden', 'M', 'yes')];
		await appendVotes(env, id, 'alex', votes);
		// Second call with the same vote — INSERT OR IGNORE must prevent a duplicate.
		await appendVotes(env, id, 'alex', votes);

		const partnerRow = rawDb
			.prepare('SELECT id FROM partners WHERE session_id = ? AND slug = ?')
			.get(id, 'alex') as { id: string } | undefined;

		expect(partnerRow).toBeDefined();
		const count = (
			rawDb
				.prepare('SELECT COUNT(*) as n FROM votes WHERE partner_id = ?')
				.get(partnerRow?.id) as { n: number }
		).n;

		expect(count).toBe(1);
	});

	it('idempotency — addPartner called twice does not duplicate D1 partners row', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'alex');

		const count = (
			rawDb
				.prepare(
					'SELECT COUNT(*) as n FROM partners WHERE session_id = ? AND slug = ?',
				)
				.get(id, 'alex') as { n: number }
		).n;

		expect(count).toBe(1);
	});

	it('D1 write failure is best-effort — does not propagate to caller', async () => {
		// Simulate a broken DB by passing an object whose prepare().bind().run() rejects.
		const brokenDb: BrambleDB = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					run: () => Promise.reject(new Error('DB unavailable')),
					first: () => Promise.reject(new Error('DB unavailable')),
					all: () => Promise.reject(new Error('DB unavailable')),
				};
				return stmt;
			},
		};

		const { kv } = mockKv();
		const env: SessionEnv = { kv, db: brokenDb };

		// createSession must succeed even though D1 is broken.
		await expect(createSession(env)).resolves.toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});
});

// ---------------------------------------------------------------------------
// SQL as the sole vote store (W0.4)
//
// appendVotes used to write the full vote array to KV as well, and getVotes
// fell back to reading it when no database was present. Votes now live only in
// SQL; KV holds session:{id}:meta and nothing else.
// ---------------------------------------------------------------------------

describe('sessions.ts — SQL is the sole vote store', () => {
	it('appendVotes does not write a KV partner blob', async () => {
		const { env, rawKv } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const blob = await rawKv.get(`session:${id}:partner:alex`, 'json');
		expect(blob).toBeNull();
	});

	it('getVotes ignores a pre-existing KV partner blob', async () => {
		// A session from the dual-write era: votes in KV, nothing in SQL. The
		// fallback is gone, so these are not readable.
		const { env, rawKv } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await rawKv.put(
			`session:${id}:partner:alex`,
			JSON.stringify({
				votes: [makeVote('Ghost', 'F', 'yes')],
				updatedAt: Date.now(),
			}),
		);

		expect(await getVotes(env, id, 'alex')).toBeNull();
	});

	it('appendVotes propagates a SQL write failure', async () => {
		// Swallowing this would mean silent, permanent vote loss now that there
		// is no second store to fall back on.
		const brokenDb: BrambleDB = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					run: () => Promise.reject(new Error('DB unavailable')),
					first: () => Promise.reject(new Error('DB unavailable')),
					all: () => Promise.reject(new Error('DB unavailable')),
				};
				return stmt;
			},
		};
		const { kv } = mockKv();
		const env: SessionEnv = { kv, db: brokenDb };
		const id = await createSession(env);

		await expect(
			appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]),
		).rejects.toThrow();
	});

	it('appendVotes repairs a missing partner row', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		rawDb.prepare('DELETE FROM partners WHERE session_id = ?').run(id);

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const stored = await getVotes(env, id, 'alex');
		expect(stored?.votes).toHaveLength(1);
	});

	it('appendVotes repairs a missing session row', async () => {
		const { env, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		// Cascades the partner row away too, so both inserts must be replayed.
		rawDb.prepare('DELETE FROM sessions WHERE id = ?').run(id);

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const stored = await getVotes(env, id, 'alex');
		expect(stored?.votes).toHaveLength(1);
	});

	it('a repaired session row keeps the original createdAt', async () => {
		const { env, rawKv, rawDb } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		rawDb.prepare('DELETE FROM sessions WHERE id = ?').run(id);

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const meta = await rawKv.get<{ createdAt: number }>(
			`session:${id}:meta`,
			'json',
		);
		const row = rawDb
			.prepare('SELECT created_at FROM sessions WHERE id = ?')
			.get(id) as { created_at: number } | undefined;
		expect(row?.created_at).toBe(meta?.createdAt);
	});

	it('appendVotes throws when the session is unknown', async () => {
		// Bounds the repair: an unauthenticated POST to an arbitrary id must not
		// mint session and partner rows.
		const { env } = kvAndDb();
		await expect(
			appendVotes(env, 'no-such-session', 'alex', [
				makeVote('Aaden', 'M', 'yes'),
			]),
		).rejects.toThrow('Session not found');
	});

	it('appendVotes is a no-op for an empty batch', async () => {
		const { env } = kvAndDb();
		await expect(
			appendVotes(env, 'no-such-session', 'alex', []),
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// D1 read cutover (W2.2a)
// ---------------------------------------------------------------------------

describe('sessions.ts — D1 read cutover (W2.2a)', () => {
	it('getVotes reads from D1 when db is present', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		const ts1 = Date.now();
		const ts2 = ts1 + 1000;
		await appendVotes(env, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: ts1 },
			{ name: 'Aaliyah', sex: 'F', vote: 'super', ts: ts2 },
		]);

		const result = await getVotes(env, id, 'alex');

		expect(result).not.toBeNull();
		expect(result?.votes).toHaveLength(2);
		expect(result?.votes[0]).toMatchObject({
			name: 'Aaden',
			sex: 'M',
			vote: 'yes',
			ts: ts1,
		});
		expect(result?.votes[1]).toMatchObject({
			name: 'Aaliyah',
			sex: 'F',
			vote: 'super',
			ts: ts2,
		});
		expect(result?.updatedAt).toBe(Math.max(ts1, ts2));
	});

	it('getVotes returns null for an unknown partner', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		// No addPartner, no appendVotes — 'ghost' has no rows in D1.

		const result = await getVotes(env, id, 'ghost');

		expect(result).toBeNull();
	});

	it('getMatches reads via D1 when db is present', async () => {
		const { env } = kvAndDb();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		const ts = Date.now();
		await appendVotes(env, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts },
		]);
		await appendVotes(env, id, 'laura', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: ts + 1 },
		]);

		const result = await getMatches(env, id);

		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].name).toBe('Aaden');
		expect(result.matches[0].sex).toBe('M');
		expect(result.matches[0].superSlugs).toHaveLength(0);
	});
});
