import { redirect } from '@sveltejs/kit';
import { createSession } from '$lib/server/sessions';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ platform }) => {
		if (!platform) {
			throw new Error('platform is not available');
		}
		const id = await createSession(platform.env.VOTES);
		throw redirect(303, `/s/${id}?p=alex`);
	},
};
