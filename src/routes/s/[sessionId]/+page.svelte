<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import NameDetailSheet from '$lib/components/NameDetailSheet.svelte';
	import {
		applyFilters,
		parseFilters,
		serializeFilters,
		type FilterState,
		type NameEntry,
	} from '$lib/filters';
	import { SLUG_HTML_PATTERN, validateJoin } from '$lib/join-validation';
	import { shouldDropBatch } from '$lib/vote-retry';

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
	let joinError = $state<string | null>(null);
	// Holds the slug awaiting "Continue as ‹slug›" confirmation when the slug
	// is in use and we have no storage proof this user claimed it. URL = trust
	// is the model: server accepts the rejoin once the user confirms.
	let pendingConfirmSlug = $state<string | null>(null);

	// Per-session localStorage key. Survives reloads so a returning partner
	// doesn't have to retype their slug; cleared by Switch Partner.
	const slugStorageKey = $derived(`bramble_slug:${data.sessionId}`);

	function handleJoinSubmit(e: Event) {
		e.preventDefault();
		const savedSlug =
			typeof localStorage !== 'undefined' ? localStorage.getItem(slugStorageKey) : null;
		const result = validateJoin(joinInput, {
			partnerSlugs: data.partnerSlugs ?? [],
			savedSlug,
			cookieSlug: data.cookieSlug ?? null,
		});
		if (result.kind === 'format-error') {
			joinError = 'Use lowercase letters, numbers, or dashes (1–32 chars).';
			pendingConfirmSlug = null;
			return;
		}
		if (result.kind === 'needs-confirm') {
			joinError = null;
			pendingConfirmSlug = result.slug;
			return;
		}
		joinError = null;
		pendingConfirmSlug = null;
		goto(`?p=${encodeURIComponent(result.slug)}`);
	}

	function confirmRejoin() {
		if (pendingConfirmSlug === null) return;
		const slug = pendingConfirmSlug;
		pendingConfirmSlug = null;
		goto(`?p=${encodeURIComponent(slug)}`);
	}

	function cancelConfirm() {
		pendingConfirmSlug = null;
	}

	function clearSavedSlug() {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(slugStorageKey);
		}
	}

	// ---------------------------------------------------------------------------
	// Deck state
	// ---------------------------------------------------------------------------
	let rawNames: NameEntry[] = $state([]);
	let deckIndex = $state(0);
	let pending: PendingVote[] = $state([]);
	// Votes held locally before graduation; user can undo anything still here.
	let undoStack: PendingVote[] = $state([]);
	let flushing = $state(false);

	const filterState = $derived<FilterState>(parseFilters(page.url.searchParams));

	// Build the set of name|sex keys already voted on at page-load time so we
	// can skip those positions in the deck without disturbing the shuffle order.
	const skipSet = $derived(
		new Set((data.slug ? data.votes : []).map((v) => `${v.name}|${v.sex}`)),
	);

	const names = $derived(
		rawNames.length === 0
			? []
			: applyFilters(shuffle(rawNames, hashString(data.sessionId)), filterState).filter(
					(n) => !skipSet.has(`${n.name}|${n.sex}`),
				),
	);

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
			if (shouldDropBatch(res.status)) {
				// Remove only the entries we sent, in case more arrived during the fetch.
				// Dropped on success and on a permanent rejection alike — see
				// vote-retry.ts for why a doomed batch must not be replayed forever.
				pending = pending.slice(batch.length);
			}
		} catch {
			// Keep pending; retry on next interval.
		} finally {
			flushing = false;
		}
	}

	function beaconFlush() {
		if (pending.length === 0 && undoStack.length === 0) return;
		if (!data.slug) return;
		// On tab close, any votes still in the undoStack are real (not undone) — merge them in.
		const body = JSON.stringify({ slug: data.slug, votes: [...pending, ...undoStack] });
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
		const newVote: PendingVote = { name: entry.name, sex: entry.sex, vote, ts: Date.now() };
		const nextStack = [...undoStack, newVote];
		// Oldest vote graduates to the flush queue once the stack exceeds its 5-slot capacity.
		if (nextStack.length > 5) {
			const [graduated, ...rest] = nextStack;
			pending = [...pending, graduated];
			undoStack = rest;
		} else {
			undoStack = nextStack;
		}
		deckIndex += 1;
		if (pending.length >= 10) {
			flush();
		}
	}

	function undo() {
		if (undoStack.length === 0) return;
		// Discard the most recent vote; it was never sent so no server-side delete needed.
		undoStack = undoStack.slice(0, -1);
		deckIndex -= 1;
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
	// Timestamp captured on pointerdown; used to distinguish tap from drag.
	let pointerStartTs = $state(0);

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		snapping = false;
		startX = e.clientX;
		startY = e.clientY;
		dx = 0;
		dy = 0;
		pointerStartTs = e.timeStamp;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		dx = e.clientX - startX;
		dy = e.clientY - startY;
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		// A tap is a short, stationary pointer gesture — distinct from a drag swipe.
		const dt = e.timeStamp - pointerStartTs;
		const isTap = Math.abs(dx) < 5 && Math.abs(dy) < 5 && dt < 250;
		if (isTap) {
			openDetail();
			dragging = false;
			dx = 0;
			dy = 0;
			return; // do NOT fall through to swipe-decision
		}
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
	// Name detail bottom-sheet
	// ---------------------------------------------------------------------------
	// Bound to <NameDetailSheet /> — when non-null the sheet shows the entry.
	let detailRequest = $state<{ name: string; sex: 'M' | 'F' } | null>(null);

	function openDetail() {
		const entry = names[deckIndex];
		if (!entry) return;
		detailRequest = { name: entry.name, sex: entry.sex };
	}

	// ---------------------------------------------------------------------------
	// Effects
	// ---------------------------------------------------------------------------

	$effect(() => {
		// Reset deck index whenever filters change so the user sees results from position 0.
		// Graduate any pending-undo votes first — they're real swipes against the old filter set.
		// Wrap the writes in untrack so the effect's dependency set stays scoped to filterState;
		// otherwise reading pending/undoStack would loop the effect against its own writes.
		JSON.stringify(filterState);
		untrack(() => {
			if (undoStack.length > 0) {
				pending = [...pending, ...undoStack];
				undoStack = [];
			}
			deckIndex = 0;
		});
	});

	function updateFilters(next: FilterState) {
		const params = serializeFilters(next);
		if (data.slug) params.set('p', data.slug);
		const qs = params.toString();
		const url = qs ? `?${qs}` : window.location.pathname;
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	$effect(() => {
		// Pre-fill the join form: localStorage first (per-browser-per-session),
		// then cookieSlug from the server (survives a localStorage wipe). Wrap
		// reads/writes in untrack so the effect runs once per slug-state change,
		// not on every keystroke (joinInput is reactive — see svelte5_effect_loops note).
		if (data.slug !== null) return;
		const saved =
			typeof localStorage !== 'undefined' ? localStorage.getItem(slugStorageKey) : null;
		const prefill = saved ?? data.cookieSlug ?? null;
		if (prefill === null) return;
		untrack(() => {
			if (joinInput === '') joinInput = prefill;
		});
	});

	$effect(() => {
		if (!data.slug) return;

		// Persist the slug for this session so reloads don't need ?p=.
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(slugStorageKey, data.slug);
		}

		fetch('/names.json')
			.then((r) => r.json())
			.then((raw: unknown) => {
				rawNames = raw as NameEntry[];
			})
			.catch(() => {});

		const intervalId = setInterval(flush, 5000);

		// Live match polling — diff each response against the previous, fire a
		// toast for newly mutual names. lastSeenMatchKeys is null on first call
		// so the cold-start response becomes the baseline (no toast for matches
		// that already existed when the page loaded).
		let lastSeenMatchKeys: Set<string> | null = null;

		async function pollMatches() {
			try {
				const res = await fetch(`/s/${data.sessionId}/matches.json`);
				if (!res.ok) return;
				const body = (await res.json()) as {
					matches: Array<{ name: string; sex: 'M' | 'F' }>;
				};
				const currentKeys = new Set(
					body.matches.map((m) => `${m.name}|${m.sex}`),
				);
				if (lastSeenMatchKeys === null) {
					lastSeenMatchKeys = currentKeys;
					return;
				}
				const fresh = body.matches.filter(
					(m) => !lastSeenMatchKeys?.has(`${m.name}|${m.sex}`),
				);
				if (fresh.length > 0) {
					newMatchToast =
						fresh.length === 1
							? `It's a match: ${fresh[0].name}!`
							: `${fresh.length} new matches!`;
					if (newMatchTimeoutId !== null) clearTimeout(newMatchTimeoutId);
					newMatchTimeoutId = setTimeout(() => {
						newMatchToast = null;
						newMatchTimeoutId = null;
					}, 4000);
				}
				lastSeenMatchKeys = currentKeys;
			} catch {
				// Silent — retry next interval.
			}
		}

		void pollMatches();
		const matchPollId = setInterval(pollMatches, 30000);

		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'ArrowLeft') recordVote('no');
			else if (e.key === 'ArrowRight') recordVote('yes');
			else if (e.key === 'ArrowUp') recordVote('super');
			else if (e.key.toLowerCase() === 'z') undo();
		}

		function onBeforeUnload() {
			beaconFlush();
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('beforeunload', onBeforeUnload);

		return () => {
			clearInterval(intervalId);
			clearInterval(matchPollId);
			if (newMatchTimeoutId !== null) {
				clearTimeout(newMatchTimeoutId);
				newMatchTimeoutId = null;
			}
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	const currentCard = $derived(names[deckIndex] ?? null);
	const remaining = $derived(names.length - deckIndex);

	// Snapshot-at-load partner progress hint. Compares the leading "other"
	// partner to the current swiper. Returns null when there's no other
	// partner or when everyone is tied (nothing meaningful to report).
	const partnerProgressText = $derived.by(() => {
		const counts = data.partnerVoteCounts;
		if (!data.slug || counts === undefined) return null;
		const others = (data.partnerSlugs ?? []).filter((s) => s !== data.slug);
		if (others.length === 0) return null;
		const myCount = counts[data.slug] ?? 0;
		let leadSlug = others[0];
		let leadCount = counts[leadSlug] ?? 0;
		for (const s of others.slice(1)) {
			const c = counts[s] ?? 0;
			if (c > leadCount) {
				leadSlug = s;
				leadCount = c;
			}
		}
		if (leadCount > myCount) return `${leadSlug} is +${leadCount - myCount}`;
		if (myCount > leadCount) return `you're +${myCount - leadCount} ahead`;
		return null;
	});

	// Background tint that ramps with drag distance to signal swipe direction.
	const tint = $derived.by(() => {
		if (!dragging && !snapping) return 'white';
		const ax = Math.min(Math.abs(dx) / 200, 1);
		const ay = Math.min(Math.abs(dy) / 200, 1);
		if (dy <= -80) {
			// Blue tint when pulling up past super threshold.
			return `rgba(56, 189, 248, ${Math.max(ay, 0.4)})`;
		}
		if (dx >= 80) return `rgba(70, 130, 105, ${Math.max(ax, 0.4)})`;
		if (dx <= -80) return `rgba(220, 100, 80, ${Math.max(ax, 0.4)})`;
		// In the pre-threshold range — gentle hint without committing.
		if (Math.abs(dx) > 0) {
			return dx > 0
				? `rgba(70, 130, 105, ${ax * 0.3})`
				: `rgba(220, 100, 80, ${ax * 0.3})`;
		}
		if (dy < 0) return `rgba(56, 189, 248, ${ay * 0.3})`;
		return 'transparent';
	});

	// ---------------------------------------------------------------------------
	// Live match toast
	// ---------------------------------------------------------------------------
	let newMatchToast = $state<string | null>(null);
	let newMatchTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// ---------------------------------------------------------------------------
	// Share + switch partner
	// ---------------------------------------------------------------------------
	let toastVisible = $state(false);
	let qrSvg = $state<string | null>(null);
	let qrLoading = $state(false);

	function shareUrl(): string {
		return `${window.location.origin}/s/${data.sessionId}`;
	}

	async function share() {
		if (typeof navigator === 'undefined') return;
		const url = shareUrl();
		const payload = {
			title: 'Bramble',
			text: 'Help me pick a baby name 🌱',
			url,
		};
		// Prefer the native share sheet on platforms that support it (iOS/Android,
		// recent Chrome/Edge). Fall back to clipboard everywhere else.
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share(payload);
				return;
			} catch (err) {
				// User dismissed the sheet — don't fall through to clipboard.
				if (err instanceof Error && err.name === 'AbortError') return;
				// Any other failure: fall through to the clipboard path below.
			}
		}
		if (!navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(url);
			toastVisible = true;
			setTimeout(() => {
				toastVisible = false;
			}, 2000);
		} catch {
			// Permission denied or unsupported — silent failure is acceptable.
		}
	}

	async function toggleQr() {
		if (qrSvg !== null) {
			qrSvg = null;
			return;
		}
		qrLoading = true;
		try {
			// Lazy import keeps the ~50KB qrcode library out of the initial bundle.
			const { default: QRCode } = await import('qrcode');
			qrSvg = await QRCode.toString(shareUrl(), {
				type: 'svg',
				margin: 1,
				width: 200,
			});
		} catch {
			qrSvg = null;
		} finally {
			qrLoading = false;
		}
	}
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
				pattern={SLUG_HTML_PATTERN}
				required
				disabled={pendingConfirmSlug !== null}
				oninput={() => {
					joinError = null;
					pendingConfirmSlug = null;
				}}
				class="rounded-lg border border-gray-300 px-4 py-2 text-center text-lg focus:border-sage-500 focus:outline-none disabled:opacity-50"
			/>
			{#if pendingConfirmSlug === null}
				<button
					type="submit"
					class="rounded-lg bg-sage-600 px-6 py-2 text-white hover:bg-sage-700 active:bg-sage-800"
				>
					Join
				</button>
			{/if}
		</form>
		{#if joinError !== null}
			<p class="text-sm text-coral-600" role="alert">{joinError}</p>
		{/if}
		{#if pendingConfirmSlug !== null}
			<div class="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-coral-200 bg-coral-50 p-4 text-center">
				<p class="text-sm text-coral-800">
					“{pendingConfirmSlug}” is already in this session. If you joined before and lost your
					saved data, continue as <span class="font-medium">{pendingConfirmSlug}</span>.
					Otherwise pick a different name to keep votes separate.
				</p>
				<div class="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onclick={confirmRejoin}
						class="rounded-lg bg-sage-600 px-4 py-2 text-sm text-white hover:bg-sage-700 active:bg-sage-800"
					>
						Continue as {pendingConfirmSlug}
					</button>
					<button
						type="button"
						onclick={cancelConfirm}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Use a different name
					</button>
				</div>
			</div>
		{/if}
		{#if (data.partnerSlugs ?? []).length === 0}
			<p class="text-sm text-gray-400">You're the first one in.</p>
		{:else}
			<p class="text-sm text-gray-500">
				{(data.partnerSlugs ?? []).length} already here:
				<span class="font-medium text-gray-700">{(data.partnerSlugs ?? []).join(', ')}</span>
			</p>
		{/if}
	</main>
{:else}
	<!-- Swipe deck -->
	<main class="flex min-h-screen flex-col items-center justify-between p-4">
		<div class="flex w-full max-w-sm flex-col items-center gap-6 pt-8">
			<!-- Toolbar: identity (left) + share (right) -->
			<div class="flex w-full items-center justify-between gap-3">
				<div class="flex flex-col text-sm leading-tight">
					<span class="text-gray-500">
						swiping as <span class="font-medium text-gray-800">{data.slug}</span>
					</span>
					<div class="flex items-center gap-2 text-xs text-gray-400">
						<a
							href="/s/{data.sessionId}"
							onclick={clearSavedSlug}
							class="underline hover:text-gray-600"
						>
							switch
						</a>
						{#if partnerProgressText !== null}
							<span aria-live="polite">· {partnerProgressText}</span>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={toggleQr}
						aria-label={qrSvg !== null ? 'Hide QR code' : 'Show QR code'}
						aria-pressed={qrSvg !== null}
						class="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
					>
						{qrLoading ? '…' : 'QR'}
					</button>
					<button
						type="button"
						onclick={share}
						class="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
					>
						Share
					</button>
				</div>
			</div>

			{#if qrSvg !== null}
				<button
					type="button"
					onclick={toggleQr}
					aria-label="Hide QR code"
					class="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:bg-gray-50"
				>
					<!-- SVG comes from the qrcode library; safe to inline -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html qrSvg}
				</button>
			{/if}

			<FilterBar state={filterState} onchange={updateFilters} />

			{#if currentCard !== null}
				<!-- Card -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<article
					class="aspect-[4/5] max-h-[60vh] w-[80vw] max-w-[80vw] cursor-grab select-none flex-col items-center justify-center gap-2 rounded-2xl border border-coral-100 shadow-xl active:cursor-grabbing sm:w-80"
					style="display: flex; transform: translateX({dx}px) translateY({dy}px) rotate({dx * 0.05}deg); background-color: {tint}; transition: {snapping ? 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 100ms ease' : 'background-color 100ms ease'};"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
				>
					<span class="font-display text-6xl font-extrabold">{currentCard.name}</span>
					<span class="text-3xl text-gray-400" aria-label={currentCard.sex === 'M' ? 'boy' : 'girl'}>
						{currentCard.sex === 'M' ? '♂' : '♀'}
					</span>
				</article>

				<!-- Action buttons (mirror swipe directions: ← no, ↑ super, → yes) -->
				<div class="flex items-center gap-6">
					<button
						type="button"
						onclick={() => recordVote('no')}
						aria-label="No"
						class="flex h-16 w-16 items-center justify-center rounded-full border-2 border-coral-500 bg-white text-2xl text-coral-500 shadow-md transition-transform hover:bg-coral-50 active:scale-95"
					>
						✕
					</button>
					<button
						type="button"
						onclick={() => recordVote('super')}
						aria-label="Super like"
						class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sky-400 bg-white text-xl text-sky-400 shadow-md transition-transform hover:bg-sky-50 active:scale-95"
					>
						★
					</button>
					<button
						type="button"
						onclick={() => recordVote('yes')}
						aria-label="Yes"
						class="flex h-16 w-16 items-center justify-center rounded-full border-2 border-sage-700 bg-white text-2xl text-sage-700 shadow-md transition-transform hover:bg-sage-100 active:scale-95"
					>
						♥
					</button>
				</div>

				<!-- Hint -->
				<p class="text-sm text-gray-400">
					← no &nbsp;|&nbsp; yes → &nbsp;|&nbsp; ↑ super
				</p>

				<button
					type="button"
					onclick={undo}
					disabled={undoStack.length === 0}
					aria-label="Undo last swipe"
					class="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
				>
					Undo (Z)
				</button>

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

	<!-- Share toast -->
	{#if toastVisible}
		<div
			class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-800 px-4 py-2 text-sm text-white shadow-lg"
			role="status"
			aria-live="polite"
		>
			Link copied
		</div>
	{/if}

	<!-- Live match toast -->
	{#if newMatchToast !== null}
		<div
			class="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-sage-700 px-4 py-2 text-sm text-white shadow-lg"
			role="status"
			aria-live="polite"
		>
			{newMatchToast}
		</div>
	{/if}

	<NameDetailSheet bind:detail={detailRequest} />
{/if}
