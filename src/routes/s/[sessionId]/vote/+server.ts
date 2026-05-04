import { error } from '@sveltejs/kit';
import type { VoteEntry } from '$lib/server/sessions';
import { appendVotes } from '$lib/server/sessions';
import type { RequestHandler } from './$types';

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

function isVoteEntry(v: unknown): v is VoteEntry {
	if (typeof v !== 'object' || v === null) return false;
	const obj = v as Record<string, unknown>;
	return (
		typeof obj.name === 'string' &&
		(obj.sex === 'M' || obj.sex === 'F') &&
		(obj.vote === 'yes' || obj.vote === 'no' || obj.vote === 'super') &&
		typeof obj.ts === 'number'
	);
}

export const POST: RequestHandler = async ({ request, params, platform }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid');
	}

	if (typeof body !== 'object' || body === null) {
		throw error(400, 'invalid');
	}

	const { slug, votes } = body as Record<string, unknown>;

	if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
		throw error(400, 'invalid');
	}

	if (!Array.isArray(votes) || !votes.every(isVoteEntry)) {
		throw error(400, 'invalid');
	}

	if (!platform) {
		throw error(500, 'Platform not available');
	}

	await appendVotes(
		{ kv: platform.env.VOTES, db: platform.env.DB },
		params.sessionId,
		slug,
		votes,
	);

	return new Response(null, { status: 204 });
};
