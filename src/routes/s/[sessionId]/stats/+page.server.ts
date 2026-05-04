import { error } from '@sveltejs/kit';
import { getSessionMeta, getVotes } from '$lib/server/sessions.js';
import { computeStats } from '$lib/stats/aggregate.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform) throw error(500, 'Platform not available');

	const kv = platform.env.VOTES;
	const { sessionId } = params;

	const meta = await getSessionMeta(kv, sessionId);
	if (meta === null || meta.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	// Load each partner's votes in parallel.
	const partnerDataList = await Promise.all(
		meta.partnerSlugs.map(async (slug) => {
			const pv = await getVotes(kv, sessionId, slug);
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
	};
};
