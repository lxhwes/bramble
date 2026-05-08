/**
 * Cloudflare scheduled event handler.
 *
 * Called by the Cloudflare runtime when the cron trigger fires.  Runs session
 * pruning and logs the result.  No response is returned (scheduled events are
 * fire-and-forget from the Worker's perspective).
 *
 * This module is imported by the Vite plugin (scripts/patch-worker.ts) that
 * appends the `scheduled` export to the adapter-generated _worker.js.
 */

import { pruneInactiveSessions } from './prune.js';

export async function scheduled(
	_event: ScheduledEvent,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	ctx.waitUntil(
		(async () => {
			const db = env.DB;
			if (!db) {
				console.warn('[prune] D1 binding DB not available; skipping');
				return;
			}
			const count = await pruneInactiveSessions(db, Date.now());
			console.log(`[prune] pruned ${count} inactive session(s)`);
		})(),
	);
}
