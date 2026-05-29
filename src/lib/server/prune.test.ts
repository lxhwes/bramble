import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { pruneInactiveSessions } from './prune.js';
import type { BrambleDB } from './storage/types.js';

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

function makeD1Shim(sqlite: Database.Database): BrambleDB {
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
// Helpers: insert rows into the in-memory DB
// ---------------------------------------------------------------------------

interface SeedRow {
	sessionId: string;
	partnerId: string;
	latestVoteTs: number | null; // null → no votes for this session
}

function seed(sqlite: Database.Database, rows: SeedRow[]): void {
	for (const { sessionId, partnerId, latestVoteTs } of rows) {
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
		const db = makeD1Shim(sqlite);
		const count = await pruneInactiveSessions(db, Date.now());
		expect(count).toBe(0);
	});

	it('does not prune a session whose last vote is within 90 days', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-recent',
				partnerId: 'p-recent',
				latestVoteTs: now - NINETY_DAYS_MS + 1000, // just inside window
			},
		]);

		const count = await pruneInactiveSessions(db, now);

		expect(count).toBe(0);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-recent');
		expect(session).toBeDefined();
	});

	it('prunes a session whose last vote is older than 90 days', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-old',
				partnerId: 'p-old',
				latestVoteTs: now - NINETY_DAYS_MS - 1000, // just outside window
			},
		]);

		const count = await pruneInactiveSessions(db, now);

		expect(count).toBe(1);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-old');
		expect(session).toBeUndefined();
	});

	it('cascades deletion to partners and votes', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
		const now = Date.now();

		seed(sqlite, [
			{
				sessionId: 's-cascade',
				partnerId: 'p-cascade',
				latestVoteTs: now - NINETY_DAYS_MS - 1000,
			},
		]);

		await pruneInactiveSessions(db, now);

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
		const db = makeD1Shim(sqlite);
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

		await pruneInactiveSessions(db, now);

		const shortlist = sqlite
			.prepare('SELECT id FROM shortlists WHERE session_id = ?')
			.all('s-shortlist');
		expect(shortlist).toHaveLength(0);
	});

	it('prunes orphan sessions (no votes at all)', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
		const now = Date.now();

		// Session created long ago with no votes.
		seed(sqlite, [
			{ sessionId: 's-orphan', partnerId: 'p-orphan', latestVoteTs: null },
		]);

		const count = await pruneInactiveSessions(db, now);

		expect(count).toBe(1);
		const session = sqlite
			.prepare('SELECT id FROM sessions WHERE id = ?')
			.get('s-orphan');
		expect(session).toBeUndefined();
	});

	it('keeps recent sessions while pruning old ones in the same database', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
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

		const count = await pruneInactiveSessions(db, now);

		expect(count).toBe(3); // s-prune-1, s-prune-2, s-orphan

		const remaining = sqlite.prepare('SELECT id FROM sessions').all() as Array<{
			id: string;
		}>;
		expect(remaining.map((r) => r.id)).toEqual(['s-keep']);
	});

	it('returns the count of pruned sessions, not rows', async () => {
		const sqlite = openWithAllMigrations();
		const db = makeD1Shim(sqlite);
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

		const count = await pruneInactiveSessions(db, now);
		expect(count).toBe(2);
	});
});
