import type { Vote, VoteEntry } from '$lib/server/sessions.js';

/**
 * Input shape for a single partner's swiping data.
 * Mirrors the fields we need from PartnerVotes without coupling to the full
 * server module (keeps this file importable in both server and test contexts).
 */
export interface PartnerData {
	slug: string;
	votes: Array<Pick<VoteEntry, 'name' | 'sex' | 'vote'>>;
}

export interface DisagreementEntry {
	name: string;
	sex: 'M' | 'F';
	/** Each partner's vote on this name. Only partners who voted are included. */
	partners: Record<string, Vote>;
}

export interface StatsResult {
	/** (yes + super) / total votes per partner slug. 0 when a partner has no votes. */
	likeRate: Record<string, number>;
	/** Count of names where every partner voted yes or super. */
	mutualLikes: number;
	/** Names where at least one partner liked and at least one disliked. Sorted alphabetically. */
	disagreements: DisagreementEntry[];
}

/**
 * Computes aggregate statistics across all partners for a session.
 *
 * Pure function — no I/O. Safe to call in both server and client contexts,
 * though in practice the server load function is the only caller.
 */
export function computeStats(partners: PartnerData[]): StatsResult {
	if (partners.length === 0) {
		return { likeRate: {}, mutualLikes: 0, disagreements: [] };
	}

	// --- Like rate per partner ---
	const likeRate: Record<string, number> = {};
	for (const partner of partners) {
		const total = partner.votes.length;
		if (total === 0) {
			likeRate[partner.slug] = 0;
			continue;
		}
		const liked = partner.votes.filter(
			(v) => v.vote === 'yes' || v.vote === 'super',
		).length;
		likeRate[partner.slug] = liked / total;
	}

	// --- Build per-partner lookup maps keyed by "name|sex" ---
	// Only consider names where all partners who voted on it have cast a vote.
	// Disagreements and mutual likes only apply to names seen by 2+ partners.

	type VoteMap = Map<string, Vote>;
	const voteMaps: VoteMap[] = partners.map((partner) => {
		const map: VoteMap = new Map();
		for (const entry of partner.votes) {
			map.set(`${entry.name}|${entry.sex}`, entry.vote);
		}
		return map;
	});

	// Collect all name|sex keys that appear in at least two partners' maps.
	const keyCount = new Map<string, number>();
	for (const map of voteMaps) {
		for (const key of map.keys()) {
			keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
		}
	}

	// Mutual likes and disagreements require at least two partners to compare.
	// With a single partner there is nobody to agree or disagree with.
	if (partners.length < 2) {
		return { likeRate, mutualLikes: 0, disagreements: [] };
	}

	// Only evaluate names seen by every partner (all partners must have a vote).
	// A name seen by fewer than all partners cannot produce a mutual like or a
	// disagreement, because we don't know the missing partners' intent.
	const allSlugsCount = partners.length;
	const sharedKeys = [...keyCount.entries()]
		.filter(([, count]) => count === allSlugsCount)
		.map(([key]) => key);

	let mutualLikes = 0;
	const disagreements: DisagreementEntry[] = [];

	for (const key of sharedKeys) {
		const [name, sex] = key.split('|') as [string, 'M' | 'F'];
		const partnerVotes: Record<string, Vote> = {};

		let anyLiked = false;
		let anyDisliked = false;

		for (let i = 0; i < partners.length; i++) {
			// sharedKeys were built from voteMaps, so each map is guaranteed to
			// contain this key — the Map.get result cannot be undefined here.
			const vote = voteMaps[i].get(key) as Vote;
			partnerVotes[partners[i].slug] = vote;
			if (vote === 'yes' || vote === 'super') {
				anyLiked = true;
			} else {
				anyDisliked = true;
			}
		}

		if (anyLiked && !anyDisliked) {
			mutualLikes += 1;
		} else if (anyLiked && anyDisliked) {
			disagreements.push({ name, sex, partners: partnerVotes });
		}
		// If everyone voted no: skip (neither category).
	}

	disagreements.sort((a, b) => a.name.localeCompare(b.name));

	return { likeRate, mutualLikes, disagreements };
}
