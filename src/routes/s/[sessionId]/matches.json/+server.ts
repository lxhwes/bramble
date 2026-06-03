import { json } from '@sveltejs/kit';
import { getMatches } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = await getStorage(platform);
	const result = await getMatches(env, params.sessionId);
	return json(result);
};
