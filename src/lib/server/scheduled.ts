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
import { cloudflareStorage } from './storage/index.js';

export async function scheduled(
	_event: ScheduledEvent,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	ctx.waitUntil(
		(async () => {
			// Both bindings are required: pruning clears KV session meta as well
			// as the SQL rows.
			if (!env.DB || !env.VOTES) {
				console.warn('[prune] DB or VOTES binding not available; skipping');
				return;
			}
			const count = await pruneInactiveSessions(
				cloudflareStorage(env),
				Date.now(),
			);
			console.log(`[prune] pruned ${count} inactive session(s)`);
		})(),
	);
}
