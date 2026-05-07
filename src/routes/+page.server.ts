import { redirect } from '@sveltejs/kit';
import { createSession } from '$lib/server/sessions';
import {
	LEGACY_COOKIE,
	parseSessionsCookie,
	readLegacyCookie,
	SESSIONS_COOKIE,
	serializeSessionsCookie,
	upsertSession,
} from '$lib/sessions-cookie';
import type { Actions, PageServerLoad } from './$types';

const COOKIE_OPTS = { path: '/', maxAge: 2592000, sameSite: 'lax' as const };

export const load: PageServerLoad = async ({ cookies }) => {
	const entries = parseSessionsCookie(cookies.get(SESSIONS_COOKIE));
	if (entries.length > 0) {
		return { lastSession: entries[0]?.sessionId ?? null };
	}
	// Fallback for users whose cookie predates the multi-session structure.
	return { lastSession: readLegacyCookie(cookies.get(LEGACY_COOKIE)) };
};

export const actions: Actions = {
	default: async ({ platform, cookies }) => {
		if (!platform) {
			throw new Error('platform is not available');
		}
		const id = await createSession({
			kv: platform.env.VOTES,
			db: platform.env.DB,
		});
		// Upsert into the multi-session cookie so this id is the most recent.
		const entries = parseSessionsCookie(cookies.get(SESSIONS_COOKIE));
		const next = upsertSession(entries, id, null, Date.now());
		cookies.set(SESSIONS_COOKIE, serializeSessionsCookie(next), COOKIE_OPTS);
		// Dual-write the legacy cookie for one release; drop in a follow-up commit.
		cookies.set(LEGACY_COOKIE, id, COOKIE_OPTS);
		throw redirect(303, `/s/${id}`);
	},
};
