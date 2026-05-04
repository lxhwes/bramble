import { error, json } from '@sveltejs/kit';
import { getMatches } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform) {
		throw error(500, 'Platform not available');
	}
	const result = await getMatches(
		{ kv: platform.env.VOTES, db: platform.env.DB },
		params.sessionId,
	);
	return json(result);
};
