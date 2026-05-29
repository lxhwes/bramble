/**
 * Minimal SQL migration runner for the Node SQLite backend.
 *
 * Reads *.sql files from `migrationsDir` in sorted order, skips already-applied
 * migrations (tracked in `_migrations`), and executes each inside a transaction.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

/**
 * Applies any unapplied SQL migrations in `migrationsDir` to `sqlite`.
 *
 * Creates a `_migrations(name TEXT PRIMARY KEY, applied_at INTEGER)` table on
 * first run. Migrations are applied in filename sort order; already-applied
 * filenames are skipped.
 */
export function runMigrations(sqlite: Database.Database, migrationsDir: string): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			name       TEXT    PRIMARY KEY,
			applied_at INTEGER NOT NULL
		)
	`);

	const applied = new Set(
		(sqlite.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>).map(
			(r) => r.name,
		),
	);

	const files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.sort();

	for (const file of files) {
		if (applied.has(file)) continue;

		const sql = readFileSync(join(migrationsDir, file), 'utf8');
		sqlite.transaction(() => {
			sqlite.exec(sql);
			sqlite
				.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
				.run(file, Date.now());
		})();
	}
}
