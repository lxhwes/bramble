export interface NameEntry {
	name: string;
	sex: 'M' | 'F';
	peakYear: number;
	totalCount: number;
	related?: string[];
}

export type Gender = 'm' | 'f' | 'both';
export type Era = '1990s' | '2000s' | '2010s' | '2020s' | 'any';
export type Pop = 'rare' | 'common' | 'very-common' | 'any';

export interface FilterState {
	gender: Gender;
	era: Era;
	pop: Pop;
	startsWith: string | null; // single uppercase ASCII A-Z, or null
}

// Tunable thresholds. First-cut defaults aim for roughly equal-sized buckets.
// Tune after a week of usage.
export const POP_RARE_MAX = 5000; // totalCount < this → rare
export const POP_COMMON_MAX = 50000; // totalCount < this → common; otherwise very-common

export const DEFAULT_FILTERS: FilterState = {
	gender: 'both',
	era: 'any',
	pop: 'any',
	startsWith: null,
};

const VALID_GENDERS = new Set<Gender>(['m', 'f', 'both']);
const VALID_ERAS = new Set<Era>(['1990s', '2000s', '2010s', '2020s', 'any']);
const VALID_POPS = new Set<Pop>(['rare', 'common', 'very-common', 'any']);

export function parseFilters(searchParams: URLSearchParams): FilterState {
	const rawGender = searchParams.get('g') ?? '';
	const gender: Gender = VALID_GENDERS.has(rawGender as Gender)
		? (rawGender as Gender)
		: DEFAULT_FILTERS.gender;

	const rawEra = searchParams.get('era') ?? '';
	const era: Era = VALID_ERAS.has(rawEra as Era)
		? (rawEra as Era)
		: DEFAULT_FILTERS.era;

	const rawPop = searchParams.get('pop') ?? '';
	const pop: Pop = VALID_POPS.has(rawPop as Pop)
		? (rawPop as Pop)
		: DEFAULT_FILTERS.pop;

	const rawStart = searchParams.get('start') ?? '';
	const upper = rawStart.toUpperCase();
	const startsWith: string | null = /^[A-Z]$/.test(upper) ? upper : null;

	return { gender, era, pop, startsWith };
}

export function serializeFilters(state: FilterState): URLSearchParams {
	const params = new URLSearchParams();

	if (state.gender !== DEFAULT_FILTERS.gender) {
		params.set('g', state.gender);
	}
	if (state.era !== DEFAULT_FILTERS.era) {
		params.set('era', state.era);
	}
	if (state.pop !== DEFAULT_FILTERS.pop) {
		params.set('pop', state.pop);
	}
	if (state.startsWith !== DEFAULT_FILTERS.startsWith) {
		params.set('start', state.startsWith as string);
	}

	return params;
}

function eraForYear(peakYear: number): Era | null {
	if (peakYear >= 1990 && peakYear <= 1999) return '1990s';
	if (peakYear >= 2000 && peakYear <= 2009) return '2000s';
	if (peakYear >= 2010 && peakYear <= 2019) return '2010s';
	if (peakYear >= 2020 && peakYear <= 2029) return '2020s';
	return null;
}

function popTierFor(totalCount: number): Pop {
	if (totalCount < POP_RARE_MAX) return 'rare';
	if (totalCount < POP_COMMON_MAX) return 'common';
	return 'very-common';
}

export function applyFilters(
	names: NameEntry[],
	state: FilterState,
): NameEntry[] {
	return names.filter((entry) => {
		if (state.gender !== 'both') {
			const targetSex = state.gender === 'm' ? 'M' : 'F';
			if (entry.sex !== targetSex) return false;
		}

		if (state.era !== 'any') {
			if (eraForYear(entry.peakYear) !== state.era) return false;
		}

		if (state.pop !== 'any') {
			if (popTierFor(entry.totalCount) !== state.pop) return false;
		}

		if (state.startsWith !== null) {
			if (entry.name[0]?.toUpperCase() !== state.startsWith) return false;
		}

		return true;
	});
}
