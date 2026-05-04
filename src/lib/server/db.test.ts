import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Schema fixture
// ---------------------------------------------------------------------------

/**
 * Opens an in-memory SQLite database and applies the initial migration.
 * Returns the database handle for introspection.
 */
function openWithSchema(): Database.Database {
	const migrationPath = join(
		import.meta.dirname,
		'../../../migrations/0001_init.sql',
	);
	const sql = readFileSync(migrationPath, 'utf8');
	const db = new Database(':memory:');
	// Execute as a batch — better-sqlite3 exec() handles multi-statement scripts.
	db.exec(sql);
	return db;
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
