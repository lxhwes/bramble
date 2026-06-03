import { error } from '@sveltejs/kit';
import { getSessionMeta, getVotes } from '$lib/server/sessions.js';
import { getStorage } from '$lib/server/storage/index.js';
import { computeStats } from '$lib/stats/aggregate.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const env = await getStorage(platform);
	const { sessionId } = params;

	const meta = await getSessionMeta(env, sessionId);
	if (meta === null || meta.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	// Load each partner's votes in parallel.
	const partnerDataList = await Promise.all(
		meta.partnerSlugs.map(async (slug) => {
			const pv = await getVotes(env, sessionId, slug);
			return { slug, votes: pv?.votes ?? [] };
		}),
	);

	const stats = computeStats(partnerDataList);

	return {
		sessionId,
		partnerSlugs: meta.partnerSlugs,
		likeRate: stats.likeRate,
		mutualLikes: stats.mutualLikes,
		disagreements: stats.disagreements,
		sharedNames: stats.sharedNames,
		agreementRate: stats.agreementRate,
	};
};
