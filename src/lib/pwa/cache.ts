/**
 * Returns a versioned cache name for the given build id.
 *
 * Embedding the build id in the cache name ensures a fresh deploy automatically
 * invalidates the previous cache without needing an explicit delete pass.
 */
export function cacheVersion(buildId: string): string {
	return `bramble-cache-${buildId}`;
}
