/**
 * Integration tests for the SvelteKit handle hook.
 *
 * These tests exercise the RULES array path-matchers and the 429 response path,
 * which are not covered by the checkRateLimit unit tests in ratelimit.test.ts.
 *
 * __BRAMBLE_TARGET__ is a Vite build-time define absent from the vitest config,
 * so we stub it to 'node' here to enable the rate-limiting code path.
 */

import { describe, expect, it, vi } from 'vitest';

// Stub the build-time global before importing the hook so the module-level
// guard (`if (__BRAMBLE_TARGET__ !== 'node')`) evaluates correctly.
vi.stubGlobal('__BRAMBLE_TARGET__', 'node');

// The vitest config does not configure the SvelteKit $lib alias, so we
// redirect it to the real module via its relative path.
vi.mock('$lib/server/ratelimit.js', async () => {
	return await import('./lib/server/ratelimit.js');
});

// Import after stubbing/mocking so the module captures the stubbed values.
import { handle } from './hooks.server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal SvelteKit RequestEvent-like object suitable for the handle
 * hook. Only the fields the hook touches are provided.
 */
function makeEvent(method: string, url: string, ip = '127.0.0.1') {
	return {
		request: new Request(url, { method }),
		getClientAddress: () => ip,
	};
}

/** A resolve spy that returns a 200 response. */
function makeResolve() {
	return vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handle hook — rate limiting', () => {
	// The handle hook uses a module-level Map for state. To prevent test
	// pollution we use distinct IPs per test group so counts never overlap.
	let ipCounter = 0;
	function freshIp() {
		return `10.0.0.${++ipCounter}`;
	}

	describe('non-matching paths pass through to resolve', () => {
		it('GET / is not rate-limited and calls resolve', async () => {
			const resolve = makeResolve();
			const event = makeEvent('GET', 'http://localhost/', freshIp());
			// @ts-expect-error — partial event; hook only touches request + getClientAddress
			const response = await handle({ event, resolve });
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.status).toBe(200);
		});

		it('GET /s/abc/vote is not rate-limited (wrong method)', async () => {
			const resolve = makeResolve();
			const event = makeEvent('GET', 'http://localhost/s/abc/vote', freshIp());
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.status).toBe(200);
		});
	});

	describe('vote rule — POST /s/{id}/vote, limit 30/min', () => {
		it('matches POST /s/{id}/vote and allows requests up to the limit', async () => {
			const ip = freshIp();
			for (let i = 0; i < 30; i++) {
				const resolve = makeResolve();
				const event = makeEvent('POST', 'http://localhost/s/abc/vote', ip);
				// @ts-expect-error — partial event
				const response = await handle({ event, resolve });
				expect(resolve).toHaveBeenCalledOnce();
				expect(response.status).toBe(200);
			}
		});

		it('blocks the 31st POST /s/{id}/vote with 429 and Retry-After', async () => {
			const ip = freshIp();
			// Exhaust the 30-request limit.
			for (let i = 0; i < 30; i++) {
				const resolve = makeResolve();
				const event = makeEvent('POST', 'http://localhost/s/abc/vote', ip);
				// @ts-expect-error — partial event
				await handle({ event, resolve });
			}

			const resolve = makeResolve();
			const event = makeEvent('POST', 'http://localhost/s/abc/vote', ip);
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });

			expect(response.status).toBe(429);
			expect(resolve).not.toHaveBeenCalled();

			const retryAfter = response.headers.get('Retry-After');
			expect(retryAfter).not.toBeNull();
			// Must be a positive integer (seconds).
			expect(Number.isInteger(Number(retryAfter))).toBe(true);
			expect(Number(retryAfter)).toBeGreaterThan(0);
		});

		it('matches nested session ids (no extra slashes)', async () => {
			const resolve = makeResolve();
			// Verify a realistic slug with hyphens is matched.
			const event = makeEvent(
				'POST',
				'http://localhost/s/my-session-id/vote',
				freshIp(),
			);
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.status).toBe(200);
		});

		it('does NOT match POST /s/abc/vote/extra (extra path segment)', async () => {
			const resolve = makeResolve();
			const event = makeEvent(
				'POST',
				'http://localhost/s/abc/vote/extra',
				freshIp(),
			);
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });
			// No rule matches, so resolve is called (no limiting).
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.status).toBe(200);
		});
	});

	describe('session-create rule — POST /, limit 5/min', () => {
		it('matches POST / and allows requests up to the limit', async () => {
			const ip = freshIp();
			for (let i = 0; i < 5; i++) {
				const resolve = makeResolve();
				const event = makeEvent('POST', 'http://localhost/', ip);
				// @ts-expect-error — partial event
				const response = await handle({ event, resolve });
				expect(resolve).toHaveBeenCalledOnce();
				expect(response.status).toBe(200);
			}
		});

		it('blocks the 6th POST / with 429 and Retry-After', async () => {
			const ip = freshIp();
			// Exhaust the 5-request limit.
			for (let i = 0; i < 5; i++) {
				const resolve = makeResolve();
				const event = makeEvent('POST', 'http://localhost/', ip);
				// @ts-expect-error — partial event
				await handle({ event, resolve });
			}

			const resolve = makeResolve();
			const event = makeEvent('POST', 'http://localhost/', ip);
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });

			expect(response.status).toBe(429);
			expect(resolve).not.toHaveBeenCalled();

			const retryAfter = response.headers.get('Retry-After');
			expect(retryAfter).not.toBeNull();
			expect(Number.isInteger(Number(retryAfter))).toBe(true);
			expect(Number(retryAfter)).toBeGreaterThan(0);
		});

		it('does NOT match POST /other (different pathname)', async () => {
			const resolve = makeResolve();
			const event = makeEvent('POST', 'http://localhost/other', freshIp());
			// @ts-expect-error — partial event
			const response = await handle({ event, resolve });
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.status).toBe(200);
		});
	});

	describe('per-IP isolation', () => {
		it('limits two IPs independently on the same route', async () => {
			const ipA = freshIp();
			const ipB = freshIp();

			// Exhaust limit for ipA on POST /.
			for (let i = 0; i < 5; i++) {
				const resolve = makeResolve();
				const event = makeEvent('POST', 'http://localhost/', ipA);
				// @ts-expect-error — partial event
				await handle({ event, resolve });
			}

			// ipA should be blocked.
			const resolveA = makeResolve();
			const eventA = makeEvent('POST', 'http://localhost/', ipA);
			// @ts-expect-error — partial event
			const responseA = await handle({ event: eventA, resolve: resolveA });
			expect(responseA.status).toBe(429);
			expect(resolveA).not.toHaveBeenCalled();

			// ipB has its own fresh window; should still be allowed.
			const resolveB = makeResolve();
			const eventB = makeEvent('POST', 'http://localhost/', ipB);
			// @ts-expect-error — partial event
			const responseB = await handle({ event: eventB, resolve: resolveB });
			expect(responseB.status).toBe(200);
			expect(resolveB).toHaveBeenCalledOnce();
		});
	});
});
