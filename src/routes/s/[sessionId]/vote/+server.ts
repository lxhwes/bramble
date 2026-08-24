import { error } from '@sveltejs/kit';
import type { VoteEntry } from '$lib/server/sessions';
import { appendVotes } from '$lib/server/sessions';
import { getStorage } from '$lib/server/storage';
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

	const env = await getStorage(platform);
	try {
		await appendVotes(env, params.sessionId, slug, votes);
	} catch (err) {
		// SQL is the only store for votes, so a failure here means the batch is
		// gone unless the caller retries. The client keeps the batch on any
		// non-2xx and retries on its 5s flush interval, and the insert is
		// idempotent, so a 500 is a retry signal rather than an error to show.
		console.error(
			`[vote] appendVotes failed (session=${params.sessionId}, slug=${slug}):`,
			err,
		);
		throw error(500, 'vote-write-failed');
	}

	return new Response(null, { status: 204 });
};
