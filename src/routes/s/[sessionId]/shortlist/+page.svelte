<script lang="ts">
	import { enhance } from '$app/forms';
	import NameDetailSheet from '$lib/components/NameDetailSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let detailRequest = $state<{ name: string; sex: 'M' | 'F' } | null>(null);

	// Track which names are on the shortlist by key ("name|sex").
	// Initialised from server data; kept in sync via form actions + page reload.
	let shortlistKeys = $derived(
		new Set(data.shortlist.map((s) => `${s.name}|${s.sex}`)),
	);

	// View toggle: 'all' shows every match, 'shortlist' filters to shortlisted only.
	let view = $state<'all' | 'shortlist'>('all');

	let sorted = $derived(
		[...data.matches].sort((a, b) => a.name.localeCompare(b.name)),
	);

	let visible = $derived(
		view === 'all'
			? sorted
			: sorted.filter((m) => shortlistKeys.has(`${m.name}|${m.sex}`)),
	);
</script>

<main class="mx-auto max-w-md px-4 py-8">
	<a href="/s/{data.sessionId}/matches" class="text-sm text-slate-500 hover:text-slate-700">
		↩ Back to matches
	</a>

	<h1 class="mt-4 text-2xl font-bold">Shortlist</h1>
	<p class="mt-1 text-sm text-slate-500">
		{data.partnerSlugs.length} partners · {data.matches.length} mutual matches ·
		{data.shortlist.length} shortlisted
	</p>

	<div class="mt-3 flex flex-wrap gap-2">
		<button
			type="button"
			class="rounded-md border px-3 py-1.5 text-sm {view === 'all'
				? 'border-slate-700 bg-slate-700 text-white'
				: 'border-slate-300 text-slate-600 hover:bg-slate-50 active:bg-slate-100'}"
			onclick={() => (view = 'all')}
		>
			All matches ({data.matches.length})
		</button>
		<button
			type="button"
			class="rounded-md border px-3 py-1.5 text-sm {view === 'shortlist'
				? 'border-slate-700 bg-slate-700 text-white'
				: 'border-slate-300 text-slate-600 hover:bg-slate-50 active:bg-slate-100'}"
			onclick={() => (view = 'shortlist')}
		>
			Shortlist ({data.shortlist.length})
		</button>
	</div>

	{#if data.shortlist.length > 0}
		<div class="mt-3 flex flex-wrap gap-2">
			<a
				href="/s/{data.sessionId}/shortlist/export.json"
				download="bramble-shortlist.json"
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
			>
				Export shortlist (JSON)
			</a>
			<a
				href="/s/{data.sessionId}/shortlist/export.html"
				target="_blank"
				rel="noopener"
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 active:bg-slate-100"
			>
				Print / Save PDF
			</a>
		</div>
	{/if}

	{#if data.partnerSlugs.length < 2}
		<p class="mt-6 text-slate-600">Waiting for at least two partners to vote.</p>
	{:else if visible.length === 0 && view === 'shortlist'}
		<p class="mt-6 text-slate-600">
			No names shortlisted yet — tap ★ to add one.
		</p>
	{:else if visible.length === 0}
		<p class="mt-6 text-slate-600">No matches yet — keep swiping!</p>
	{:else}
		<ul class="mt-6 divide-y divide-slate-100">
			{#each visible as match (match.name + '|' + match.sex)}
				{@const key = `${match.name}|${match.sex}`}
				{@const shortlisted = shortlistKeys.has(key)}
				<li class="flex items-center gap-3 px-3 py-4">
					<button
						type="button"
						class="flex flex-1 items-center gap-3 text-left hover:opacity-75"
						onclick={() => (detailRequest = { name: match.name, sex: match.sex })}
						aria-label="Show details for {match.name}"
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
					</button>
					<form
						method="POST"
						action="?/{shortlisted ? 'remove' : 'add'}"
						use:enhance
						class="ml-auto"
					>
						<input type="hidden" name="name" value={match.name} />
						<input type="hidden" name="sex" value={match.sex} />
						<button
							type="submit"
							class="rounded-md border px-2.5 py-1 text-xs {shortlisted
								? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
								: 'border-slate-300 text-slate-500 hover:bg-slate-50 active:bg-slate-100'}"
							aria-label="{shortlisted ? 'Remove' : 'Add'} {match.name} {shortlisted
								? 'from'
								: 'to'} shortlist"
						>
							{shortlisted ? '★ Shortlisted' : '☆ Shortlist'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<NameDetailSheet bind:detail={detailRequest} />
</main>
