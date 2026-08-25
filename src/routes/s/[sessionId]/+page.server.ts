import { error } from '@sveltejs/kit';
import {
	addPartner,
	getSessionMeta,
	getVotes,
	SessionFullError,
} from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import {
	LEGACY_COOKIE,
	parseSessionsCookie,
	SESSIONS_COOKIE,
	serializeSessionsCookie,
	upsertSession,
} from '$lib/sessions-cookie';
import type { PageServerLoad } from './$types';

const SLUG_RE = /^[a-z0-9-]{1,32}$/;
const COOKIE_OPTS = { path: '/', maxAge: 2592000, sameSite: 'lax' as const };

export const load: PageServerLoad = async ({
	params,
	url,
	platform,
	cookies,
}) => {
	const raw = url.searchParams.get('p');
	const slug = raw !== null ? raw.toLowerCase() : null;
	const slugValid = slug !== null && SLUG_RE.test(slug);

	const env = await getStorage(platform);
	const meta = await getSessionMeta(env, params.sessionId);

	if (meta === null) {
		throw error(404, 'Session not found');
	}

	const cookieEntries = parseSessionsCookie(cookies.get(SESSIONS_COOKIE));
	const cookieSlug =
		cookieEntries.find((e) => e.sessionId === params.sessionId)?.slug ?? null;

	if (!slugValid) {
		return {
			slug: null,
			sessionId: params.sessionId,
			partnerSlugs: meta.partnerSlugs,
			cookieSlug,
		};
	}

	try {
		await addPartner(env, params.sessionId, slug);
	} catch (err) {
		// The session is full. This is a plain GET, so the alternative is a 500
		// page on what is really a "no room" answer.
		if (err instanceof SessionFullError) {
			throw error(
				409,
				'This session already has the maximum number of partners',
			);
		}
		throw err;
	}

	const nextEntries = upsertSession(
		cookieEntries,
		params.sessionId,
		slug,
		Date.now(),
	);
	cookies.set(
		SESSIONS_COOKIE,
		serializeSessionsCookie(nextEntries),
		COOKIE_OPTS,
	);
	// Dual-write the legacy cookie for one release; drop in a follow-up commit.
	cookies.set(LEGACY_COOKIE, params.sessionId, COOKIE_OPTS);

	// addPartner is idempotent — the post-join slug list is the prior list
	// plus the joining slug if it wasn't already there. Avoids a second
	// getSessionMeta round trip just to learn what we already know.
	const partnerSlugs = meta.partnerSlugs.includes(slug)
		? meta.partnerSlugs
		: [...meta.partnerSlugs, slug];

	const allPartnerVotes = await Promise.all(
		partnerSlugs.map((s) => getVotes(env, params.sessionId, s)),
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
		cookieSlug: slug,
	};
};
