import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { pruneInactiveSessions } from './prune.js';
import { sessionMetaKey } from './sessions.js';
import type { BrambleDB, BrambleKV, Storage } from './storage/types.js';

// ---------------------------------------------------------------------------
// Schema fixture
// ---------------------------------------------------------------------------

function openWithAllMigrations(): Database.Database {
	const db = new Database(':memory:');
	for (const filename of ['0001_init.sql', '0002_shortlist.sql']) {
		const sql = readFileSync(
			join(import.meta.dirname, '../../../migrations', filename),
			'utf8',
		);
		db.exec(sql);
	}
	return db;
}

// ---------------------------------------------------------------------------
// D1 shim (minimal: .prepare().bind().run() + .all() + .first())
// ---------------------------------------------------------------------------

type D1Row = Record<string, unknown>;

function makeD1Shim(sqlite: Database.Database, ops?: string[]): BrambleDB {
	return {
		prepare(query: string) {
			let bound: unknown[] = [];
			const stmt = {
				bind(...values: unknown[]) {
					bound = values;
					return stmt;
				},
				async all<T = D1Row>(): Promise<{ results: T[] }> {
					const results = sqlite.prepare(query).all(...bound) as T[];
					return { results };
				},
				async run(): Promise<{ meta: { changes: number } }> {
					ops?.push('sql');
					const info = sqlite.prepare(query).run(...bound);
					return { meta: { changes: info.changes } };
				},
				async first<T = D1Row>(): Promise<T | null> {
					const row = sqlite.prepare(query).get(...bound) as T | undefined;
					return row ?? null;
				},
			};
			return stmt;
		},
	};
}

// ---------------------------------------------------------------------------
// KV shim (Map-backed)
// ---------------------------------------------------------------------------

function makeKvShim(
	store = new Map<string, string>(),
	ops?: string[],
): BrambleKV {
	return {
		async get<T>(key: string): Promise<T | null> {
			const raw = store.get(key);
			return raw === undefined ? null : (JSON.parse(raw) as T);
		},
		async put(key: string, value: string): Promise<void> {
			store.set(key, value);
		},
		async delete(key: string): Promise<void> {
			ops?.push(`kv:${key}`);
			store.delete(key);
		},
	};
}

/**
 * Assembles the Storage that pruneInactiveSessions now takes.
 *
 * `ops` records the interleaving of KV deletes and SQL writes so the
 * meta-before-rows ordering can be asserted.
 */
function makeStorage(sqlite: Database.Database): {
	storage: Storage;
	kvStore: Map<string, string>;
	ops: string[];
} {
	const kvStore = new Map<string, string>();
	const ops: string[] = [];
	return {
		storage: { db: makeD1Shim(sqlite, ops), kv: makeKvShim(kvStore, ops) },
		kvStore,
		ops,
	};
}

// ---------------------------------------------------------------------------
// Helpers: insert rows into the in-memory DB
// ---------------------------------------------------------------------------

interface SeedRow {
	sessionId: string;
	partnerId: string;
	latestVoteTs: number | null; // null → no votes for this session
}

