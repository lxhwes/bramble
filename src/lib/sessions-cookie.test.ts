import { describe, expect, it } from 'vitest';
import {
	MAX_SESSIONS,
	parseSessionsCookie,
	readLegacyCookie,
	type SessionEntry,
	serializeSessionsCookie,
	upsertSession,
} from './sessions-cookie.js';

// ---------------------------------------------------------------------------
// parseSessionsCookie
// ---------------------------------------------------------------------------

describe('parseSessionsCookie', () => {
	it('returns [] for undefined input', () => {
		expect(parseSessionsCookie(undefined)).toEqual([]);
	});

	it('returns [] for empty string', () => {
		expect(parseSessionsCookie('')).toEqual([]);
	});

	it('returns [] for malformed JSON', () => {
		expect(parseSessionsCookie('not json{')).toEqual([]);
	});

	it('returns [] when JSON is not an array', () => {
		expect(parseSessionsCookie('{"sessionId":"abc"}')).toEqual([]);
	});

	it('drops entries missing sessionId', () => {
		const raw = JSON.stringify([
			{ sessionId: 'a', slug: 'alice', lastSeen: 1 },
			{ slug: 'orphan', lastSeen: 2 },
		]);
		expect(parseSessionsCookie(raw)).toEqual([
			{ sessionId: 'a', slug: 'alice', lastSeen: 1 },
		]);
	});

	it('tolerates missing slug field (legacy / unclaimed entries)', () => {
		const raw = JSON.stringify([{ sessionId: 'a', lastSeen: 1 }]);
		expect(parseSessionsCookie(raw)).toEqual([
			{ sessionId: 'a', slug: null, lastSeen: 1 },
		]);
	});

	it('coerces non-number lastSeen to 0', () => {
		const raw = JSON.stringify([
			{ sessionId: 'a', slug: 'alice', lastSeen: 'notanumber' },
		]);
		expect(parseSessionsCookie(raw)).toEqual([
			{ sessionId: 'a', slug: 'alice', lastSeen: 0 },
		]);
	});
});

// ---------------------------------------------------------------------------
// serializeSessionsCookie
// ---------------------------------------------------------------------------

describe('serializeSessionsCookie', () => {
	it('round-trips through parseSessionsCookie', () => {
		const entries: SessionEntry[] = [
			{ sessionId: 'a', slug: 'alice', lastSeen: 1 },
			{ sessionId: 'b', slug: null, lastSeen: 2 },
		];
		expect(parseSessionsCookie(serializeSessionsCookie(entries))).toEqual(
			entries,
		);
	});
});

// ---------------------------------------------------------------------------
// upsertSession
// ---------------------------------------------------------------------------

describe('upsertSession', () => {
	it('inserts a new entry at the front', () => {
		const result = upsertSession([], 'a', 'alice', 100);
		expect(result).toEqual([{ sessionId: 'a', slug: 'alice', lastSeen: 100 }]);
	});

	it('moves an existing entry to the front and updates lastSeen', () => {
		const before: SessionEntry[] = [
			{ sessionId: 'a', slug: 'alice', lastSeen: 1 },
			{ sessionId: 'b', slug: 'bob', lastSeen: 2 },
		];
		const after = upsertSession(before, 'a', 'alice', 99);
		expect(after).toEqual([
			{ sessionId: 'a', slug: 'alice', lastSeen: 99 },
			{ sessionId: 'b', slug: 'bob', lastSeen: 2 },
		]);
	});

	it('updates the slug when an entry is upserted with a new slug', () => {
		const before: SessionEntry[] = [
			{ sessionId: 'a', slug: null, lastSeen: 1 },
		];
		const after = upsertSession(before, 'a', 'alice', 99);
		expect(after).toEqual([{ sessionId: 'a', slug: 'alice', lastSeen: 99 }]);
	});

	it('preserves an existing slug when upserting without one', () => {
		const before: SessionEntry[] = [
			{ sessionId: 'a', slug: 'alice', lastSeen: 1 },
		];
		const after = upsertSession(before, 'a', null, 99);
		expect(after).toEqual([{ sessionId: 'a', slug: 'alice', lastSeen: 99 }]);
	});

	it(`caps at MAX_SESSIONS (${MAX_SESSIONS}) and evicts the oldest`, () => {
		// Build MAX_SESSIONS entries with increasing lastSeen, oldest at the tail.
		const before: SessionEntry[] = Array.from(
			{ length: MAX_SESSIONS },
			(_, i) => ({
				sessionId: `s${i}`,
				slug: `slug${i}`,
				lastSeen: MAX_SESSIONS - i, // s0 newest, s{MAX-1} oldest
			}),
		);
		const after = upsertSession(before, 'new', 'newslug', 999);
		expect(after).toHaveLength(MAX_SESSIONS);
		expect(after[0]).toEqual({
			sessionId: 'new',
			slug: 'newslug',
			lastSeen: 999,
		});
		// The oldest entry (s{MAX-1}) should be gone.
		expect(
			after.find((e) => e.sessionId === `s${MAX_SESSIONS - 1}`),
		).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// readLegacyCookie
// ---------------------------------------------------------------------------

describe('readLegacyCookie', () => {
	it('returns null for undefined', () => {
		expect(readLegacyCookie(undefined)).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(readLegacyCookie('')).toBeNull();
	});

	it('returns the sessionId for a valid legacy value', () => {
		expect(readLegacyCookie('abc123')).toBe('abc123');
	});
});
