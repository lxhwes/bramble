import { checkStorage, publicHealthBody } from '$lib/server/health';
import { getStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

/**
 * Container health probe. 200 when storage is reachable, 503 otherwise.
 *
 * getStorage() is inside the try because it is where the node target opens the
 * database and applies migrations — an unwritable /data volume throws here
 * rather than at query time.
 */
export const GET: RequestHandler = async ({ platform }) => {
	let result: Awaited<ReturnType<typeof checkStorage>>;
	try {
		result = await checkStorage(await getStorage(platform));
	} catch (err) {
		result = {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	if (!result.ok) {
		// The only place the reason is disclosed — see publicHealthBody.
		console.error('[healthz] storage check failed:', result.error);
	}

	return new Response(JSON.stringify(publicHealthBody(result)), {
		status: result.ok ? 200 : 503,
		headers: {
			'content-type': 'application/json',
			// A cached health probe is worse than no health probe.
			'cache-control': 'no-store',
		},
	});
};
