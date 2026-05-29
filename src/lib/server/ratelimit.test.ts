/**
 * Unit tests for the in-process fixed-window rate limiter.
 *
 * Tests cover: allowing requests under the limit, blocking at the limit,
 * window expiry and reset, and per-key isolation.
 */

import { describe, expect, it } from 'vitest';
import { checkRateLimit } from './ratelimit.js';
import type { RateLimitState } from './ratelimit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(): RateLimitState {
	return new Map();
}

const LIMIT = 5;
const WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
	it('allows the first request', () => {
		const state = makeState();
		const result = checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, 0);
		expect(result.allowed).toBe(true);
		expect(result.retryAfterMs).toBe(0);
	});

	it('allows requests up to the limit', () => {
		const state = makeState();
		for (let i = 0; i < LIMIT; i++) {
			const result = checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, 0);
			expect(result.allowed).toBe(true);
		}
	});

	it('blocks the request exactly at the limit', () => {
		const state = makeState();
		// Consume all LIMIT slots.
		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, 0);
		}
		// Next request is over the limit.
		const result = checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, 0);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBeGreaterThan(0);
	});

	it('reports retryAfterMs equal to remaining window time', () => {
		const state = makeState();
		const start = 1_000_000;
		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, start);
		}
		const now = start + 10_000; // 10 s into the window
		const result = checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, now);
		expect(result.allowed).toBe(false);
		// Window resets at start + WINDOW_MS; retry after = (start + WINDOW_MS) - now
		expect(result.retryAfterMs).toBe(WINDOW_MS - 10_000);
	});

	it('resets the window after the window expires', () => {
		const state = makeState();
		const start = 0;
		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(state, 'ip1:route', LIMIT, WINDOW_MS, start);
		}
		// Advance past the window boundary.
		const afterWindow = start + WINDOW_MS + 1;
		const result = checkRateLimit(
			state,
			'ip1:route',
			LIMIT,
			WINDOW_MS,
			afterWindow,
		);
		expect(result.allowed).toBe(true);
	});

	it('tracks different keys independently', () => {
		const state = makeState();
		// Exhaust limit for key A.
		for (let i = 0; i < LIMIT; i++) {
			checkRateLimit(state, 'keyA', LIMIT, WINDOW_MS, 0);
		}
		const resultA = checkRateLimit(state, 'keyA', LIMIT, WINDOW_MS, 0);
		const resultB = checkRateLimit(state, 'keyB', LIMIT, WINDOW_MS, 0);

		expect(resultA.allowed).toBe(false);
		expect(resultB.allowed).toBe(true);
	});

	it('lazy-evicts expired windows on access', () => {
		const state = makeState();
		// Populate state for a key.
		checkRateLimit(state, 'evict-me', LIMIT, WINDOW_MS, 0);
		expect(state.has('evict-me')).toBe(true);

		// Access after the window expires: the old entry should be replaced,
		// not kept, and the request should be allowed.
		const afterWindow = WINDOW_MS + 1;
		const result = checkRateLimit(
			state,
			'evict-me',
			LIMIT,
			WINDOW_MS,
			afterWindow,
		);
		expect(result.allowed).toBe(true);
	});
});
