import { describe, expect, it } from 'vitest';
import type { FilterState, NameEntry } from './filters.js';
import {
	applyFilters,
	DEFAULT_FILTERS,
	POP_COMMON_MAX,
	POP_RARE_MAX,
	parseFilters,
	serializeFilters,
} from './filters.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeName(
	overrides: Partial<NameEntry> & Pick<NameEntry, 'name'>,
): NameEntry {
	return {
		sex: 'M',
		peakYear: 2010,
		totalCount: 1000,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// parseFilters
// ---------------------------------------------------------------------------

describe('parseFilters', () => {
	it('returns DEFAULT_FILTERS for empty URLSearchParams', () => {
		expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
	});

	it('parses valid gender values', () => {
		expect(parseFilters(new URLSearchParams('g=m')).gender).toBe('m');
		expect(parseFilters(new URLSearchParams('g=f')).gender).toBe('f');
		expect(parseFilters(new URLSearchParams('g=both')).gender).toBe('both');
	});

	it('falls back to default gender for invalid value', () => {
		expect(parseFilters(new URLSearchParams('g=male')).gender).toBe(
			DEFAULT_FILTERS.gender,
		);
		expect(parseFilters(new URLSearchParams('g=')).gender).toBe(
			DEFAULT_FILTERS.gender,
		);
	});

	it('parses valid era values', () => {
		for (const era of ['1990s', '2000s', '2010s', '2020s', 'any'] as const) {
			expect(parseFilters(new URLSearchParams(`era=${era}`)).era).toBe(era);
		}
	});

	it('falls back to default era for invalid value', () => {
		expect(parseFilters(new URLSearchParams('era=2030s')).era).toBe(
			DEFAULT_FILTERS.era,
		);
	});

	it('parses valid pop values', () => {
		for (const pop of ['rare', 'common', 'very-common', 'any'] as const) {
			expect(parseFilters(new URLSearchParams(`pop=${pop}`)).pop).toBe(pop);
		}
	});

	it('falls back to default pop for invalid value', () => {
		expect(parseFilters(new URLSearchParams('pop=medium')).pop).toBe(
			DEFAULT_FILTERS.pop,
		);
	});

	it('uppercases and validates single-letter start', () => {
		expect(parseFilters(new URLSearchParams('start=a')).startsWith).toBe('A');
		expect(parseFilters(new URLSearchParams('start=Z')).startsWith).toBe('Z');
	});

	it('returns null startsWith for multi-char and numeric start values', () => {
		expect(
			parseFilters(new URLSearchParams('start=abc')).startsWith,
		).toBeNull();
		expect(parseFilters(new URLSearchParams('start=1')).startsWith).toBeNull();
		expect(parseFilters(new URLSearchParams('start=')).startsWith).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// serializeFilters
// ---------------------------------------------------------------------------

describe('serializeFilters', () => {
	it('produces empty URLSearchParams for DEFAULT_FILTERS', () => {
		const params = serializeFilters(DEFAULT_FILTERS);
		expect(params.toString()).toBe('');
	});

	it('only emits keys that differ from defaults', () => {
		const state: FilterState = { ...DEFAULT_FILTERS, gender: 'f' };
		const params = serializeFilters(state);
		expect(params.get('g')).toBe('f');
		expect(params.get('era')).toBeNull();
		expect(params.get('pop')).toBeNull();
		expect(params.get('start')).toBeNull();
	});

	it('emits all non-default keys when all differ', () => {
		const state: FilterState = {
			gender: 'f',
			era: '2010s',
			pop: 'common',
			startsWith: 'A',
		};
		const params = serializeFilters(state);
		expect(params.get('g')).toBe('f');
		expect(params.get('era')).toBe('2010s');
		expect(params.get('pop')).toBe('common');
		expect(params.get('start')).toBe('A');
	});
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip: parseFilters(serializeFilters(state)) === state', () => {
	const cases: FilterState[] = [
		{ gender: 'f', era: '2010s', pop: 'common', startsWith: 'A' },
		{ gender: 'm', era: '1990s', pop: 'rare', startsWith: null },
		{ gender: 'both', era: '2020s', pop: 'very-common', startsWith: 'Z' },
		{ gender: 'f', era: 'any', pop: 'any', startsWith: 'M' },
	];

	for (const state of cases) {
		it(`round-trips ${JSON.stringify(state)}`, () => {
			expect(parseFilters(serializeFilters(state))).toEqual(state);
		});
	}
});

// ---------------------------------------------------------------------------
// applyFilters — gender
// ---------------------------------------------------------------------------

describe('applyFilters — gender', () => {
	const names = [
		makeName({ name: 'Liam', sex: 'M' }),
		makeName({ name: 'Olivia', sex: 'F' }),
	];

	it('gender=both includes all entries', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, gender: 'both' });
		expect(result).toHaveLength(2);
	});

	it('gender=m excludes F entries', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, gender: 'm' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Liam');
	});

	it('gender=f excludes M entries', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, gender: 'f' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Olivia');
	});
});

// ---------------------------------------------------------------------------
// applyFilters — era
// ---------------------------------------------------------------------------

describe('applyFilters — era', () => {
	const names = [
		makeName({ name: 'A', peakYear: 1989 }),
		makeName({ name: 'B', peakYear: 1990 }),
		makeName({ name: 'C', peakYear: 1999 }),
		makeName({ name: 'D', peakYear: 2000 }),
		makeName({ name: 'E', peakYear: 2009 }),
		makeName({ name: 'F', peakYear: 2010 }),
		makeName({ name: 'G', peakYear: 2019 }),
		makeName({ name: 'H', peakYear: 2020 }),
		makeName({ name: 'I', peakYear: 2024 }),
		makeName({ name: 'J', peakYear: 2029 }),
		makeName({ name: 'K', peakYear: 2030 }),
	];

	it('era=any includes all entries', () => {
		expect(
			applyFilters(names, { ...DEFAULT_FILTERS, era: 'any' }),
		).toHaveLength(names.length);
	});

	it('era=1990s includes exactly 1990–1999', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, era: '1990s' });
		const years = result.map((n) => n.peakYear);
		expect(years).toContain(1990);
		expect(years).toContain(1999);
		expect(years).not.toContain(1989);
		expect(years).not.toContain(2000);
	});

	it('era=2000s includes exactly 2000–2009', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, era: '2000s' });
		const years = result.map((n) => n.peakYear);
		expect(years).toContain(2000);
		expect(years).toContain(2009);
		expect(years).not.toContain(1999);
		expect(years).not.toContain(2010);
	});

	it('era=2010s includes exactly 2010–2019', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, era: '2010s' });
		const years = result.map((n) => n.peakYear);
		expect(years).toContain(2010);
		expect(years).toContain(2019);
		expect(years).not.toContain(2009);
		expect(years).not.toContain(2020);
	});

	it('era=2020s includes exactly 2020–2029', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, era: '2020s' });
		const years = result.map((n) => n.peakYear);
		expect(years).toContain(2020);
		expect(years).toContain(2024);
		expect(years).toContain(2029);
		expect(years).not.toContain(2019);
		expect(years).not.toContain(2030);
	});

	it('peakYear=1989 is excluded when era is set to any specific decade', () => {
		for (const era of ['1990s', '2000s', '2010s', '2020s'] as const) {
			const result = applyFilters(names, { ...DEFAULT_FILTERS, era });
			expect(result.map((n) => n.peakYear)).not.toContain(1989);
		}
	});
});

