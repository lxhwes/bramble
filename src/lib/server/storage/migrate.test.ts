import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../migrations');

describe('runMigrations', () => {
	it('applies all migration files to a fresh database', () => {
		const sqlite = new Database(':memory:');
		runMigrations(sqlite, MIGRATIONS_DIR);

		const tables = (
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
				)
				.all() as Array<{ name: string }>
		).map((r) => r.name);

		expect(tables).toContain('sessions');
		expect(tables).toContain('partners');
		expect(tables).toContain('votes');
		expect(tables).toContain('shortlists');
		expect(tables).toContain('kv');
	});

	it('records applied migrations in _migrations table', () => {
		const sqlite = new Database(':memory:');
		runMigrations(sqlite, MIGRATIONS_DIR);

		const rows = sqlite
			.prepare('SELECT name FROM _migrations ORDER BY name')
			.all() as Array<{ name: string }>;

		expect(rows.map((r) => r.name)).toEqual([
			'0001_init.sql',
			'0002_shortlist.sql',
			'0003_kv.sql',
		]);
	});

	it('is idempotent — second run is a no-op and does not throw', () => {
		const sqlite = new Database(':memory:');
		runMigrations(sqlite, MIGRATIONS_DIR);
		expect(() => runMigrations(sqlite, MIGRATIONS_DIR)).not.toThrow();
	});

	it('does not re-apply already-applied migrations on a second run', () => {
		const sqlite = new Database(':memory:');
		runMigrations(sqlite, MIGRATIONS_DIR);
		const countBefore = (
			sqlite
				.prepare('SELECT COUNT(*) as n FROM _migrations')
				.get() as { n: number }
		).n;

		runMigrations(sqlite, MIGRATIONS_DIR);
		const countAfter = (
			sqlite
				.prepare('SELECT COUNT(*) as n FROM _migrations')
				.get() as { n: number }
		).n;

		expect(countAfter).toBe(countBefore);
	});
});
