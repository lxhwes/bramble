import { error } from '@sveltejs/kit';
import { getMatches } from '$lib/server/sessions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform) throw error(500, 'Platform not available');
	const result = await getMatches(
		{ kv: platform.env.VOTES, db: platform.env.DB },
		params.sessionId,
	);

	// getMatches returns partnerSlugs: [] when the session does not exist in KV
	// (getSessionMeta returns null inside getMatches → meta?.partnerSlugs ?? []).
	// A real session with at least one partner will always have partnerSlugs.length >= 1,
	// so empty partnerSlugs reliably signals a missing session.
	if (result.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	return {
		sessionId: params.sessionId,
		partnerSlugs: result.partnerSlugs,
		matches: result.matches,
	};
};
