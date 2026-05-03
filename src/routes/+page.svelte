<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
	<div class="text-center">
		<h1 class="text-5xl font-bold tracking-tight text-gray-900">Bramble</h1>
		<p class="mt-3 text-lg text-gray-500">Swipe baby names. Find mutual matches.</p>
	</div>

	{#if data.lastSession}
		<a
			href="/s/{data.lastSession}"
			class="rounded-2xl border border-rose-300 bg-rose-50 px-6 py-3 text-rose-700 shadow-sm hover:bg-rose-100 active:bg-rose-200"
		>
			Resume your session
		</a>
	{/if}

	<form method="POST">
		<button
			type="submit"
			class="rounded-2xl bg-rose-500 px-8 py-4 text-xl font-semibold text-white shadow-md transition-colors hover:bg-rose-600 active:bg-rose-700"
		>
			Start a session
		</button>
	</form>

	<p class="max-w-sm text-center text-sm text-gray-400">
		After starting, share the URL with your partner — both of you pick a name on the join screen
		and start swiping.
	</p>
</main>
