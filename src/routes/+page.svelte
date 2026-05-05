<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
	<div class="flex flex-col items-center text-center">
		<svg viewBox="0 0 100 100" aria-hidden="true" class="h-40 w-40">
			<circle cx="40" cy="60" r="22" class="fill-coral-500" />
			<circle cx="62" cy="62" r="22" class="fill-coral-400" />
		</svg>
		<h1 class="mt-4 text-5xl font-bold tracking-tight text-gray-900">Bramble</h1>
		<p class="mt-3 text-lg text-gray-500">Swipe baby names. Find mutual matches.</p>
	</div>

	{#if data.lastSession}
		<a
			href="/s/{data.lastSession}"
			class="rounded-2xl border border-coral-300 bg-coral-50 px-6 py-3 text-coral-700 shadow-sm hover:bg-coral-100 active:bg-coral-200"
		>
			Resume your session
		</a>
	{/if}

	<form method="POST">
		<button
			type="submit"
			class="rounded-2xl bg-coral-500 px-8 py-4 text-xl font-semibold text-white shadow-md transition-colors hover:bg-coral-600 active:bg-coral-700"
		>
			Start a session
		</button>
	</form>

	<p class="max-w-sm text-center text-sm text-gray-400">
		After starting, share the URL with your partner — both of you pick a name on the join screen
		and start swiping.
	</p>
</main>
