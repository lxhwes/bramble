import { describe, expect, it } from 'vitest';
import { SLUG_HTML_PATTERN, validateJoin } from './join-validation.js';

describe('SLUG_HTML_PATTERN', () => {
	it('parses cleanly in /v regex mode (Chromium 133+ HTML pattern attr)', () => {
		expect(() => new RegExp(SLUG_HTML_PATTERN, 'v')).not.toThrow();
	});

	it('matches valid slugs and rejects invalid ones under /v', () => {
		const re = new RegExp(`^${SLUG_HTML_PATTERN}$`, 'v');
		expect(re.test('alex')).toBe(true);
		expect(re.test('alex-1')).toBe(true);
		expect(re.test('a-b-c-d')).toBe(true);
		expect(re.test('Alex')).toBe(false);
		expect(re.test('alex_1')).toBe(false);
		expect(re.test('')).toBe(false);
	});
});

describe('validateJoin', () => {
	it('returns format-error for empty input', () => {
		const result = validateJoin('', {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result.kind).toBe('format-error');
	});

	it('lowercases uppercase input before validating', () => {
		const result = validateJoin('ALICE', {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result).toEqual({ kind: 'ok', slug: 'alice' });
	});

	it('returns format-error for input with disallowed characters', () => {
		const result = validateJoin('alice!', {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result.kind).toBe('format-error');
	});

	it('returns format-error for input longer than 32 chars', () => {
		const result = validateJoin('a'.repeat(33), {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result.kind).toBe('format-error');
	});

	it('returns ok for a fresh slug not in the session', () => {
		const result = validateJoin('alice', {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result).toEqual({ kind: 'ok', slug: 'alice' });
	});

	it('returns ok when the slug matches savedSlug (localStorage resume)', () => {
		const result = validateJoin('alice', {
			partnerSlugs: ['alice', 'bob'],
			savedSlug: 'alice',
			cookieSlug: null,
		});
		expect(result).toEqual({ kind: 'ok', slug: 'alice' });
	});

	it('returns ok when the slug matches cookieSlug (cookie resume)', () => {
		const result = validateJoin('alice', {
			partnerSlugs: ['alice', 'bob'],
			savedSlug: null,
			cookieSlug: 'alice',
		});
		expect(result).toEqual({ kind: 'ok', slug: 'alice' });
	});

	it('returns needs-confirm when slug is taken and neither storage matches', () => {
		const result = validateJoin('alice', {
			partnerSlugs: ['alice'],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result.kind).toBe('needs-confirm');
		if (result.kind === 'needs-confirm') {
			expect(result.slug).toBe('alice');
		}
	});

	it('trims surrounding whitespace before validating', () => {
		const result = validateJoin('  alice  ', {
			partnerSlugs: [],
			savedSlug: null,
			cookieSlug: null,
		});
		expect(result).toEqual({ kind: 'ok', slug: 'alice' });
	});
});
