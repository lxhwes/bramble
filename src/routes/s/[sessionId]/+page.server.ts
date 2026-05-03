import { error } from '@sveltejs/kit';
import { addPartner, getSessionMeta, getVotes } from '$lib/server/sessions';
import type { PageServerLoad } from './$types';

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const raw = url.searchParams.get('p');
	const slug = raw !== null ? raw.toLowerCase() : null;
	const slugValid = slug !== null && SLUG_RE.test(slug);

	if (!platform) {
		throw error(500, 'Platform not available');
	}

	const meta = await getSessionMeta(platform.env.VOTES, params.sessionId);

	if (meta === null) {
		throw error(404, 'Session not found');
	}

	if (!slugValid) {
		return { slug: null, sessionId: params.sessionId };
	}

	await addPartner(platform.env.VOTES, params.sessionId, slug);

	const votes = await getVotes(platform.env.VOTES, params.sessionId, slug);

	return { slug, sessionId: params.sessionId, votes: votes?.votes ?? [] };
};
