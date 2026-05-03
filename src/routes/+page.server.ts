import { redirect } from '@sveltejs/kit';
import { createSession } from '$lib/server/sessions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const lastSession = cookies.get('bramble_last_session') ?? null;
	return { lastSession };
};

export const actions: Actions = {
	default: async ({ platform, cookies }) => {
		if (!platform) {
			throw new Error('platform is not available');
		}
		const id = await createSession(platform.env.VOTES);
		// Write cookie before redirect so the browser picks it up immediately.
		cookies.set('bramble_last_session', id, {
			path: '/',
			maxAge: 2592000,
			sameSite: 'lax',
		});
		throw redirect(303, `/s/${id}`);
	},
};