// ---------------------------------------------------------------------------
// applyFilters — pop tier
// ---------------------------------------------------------------------------

describe('applyFilters — pop tier', () => {
	// Boundary entries
	const names = [
		makeName({ name: 'VeryRare', totalCount: POP_RARE_MAX - 1 }), // rare
		makeName({ name: 'AtRareMax', totalCount: POP_RARE_MAX }), // common (>= POP_RARE_MAX, < POP_COMMON_MAX)
		makeName({ name: 'AtCommonMax', totalCount: POP_COMMON_MAX }), // very-common (>= POP_COMMON_MAX)
	];

	it('pop=any includes all entries', () => {
		expect(
			applyFilters(names, { ...DEFAULT_FILTERS, pop: 'any' }),
		).toHaveLength(3);
	});

	it('pop=rare includes only entries with totalCount < POP_RARE_MAX', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, pop: 'rare' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('VeryRare');
	});

	it('pop=common includes entries with POP_RARE_MAX <= totalCount < POP_COMMON_MAX', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, pop: 'common' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('AtRareMax');
	});

	it('pop=very-common includes entries with totalCount >= POP_COMMON_MAX', () => {
		const result = applyFilters(names, {
			...DEFAULT_FILTERS,
			pop: 'very-common',
		});
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('AtCommonMax');
	});
});

// ---------------------------------------------------------------------------
// applyFilters — startsWith
// ---------------------------------------------------------------------------

describe('applyFilters — startsWith', () => {
	const names = [
		makeName({ name: 'Alice' }),
		makeName({ name: 'adam' }),
		makeName({ name: 'Bob' }),
	];

	it('startsWith=null includes all entries', () => {
		expect(
			applyFilters(names, { ...DEFAULT_FILTERS, startsWith: null }),
		).toHaveLength(3);
	});

	it('startsWith=A matches names starting with A case-insensitively', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, startsWith: 'A' });
		expect(result).toHaveLength(2);
		expect(result.map((n) => n.name)).toEqual(
			expect.arrayContaining(['Alice', 'adam']),
		);
	});

	it('startsWith=B excludes names not starting with B', () => {
		const result = applyFilters(names, { ...DEFAULT_FILTERS, startsWith: 'B' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Bob');
	});
});
