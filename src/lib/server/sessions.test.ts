import { describe, expect, it } from 'vitest';
import type { VoteEntry } from './sessions.js';
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
// Helpers
// ---------------------------------------------------------------------------

function makeVote(
	name: string,
	sex: 'M' | 'F',
	vote: VoteEntry['vote'],
): VoteEntry {
	return { name, sex, vote, ts: Date.now() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessions.ts', () => {
	it('createSession returns a UUID and writes meta with partnerSlugs:[] and numeric createdAt', async () => {
		const { kv, raw } = mockKv();
		const id = await createSession(kv);

		expect(typeof id).toBe('string');
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);

		// Read back directly via the mock's get to verify the write
		const stored = await raw.get<{ partnerSlugs: string[]; createdAt: number }>(
			`session:${id}:meta`,
			'json',
		);
		expect(stored).not.toBeNull();
		expect(stored?.partnerSlugs).toEqual([]);
		expect(typeof stored?.createdAt).toBe('number');
	});

	it('addPartner is idempotent — calling twice with the same slug yields partnerSlugs.length === 1', async () => {
		const { kv, raw } = mockKv();
		const id = await createSession(kv);

		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'alex');

		const stored = await raw.get<{ partnerSlugs: string[] }>(
			`session:${id}:meta`,
			'json',
		);
		expect(stored?.partnerSlugs).toHaveLength(1);
		expect(stored?.partnerSlugs[0]).toBe('alex');
	});

	it('addPartner throws when called on a non-existent session', async () => {
		const { kv } = mockKv();
		await expect(addPartner(kv, 'no-such-session', 'alex')).rejects.toThrow(
			'Session not found: no-such-session',
		);
	});

	it('appendVotes accumulates — two calls of 2 votes each yields a 4-vote array', async () => {
		const { kv, raw } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');

		const batch1: VoteEntry[] = [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Aaliyah', 'F', 'yes'),
		];
		const batch2: VoteEntry[] = [
			makeVote('Beatrice', 'F', 'no'),
			makeVote('Bruno', 'M', 'super'),
		];

		await appendVotes(kv, id, 'alex', batch1);
		await appendVotes(kv, id, 'alex', batch2);

		const stored = await raw.get<{ votes: VoteEntry[] }>(
			`session:${id}:partner:alex`,
			'json',
		);
		expect(stored?.votes).toHaveLength(4);
	});

	it('getMatches returns the intersection of yes/super votes across partners', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'laura');

		// alex likes Aaden and Aaliyah; laura likes Aaden and Beatrice
		await appendVotes(kv, id, 'alex', [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Aaliyah', 'F', 'yes'),
		]);
		await appendVotes(kv, id, 'laura', [
			makeVote('Aaden', 'M', 'yes'),
			makeVote('Beatrice', 'F', 'yes'),
		]);

		const result = await getMatches(kv, id);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]).toEqual({
			name: 'Aaden',
			sex: 'M',
			superSlugs: [],
		});
	});

	it('getMatches treats super as yes for matching purposes', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'laura');

		await appendVotes(kv, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(kv, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(kv, id);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].name).toBe('Aaden');
	});

	it('getMatches lists the slug of a single partner who super-liked the match', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'laura');

		// alex super-likes; laura just likes
		await appendVotes(kv, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(kv, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(kv, id);
		expect(result.matches[0].superSlugs).toEqual(['alex']);
	});

	it('getMatches lists every slug when all partners super-liked the match', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'laura');

		await appendVotes(kv, id, 'alex', [makeVote('Aaden', 'M', 'super')]);
		await appendVotes(kv, id, 'laura', [makeVote('Aaden', 'M', 'super')]);

		const result = await getMatches(kv, id);
		// Sorted to keep the assertion stable regardless of partner iteration order.
		expect([...result.matches[0].superSlugs].sort()).toEqual(['alex', 'laura']);
	});

	it('getMatches returns superSlugs:[] when nobody super-liked the match', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');
		await addPartner(kv, id, 'laura');

		await appendVotes(kv, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);
		await appendVotes(kv, id, 'laura', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(kv, id);
		expect(result.matches[0].superSlugs).toEqual([]);
	});

	it('getMatches returns empty matches when there is only one partner', async () => {
		const { kv } = mockKv();
		const id = await createSession(kv);
		await addPartner(kv, id, 'alex');

		await appendVotes(kv, id, 'alex', [makeVote('Aaden', 'M', 'yes')]);

		const result = await getMatches(kv, id);
		expect(result.matches).toHaveLength(0);
	});
});
