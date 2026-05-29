import { error, json } from '@sveltejs/kit';
import { buildShortlistJson } from '$lib/export/shortlist';
import { getMatches } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = await getStorage(platform);
	const result = await getMatches(env, params.sessionId);

	if (result.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	const payload = buildShortlistJson(
		result.matches,
		params.sessionId,
		new Date(),
	);
	return json(payload);
};
