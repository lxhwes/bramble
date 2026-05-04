import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { addToShortlist, getShortlist, removeFromShortlist } from './db';

// ---------------------------------------------------------------------------
// Schema fixture
// ---------------------------------------------------------------------------

/**
 * Opens an in-memory SQLite database and applies a migration file by path.
 */
function applyMigration(db: Database.Database, filename: string): void {
	const migrationPath = join(
		import.meta.dirname,
		'../../../migrations',
		filename,
	);
	const sql = readFileSync(migrationPath, 'utf8');
	db.exec(sql);
}

/**
 * Opens an in-memory SQLite database and applies the initial migration.
 * Returns the database handle for introspection.
 */
function openWithSchema(): Database.Database {
	const db = new Database(':memory:');
	applyMigration(db, '0001_init.sql');
	return db;
}

/**
 * Opens an in-memory SQLite database with both migrations applied.
 */
function openWithAllMigrations(): Database.Database {
	const db = new Database(':memory:');
	applyMigration(db, '0001_init.sql');
	applyMigration(db, '0002_shortlist.sql');
	return db;
}

// ---------------------------------------------------------------------------
// D1 shim
//
// Wraps a better-sqlite3 Database in an async interface compatible with D1Database.
// Used only in tests — never imported by production code.
// ---------------------------------------------------------------------------

type D1Row = Record<string, unknown>;

interface ShimStatement {
	bind(...values: unknown[]): ShimStatement;
	all<T = D1Row>(): Promise<{ results: T[] }>;
	run(): Promise<{ meta: { changes: number } }>;
	first<T = D1Row>(): Promise<T | null>;
}

interface ShimDatabase {
	prepare(query: string): ShimStatement;
}

