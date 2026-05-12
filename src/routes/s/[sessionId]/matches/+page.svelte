<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side dismissed set. Key format matches getMatches: "name|sex".
	// No server persistence — per Phase 0 spec.
	let dismissed = $state(new Set<string>());

	// Sort toggle: 'newest' (default) puts the most recently crystallized match
	// at the top — the decision-aid frame couples want once they have a list to
	// pick from. 'alpha' is the original A–Z ordering.
	let sortMode = $state<'newest' | 'alpha'>('newest');

	// A match is "new" when its firstMatchedAt is within the last 24h. Captured
	// once at script init so the badge does not flicker as time elapses while
	// the page is open.
	const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;
	const newCutoff = Date.now() - NEW_BADGE_WINDOW_MS;

	// Visible list: sorted by current mode, with dismissed entries filtered out.
	// Both derivations are reactive so they update if data, sort, or dismissed change.
	let visible = $derived(
		[...data.matches]
			.sort((a, b) =>
				sortMode === 'newest'
					? b.firstMatchedAt - a.firstMatchedAt
					: a.name.localeCompare(b.name),
			)
			.filter((m) => !dismissed.has(`${m.name}|${m.sex}`)),
	);

	function dismiss(name: string, sex: 'M' | 'F') {
		dismissed = new Set(dismissed).add(`${name}|${sex}`);
	}
</script>

<main class="mx-auto max-w-md px-4 py-8">
	<a href="/s/{data.sessionId}" class="text-sm text-slate-500 hover:text-slate-700">
		← Back to swipes
	</a>

	<h1 class="mt-4 text-2xl font-bold">Matches</h1>
	<p class="mt-1 text-sm text-slate-500">
		{data.partnerSlugs.length} partners · {data.matches.length} mutual yeses
	</p>

	<div class="mt-3 flex flex-wrap gap-2">
		<a
			href="/s/{data.sessionId}/matches/export.json"
			download="bramble-shortlist.json"
			class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
		>
			Export JSON
		</a>
		<a
			href="/s/{data.sessionId}/matches/export.html"
			target="_blank"
			rel="noopener"
			class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
		>
			Print / Save PDF
		</a>
		<a
			href="/s/{data.sessionId}/shortlist"
			class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
		>
			View shortlist
		</a>
		<a
			href="/s/{data.sessionId}/stats"
			class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
		>
			View stats
		</a>
	</div>

	{#if visible.length > 0 || data.matches.length > 0}
		<div class="mt-4 flex items-center gap-2 text-xs text-slate-500" role="group" aria-label="Sort matches">
			<span>Sort:</span>
			<button
				type="button"
				class="rounded-md border px-2 py-1 {sortMode === 'newest'
					? 'border-slate-700 bg-slate-700 text-white'
					: 'border-slate-300 text-slate-600 hover:bg-slate-50 active:bg-slate-100'}"
				aria-pressed={sortMode === 'newest'}
				onclick={() => (sortMode = 'newest')}
			>
				Newest
			</button>
			<button
				type="button"
				class="rounded-md border px-2 py-1 {sortMode === 'alpha'
					? 'border-slate-700 bg-slate-700 text-white'
					: 'border-slate-300 text-slate-600 hover:bg-slate-50 active:bg-slate-100'}"
				aria-pressed={sortMode === 'alpha'}
				onclick={() => (sortMode = 'alpha')}
			>
				A–Z
			</button>
		</div>
	{/if}

	{#if data.partnerSlugs.length < 2}
		<p class="mt-6 text-slate-600">Waiting for at least two partners to vote.</p>
	{:else if visible.length === 0}
		<p class="mt-6 text-slate-600">No matches yet — keep swiping!</p>
	{:else}
		<ul class="mt-6 divide-y divide-slate-100">
			{#each visible as match (match.name + '|' + match.sex)}
				{@const isNew = match.firstMatchedAt >= newCutoff}
				<li>
					<button
						type="button"
						class="flex w-full flex-col items-start gap-1 px-3 py-4 text-left hover:bg-slate-50 active:bg-slate-100"
						onclick={() => dismiss(match.name, match.sex)}
					>
						<div class="flex w-full items-center gap-3">
							<span class="text-lg font-semibold text-slate-900">{match.name}</span>
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium {match.sex === 'M'
									? 'bg-blue-100 text-blue-700'
									: 'bg-pink-100 text-pink-700'}"
							>
								{match.sex === 'M' ? 'boy' : 'girl'}
							</span>
							{#if match.superSlugs.length > 0}
								<span
									class="text-sky-500"
									aria-label="Super-liked by {match.superSlugs.join(', ')}"
									title="Super-liked by {match.superSlugs.join(', ')}"
								>
									★
								</span>
							{/if}
							{#if isNew}
								<span
									class="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700"
									title="Matched within the last 24 hours"
								>
									✨ New
								</span>
							{/if}
							<span class="ml-auto text-xs text-slate-400">tap to dismiss</span>
						</div>
						<span class="text-xs text-slate-500">
							<span class="font-medium text-slate-600">{match.firstLikedBy}</span> liked first
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>