function seed(
	sqlite: Database.Database,
	rows: SeedRow[],
	kvStore?: Map<string, string>,
): void {
	for (const { sessionId, partnerId, latestVoteTs } of rows) {
		// Mirror what createSession does, so the meta key is there to delete.
		kvStore?.set(
			sessionMetaKey(sessionId),
			JSON.stringify({ createdAt: 0, partnerSlugs: ['alice'] }),
		);
		sqlite
			.prepare(
				'INSERT INTO sessions (id, user_id, created_at) VALUES (?, NULL, ?)',
			)
			.run(sessionId, 0);
		sqlite
			.prepare(
				'INSERT INTO partners (id, session_id, slug, created_at) VALUES (?, ?, ?, ?)',
			)
			.run(partnerId, sessionId, 'alice', 0);

		if (latestVoteTs !== null) {
			sqlite
				.prepare(
					'INSERT INTO votes (id, partner_id, name, sex, vote, ts) VALUES (?, ?, ?, ?, ?, ?)',
				)
				.run(`vote-${partnerId}`, partnerId, 'Ava', 'F', 'yes', latestVoteTs);
		}
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pruneInactiveSessions', () => {
	const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

	it('returns 0 when no sessions exist', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const count = await pruneInactiveSessions(storage, Date.now());
		expect(count).toBe(0);
	});

	it('does not prune a session whose last vote is within 90 days', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-recent',
				partnerId: 'p-recent',
				latestVoteTs: now - NINETY_DAYS_MS + 1000, // just inside window
			},
		]);

		const count = await pruneInactiveSessions(storage, now);

		expect(count).toBe(0);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-recent');
		expect(session).toBeDefined();
	});

	it('prunes a session whose last vote is older than 90 days', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-old',
				partnerId: 'p-old',
				latestVoteTs: now - NINETY_DAYS_MS - 1000, // just outside window
			},
		]);

		const count = await pruneInactiveSessions(storage, now);

		expect(count).toBe(1);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-old');
		expect(session).toBeUndefined();
	});

	it('cascades deletion to partners and votes', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-cascade',
				partnerId: 'p-cascade',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
		]);

		await pruneInactiveSessions(storage, now);

		const partners = sqlite
			.prepare('SELECT id FROM partners WHERE session_id = ?')
			.all('s-cascade');
		expect(partners).toHaveLength(0);

		const votes = sqlite
			.prepare('SELECT id FROM votes WHERE partner_id = ?')
			.all('p-cascade');
		expect(votes).toHaveLength(0);
	});

	it('prunes shortlist rows for deleted sessions', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-shortlist',
				partnerId: 'p-shortlist',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
		]);

		// Insert a shortlist row using the same session_id (shortlists use a TEXT session_id).
		sqlite
			.prepare(
				'INSERT INTO shortlists (session_id, name, sex, created_at) VALUES (?, ?, ?, ?)',
			)
			.run('s-shortlist', 'Leo', 'M', 0);

		await pruneInactiveSessions(storage, now);

		const shortlist = sqlite
			.prepare('SELECT id FROM shortlists WHERE session_id = ?')
			.all('s-shortlist');
		expect(shortlist).toHaveLength(0);
	});

	it('prunes orphan sessions (no votes at all)', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		// Session created long ago with no votes.
		seed(sqlite, [
			{ sessionId: 's-orphan', partnerId: 'p-orphan', latestVoteTs: null },
		]);

		const count = await pruneInactiveSessions(storage, now);

		expect(count).toBe(1);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-orphan');
		expect(session).toBeUndefined();
	});

	it('keeps recent sessions while pruning old ones in the same database', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-keep',
				partnerId: 'p-keep',
				latestVoteTs: now - 1000, // very recent
			},
			{
				sessionId: 's-prune-1',
				partnerId: 'p-prune-1',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
			{
				sessionId: 's-prune-2',
				partnerId: 'p-prune-2',
				latestVoteTs: now - NINETY_DAYS_MS - 2000,
			},
			{
				sessionId: 's-orphan',
				partnerId: 'p-orphan',
				latestVoteTs: null,
			},
		]);

		const count = await pruneInactiveSessions(storage, now);

		expect(count).toBe(3); // s-prune-1, s-prune-2, s-orphan

		const remaining = sqlite.prepare('SELECT id FROM sessions').all() as Array<{
			id: string;
		}>;
		expect(remaining.map((r) => r.id)).toEqual(['s-keep']);
	});

	it('returns the count of pruned sessions, not rows', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();

		// Two sessions, both old.
		seed(sqlite, [
			{
				sessionId: 's-a',
				partnerId: 'p-a',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
			{
				sessionId: 's-b',
				partnerId: 'p-b',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
		]);

		const count = await pruneInactiveSessions(storage, now);
		expect(count).toBe(2);
	});

	// -------------------------------------------------------------------------
	// KV session-meta cleanup
	//
	// Pruning used to delete only SQL rows, leaving session:{id}:meta in KV
	// forever. On the node target that KV table lives in the same SQLite file,
	// so the file grew without bound despite a "bounded" retention window — and
	// a pruned session still resolved its meta, rendering as an empty session
	// instead of a 404.
	// -------------------------------------------------------------------------

	it('deletes the KV meta key for every pruned session', async () => {
		const sqlite = openWithAllMigrations();
		const { storage, kvStore } = makeStorage(sqlite);
		const now = Date.now();

		seed(
			sqlite,
			[
				{
					sessionId: 's-old-1',
					partnerId: 'p-old-1',
					latestVoteTs: now - NINETY_DAYS_MS - 1000,
				},
				{
					sessionId: 's-old-2',
					partnerId: 'p-old-2',
					latestVoteTs: now - NINETY_DAYS_MS - 2000,
				},
			],
			kvStore,
		);

		await pruneInactiveSessions(storage, now);

		expect(kvStore.has(sessionMetaKey('s-old-1'))).toBe(false);
		expect(kvStore.has(sessionMetaKey('s-old-2'))).toBe(false);
	});

	it('leaves the KV meta key for sessions that are kept', async () => {
		const sqlite = openWithAllMigrations();
		const { storage, kvStore } = makeStorage(sqlite);
		const now = Date.now();

		seed(
			sqlite,
			[
				{ sessionId: 's-keep', partnerId: 'p-keep', latestVoteTs: now - 1000 },
				{
					sessionId: 's-prune',
					partnerId: 'p-prune',
					latestVoteTs: now - NINETY_DAYS_MS - 1000,
				},
			],
			kvStore,
		);

		await pruneInactiveSessions(storage, now);

		expect(kvStore.has(sessionMetaKey('s-keep'))).toBe(true);
		expect(kvStore.has(sessionMetaKey('s-prune'))).toBe(false);
	});

	it('deletes KV meta before the SQL rows', async () => {
		// Ordering is a deliberate failure-mode choice, not an accident. If KV
		// succeeds and SQL then fails, the session reads as gone and the next run
		// finishes the job. The reverse leaves a session that still renders but
		// has lost every vote, which looks like data loss rather than expiry.
		const sqlite = openWithAllMigrations();
		const { storage, kvStore, ops } = makeStorage(sqlite);
		const now = Date.now();

		seed(
			sqlite,
			[
				{
					sessionId: 's-order',
					partnerId: 'p-order',
					latestVoteTs: now - NINETY_DAYS_MS - 1000,
				},
			],
			kvStore,
		);

		await pruneInactiveSessions(storage, now);

		expect(ops[0]).toBe(`kv:${sessionMetaKey('s-order')}`);
		expect(ops).toContain('sql');
		expect(ops.indexOf('sql')).toBeGreaterThan(0);
	});

	it('does not touch KV when nothing is pruned', async () => {
		const sqlite = openWithAllMigrations();
		const { storage, kvStore, ops } = makeStorage(sqlite);
		const now = Date.now();

		seed(
			sqlite,
			[{ sessionId: 's-keep', partnerId: 'p-keep', latestVoteTs: now - 1000 }],
			kvStore,
		);

		await pruneInactiveSessions(storage, now);

		expect(ops).toEqual([]);
		expect(kvStore.has(sessionMetaKey('s-keep'))).toBe(true);
	});

	it('respects an explicit retentionMs override', async () => {
		const sqlite = openWithAllMigrations();
		const { storage } = makeStorage(sqlite);
		const now = Date.now();
		// Use a 1-day retention window.
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;

		// Session whose last vote is 2 days old — stale under 1-day retention.
		seed(sqlite, [
			{
				sessionId: 's-1day-old',
				partnerId: 'p-1day-old',
				latestVoteTs: now - ONE_DAY_MS * 2,
			},
		]);

		// Default 90-day window: session is kept.
		const countDefault = await pruneInactiveSessions(storage, now);
		expect(countDefault).toBe(0);

		// Explicit 1-day window: session is pruned.
		const countShort = await pruneInactiveSessions(storage, now, ONE_DAY_MS);
		expect(countShort).toBe(1);
	});
});
