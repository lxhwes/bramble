<script lang="ts">
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
	<div class="text-center">
		<h1 class="text-5xl font-bold tracking-tight text-gray-900">Bramble</h1>
		<p class="mt-3 text-lg text-gray-500">Swipe baby names. Find mutual matches.</p>
	</div>

	<form method="POST">
		<button
			type="submit"
			class="rounded-2xl bg-rose-500 px-8 py-4 text-xl font-semibold text-white shadow-md transition-colors hover:bg-rose-600 active:bg-rose-700"
		>
			Start a session
		</button>
	</form>

	<p class="max-w-sm text-center text-sm text-gray-400">
		After starting, share the URL with your partner — they'll join by opening it and adding
		<code class="font-mono">?p=their-name</code> to pick their own name.
	</p>
</main>
