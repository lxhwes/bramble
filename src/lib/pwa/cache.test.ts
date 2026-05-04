import { describe, expect, it } from 'vitest';
import { cacheVersion } from './cache.js';

describe('cacheVersion', () => {
	it('returns a versioned cache name with the build id', () => {
		expect(cacheVersion('abc123')).toBe('bramble-cache-abc123');
	});

	it('handles a build id with special characters', () => {
		expect(cacheVersion('1.2.3-beta')).toBe('bramble-cache-1.2.3-beta');
	});

	it('handles an empty build id', () => {
		expect(cacheVersion('')).toBe('bramble-cache-');
	});

	it('always starts with the bramble-cache- prefix', () => {
		const result = cacheVersion('xyz');
		expect(result.startsWith('bramble-cache-')).toBe(true);
	});
});
