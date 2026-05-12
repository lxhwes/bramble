<script lang="ts" module>
	import type { NameEntry } from '$lib/filters';

	// Module-scoped lazy cache: the names dataset is fetched once and shared
	// across every NameDetailSheet instance on the page. Keeps `/matches`,
	// `/shortlist`, and `/stats` from each issuing their own 100k-entry fetch.
	let datasetPromise: Promise<Map<string, NameEntry>> | null = null;

	function loadDataset(): Promise<Map<string, NameEntry>> {
		if (datasetPromise) return datasetPromise;
		datasetPromise = fetch('/names.json')
			.then((r) => r.json())
			.then((raw: unknown) => {
				const map = new Map<string, NameEntry>();
				for (const entry of raw as NameEntry[]) {
					map.set(`${entry.name}|${entry.sex}`, entry);
				}
				return map;
			})
			.catch(() => new Map<string, NameEntry>());
		return datasetPromise;
	}
</script>

<script lang="ts">
	/**
	 * Bottom-sheet that surfaces peakYear / totalCount / related metadata for
	 * any name in the dataset. Bind the `detail` prop to a `{ name, sex }` pair
	 * (or `null` to close). The sheet manages its own dialog element, drag-to-
	 * dismiss gesture, and lazy dataset fetch.
	 *
	 * Lifted from the swipe page (Phase 1) into a shared component as part of
	 * W4.3 so the matches, shortlist, and stats views can reuse it.
	 */
	let {
		detail = $bindable<{ name: string; sex: 'M' | 'F' } | null>(null),
	}: {
		detail?: { name: string; sex: 'M' | 'F' } | null;
	} = $props();

	let dialog: HTMLDialogElement | null = $state(null);
	let entry: NameEntry | null = $state(null);
	let loading = $state(false);

	$effect(() => {
		if (detail === null) {
			entry = null;
			dialog?.close();
			return;
		}

		// Render the lightweight name/sex info immediately; resolve the full
		// metadata from the cached dataset and update once it arrives.
		const fallback: NameEntry = {
			name: detail.name,
			sex: detail.sex,
			peakYear: 0,
			totalCount: 0,
		};
		entry = fallback;
		loading = true;
		dialog?.showModal();

		const target = detail;
		loadDataset().then((map) => {
			// A second open may have happened while the fetch was in flight;
			// drop the result if the binding has moved on.
			if (detail !== target) return;
			const resolved = map.get(`${target.name}|${target.sex}`);
			entry = resolved ?? fallback;
			loading = false;
		});
	});

	function close() {
		detail = null;
	}

	function onDialogClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	// Swipe-down dismissal on the drag handle only — body interactions stay
	// untouched so future content (links, scroll) doesn't fight the gesture.
	let dragStartY = $state(0);
	let dragDy = $state(0);

	function onSheetPointerDown(e: PointerEvent) {
		dragStartY = e.clientY;
		dragDy = 0;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onSheetPointerMove(e: PointerEvent) {
		if (!e.currentTarget) return;
		dragDy = e.clientY - dragStartY;
	}

	function onSheetPointerUp() {
		if (dragDy >= 60) close();
		dragDy = 0;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	onclick={onDialogClick}
	onclose={close}
	aria-label="Name details"
	class="m-0 mt-auto max-h-[80vh] w-full max-w-md rounded-t-2xl bg-white p-0 shadow-2xl backdrop:bg-black/40 sm:mx-auto sm:mb-auto sm:rounded-2xl"
>
	{#if entry !== null}
		<div
			role="presentation"
			onpointerdown={onSheetPointerDown}
			onpointermove={onSheetPointerMove}
			onpointerup={onSheetPointerUp}
			class="cursor-grab pt-2 pb-1 active:cursor-grabbing"
		>
			<div class="mx-auto h-1.5 w-12 rounded-full bg-gray-300"></div>
		</div>
		<div class="flex flex-col gap-3 px-6 pb-6">
			<h2 class="text-center font-display text-4xl font-bold">{entry.name}</h2>
			<p
				class="text-center text-2xl text-gray-400"
				aria-label={entry.sex === 'M' ? 'boy' : 'girl'}
			>
				{entry.sex === 'M' ? '♂' : '♀'}
				<span class="ml-1 text-base text-gray-500">
					{entry.sex === 'M' ? 'Boy' : 'Girl'}
				</span>
			</p>
			<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<dt class="font-medium text-gray-500">Peak year</dt>
				<dd class="text-gray-900">{entry.peakYear || (loading ? '…' : '—')}</dd>
				<dt class="font-medium text-gray-500">Total count</dt>
				<dd class="text-gray-900">
					{entry.totalCount > 0
						? entry.totalCount.toLocaleString()
						: loading
							? '…'
							: '—'}
				</dd>
				{#if entry.related && entry.related.length > 0}
					<dt class="col-span-2 font-medium text-gray-500">Related</dt>
					<dd class="col-span-2 text-gray-900">{entry.related.join(', ')}</dd>
				{/if}
			</dl>
		</div>
	{/if}
</dialog>
