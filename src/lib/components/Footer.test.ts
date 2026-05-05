import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Footer is the only place the SSA / Behind the Name attribution renders
// in-app. The bundled name dataset is CC BY-SA 4.0, so attribution is a
// license obligation. This test guards against accidental removal during
// future footer redesigns.
const footerSource = readFileSync(
	fileURLToPath(new URL('./Footer.svelte', import.meta.url)),
	'utf8',
);

describe('Footer', () => {
	it('links to the about page', () => {
		expect(footerSource).toContain('href="/about"');
		expect(footerSource).toContain('About');
	});

	it('attributes the SSA dataset', () => {
		expect(footerSource).toContain('https://www.ssa.gov/oact/babynames/');
		expect(footerSource).toContain('SSA');
	});

	it('attributes Behind the Name with the CC BY-SA license', () => {
		expect(footerSource).toContain('https://www.behindthename.com/');
		expect(footerSource).toContain('Behind the Name');
		expect(footerSource).toContain('CC BY-SA 4.0');
	});
});
