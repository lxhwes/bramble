<script lang="ts">
	import type { Era, FilterState, Gender, Pop } from '$lib/filters';

	let { state, onchange }: { state: FilterState; onchange: (next: FilterState) => void } =
		$props();

	function handleGender(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as Gender;
		onchange({ ...state, gender: value });
	}

	function handleEra(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as Era;
		onchange({ ...state, era: value });
	}

	function handlePop(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value as Pop;
		onchange({ ...state, pop: value });
	}

	function handleStart(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		onchange({ ...state, startsWith: value === '' ? null : value });
	}

	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
</script>

<div class="flex flex-wrap items-center gap-2 text-xs text-gray-500">
	<div class="flex items-center gap-1">
		<label for="filter-gender" class="sr-only">Gender</label>
		<select
			id="filter-gender"
			value={state.gender}
			onchange={handleGender}
			class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 focus:outline-none"
		>
			<option value="both">Both</option>
			<option value="m">Boys</option>
			<option value="f">Girls</option>
		</select>
	</div>

	<div class="flex items-center gap-1">
		<label for="filter-era" class="sr-only">Era</label>
		<select
			id="filter-era"
			value={state.era}
			onchange={handleEra}
			class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 focus:outline-none"
		>
			<option value="any">Any era</option>
			<option value="1990s">1990s</option>
			<option value="2000s">2000s</option>
			<option value="2010s">2010s</option>
			<option value="2020s">2020s</option>
		</select>
	</div>

	<div class="flex items-center gap-1">
		<label for="filter-pop" class="sr-only">Popularity</label>
		<select
			id="filter-pop"
			value={state.pop}
			onchange={handlePop}
			class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 focus:outline-none"
		>
			<option value="any">Any pop.</option>
			<option value="rare">Rare</option>
			<option value="common">Common</option>
			<option value="very-common">Very common</option>
		</select>
	</div>

	<div class="flex items-center gap-1">
		<label for="filter-start" class="sr-only">Starts with</label>
		<select
			id="filter-start"
			value={state.startsWith ?? ''}
			onchange={handleStart}
			class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 focus:outline-none"
		>
			<option value="">Any letter</option>
			{#each letters as letter}
				<option value={letter}>{letter}</option>
			{/each}
		</select>
	</div>
</div>
