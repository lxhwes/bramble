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
} from './sessions.js';

// ---------------------------------------------------------------------------
// In-memory KV mock
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory store that covers only the KVNamespace methods sessions.ts
 * uses: `get(key, 'json')` and `put(key, stringValue)`.
 *
 * Typed as a plain object to avoid having to mirror the complex overload set on
 * the KVNamespace interface. Cast to `KVNamespace` at call sites via
 * `mockKv()` helper below.
 */
class MockKV {
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
}

/** Cast a MockKV to the KVNamespace shape expected by sessions.ts. */
function mockKv(): { kv: KVNamespace; raw: MockKV } {
	const raw = new MockKV();
	return { kv: raw as unknown as KVNamespace, raw };
}

// ---------------------------------------------------------------------------
// In-memory D1 mock (backed by better-sqlite3)
// ---------------------------------------------------------------------------

/**
 * Opens a fresh in-memory SQLite database with the Bramble schema applied.
 * Returns a D1Database-compatible mock that wraps better-sqlite3.
 *
 * Only covers `prepare(sql).run(...bindings)` and `prepare(sql).first()` —
 * the only D1 methods sessions.ts uses for dual-write.
 */
function openMockDb(): { db: D1Database; raw: Database.Database } {
	const migrationPath = join(
		import.meta.dirname,
		'../../../migrations/0001_init.sql',
	);
	const sql = readFileSync(migrationPath, 'utf8');
	const raw = new Database(':memory:');
	raw.exec(sql);

	// Wrap better-sqlite3 to look like D1Database's prepare().run() / .first() API.
	const db = {
		prepare(query: string) {
			return {
				bind(...values: unknown[]) {
					return {
						run() {
							return Promise.resolve(raw.prepare(query).run(...values));
						},
						first<T = unknown>(): Promise<T | null> {
							const row = raw.prepare(query).get(...values) as T | undefined;
							return Promise.resolve(row ?? null);
						},
					};
				},
				run(...values: unknown[]) {
					return Promise.resolve(raw.prepare(query).run(...values));
				},
				first<T = unknown>(...values: unknown[]): Promise<T | null> {
					const row = raw.prepare(query).get(...values) as T | undefined;
					return Promise.resolve(row ?? null);
				},
			};
		},
	} as unknown as D1Database;

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

/** Build a SessionEnv without D1 — for the existing KV-only tests. */
function kvOnly(): { env: SessionEnv; rawKv: MockKV } {
	const { kv, raw } = mockKv();
	return { env: { kv, db: null }, rawKv: raw };
}

/** Build a SessionEnv with both KV and D1 — for parity tests. */
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
// Existing KV-only behaviour (unchanged by W2.1)
// ---------------------------------------------------------------------------

describe('sessions.ts — KV behaviour', () => {
	it('createSession returns a UUID and writes meta with partnerSlugs:[] and numeric createdAt', async () => {
		const { env, rawKv } = kvOnly();
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
		const { env, rawKv } = kvOnly();
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
		const { env } = kvOnly();
		await expect(addPartner(env, 'no-such-session', 'alex')).rejects.toThrow(
			'Session not found: no-such-session',
		);
	});

	it('appendVotes accumulates — two calls of 2 votes each yields a 4-vote array', async () => {
		const { env, rawKv } = kvOnly();
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

		const stored = await rawKv.get<{ votes: VoteEntry[] }>(
			`session:${id}:partner:alex`,
			'json',
		);
		expect(stored?.votes).toHaveLength(4);
	});

	it('getMatches returns the intersection of yes/super votes across partners', async () => {
		const { env } = kvOnly();
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
		expect(result.matches[0]).toEqual({
			name: 'Aaden',
			sex: 'M',
			superSlugs: [],
		});
	});

	it('getMatches treats super as yes for matching purposes', async () => {
		const { env } = kvOnly();
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
		const { env } = kvOnly();
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
		const { env } = kvOnly();
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
		const { env } = kvOnly();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await addPartner(env, id, 'laura');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);
		await appendVotes(env, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches[0].superSlugs).toEqual([]);
	});

	it('getMatches returns empty matches when there is only one partner', async () => {
		const { env } = kvOnly();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');

		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(env, id);
		expect(result.matches).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// D1 parity tests — KV stays canonical, D1 mirrors each write
// ---------------------------------------------------------------------------

describe('sessions.ts — D1 dual-write parity', () => {
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

	it('full flow — createSession → addPartner → appendVotes — KV and D1 both hold matching data', async () => {
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

		const kvVotes = await rawKv.get<{ votes: VoteEntry[] }>(
			`session:${id}:partner:alex`,
			'json',
		);
		expect(kvVotes?.votes).toHaveLength(2);

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
		// Simulate a broken D1 by passing an object whose prepare().bind().run() rejects.
		const brokenDb = {
			prepare() {
				return {
					bind() {
						return {
							run: () => Promise.reject(new Error('D1 unavailable')),
							first: () => Promise.reject(new Error('D1 unavailable')),
						};
					},
				};
			},
		} as unknown as D1Database;

		const { kv } = mockKv();
		const env: SessionEnv = { kv, db: brokenDb };

		// createSession must succeed even though D1 is broken.
		await expect(createSession(env)).resolves.toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});

	it('D1 null — all operations succeed when db is null (no D1 binding available)', async () => {
		const { env } = kvOnly();
		const id = await createSession(env);
		await addPartner(env, id, 'alex');
		await appendVotes(env, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);
		const result = await getMatches(env, id);
		expect(result.matches).toHaveLength(0); // only one partner
	});
});
