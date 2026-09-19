// Pure validation for the join form on /s/[sessionId]. Returns one of three
// outcomes so the UI can render the right state:
//   - ok            → goto(?p={slug}) immediately
//   - format-error  → show inline error, user retypes
//   - needs-confirm → slug is in use and we have no storage proof this user
//                     claimed it; show "Continue as ‹slug›" / "Use a different
//                     name" UI. Trust model is URL = trust, so the server
//                     accepts the rejoin if the user confirms.

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

// HTML5 input pattern attribute. This gates the browser's own constraint
// validation ("Match the requested format"), which runs *before* our submit
// handler, so it has to accept everything `validateJoin` accepts — not just
// what a slug looks like after normalising. `validateJoin` trims and
// lowercases first, so the pattern allows surrounding whitespace (pasted or
// autofilled values carry it) and uppercase (iOS auto-capitalises the first
// letter of a text input, so "Alex" is what most phone users actually type).
//
// Browsers parse this in /v regex mode (modern Chromium 133+), which requires
// literal `-` inside a character class to be escaped with `\`, regardless of
// position. `[a-z0-9-]` and `[-a-z0-9]` both throw a /v SyntaxError. The HTML
// pattern attribute auto-anchors, so no `^...$`.
export const SLUG_HTML_PATTERN = '\\s*[A-Za-z0-9\\-]{1,32}\\s*';

// Shown by the browser alongside its own validation bubble, and reused as the
// inline error when our handler rejects the input.
export const SLUG_HINT = 'Use letters, numbers, or dashes (1-32 characters).';

export interface JoinContext {
	partnerSlugs: string[];
	savedSlug: string | null;
	cookieSlug: string | null;
}

export type JoinValidation =
	| { kind: 'ok'; slug: string }
	| { kind: 'format-error' }
	| { kind: 'needs-confirm'; slug: string };

export function validateJoin(input: string, ctx: JoinContext): JoinValidation {
	const slug = input.trim().toLowerCase();
	if (!SLUG_RE.test(slug)) return { kind: 'format-error' };

	const isTaken = ctx.partnerSlugs.includes(slug);
	if (!isTaken) return { kind: 'ok', slug };

	const isReturning = ctx.savedSlug === slug || ctx.cookieSlug === slug;
	if (isReturning) return { kind: 'ok', slug };

	return { kind: 'needs-confirm', slug };
}
