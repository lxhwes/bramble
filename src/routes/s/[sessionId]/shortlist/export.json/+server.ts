import { error, json } from '@sveltejs/kit';
import { buildShortlistJson } from '$lib/export/shortlist';
import { getShortlist } from '$lib/server/db';
import { getSessionMeta } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

/**
 * Exports the saved shortlist (subset of mutual matches the partners have
 * starred) rather than every mutual match. Shape matches the matches export
 * for tooling parity; `partners` is always an empty array because shortlist
 * rows do not carry super-like attribution.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform) {
		throw error(500, 'Platform not available');
	}
	const env = { kv: platform.env.VOTES, db: platform.env.DB };
	const meta = await getSessionMeta(env, params.sessionId);
	if (meta === null) {
		throw error(404, 'Session not found');
	}

	const rows = await getShortlist(platform.env.DB, params.sessionId);
	const payload = buildShortlistJson(
		rows.map((r) => ({ name: r.name, sex: r.sex, superSlugs: [] })),
		params.sessionId,
		new Date(),
	);
	return json(payload);
};
