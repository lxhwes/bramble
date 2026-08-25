<script lang="ts">
	// The data-handling disclosure has to describe the deployment the reader is
	// actually looking at. Cloudflare Pages auto-injects a Web Analytics beacon
	// on the maintainer's hosted demo; a self-hosted Node instance has no
	// analytics code path at all, so claiming otherwise would be a false
	// privacy disclosure published by the operator.
	//
	// __BRAMBLE_TARGET__ is a Vite build-time constant, so this resolves at
	// build time. Note that both branches' markup still ships — Svelte compiles
	// {#if} into template code that Rollup does not tree-shake — so this is a
	// correctness measure, not a bundle-size one.
	const isHostedDemo = __BRAMBLE_TARGET__ === 'cloudflare';
</script>

<svelte:head>
	<title>About · Bramble</title>
	<meta
		name="description"
		content="Bramble is a free, open-source baby name app for couples. Swipe independently, find mutual matches."
	/>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-8 px-4 py-12 text-gray-800">
	<header class="space-y-2">
		<a href="/" class="text-sm text-gray-400 underline hover:text-gray-600">← Home</a>
		<h1 class="font-display text-4xl font-bold tracking-tight text-gray-900">About Bramble</h1>
	</header>

	<section class="space-y-3 text-lg leading-relaxed">
		<p>
			Bramble is a free, open-source baby name app for couples — or anyone — trying to find a name
			they all like. You both swipe through the same names independently, and the app surfaces the
			ones you both said yes to. No accounts. No paywall.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-2xl font-semibold text-gray-900">How it works</h2>
		<ol class="list-decimal space-y-2 pl-6 text-gray-700">
			<li>One person taps "Start a session" and shares the URL.</li>
			<li>Each person picks a name on the join screen and starts swiping.</li>
			<li>The matches page shows the names you both swiped right on.</li>
		</ol>
		<p class="text-gray-700">That's the whole product.</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-2xl font-semibold text-gray-900">Where the names come from</h2>
		<p class="text-gray-700">The name list combines two public datasets:</p>
		<ul class="list-disc space-y-2 pl-6 text-gray-700">
			<li>
				<strong>US Social Security Administration</strong> — name frequencies from every year back
				to 1880 (public domain).
			</li>
			<li>
				<strong>Behind the Name</strong> — gender and related-name data, distributed under
				<a
					href="https://creativecommons.org/licenses/by-sa/4.0/"
					class="text-coral-700 underline hover:text-coral-800">CC BY-SA 4.0</a
				>.
			</li>
		</ul>
		<p class="text-gray-700">
			Because the bundled dataset includes Behind the Name content, the dataset itself is also CC
			BY-SA 4.0. The app code is MIT.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-2xl font-semibold text-gray-900">What happens to your data</h2>
		<ul class="list-disc space-y-2 pl-6 text-gray-700">
			{#if isHostedDemo}
				<li>A session lives in Cloudflare's storage, keyed by a random session ID.</li>
			{:else}
				<li>A session lives in this instance's database, keyed by a random session ID.</li>
			{/if}
			<li>Your swipes are tied to whichever name you picked on the join screen.</li>
			<li>No accounts, no email, no tracking pixels, no cross-site advertising.</li>
			{#if isHostedDemo}
				<li>
					Bramble uses Cloudflare Web Analytics (cookie-less, no fingerprinting) to count anonymous
					pageviews so I can tell whether anyone is using this thing.
				</li>
				<li>Sessions and their votes are automatically deleted after 90 days of inactivity.</li>
			{:else}
				<li>This instance collects no analytics and no telemetry of any kind.</li>
				<li>
					Sessions and their votes are automatically deleted after a period of inactivity set by
					whoever runs this instance (90 days by default).
				</li>
			{/if}
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-2xl font-semibold text-gray-900">Why I built it</h2>
		<p class="text-gray-700">
			The other baby name swipe apps charge for the swipe-and-match feature — the one feature
			that's actually the whole point. The underlying data is public. So this exists.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-2xl font-semibold text-gray-900">Open source</h2>
		<p class="text-gray-700">
			App code: MIT. Bundled name dataset: CC BY-SA 4.0. The source is on
			<a
				href="https://github.com/lxhwes/bramble"
				class="text-coral-700 underline hover:text-coral-800">GitHub</a
			>, and you can run your own copy with Docker.
		</p>
	</section>
</main>
