import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { checkStorage } from './health.js';
import { runMigrations } from './storage/migrate.js';
import { makeSqliteAdapter, makeSqliteKV } from './storage/node.js';
import type { Storage } from './storage/types.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fully migrated in-memory database — the healthy case. */
function openStorage(): Storage {
	const raw = new Database(':memory:');
	raw.pragma('foreign_keys = ON');
	runMigrations(raw, MIGRATIONS_DIR);
	return { db: makeSqliteAdapter(raw), kv: makeSqliteKV(raw) };
}

/** An open database with no schema — mirrors a failed or skipped migration. */
function openUnmigratedStorage(): Storage {
	const raw = new Database(':memory:');
	return { db: makeSqliteAdapter(raw), kv: makeSqliteKV(raw) };
}

/** Every query rejects — mirrors a corrupt file or an unreadable volume. */
function brokenStorage(): Storage {
	const db = {
		prepare: () => ({
			bind: () => ({
				all: () =>
					Promise.reject(new Error('database disk image is malformed')),
				first: () =>
					Promise.reject(new Error('database disk image is malformed')),
				run: () =>
					Promise.reject(new Error('database disk image is malformed')),
			}),
		}),
	} as unknown as Storage['db'];
	return { db, kv: {} as Storage['kv'] };
}

// ---------------------------------------------------------------------------
// checkStorage
// ---------------------------------------------------------------------------

describe('checkStorage', () => {
	it('reports healthy against a migrated database', async () => {
		const result = await checkStorage(openStorage());
		expect(result.ok).toBe(true);
	});

	it('reports healthy when the database is migrated but empty', async () => {
		// No sessions exist yet on a fresh install. That is not a failure.
		const result = await checkStorage(openStorage());
		expect(result.ok).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it('reports unhealthy when the schema is missing', async () => {
		const result = await checkStorage(openUnmigratedStorage());
		expect(result.ok).toBe(false);
	});

	it('reports unhealthy when queries fail', async () => {
		const result = await checkStorage(brokenStorage());
		expect(result.ok).toBe(false);
	});

	it('includes the failure reason when unhealthy', async () => {
		const result = await checkStorage(brokenStorage());
		expect(result.error).toContain('malformed');
	});

	it('does not throw on failure — it returns a result', async () => {
		await expect(checkStorage(brokenStorage())).resolves.toBeDefined();
	});
});
