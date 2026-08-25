import { describe, expect, it } from 'vitest';
import { shouldDropBatch } from './vote-retry.js';

describe('shouldDropBatch', () => {
	it('drops a batch the server stored', () => {
		expect(shouldDropBatch(204)).toBe(true);
		expect(shouldDropBatch(200)).toBe(true);
	});

	it('keeps a batch when the server failed transiently', () => {
		// SQL is the only vote store, so a 5xx means the batch is gone unless the
		// client replays it. INSERT OR IGNORE makes the replay idempotent.
		expect(shouldDropBatch(500)).toBe(false);
		expect(shouldDropBatch(502)).toBe(false);
		expect(shouldDropBatch(503)).toBe(false);
	});

	it('keeps a batch that was rate limited', () => {
		// The one 4xx worth replaying: the votes are valid, the window is not.
		expect(shouldDropBatch(429)).toBe(false);
	});

	it('drops a batch the server will never accept', () => {
		// Retrying these forever is the bug this guards: the 5s flush interval
		// would replay the identical doomed payload for the life of the tab.
		expect(shouldDropBatch(404)).toBe(true);
		expect(shouldDropBatch(400)).toBe(true);
		expect(shouldDropBatch(410)).toBe(true);
		expect(shouldDropBatch(413)).toBe(true);
	});

	it('keeps a batch on an unexpected status', () => {
		// Conservative default: an unrecognised response is not proof the votes
		// were rejected, and discarding them would be silent data loss.
		expect(shouldDropBatch(0)).toBe(false);
		expect(shouldDropBatch(302)).toBe(false);
	});
});
