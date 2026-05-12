import { describe, expect, it } from 'vitest';
import type { PartnerData } from './aggregate.js';
import { computeStats } from './aggregate.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePartner(
	slug: string,
	votes: Array<{ name: string; sex: 'M' | 'F'; vote: 'yes' | 'no' | 'super' }>,
): PartnerData {
	return {
		slug,
		votes: votes.map((v) => ({ ...v, ts: 0 })),
	};
}

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('computeStats — empty input', () => {
	it('returns zeroes for an empty partner list', () => {
		const result = computeStats([]);
		expect(result.likeRate).toEqual({});
		expect(result.mutualLikes).toBe(0);
		expect(result.disagreements).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Single partner
// ---------------------------------------------------------------------------

describe('computeStats — single partner', () => {
	it('computes like rate correctly when all votes are yes/super/no', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'super' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		// like rate: 2 yes/super out of 3 total
		expect(result.likeRate).toEqual({ alice: 2 / 3 });
	});

	it('returns mutualLikes of 0 for a single partner (nobody to match with)', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'super' },
			]),
		];
		const result = computeStats(partners);
		expect(result.mutualLikes).toBe(0);
	});

	it('returns no disagreements for a single partner', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		expect(result.disagreements).toEqual([]);
	});

	it('returns likeRate of 0 when partner voted no on everything', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		expect(result.likeRate).toEqual({ alice: 0 });
	});

	it('returns likeRate of 0 for a partner with no votes', () => {
		const partners = [makePartner('alice', [])];
		const result = computeStats(partners);
		expect(result.likeRate).toEqual({ alice: 0 });
	});
});

// ---------------------------------------------------------------------------
// Two partners — full agreement
// ---------------------------------------------------------------------------

describe('computeStats — two partners, full agreement', () => {
	it('counts mutual likes when both partners liked the same names', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'super' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'super' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		expect(result.mutualLikes).toBe(2);
		expect(result.disagreements).toEqual([]);
	});

	it('computes per-partner like rates independently', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'super' },
				{ name: 'Emma', sex: 'F', vote: 'super' },
			]),
		];
		const result = computeStats(partners);
		expect(result.likeRate).toEqual({ alice: 0.5, bob: 1 });
	});
});

// ---------------------------------------------------------------------------
// Two partners — disagreements
// ---------------------------------------------------------------------------

describe('computeStats — two partners, disagreements', () => {
	it('identifies names where one partner liked and the other did not', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
				{ name: 'Noah', sex: 'M', vote: 'super' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
				{ name: 'Noah', sex: 'M', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		// Emma: alice=no, bob=yes → disagreement
		// Liam: alice=yes, bob=no → disagreement
		// Noah: alice=super, bob=no → disagreement
		expect(result.mutualLikes).toBe(0);
		expect(result.disagreements).toHaveLength(3);
		// Sorted alphabetically
		expect(result.disagreements.map((d) => d.name)).toEqual([
			'Emma',
			'Liam',
			'Noah',
		]);
	});

	it('records each partner vote in the disagreement entry', () => {
		const partners = [
			makePartner('alice', [{ name: 'Liam', sex: 'M', vote: 'super' }]),
			makePartner('bob', [{ name: 'Liam', sex: 'M', vote: 'no' }]),
		];
		const result = computeStats(partners);
		expect(result.disagreements).toHaveLength(1);
		expect(result.disagreements[0]).toEqual({
			name: 'Liam',
			sex: 'M',
			partners: { alice: 'super', bob: 'no' },
		});
	});

	it('does not include names where both voted no', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
			]),
		];
		const result = computeStats(partners);
		// Both voted no on Liam → not a disagreement, not a mutual like
		// Both voted yes on Emma → mutual like, not a disagreement
		expect(result.disagreements).toHaveLength(0);
		expect(result.mutualLikes).toBe(1);
	});

	it('only considers names voted on by all partners when checking disagreements', () => {
		// Alice voted on Liam; Bob has not — name only appears in one partner's votes.
		// A name only seen by one partner cannot be a disagreement.
		const partners = [
			makePartner('alice', [{ name: 'Liam', sex: 'M', vote: 'yes' }]),
			makePartner('bob', [{ name: 'Emma', sex: 'F', vote: 'yes' }]),
		];
		const result = computeStats(partners);
		expect(result.disagreements).toHaveLength(0);
		expect(result.mutualLikes).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Three partners
// ---------------------------------------------------------------------------

describe('computeStats — three partners', () => {
	it('counts a mutual like only when ALL three partners liked it', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
			makePartner('carol', [
				{ name: 'Liam', sex: 'M', vote: 'super' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
			]),
		];
		const result = computeStats(partners);
		// Liam: all three liked → mutual
		// Emma: bob said no → not mutual
		expect(result.mutualLikes).toBe(1);
	});

	it('flags a disagreement when at least one liked and at least one did not', () => {
		const partners = [
			makePartner('alice', [{ name: 'Noah', sex: 'M', vote: 'yes' }]),
			makePartner('bob', [{ name: 'Noah', sex: 'M', vote: 'no' }]),
			makePartner('carol', [{ name: 'Noah', sex: 'M', vote: 'super' }]),
		];
		const result = computeStats(partners);
		// alice=yes, bob=no, carol=super → disagreement
		expect(result.disagreements).toHaveLength(1);
		expect(result.disagreements[0].partners).toEqual({
			alice: 'yes',
			bob: 'no',
			carol: 'super',
		});
	});

	it('produces correct like rates for three partners', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'yes' },
				{ name: 'Noah', sex: 'M', vote: 'yes' },
				{ name: 'Olivia', sex: 'F', vote: 'no' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
			makePartner('carol', []),
		];
		const result = computeStats(partners);
		expect(result.likeRate.alice).toBeCloseTo(0.75);
		expect(result.likeRate.bob).toBe(0);
		expect(result.likeRate.carol).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Agreement rate — W4.5
// ---------------------------------------------------------------------------

describe('computeStats — agreementRate', () => {
	it('returns 0 when there are no shared names', () => {
		const partners = [
			makePartner('alice', [{ name: 'Liam', sex: 'M', vote: 'yes' }]),
			makePartner('bob', [{ name: 'Emma', sex: 'F', vote: 'yes' }]),
		];
		const result = computeStats(partners);
		expect(result.agreementRate).toBe(0);
	});

	it('returns 1 when partners agree on every shared name (all yes or all no)', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'super' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		// Both names are shared; both agreed → 2/2 = 1.0
		expect(result.agreementRate).toBe(1);
	});

	it('counts mutual-no agreement alongside mutual-likes', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'no' },
			]),
		];
		const result = computeStats(partners);
		expect(result.agreementRate).toBe(1);
		expect(result.mutualLikes).toBe(0);
	});

	it('returns 0.5 when half the shared names agree', () => {
		const partners = [
			makePartner('alice', [
				{ name: 'Liam', sex: 'M', vote: 'yes' }, // disagree
				{ name: 'Emma', sex: 'F', vote: 'yes' }, // agree
			]),
			makePartner('bob', [
				{ name: 'Liam', sex: 'M', vote: 'no' },
				{ name: 'Emma', sex: 'F', vote: 'super' },
			]),
		];
		const result = computeStats(partners);
		expect(result.agreementRate).toBe(0.5);
	});
});
