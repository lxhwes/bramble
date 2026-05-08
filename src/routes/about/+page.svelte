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
			<li>A session lives in Cloudflare KV, keyed by a random session ID.</li>
			<li>Your swipes are tied to whichever name you picked on the join screen.</li>
			<li>No accounts, no email, no tracking pixels, no third-party analytics.</li>
			<li>Sessions and their votes are automatically deleted after 90 days of inactivity.</li>
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
			App code: MIT. Bundled name dataset: CC BY-SA 4.0. Source will be public once Phase 1 polish
			lands.
		</p>
	</section>
</main>
