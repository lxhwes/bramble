import { error, json } from '@sveltejs/kit';
import { getMatches } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform) {
		throw error(500, 'Platform not available');
	}
	const result = await getMatches(platform.env.VOTES, params.sessionId);
	return json(result);
};
