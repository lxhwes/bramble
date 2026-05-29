/**
 * In-process fixed-window rate limiter.
 *
 * Tracks request counts per (IP, route) key in a module-level Map. Windows
 * are evicted lazily on access once they expire, keeping memory bounded without
 * a background sweeper.
 *
 * Note: per-process only. Multi-replica self-host deployments are out of scope;
 * counts are not shared across processes or machines.
 */

/** One window entry stored in the rate-limit state map. */
interface WindowEntry {
	/** Timestamp (ms) when this window started. */
	windowStart: number;
	/** Number of requests recorded in this window. */
	count: number;
}

/**
 * Mutable state map keyed by an arbitrary string (typically "ip:rule").
 * Export as an opaque type so callers can create instances for testing without
 * touching the module singleton.
 */
export type RateLimitState = Map<string, WindowEntry>;

/** Result returned by checkRateLimit. */
export interface RateLimitResult {
	/** True when the request is within the limit and should proceed. */
	allowed: boolean;
	/**
	 * Milliseconds until the current window resets. Zero when allowed.
	 * Used to populate the Retry-After response header (convert to seconds).
	 */
	retryAfterMs: number;
}

/**
 * Checks and records a single request against a fixed-window rate limit.
 *
 * Mutates `state` in place: increments the counter for `key` within the
 * current window, or opens a new window if the previous one has expired
 * (lazy eviction).
 *
 * @param state    - Shared mutable state map (module-level singleton in production).
 * @param key      - Unique string identifying the (IP, rule) combination.
 * @param limit    - Maximum number of requests allowed per window.
 * @param windowMs - Window duration in milliseconds.
 * @param now      - Current timestamp in milliseconds (injectable for testing).
 * @returns        - `{ allowed, retryAfterMs }`.
 */
export function checkRateLimit(
	state: RateLimitState,
	key: string,
	limit: number,
	windowMs: number,
	now: number,
): RateLimitResult {
	const entry = state.get(key);

	if (entry === undefined || now >= entry.windowStart + windowMs) {
		// No existing window, or the previous window has expired — open a new one.
		state.set(key, { windowStart: now, count: 1 });
		return { allowed: true, retryAfterMs: 0 };
	}

	if (entry.count < limit) {
		entry.count += 1;
		return { allowed: true, retryAfterMs: 0 };
	}

	// Over limit: compute time until this window resets.
	const retryAfterMs = entry.windowStart + windowMs - now;
	return { allowed: false, retryAfterMs };
}
