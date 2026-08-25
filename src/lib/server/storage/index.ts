/**
 * Storage factory.
 *
 * Returns a Storage instance for the current build target:
 *   - 'cloudflare': wraps platform.env.DB and platform.env.VOTES directly.
 *     D1Database and KVNamespace satisfy BrambleDB/BrambleKV structurally.
 *   - 'node': lazily opens a better-sqlite3 database and returns the Node
 *     adapter. The import of './node.js' is gated behind a build-time constant
 *     so esbuild eliminates it on Cloudflare builds — better-sqlite3 never
 *     enters the Worker bundle.
 *
 * __BRAMBLE_TARGET__ is defined in vite.config.ts via `define`.
 */

import type { Storage } from './types.js';

/**
 * Wraps Cloudflare bindings as a Storage.
 *
 * Kept as its own export so the scheduled (cron) handler can build a Storage
 * from `env` without a platform object — and so the double cast below lives at
 * exactly one site rather than being copied into every caller.
 */
export function cloudflareStorage(env: Env): Storage {
	return {
		// D1Database and KVNamespace are strict supersets of BrambleDB/BrambleKV;
		// plain assignment works because both interfaces are satisfied structurally.
		db: env.DB as unknown as Storage['db'],
		kv: env.VOTES as unknown as Storage['kv'],
	};
}

export async function getStorage(
	platform: App.Platform | undefined,
): Promise<Storage> {
	if (__BRAMBLE_TARGET__ === 'node') {
		const { getNodeStorage } = await import('./node.js');
		return getNodeStorage();
	}
	if (!platform) throw new Error('platform unavailable on cloudflare target');
	return cloudflareStorage(platform.env);
}
