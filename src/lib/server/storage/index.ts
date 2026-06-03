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

export async function getStorage(
	platform: App.Platform | undefined,
): Promise<Storage> {
	if (__BRAMBLE_TARGET__ === 'node') {
		const { getNodeStorage } = await import('./node.js');
		return getNodeStorage();
	}
	if (!platform) throw new Error('platform unavailable on cloudflare target');
	return {
		// D1Database and KVNamespace are strict supersets of BrambleDB/BrambleKV;
		// plain assignment works because both interfaces are satisfied structurally.
		db: platform.env.DB as unknown as Storage['db'],
		kv: platform.env.VOTES as unknown as Storage['kv'],
	};
}
