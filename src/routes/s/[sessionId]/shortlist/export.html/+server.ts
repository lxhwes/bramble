import { error } from '@sveltejs/kit';
import { buildShortlistHtml } from '$lib/export/shortlist';
import { getShortlist } from '$lib/server/db';
import { getSessionMeta } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * Printable view of the saved shortlist. Same HTML shell as the matches
 * export so users can save either as a PDF and compare side-by-side.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	const env = await getStorage(platform);
	const meta = await getSessionMeta(env, params.sessionId);
	if (meta === null) {
		throw error(404, 'Session not found');
	}

	const rows = await getShortlist(env.db, params.sessionId);
	const html = buildShortlistHtml(
		rows.map((r) => ({ name: r.name, sex: r.sex, superSlugs: [] })),
		params.sessionId,
		new Date(),
	);
	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
};
