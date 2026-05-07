// Per-browser cookie remembering which sessions this browser has joined and
// the slug used in each. Replaces the older `bramble_last_session` cookie that
// only tracked a single session id without the slug.
//
// Trust model: the slug here is a UX hint, not proof of ownership. Anyone with
// the session URL can still claim any unused slug — see docs/ARCHITECTURE.md.

export interface SessionEntry {
	sessionId: string;
	slug: string | null;
	lastSeen: number;
}

export const MAX_SESSIONS = 10;
export const SESSIONS_COOKIE = 'bramble_sessions';
export const LEGACY_COOKIE = 'bramble_last_session';

export function parseSessionsCookie(value: string | undefined): SessionEntry[] {
	if (!value) return [];
	let raw: unknown;
	try {
		raw = JSON.parse(value);
	} catch {
		return [];
	}
	if (!Array.isArray(raw)) return [];
	const entries: SessionEntry[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const obj = item as Record<string, unknown>;
		if (typeof obj.sessionId !== 'string' || obj.sessionId === '') continue;
		const slug =
			typeof obj.slug === 'string' && obj.slug !== '' ? obj.slug : null;
		const lastSeen = typeof obj.lastSeen === 'number' ? obj.lastSeen : 0;
		entries.push({ sessionId: obj.sessionId, slug, lastSeen });
	}
	return entries;
}

export function serializeSessionsCookie(entries: SessionEntry[]): string {
	return JSON.stringify(entries);
}

// Move sessionId to the front of the list, updating slug (if provided) and
// lastSeen. Caps at MAX_SESSIONS by evicting the oldest tail entries.
export function upsertSession(
	entries: SessionEntry[],
	sessionId: string,
	slug: string | null,
	lastSeen: number,
): SessionEntry[] {
	const existing = entries.find((e) => e.sessionId === sessionId);
	const rest = entries.filter((e) => e.sessionId !== sessionId);
	const merged: SessionEntry = {
		sessionId,
		// Don't clobber a previously-saved slug with null when the caller doesn't
		// know it (e.g. server load before slug query param is read).
		slug: slug ?? existing?.slug ?? null,
		lastSeen,
	};
	return [merged, ...rest].slice(0, MAX_SESSIONS);
}

export function readLegacyCookie(value: string | undefined): string | null {
	if (!value) return null;
	return value;
}
