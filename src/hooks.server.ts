/**
 * SvelteKit server hooks.
 *
 * On the Node target: applies an in-process fixed-window rate limiter that
 * mirrors the Cloudflare WAF rules (see docs/ARCHITECTURE.md § Rate limiting).
 *
 * On the Cloudflare target: the Cloudflare edge WAF handles rate limiting
 * before the Worker runs, so this hook short-circuits immediately to avoid
 * any per-request cost.
 *
 * Note: per-process limiter only. Multi-replica self-host is out of scope;
 * counts are not shared across processes or machines.
 */

import type { Handle } from '@sveltejs/kit';
import type { RateLimitState } from '$lib/server/ratelimit.js';
import { checkRateLimit } from '$lib/server/ratelimit.js';

// ---------------------------------------------------------------------------
// Rate limit rules — mirror the Cloudflare WAF thresholds exactly.
// ---------------------------------------------------------------------------

interface RuleConfig {
	/** Returns true when this rule applies to the request. */
	matches: (method: string, pathname: string) => boolean;
	/** Max requests per window per IP. */
	limit: number;
	/** Window size in milliseconds. */
	windowMs: number;
	/** Short name used as part of the state map key. */
	name: string;
}

const RULES: RuleConfig[] = [
	{
		name: 'vote',
		matches: (method, pathname) =>
			method === 'POST' && /^\/s\/[^/]+\/vote$/.test(pathname),
		limit: 30,
		windowMs: 60_000,
	},
	{
		name: 'session-create',
		matches: (method, pathname) => method === 'POST' && pathname === '/',
		limit: 5,
		windowMs: 60_000,
	},
];

// Module-level state: one Map, shared across all requests in this process.
const rateLimitState: RateLimitState = new Map();

// ---------------------------------------------------------------------------
// Handle hook
// ---------------------------------------------------------------------------

export const handle: Handle = async ({ event, resolve }) => {
	// On Cloudflare the edge WAF runs first; skip all limiting here.
	if (__BRAMBLE_TARGET__ !== 'node') {
		return resolve(event);
	}

	const { method } = event.request;
	const { pathname } = new URL(event.request.url);
	const ip = event.getClientAddress();

	for (const rule of RULES) {
		if (!rule.matches(method, pathname)) continue;

		const key = `${ip}:${rule.name}`;
		const { allowed, retryAfterMs } = checkRateLimit(
			rateLimitState,
			key,
			rule.limit,
			rule.windowMs,
			Date.now(),
		);

		if (!allowed) {
			const retryAfterSecs = Math.ceil(retryAfterMs / 1000);
			return new Response('Too Many Requests', {
				status: 429,
				headers: { 'Retry-After': String(retryAfterSecs) },
			});
		}

		// Only the first matching rule applies per request.
		break;
	}

	return resolve(event);
};
