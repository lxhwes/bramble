import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { pruneInactiveSessions } from '../prune.js';
import {
	addPartner,
	appendVotes,
	createSession,
	getMatches,
	getVotes,
} from '../sessions.js';
import { runMigrations } from './migrate.js';
import { makeSqliteAdapter, makeSqliteKV } from './node.js';
import type { Storage } from './types.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../migrations');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function openStorage(): { storage: Storage; raw: Database.Database } {
	const raw = new Database(':memory:');
	raw.pragma('foreign_keys = ON');
	runMigrations(raw, MIGRATIONS_DIR);
	const db = makeSqliteAdapter(raw);
	const kv = makeSqliteKV(raw);
	return { storage: { db, kv }, raw };
}

// ---------------------------------------------------------------------------
// BrambleKV — get / put / delete
// ---------------------------------------------------------------------------

describe('makeSqliteKV', () => {
	it('returns null for a missing key', async () => {
		const { storage } = openStorage();
		const result = await storage.kv.get('no-such-key', 'json');
		expect(result).toBeNull();
	});

	it('put then get round-trips a JSON value', async () => {
		const { storage } = openStorage();
		await storage.kv.put('foo', JSON.stringify({ hello: 'world' }));
		const result = await storage.kv.get<{ hello: string }>('foo', 'json');
		expect(result).toEqual({ hello: 'world' });
	});

	it('put overwrites an existing key (upsert)', async () => {
		const { storage } = openStorage();
		await storage.kv.put('k', JSON.stringify(1));
		await storage.kv.put('k', JSON.stringify(2));
		const result = await storage.kv.get<number>('k', 'json');
		expect(result).toBe(2);
	});

	it('delete removes the key', async () => {
		const { storage } = openStorage();
		await storage.kv.put('del-me', JSON.stringify('value'));
		await storage.kv.delete('del-me');
		const result = await storage.kv.get('del-me', 'json');
		expect(result).toBeNull();
	});

	it('delete is a no-op when the key does not exist', async () => {
		const { storage } = openStorage();
		await expect(storage.kv.delete('ghost')).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// BrambleDB — end-to-end session operations
// ---------------------------------------------------------------------------

describe('makeSqliteAdapter + sessions.ts — end-to-end', () => {
	it('createSession creates a session row and returns a UUID', async () => {
		const { storage, raw } = openStorage();
		const id = await createSession(storage);

		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		const row = raw.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
		expect(row).toBeDefined();
	});

	it('two-partner mutual match is found via the Node adapter', async () => {
		const { storage } = openStorage();
		const id = await createSession(storage);
		await addPartner(storage, id, 'alex');
		await addPartner(storage, id, 'laura');

		const ts = Date.now();
		await appendVotes(storage, id, 'alex', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts },
			{ name: 'Beatrice', sex: 'F', vote: 'yes', ts: ts + 1 },
		]);
		await appendVotes(storage, id, 'laura', [
			{ name: 'Aaden', sex: 'M', vote: 'yes', ts: ts + 2 },
			{ name: 'Charlie', sex: 'M', vote: 'yes', ts: ts + 3 },
		]);

		const result = await getMatches(storage, id);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].name).toBe('Aaden');
	});

	it('getVotes reads from DB and returns correct vote list', async () => {
		const { storage } = openStorage();
		const id = await createSession(storage);
		await addPartner(storage, id, 'alex');

		const ts = Date.now();
		await appendVotes(storage, id, 'alex', [
			{ name: 'Ava', sex: 'F', vote: 'super', ts },
		]);

		const pv = await getVotes(storage, id, 'alex');
		expect(pv).not.toBeNull();
		expect(pv?.votes).toHaveLength(1);
		expect(pv?.votes[0]).toMatchObject({
			name: 'Ava',
			sex: 'F',
			vote: 'super',
		});
	});
});

// ---------------------------------------------------------------------------
// FK cascade — deleting a session deletes partners + votes
// ---------------------------------------------------------------------------

describe('foreign key cascade with Node adapter', () => {
	it('deleting a session cascades to partners and votes', async () => {
		const { storage, raw } = openStorage();
		const id = await createSession(storage);
		await addPartner(storage, id, 'alex');
		await appendVotes(storage, id, 'alex', [
			{ name: 'Ava', sex: 'F', vote: 'yes', ts: Date.now() },
		]);

		// Confirm rows exist before delete.
		const partnersBefore = raw
			.prepare('SELECT id FROM partners WHERE session_id = ?')
			.all(id);
		expect(partnersBefore).toHaveLength(1);

		const partnerRow = partnersBefore[0] as { id: string };
		const votesBefore = raw
			.prepare('SELECT id FROM votes WHERE partner_id = ?')
			.all(partnerRow.id);
		expect(votesBefore).toHaveLength(1);

		// Delete the session directly (bypasses prune, simpler assertion).
		raw.prepare('DELETE FROM sessions WHERE id = ?').run(id);

		// FK cascade: partners and votes must be gone.
		const partnersAfter = raw
			.prepare('SELECT id FROM partners WHERE session_id = ?')
			.all(id);
		expect(partnersAfter).toHaveLength(0);

		const votesAfter = raw
			.prepare('SELECT id FROM votes WHERE partner_id = ?')
			.all(partnerRow.id);
		expect(votesAfter).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// pruneInactiveSessions via Node adapter
// ---------------------------------------------------------------------------

describe('pruneInactiveSessions with Node adapter', () => {
	const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

	it('prunes a stale session via the Node adapter', async () => {
		const { storage, raw } = openStorage();
		const id = await createSession(storage);
		await addPartner(storage, id, 'alice');

		// Insert a vote older than 90 days directly.
		const partnerRow = raw
			.prepare('SELECT id FROM partners WHERE session_id = ?')
			.get(id) as { id: string };
		raw
			.prepare(
				'INSERT INTO votes (id, partner_id, name, sex, vote, ts) VALUES (?, ?, ?, ?, ?, ?)',
			)
			.run(
				'v-old',
				partnerRow.id,
				'Ava',
				'F',
				'yes',
				Date.now() - NINETY_DAYS_MS - 1000,
			);

		const count = await pruneInactiveSessions(storage, Date.now());
		expect(count).toBe(1);

		const row = raw.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
		expect(row).toBeUndefined();
	});
});
