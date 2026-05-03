<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	interface NameEntry {
		name: string;
		sex: 'M' | 'F';
		peakYear: number;
		totalCount: number;
		origin?: string;
		meaning?: string;
	}

	interface PendingVote {
		name: string;
		sex: 'M' | 'F';
		vote: 'yes' | 'no' | 'super';
		ts: number;
	}

	let { data }: { data: PageData } = $props();

	// ---------------------------------------------------------------------------
	// Join form (slug is null)
	// ---------------------------------------------------------------------------
	let joinInput = $state('');

	function handleJoinSubmit(e: Event) {
		e.preventDefault();
		const val = joinInput.trim().toLowerCase();
		if (/^[a-z0-9-]{1,32}$/.test(val)) {
			goto(`?p=${encodeURIComponent(val)}`);
		}
	}

	// ---------------------------------------------------------------------------
	// Deck state
	// ---------------------------------------------------------------------------
	let names: NameEntry[] = $state([]);
	let deckIndex = $state(0);
	let pending: PendingVote[] = $state([]);
	let flushing = $state(false);

	// ---------------------------------------------------------------------------
	// Deterministic shuffle — mulberry32 PRNG + string-to-uint32 hash
	// ---------------------------------------------------------------------------

	function hashString(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
		}
		return h;
	}

	function mulberry32(seed: number): () => number {
		let s = seed;
		return () => {
			s |= 0;
			s = (s + 0x6d2b79f5) | 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function shuffle<T>(arr: T[], seed: number): T[] {
		const out = [...arr];
		const rand = mulberry32(seed);
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			const tmp = out[i];
			out[i] = out[j];
			out[j] = tmp;
		}
		return out;
	}

	// ---------------------------------------------------------------------------
	// Flush logic
	// ---------------------------------------------------------------------------

	async function flush() {
		if (flushing || pending.length === 0 || !data.slug) return;
		flushing = true;
		const batch = [...pending];
		try {
			const res = await fetch(`/s/${data.sessionId}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slug: data.slug, votes: batch }),
			});
			if (res.ok) {
				// Remove only the entries we sent, in case more arrived during the fetch.
				pending = pending.slice(batch.length);
			}
		} catch {
			// Keep pending; retry on next interval.
		} finally {
			flushing = false;
		}
	}

	function beaconFlush() {
		if (pending.length === 0 || !data.slug) return;
		const body = JSON.stringify({ slug: data.slug, votes: pending });
		if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
			navigator.sendBeacon(
				`/s/${data.sessionId}/vote`,
				new Blob([body], { type: 'application/json' }),
			);
		} else {
			fetch(`/s/${data.sessionId}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				keepalive: true,
			}).catch(() => {});
		}
	}

	function recordVote(vote: 'yes' | 'no' | 'super') {
		const entry = names[deckIndex];
		if (!entry) return;
		pending = [...pending, { name: entry.name, sex: entry.sex, vote, ts: Date.now() }];
		deckIndex += 1;
		if (pending.length >= 10) {
			flush();
		}
	}

	// ---------------------------------------------------------------------------
	// Drag state
	// ---------------------------------------------------------------------------
	let dragging = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let dx = $state(0);
	let dy = $state(0);
	let snapping = $state(false);

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		snapping = false;
		startX = e.clientX;
		startY = e.clientY;
		dx = 0;
		dy = 0;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		dx = e.clientX - startX;
		dy = e.clientY - startY;
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		if (Math.abs(dx) >= 80) {
			recordVote(dx > 0 ? 'yes' : 'no');
			dx = 0;
			dy = 0;
		} else if (dy <= -80) {
			recordVote('super');
			dx = 0;
			dy = 0;
		} else {
			// Snap back.
			snapping = true;
			dx = 0;
			dy = 0;
		}
	}

	// ---------------------------------------------------------------------------
	// Effects
	// ---------------------------------------------------------------------------

	$effect(() => {
		if (!data.slug) return;

		fetch('/names.json')
			.then((r) => r.json())
			.then((raw: unknown) => {
				const seed = hashString(data.sessionId);
				names = shuffle(raw as NameEntry[], seed);
			})
			.catch(() => {});

		const intervalId = setInterval(flush, 5000);

		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'ArrowLeft') recordVote('no');
			else if (e.key === 'ArrowRight') recordVote('yes');
			else if (e.key === 'ArrowUp') recordVote('super');
		}

		function onBeforeUnload() {
			beaconFlush();
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('beforeunload', onBeforeUnload);

		return () => {
			clearInterval(intervalId);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	const currentCard = $derived(names[deckIndex] ?? null);
	const remaining = $derived(names.length - deckIndex);
</script>

{#if data.slug === null}
	<!-- Join form -->
	<main class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
		<h1 class="text-2xl font-semibold">Join this session as…</h1>
		<form onsubmit={handleJoinSubmit} class="flex flex-col items-center gap-3">
			<input
				type="text"
				bind:value={joinInput}
				placeholder="your-name"
				pattern={'[a-z0-9-]{1,32}'}
				required
				class="rounded-lg border border-gray-300 px-4 py-2 text-center text-lg focus:border-indigo-500 focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700 active:bg-indigo-800"
			>
				Join
			</button>
		</form>
	</main>
{:else}
	<!-- Swipe deck -->
	<main class="flex min-h-screen flex-col items-center justify-between p-4">
		<div class="flex w-full max-w-sm flex-col items-center gap-6 pt-8">
			{#if currentCard !== null}
				<!-- Card -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<article
					class="flex h-72 w-full cursor-grab select-none flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white shadow-md active:cursor-grabbing"
					style="transform: translateX({dx}px) rotate({dx * 0.05}deg); transition: {snapping
						? 'transform 0.2s ease'
						: 'none'};"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
				>
					<span class="text-5xl font-bold tracking-tight">{currentCard.name}</span>
					<span class="text-2xl text-gray-400" aria-label={currentCard.sex === 'M' ? 'boy' : 'girl'}>
						{currentCard.sex === 'M' ? '♂' : '♀'}
					</span>
				</article>

				<!-- Hint -->
				<p class="text-sm text-gray-400">
					← no &nbsp;|&nbsp; yes → &nbsp;|&nbsp; ↑ super
				</p>

				<p class="text-xs text-gray-300">{remaining} remaining</p>
			{:else if names.length > 0}
				<p class="text-lg text-gray-500">You've swiped through all the names!</p>
			{:else}
				<p class="text-lg text-gray-400">Loading names…</p>
			{/if}
		</div>

		<!-- Footer -->
		<footer class="pb-4 text-sm text-gray-400">
			<a href="/s/{data.sessionId}/matches" class="underline hover:text-gray-600">Matches</a>
		</footer>
	</main>
{/if}
