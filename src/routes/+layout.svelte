<script lang="ts">
	import './layout.css';
	import Footer from '$lib/components/Footer.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';

	let { children } = $props();
</script>

{@render children()}
<Footer />
<InstallBanner />
