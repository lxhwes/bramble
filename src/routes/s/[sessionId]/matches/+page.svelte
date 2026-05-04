<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Client-side dismissed set. Key format matches getMatches: "name|sex".
	// No server persistence — per Phase 0 spec.
	let dismissed = $state(new Set<string>());

	// Visible list: sorted alphabetically, with dismissed entries filtered out.
	// Both derivations are reactive so they update if data or dismissed changes.
	let visible = $derived(
		[...data.matches]
			.sort((a, b) => a.name.localeCompare(b.name))
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

	<div class="mt-3 flex gap-2">
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
	</div>

	{#if data.partnerSlugs.length < 2}
		<p class="mt-6 text-slate-600">Waiting for at least two partners to vote.</p>
	{:else if visible.length === 0}
		<p class="mt-6 text-slate-600">No matches yet — keep swiping!</p>
	{:else}
		<ul class="mt-6 divide-y divide-slate-100">
			{#each visible as match (match.name + '|' + match.sex)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-50 active:bg-slate-100"
						onclick={() => dismiss(match.name, match.sex)}
					>
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
						<span class="ml-auto text-xs text-slate-400">tap to dismiss</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>
