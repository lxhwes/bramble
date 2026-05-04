/**
 * Pure helpers for building shortlist export payloads.
 *
 * Both functions are side-effect-free and deterministic: same inputs → same
 * output. The `now` parameter is injected so callers (route handlers) control
 * the timestamp rather than hiding it inside these functions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchInput {
	name: string;
	sex: 'M' | 'F';
	superSlugs: string[];
}

export interface ExportMatch {
	name: string;
	sex: 'M' | 'F';
	/** Partners who super-liked this name. */
	partners: string[];
}

export interface ExportJson {
	sessionId: string;
	/** ISO 8601 timestamp. */
	generatedAt: string;
	matches: ExportMatch[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort a copy of matches alphabetically by name. */
function sortedMatches(matches: MatchInput[]): MatchInput[] {
	return [...matches].sort((a, b) => a.name.localeCompare(b.name));
}

/** Escape special HTML characters to prevent injection in the HTML export. */
function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the JSON export payload for a shortlist.
 *
 * Matches are sorted alphabetically. `superSlugs` is exposed as `partners` to
 * keep the external shape decoupled from internal KV naming.
 */
export function buildShortlistJson(
	matches: MatchInput[],
	sessionId: string,
	now: Date,
): ExportJson {
	return {
		sessionId,
		generatedAt: now.toISOString(),
		matches: sortedMatches(matches).map((m) => ({
			name: m.name,
			sex: m.sex,
			partners: m.superSlugs,
		})),
	};
}

/**
 * Builds a self-contained, printable HTML document for a shortlist.
 *
 * The returned string is ready to serve directly as `text/html`. It includes
 * an inline `<style>` block with `@media print` rules so the page prints
 * cleanly without browser chrome.
 */
export function buildShortlistHtml(
	matches: MatchInput[],
	sessionId: string,
	now: Date,
): string {
	const sorted = sortedMatches(matches);
	const generatedAt = now.toISOString();

	const rows = sorted
		.map((m) => {
			const sexLabel = m.sex === 'M' ? 'boy' : 'girl';
			const sexClass = m.sex === 'M' ? 'badge-boy' : 'badge-girl';
			const partnersHtml =
				m.superSlugs.length > 0
					? ` <span class="star" title="Super-liked by ${escapeHtml(m.superSlugs.join(', '))}">★</span>`
					: '';
			return `    <li class="name-row">
      <span class="name">${escapeHtml(m.name)}</span>
      <span class="badge ${sexClass}">${sexLabel}</span>${partnersHtml}
    </li>`;
		})
		.join('\n');

	const emptyNote =
		sorted.length === 0
			? '<p class="empty">No mutual matches yet — keep swiping!</p>'
			: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bramble shortlist — ${escapeHtml(sessionId)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: system-ui, sans-serif;
    color: #1e293b;
    background: #fff;
    padding: 2rem;
    max-width: 40rem;
    margin: 0 auto;
  }

  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }

  .meta {
    font-size: 0.75rem;
    color: #64748b;
    margin-bottom: 1.5rem;
  }

  ul { list-style: none; border-top: 1px solid #e2e8f0; }

  .name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .name { font-size: 1.125rem; font-weight: 600; }

  .badge {
    border-radius: 9999px;
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .badge-boy  { background: #dbeafe; color: #1d4ed8; }
  .badge-girl { background: #fce7f3; color: #be185d; }

  .star { color: #0ea5e9; }

  .empty { color: #64748b; margin-top: 1rem; }

  @media print {
    body { padding: 0; max-width: 100%; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h1>Bramble shortlist</h1>
<p class="meta">Session: ${escapeHtml(sessionId)} &nbsp;·&nbsp; Generated: ${generatedAt}</p>
${sorted.length > 0 ? `<ul>\n${rows}\n</ul>` : emptyNote}
</body>
</html>`;
}
