<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function pct(rate: number): string {
		return `${Math.round(rate * 100)}%`;
	}
</script>

<main class="mx-auto max-w-md px-4 py-8">
	<h1 class="text-2xl font-bold">Stats</h1>
	<p class="mt-1 text-sm text-slate-500">
		{data.partnerSlugs.length} partner{data.partnerSlugs.length === 1 ? '' : 's'}
	</p>

	{#if data.sharedNames > 0}
		<section class="mt-6 rounded-lg bg-slate-50 p-4">
			<p class="text-3xl font-bold text-emerald-600">{pct(data.agreementRate)} agreement</p>
			<p class="mt-1 text-sm text-slate-500">
				across {data.sharedNames} shared name{data.sharedNames === 1 ? '' : 's'}
			</p>
		</section>
	{/if}

	<!-- Like rates -->
	<section class="mt-8">
		<h2 class="text-lg font-semibold text-slate-800">Like rate</h2>
		<p class="mt-0.5 text-xs text-slate-500">
			Percentage of names each partner voted yes or super on.
		</p>
		<ul class="mt-3 divide-y divide-slate-100">
			{#each data.partnerSlugs as slug (slug)}
				<li class="flex items-center gap-3 py-3">
					<span class="flex-1 font-medium text-slate-900">{slug}</span>
					<div class="flex items-center gap-2">
						<div class="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
							<div
								class="h-full rounded-full bg-emerald-400"
								style="width: {pct(data.likeRate[slug] ?? 0)}"
							></div>
						</div>
						<span class="w-10 text-right text-sm text-slate-600">
							{pct(data.likeRate[slug] ?? 0)}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Mutual likes -->
	<section class="mt-8">
		<h2 class="text-lg font-semibold text-slate-800">Mutual likes</h2>
		<p class="mt-1 text-sm text-slate-500">
			Names every partner voted yes or super on.
		</p>
		<p class="mt-3 text-3xl font-bold text-emerald-600">{data.mutualLikes}</p>
	</section>

	<!-- Disagreements -->
	<section class="mt-8">
		<h2 class="text-lg font-semibold text-slate-800">Disagreements</h2>
		<p class="mt-0.5 text-xs text-slate-500">
			Names where at least one partner liked and at least one did not.
		</p>

		{#if data.disagreements.length === 0}
			<p class="mt-4 text-slate-600">No disagreements yet.</p>
		{:else}
			<ul class="mt-3 divide-y divide-slate-100">
				{#each data.disagreements as item (item.name + '|' + item.sex)}
					<li class="py-3">
						<div class="flex items-center gap-2">
							<span class="text-base font-semibold text-slate-900">{item.name}</span>
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium {item.sex === 'M'
									? 'bg-blue-100 text-blue-700'
									: 'bg-pink-100 text-pink-700'}"
							>
								{item.sex === 'M' ? 'boy' : 'girl'}
							</span>
						</div>
						<dl class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
							{#each Object.entries(item.partners) as [slug, vote] (slug)}
								<div class="flex gap-1 text-xs">
									<dt class="text-slate-500">{slug}</dt>
									<dd
										class={vote === 'yes' || vote === 'super'
											? 'font-medium text-emerald-600'
											: 'text-slate-400'}
									>
										{vote === 'super' ? '★ super' : vote}
									</dd>
								</div>
							{/each}
						</dl>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
