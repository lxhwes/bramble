<script lang="ts">
	import { onMount } from 'svelte';

	// The BeforeInstallPromptEvent is not in the standard lib types.
	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	const DISMISSED_KEY = 'bramble-install-banner-dismissed';

	let deferredPrompt: BeforeInstallPromptEvent | null = $state(null);
	let visible = $state(false);

	onMount(() => {
		// Don't show again if already dismissed this session.
		if (sessionStorage.getItem(DISMISSED_KEY)) return;

		const handler = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			visible = true;
		};

		window.addEventListener('beforeinstallprompt', handler);
		return () => window.removeEventListener('beforeinstallprompt', handler);
	});

	async function install() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') {
			visible = false;
		}
		deferredPrompt = null;
	}

	function dismiss() {
		sessionStorage.setItem(DISMISSED_KEY, '1');
		visible = false;
	}
</script>

{#if visible}
	<div
		role="banner"
		class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-lg border-t border-coral-100"
	>
		<span class="text-sm text-gray-700">Install Bramble for offline use.</span>
		<div class="flex items-center gap-2">
			<button
				onclick={install}
				class="rounded-full bg-coral-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-coral-600 focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-1"
			>
				Install
			</button>
			<button
				onclick={dismiss}
				aria-label="Dismiss install banner"
				class="rounded-full p-1.5 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-1"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="size-4"
					aria-hidden="true"
				>
					<path
						d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}
