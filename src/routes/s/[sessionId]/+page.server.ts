import { error } from '@sveltejs/kit';
import { addPartner, getSessionMeta, getVotes } from '$lib/server/sessions';
import type { PageServerLoad } from './$types';

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

export const load: PageServerLoad = async ({
	params,
	url,
	platform,
	cookies,
}) => {
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
		return {
			slug: null,
			sessionId: params.sessionId,
			partnerSlugs: meta.partnerSlugs,
		};
	}

	await addPartner(platform.env.VOTES, params.sessionId, slug);

	cookies.set('bramble_last_session', params.sessionId, {
		path: '/',
		maxAge: 2592000,
		sameSite: 'lax',
	});

	const [votes, postJoinMeta] = await Promise.all([
		getVotes(platform.env.VOTES, params.sessionId, slug),
		getSessionMeta(platform.env.VOTES, params.sessionId),
	]);

	return {
		slug,
		sessionId: params.sessionId,
		votes: votes?.votes ?? [],
		partnerSlugs: postJoinMeta?.partnerSlugs ?? [slug],
	};
};
