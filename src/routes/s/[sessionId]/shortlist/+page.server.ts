import { error, fail } from '@sveltejs/kit';
import {
	addToShortlist,
	getShortlist,
	removeFromShortlist,
} from '$lib/server/db';
import { getMatches } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const env = await getStorage(platform);
	const { sessionId } = params;

	const result = await getMatches(env, sessionId);

	// Empty partnerSlugs reliably signals a missing session (same logic as matches page).
	if (result.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	const shortlist = await getShortlist(env.db, sessionId);

	return {
		sessionId,
		partnerSlugs: result.partnerSlugs,
		matches: result.matches,
		shortlist,
	};
};

export const actions: Actions = {
	add: async ({ params, platform, request }) => {
		const data = await request.formData();
		const name = data.get('name');
		const sex = data.get('sex');

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { message: 'Name is required' });
		}
		if (sex !== 'M' && sex !== 'F') {
			return fail(400, { message: 'Sex must be M or F' });
		}

		const env = await getStorage(platform);
		await addToShortlist(env.db, params.sessionId, name, sex);
	},

	remove: async ({ params, platform, request }) => {
		const data = await request.formData();
		const name = data.get('name');
		const sex = data.get('sex');

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { message: 'Name is required' });
		}
		if (sex !== 'M' && sex !== 'F') {
			return fail(400, { message: 'Sex must be M or F' });
		}

		const env = await getStorage(platform);
		await removeFromShortlist(env.db, params.sessionId, name, sex);
	},
};
