import { describe, expect, it } from 'vitest';
import { buildShortlistHtml, buildShortlistJson } from './shortlist.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'test-session-abc';
const NOW = new Date('2026-05-03T12:00:00.000Z');

const MATCHES: Array<{ name: string; sex: 'M' | 'F'; superSlugs: string[] }> = [
	{ name: 'Zara', sex: 'F', superSlugs: ['alex'] },
	{ name: 'Aaden', sex: 'M', superSlugs: [] },
	{ name: 'Mia', sex: 'F', superSlugs: ['alex', 'laura'] },
];

// ---------------------------------------------------------------------------
// buildShortlistJson
// ---------------------------------------------------------------------------

describe('buildShortlistJson', () => {
	it('returns the sessionId unchanged', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		expect(result.sessionId).toBe(SESSION_ID);
	});

	it('returns generatedAt as an ISO 8601 string matching the supplied Date', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		expect(result.generatedAt).toBe(NOW.toISOString());
	});

	it('sorts matches alphabetically by name', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		const names = result.matches.map((m) => m.name);
		expect(names).toEqual(['Aaden', 'Mia', 'Zara']);
	});

	it('maps superSlugs to partners field', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		const mia = result.matches.find((m) => m.name === 'Mia');
		expect(mia?.partners).toEqual(['alex', 'laura']);
	});

	it('maps empty superSlugs to an empty partners array', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		const aaden = result.matches.find((m) => m.name === 'Aaden');
		expect(aaden?.partners).toEqual([]);
	});

	it('preserves sex field on each match', () => {
		const result = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		const zara = result.matches.find((m) => m.name === 'Zara');
		expect(zara?.sex).toBe('F');
	});

	it('returns empty matches array when given no matches', () => {
		const result = buildShortlistJson([], SESSION_ID, NOW);
		expect(result.matches).toEqual([]);
	});

	it('is deterministic — same inputs produce identical output', () => {
		const a = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		const b = buildShortlistJson(MATCHES, SESSION_ID, NOW);
		expect(a).toEqual(b);
	});
});

// ---------------------------------------------------------------------------
// buildShortlistHtml
// ---------------------------------------------------------------------------

describe('buildShortlistHtml', () => {
	it('returns a string that starts with <!DOCTYPE html>', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
	});

	it('includes all match names', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		for (const match of MATCHES) {
			expect(html).toContain(match.name);
		}
	});

	it('lists matches in alphabetical order', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		const aIdx = html.indexOf('Aaden');
		const mIdx = html.indexOf('Mia');
		const zIdx = html.indexOf('Zara');
		expect(aIdx).toBeLessThan(mIdx);
		expect(mIdx).toBeLessThan(zIdx);
	});

	it('includes a boy gender badge for M names', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain('boy');
	});

	it('includes a girl gender badge for F names', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain('girl');
	});

	it('includes an inline <style> block', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain('<style>');
		expect(html).toContain('</style>');
	});

	it('includes @media print styles', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain('@media print');
	});

	it('includes the generatedAt timestamp', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain(NOW.toISOString());
	});

	it('is deterministic — same inputs produce identical output', () => {
		const a = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		const b = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(a).toBe(b);
	});

	it('returns a self-contained HTML document with <html>, <head>, and <body>', () => {
		const html = buildShortlistHtml(MATCHES, SESSION_ID, NOW);
		expect(html).toContain('<html');
		expect(html).toContain('<head>');
		expect(html).toContain('<body>');
	});
});
