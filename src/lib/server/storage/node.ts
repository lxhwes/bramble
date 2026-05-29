/**
 * Node SQLite backend for the Bramble storage layer.
 *
 * Exports:
 *   makeSqliteAdapter(sqlite) — wraps better-sqlite3 as BrambleDB
 *   makeSqliteKV(sqlite)      — KV store backed by the `kv` table
 *   getNodeStorage()          — singleton: opens/migrates the DB, returns Storage
 *
 * This module is Node-only. It is never imported on the Cloudflare build
 * because the factory (index.ts) gates the import behind a build-time constant
 * (__BRAMBLE_TARGET__ === 'node'). On a Cloudflare build that constant is
 * 'cloudflare', so the import is dead code and esbuild eliminates it.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import type {
	BrambleDB,
	BrambleKV,
	BrambleStatement,
	Storage,
} from './types.js';

// ---------------------------------------------------------------------------
// BrambleDB — wraps better-sqlite3
// ---------------------------------------------------------------------------

/**
 * Wraps a better-sqlite3 Database instance as a BrambleDB.
 *
 * Prepared statements are cached by SQL text to avoid repeated parsing.
 */
export function makeSqliteAdapter(sqlite: Database.Database): BrambleDB {
	const cache = new Map<string, Database.Statement>();

	function getStmt(sql: string): Database.Statement {
		let stmt = cache.get(sql);
		if (stmt === undefined) {
			stmt = sqlite.prepare(sql);
			cache.set(sql, stmt);
		}
		return stmt;
	}

	return {
		prepare(sql: string): BrambleStatement {
			let boundValues: unknown[] = [];

			const stmt: BrambleStatement = {
				bind(...values: unknown[]): BrambleStatement {
					boundValues = values;
					return stmt;
				},
				async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
					const results = getStmt(sql).all(...boundValues) as T[];
					return { results };
				},
				async first<T = Record<string, unknown>>(): Promise<T | null> {
					const row = getStmt(sql).get(...boundValues) as T | undefined;
					return row ?? null;
				},
				async run(): Promise<{ meta: { changes: number } }> {
					const info = getStmt(sql).run(...boundValues);
					return { meta: { changes: info.changes } };
				},
			};
			return stmt;
		},
	};
}

// ---------------------------------------------------------------------------
// BrambleKV — backed by the `kv` table
// ---------------------------------------------------------------------------

/**
 * Wraps a better-sqlite3 Database as a BrambleKV, storing values in the `kv`
 * table (created by migration 0003_kv.sql).
 */
export function makeSqliteKV(sqlite: Database.Database): BrambleKV {
	return {
		async get<T>(key: string, _type: 'json'): Promise<T | null> {
			const row = sqlite
				.prepare('SELECT value FROM kv WHERE key = ?')
				.get(key) as { value: string } | undefined;
			if (row === undefined) return null;
			return JSON.parse(row.value) as T;
		},
		async put(key: string, value: string): Promise<void> {
			sqlite
				.prepare(
					'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
				)
				.run(key, value, Date.now());
		},
		async delete(key: string): Promise<void> {
			sqlite.prepare('DELETE FROM kv WHERE key = ?').run(key);
		},
	};
}

// ---------------------------------------------------------------------------
// Singleton — getNodeStorage
// ---------------------------------------------------------------------------

let _nodeStorage: Storage | null = null;

/**
 * Returns the singleton Node Storage, lazily opening and migrating the SQLite
 * database on first call.
 *
 * Database path: `BRAMBLE_DB_PATH` env var, defaulting to `./data/bramble.sqlite`.
 * Ensures the parent directory exists before opening.
 */
export function getNodeStorage(): Storage {
	if (_nodeStorage !== null) return _nodeStorage;

	const dbPath = process.env.BRAMBLE_DB_PATH ?? './data/bramble.sqlite';
	const dir = dirname(dbPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');

	const migrationsDir = join(import.meta.dirname, '../../../../migrations');
	runMigrations(sqlite, migrationsDir);

	_nodeStorage = {
		db: makeSqliteAdapter(sqlite),
		kv: makeSqliteKV(sqlite),
	};
	return _nodeStorage;
}
