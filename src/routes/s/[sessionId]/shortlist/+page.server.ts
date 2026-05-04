import { error, fail } from '@sveltejs/kit';
import {
	addToShortlist,
	getShortlist,
	removeFromShortlist,
} from '$lib/server/db';
import { getMatches } from '$lib/server/sessions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform) throw error(500, 'Platform not available');

	const { sessionId } = params;

	const result = await getMatches(
		{ kv: platform.env.VOTES, db: platform.env.DB },
		sessionId,
	);

	// Empty partnerSlugs reliably signals a missing session (same logic as matches page).
	if (result.partnerSlugs.length === 0) {
		throw error(404, 'Session not found');
	}

	const shortlist = await getShortlist(platform.env.DB, sessionId);

	return {
		sessionId,
		partnerSlugs: result.partnerSlugs,
		matches: result.matches,
		shortlist,
	};
};

export const actions: Actions = {
	add: async ({ params, platform, request }) => {
		if (!platform) return fail(500, { message: 'Platform not available' });

		const data = await request.formData();
		const name = data.get('name');
		const sex = data.get('sex');

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { message: 'Name is required' });
		}
		if (sex !== 'M' && sex !== 'F') {
			return fail(400, { message: 'Sex must be M or F' });
		}

		await addToShortlist(platform.env.DB, params.sessionId, name, sex);
	},

	remove: async ({ params, platform, request }) => {
		if (!platform) return fail(500, { message: 'Platform not available' });

		const data = await request.formData();
		const name = data.get('name');
		const sex = data.get('sex');

		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { message: 'Name is required' });
		}
		if (sex !== 'M' && sex !== 'F') {
			return fail(400, { message: 'Sex must be M or F' });
		}

		await removeFromShortlist(platform.env.DB, params.sessionId, name, sex);
	},
};