function makeD1Shim(sqlite: Database.Database): ShimDatabase {
	return {
		prepare(query: string): ShimStatement {
			let boundValues: unknown[] = [];
			const stmt: ShimStatement = {
				bind(...values: unknown[]): ShimStatement {
					boundValues = values;
					return stmt;
				},
				async all<T = D1Row>(): Promise<{ results: T[] }> {
					const results = sqlite.prepare(query).all(...boundValues) as T[];
					return { results };
				},
				async run(): Promise<{ meta: { changes: number } }> {
					const info = sqlite.prepare(query).run(...boundValues);
					return { meta: { changes: info.changes } };
				},
				async first<T = D1Row>(): Promise<T | null> {
					const row = sqlite.prepare(query).get(...boundValues) as
						| T
						| undefined;
					return row ?? null;
				},
			};
			return stmt;
		},
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the list of table names present in the database. */
function tableNames(db: Database.Database): string[] {
	const rows = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		)
		.all() as Array<{ name: string }>;
	return rows.map((r) => r.name);
}

/** Returns the column names for a given table. */
function columnNames(db: Database.Database, table: string): string[] {
	const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
	return rows.map((r) => r.name);
}

/** Returns the index names for a given table. */
function indexNames(db: Database.Database, table: string): string[] {
	const rows = db.pragma(`index_list(${table})`) as Array<{ name: string }>;
	return rows.map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrations/0001_init.sql', () => {
	it('applies without error on a fresh in-memory SQLite database', () => {
		expect(() => openWithSchema()).not.toThrow();
	});

	it('creates exactly the expected set of tables', () => {
		const db = openWithSchema();
		expect(tableNames(db).sort()).toEqual([
			'name_meta',
			'partners',
			'sessions',
			'users',
			'votes',
		]);
	});

	it('users table has id, email, created_at columns', () => {
		const db = openWithSchema();
		const cols = columnNames(db, 'users');
		expect(cols).toContain('id');
		expect(cols).toContain('email');
		expect(cols).toContain('created_at');
	});

	it('sessions table has id, user_id, created_at columns', () => {
		const db = openWithSchema();
		const cols = columnNames(db, 'sessions');
		expect(cols).toContain('id');
		expect(cols).toContain('user_id');
		expect(cols).toContain('created_at');
	});

	it('partners table has id, session_id, slug, created_at columns', () => {
		const db = openWithSchema();
		const cols = columnNames(db, 'partners');
		expect(cols).toContain('id');
		expect(cols).toContain('session_id');
		expect(cols).toContain('slug');
		expect(cols).toContain('created_at');
	});

	it('votes table has id, partner_id, name, sex, vote, ts columns', () => {
		const db = openWithSchema();
		const cols = columnNames(db, 'votes');
		expect(cols).toContain('id');
		expect(cols).toContain('partner_id');
		expect(cols).toContain('name');
		expect(cols).toContain('sex');
		expect(cols).toContain('vote');
		expect(cols).toContain('ts');
	});

	it('name_meta table has name, sex, peak_year, total columns', () => {
		const db = openWithSchema();
		const cols = columnNames(db, 'name_meta');
		expect(cols).toContain('name');
		expect(cols).toContain('sex');
		expect(cols).toContain('peak_year');
		expect(cols).toContain('total');
	});

	it('votes table has an index on partner_id', () => {
		const db = openWithSchema();
		const indexes = indexNames(db, 'votes');
		const hasPartnerIdx = indexes.some((n) => n.includes('partner'));
		expect(hasPartnerIdx).toBe(true);
	});

	it('partners table has an index on session_id', () => {
		const db = openWithSchema();
		const indexes = indexNames(db, 'partners');
		const hasSessionIdx = indexes.some((n) => n.includes('session'));
		expect(hasSessionIdx).toBe(true);
	});

	it('can insert and retrieve a user row', () => {
		const db = openWithSchema();
		db.prepare(
			'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
		).run('u1', 'alice@example.com', Date.now());
		const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as
			| { id: string; email: string }
			| undefined;
		expect(row?.email).toBe('alice@example.com');
	});

	it('can insert a session linked to a user', () => {
		const db = openWithSchema();
		db.prepare(
			'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
		).run('u1', 'bob@example.com', Date.now());
		db.prepare(
			'INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)',
		).run('s1', 'u1', Date.now());
		const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('s1') as
			| { id: string; user_id: string }
			| undefined;
		expect(row?.user_id).toBe('u1');
	});

	it('can insert a vote linked to a partner', () => {
		const db = openWithSchema();
		db.prepare(
			'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
		).run('u1', 'carol@example.com', Date.now());
		db.prepare(
			'INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)',
		).run('s1', 'u1', Date.now());
		db.prepare(
			'INSERT INTO partners (id, session_id, slug, created_at) VALUES (?, ?, ?, ?)',
		).run('p1', 's1', 'carol', Date.now());
		db.prepare(
			'INSERT INTO votes (id, partner_id, name, sex, vote, ts) VALUES (?, ?, ?, ?, ?, ?)',
		).run('v1', 'p1', 'Ava', 'F', 'yes', Date.now());
		const row = db
			.prepare('SELECT * FROM votes WHERE partner_id = ?')
			.get('p1') as { name: string; vote: string } | undefined;
		expect(row?.name).toBe('Ava');
		expect(row?.vote).toBe('yes');
	});

	it('sessions.user_id allows NULL for anonymous sessions', () => {
		const db = openWithSchema();
		// No foreign-key violation expected — anonymous sessions have no user.
		expect(() => {
			db.prepare(
				'INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)',
			).run('s-anon', null, Date.now());
		}).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// migrations/0002_shortlist.sql
// ---------------------------------------------------------------------------

describe('migrations/0002_shortlist.sql', () => {
	it('applies cleanly on top of 0001_init.sql', () => {
		expect(() => openWithAllMigrations()).not.toThrow();
	});

	it('creates the shortlists table with expected columns', () => {
		const db = openWithAllMigrations();
		const cols = columnNames(db, 'shortlists');
		expect(cols).toContain('id');
		expect(cols).toContain('session_id');
		expect(cols).toContain('name');
		expect(cols).toContain('sex');
		expect(cols).toContain('created_at');
	});

	it('shortlists table has an index on session_id', () => {
		const db = openWithAllMigrations();
		const indexes = indexNames(db, 'shortlists');
		const hasSessionIdx = indexes.some((n) => n.includes('session'));
		expect(hasSessionIdx).toBe(true);
	});

	it('enforces UNIQUE(session_id, name, sex)', () => {
		const db = openWithAllMigrations();
		const now = Date.now();
		db.prepare(
			'INSERT INTO shortlists (session_id, name, sex, created_at) VALUES (?, ?, ?, ?)',
		).run('sess1', 'Ava', 'F', now);
		expect(() => {
			db.prepare(
				'INSERT INTO shortlists (session_id, name, sex, created_at) VALUES (?, ?, ?, ?)',
			).run('sess1', 'Ava', 'F', now);
		}).toThrow();
	});

	it('rejects invalid sex values', () => {
		const db = openWithAllMigrations();
		expect(() => {
			db.prepare(
				'INSERT INTO shortlists (session_id, name, sex, created_at) VALUES (?, ?, ?, ?)',
			).run('sess1', 'Ava', 'X', Date.now());
		}).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Shortlist helpers: addToShortlist / removeFromShortlist / getShortlist
// ---------------------------------------------------------------------------

describe('shortlist helpers', () => {
	function makeDb(): ShimDatabase {
		return makeD1Shim(openWithAllMigrations());
	}

	it('getShortlist returns empty array for a new session', async () => {
		const db = makeDb();
		const result = await getShortlist(db as unknown as D1Database, 'sess-new');
		expect(result).toEqual([]);
	});

	it('addToShortlist inserts a row and getShortlist returns it', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		const result = await getShortlist(db as unknown as D1Database, 'sess1');
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Ava');
		expect(result[0].sex).toBe('F');
		expect(result[0].session_id).toBe('sess1');
	});

	it('addToShortlist is idempotent (INSERT OR IGNORE)', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		const result = await getShortlist(db as unknown as D1Database, 'sess1');
		expect(result).toHaveLength(1);
	});

	it('addToShortlist distinguishes sex (M vs F)', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Avery', 'F');
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Avery', 'M');
		const result = await getShortlist(db as unknown as D1Database, 'sess1');
		expect(result).toHaveLength(2);
	});

	it('removeFromShortlist deletes the row', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		await removeFromShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		const result = await getShortlist(db as unknown as D1Database, 'sess1');
		expect(result).toEqual([]);
	});

	it('removeFromShortlist is a no-op when row does not exist', async () => {
		const db = makeDb();
		// Should not throw.
		await expect(
			removeFromShortlist(db as unknown as D1Database, 'sess1', 'Ghost', 'M'),
		).resolves.toBeUndefined();
	});

	it('round-trip: add → get → remove → get empty', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Leo', 'M');

		const after_add = await getShortlist(db as unknown as D1Database, 'sess1');
		expect(after_add).toHaveLength(2);

		await removeFromShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		const after_remove = await getShortlist(
			db as unknown as D1Database,
			'sess1',
		);
		expect(after_remove).toHaveLength(1);
		expect(after_remove[0].name).toBe('Leo');

		await removeFromShortlist(db as unknown as D1Database, 'sess1', 'Leo', 'M');
		const after_empty = await getShortlist(
			db as unknown as D1Database,
			'sess1',
		);
		expect(after_empty).toEqual([]);
	});

	it('getShortlist is scoped to the session (does not cross-contaminate)', async () => {
		const db = makeDb();
		await addToShortlist(db as unknown as D1Database, 'sess1', 'Ava', 'F');
		await addToShortlist(db as unknown as D1Database, 'sess2', 'Leo', 'M');

		const sess1 = await getShortlist(db as unknown as D1Database, 'sess1');
		const sess2 = await getShortlist(db as unknown as D1Database, 'sess2');

		expect(sess1.map((r) => r.name)).toEqual(['Ava']);
		expect(sess2.map((r) => r.name)).toEqual(['Leo']);
	});
});
