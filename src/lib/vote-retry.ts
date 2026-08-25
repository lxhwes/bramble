// Decides whether the swipe page may discard a vote batch after a flush.
//
// SQL is the only store for votes, so the client holding its batch on failure
// is the sole thing standing between a transient 500 and permanent vote loss.
// The flip side is that a batch the server will *never* accept -- an unknown
// session, a malformed payload -- used to be replayed every 5s for the life of
// the tab, logging a server-side error each time and never recovering.
//
// Retryable and permanent are distinguished by status class rather than by
// response body, so a new 4xx on the vote route gets the right treatment
// without a matching client change.

/**
 * True when the batch can be dropped from `pending`: either the server stored
 * it, or it rejected the batch in a way that replaying cannot fix.
 *
 * False means keep the batch and retry on the next flush interval.
 */
export function shouldDropBatch(status: number): boolean {
	// Stored.
	if (status >= 200 && status < 300) return true;
	// Rate limited: the votes are fine, the window is not.
	if (status === 429) return false;
	// Any other 4xx is a permanent rejection -- replaying changes nothing.
	if (status >= 400 && status < 500) return true;
	// 5xx and anything unrecognised: not proof the votes were rejected, so
	// keeping them is the safe default.
	return false;
}
