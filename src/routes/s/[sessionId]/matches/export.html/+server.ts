import { error } from '@sveltejs/kit';
import { buildShortlistHtml } from '$lib/export/shortlist';
import { getMatches } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform) {
		throw error(500, 'Platform not available');
	}
	const result = await getMatches(platform.env.VOTES, params.sessionId);

	if (result.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	const html = buildShortlistHtml(result.matches, params.sessionId, new Date());
	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
};
