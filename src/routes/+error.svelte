<script lang="ts">
	import { page } from '$app/state';

	let status = $derived(page.status);
	let message = $derived(page.error?.message ?? 'Something went wrong');
	let isNotFound = $derived(status === 404);
</script>

<svelte:head>
	<title>{isNotFound ? 'Not found' : 'Error'} · Bramble</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-12 text-center">
	<p class="text-sm font-semibold uppercase tracking-wider text-coral-600">
		{status}
	</p>
	<h1 class="mt-2 text-4xl font-bold tracking-tight text-gray-900">
		{isNotFound ? 'Page not found' : 'Something went wrong'}
	</h1>
	<p class="mt-4 max-w-md text-lg text-gray-600">
		{#if isNotFound}
			That URL doesn't go anywhere. The session may have expired, or the link may be wrong.
		{:else}
			{message}
		{/if}
	</p>

	<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
		<a
			href="/"
			class="rounded-2xl bg-coral-500 px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-coral-600 active:bg-coral-700"
		>
			Start a session
		</a>
		<a
			href="/about"
			class="rounded-2xl border border-sage-300 bg-sage-50 px-6 py-3 font-semibold text-sage-800 transition-colors hover:bg-sage-100"
		>
			About Bramble
		</a>
	</div>
</main>
