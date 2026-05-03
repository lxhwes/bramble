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

	// addPartner is idempotent — the post-join slug list is the prior list
	// plus the joining slug if it wasn't already there. Avoids a second
	// getSessionMeta round trip just to learn what we already know.
	const partnerSlugs = meta.partnerSlugs.includes(slug)
		? meta.partnerSlugs
		: [...meta.partnerSlugs, slug];

	const allPartnerVotes = await Promise.all(
		partnerSlugs.map((s) => getVotes(platform.env.VOTES, params.sessionId, s)),
	);

	const partnerVoteCounts: Record<string, number> = {};
	partnerSlugs.forEach((s, i) => {
		partnerVoteCounts[s] = allPartnerVotes[i]?.votes.length ?? 0;
	});

	const myIndex = partnerSlugs.indexOf(slug);

	return {
		slug,
		sessionId: params.sessionId,
		votes: allPartnerVotes[myIndex]?.votes ?? [],
		partnerSlugs,
		partnerVoteCounts,
	};
};
