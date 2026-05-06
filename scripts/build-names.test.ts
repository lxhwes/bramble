import { describe, expect, it } from 'vitest';

import { parseBtnTsv } from './build-names';

describe('parseBtnTsv', () => {
	it('skips comment lines (including the column-header comment)', () => {
		const raw = [
			'#',
			'# This data is licensed under CC BY-SA 4.0.',
			'#',
			'# name\tgender\trelated',
			'Aaden\tm\tAden,Aidan',
		].join('\n');

		const out = parseBtnTsv(raw);

		expect(out.size).toBe(1);
		expect(out.has('aaden')).toBe(true);
	});

	it('splits on tabs and stores the related list as a string array', () => {
		const raw = ['Aaden\tm\tAden,Aidan,Aiden,Aydan,Ayden'].join('\n');

		const record = parseBtnTsv(raw).get('aaden');

		expect(record).toEqual({
			related: ['Aden', 'Aidan', 'Aiden', 'Aydan', 'Ayden'],
		});
	});

	it('returns an empty related array when the field is empty', () => {
		const raw = ['Aafje\tf\t'].join('\n');

		const record = parseBtnTsv(raw).get('aafje');

		expect(record).toEqual({ related: [] });
	});

	it('passes through "mf" (unisex) entries — match key is name only', () => {
		const raw = ['Aaren\tmf\tAaron,Arron'].join('\n');

		const record = parseBtnTsv(raw).get('aaren');

		expect(record).toEqual({ related: ['Aaron', 'Arron'] });
	});

	it('lowercases the lookup key so SSA names match BTN entries', () => {
		const raw = ['Aaliyah\tf\tAleah,Alia,Aliya'].join('\n');

		const out = parseBtnTsv(raw);

		expect(out.has('aaliyah')).toBe(true);
		expect(out.has('Aaliyah')).toBe(false);
	});

	it('ignores lines with no tab separators (malformed rows)', () => {
		const raw = ['Aaden\tm\tAden', 'this-is-junk-no-tabs', 'Aafje\tf\t'].join(
			'\n',
		);

		const out = parseBtnTsv(raw);

		expect(out.size).toBe(2);
		expect(out.has('aaden')).toBe(true);
		expect(out.has('aafje')).toBe(true);
	});
});
