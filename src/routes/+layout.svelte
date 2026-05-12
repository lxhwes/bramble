<script lang="ts">
	import './layout.css';
	import Footer from '$lib/components/Footer.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';

	let { children } = $props();

	const OG_TITLE = 'Bramble — swipe baby names with your partner';
	const OG_DESCRIPTION =
		'Open-source name discovery for couples. Swipe independently, see mutual likes.';
	const OG_IMAGE = '/og.png';
</script>

<svelte:head>
	<title>{OG_TITLE}</title>
	<meta name="description" content={OG_DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={OG_TITLE} />
	<meta property="og:description" content={OG_DESCRIPTION} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={OG_TITLE} />
	<meta name="twitter:description" content={OG_DESCRIPTION} />
	<meta name="twitter:image" content={OG_IMAGE} />
</svelte:head>

{@render children()}
<Footer />
<InstallBanner />
