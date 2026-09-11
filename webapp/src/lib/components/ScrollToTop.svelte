<script lang="ts">
	import ArrowUp from 'svelte-icons/fa/FaArrowUp.svelte';

	/**
	 * Floating "back to top" button. Hidden while the page is at (or near) the top
	 * so it never covers content unnecessarily.
	 *
	 * The button stays mounted and fades via a CSS opacity transition rather than
	 * Svelte's `transition:fade`. A Svelte transition uses the Web Animations API,
	 * and tearing the element down mid-fade rejects that animation's promise with
	 * an uncaught `AbortError: The animation was canceled` — harmless in a browser,
	 * but it fails the test run. `inert` keeps the hidden button out of the tab
	 * order and the accessibility tree.
	 */

	/** How far down the user has to be before the button appears, in pixels. */
	const THRESHOLD = 300;

	let visible = $state(false);

	function update() {
		visible = window.scrollY > THRESHOLD;
	}

	// Run once on mount too: the page can load already scrolled (a restored
	// scroll position, or a jump to a heading) and no scroll event fires then.
	$effect(() => {
		update();
	});

	function toTop() {
		window.scrollTo({
			top: 0,
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
		});
	}
</script>

<svelte:window onscroll={update} />

<button
	type="button"
	onclick={toTop}
	aria-label="Scroll to top"
	title="Scroll to top"
	inert={!visible}
	class="scroll-to-top fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center
	       rounded-full bg-white text-[#705dcf] shadow-lg ring-1 ring-zinc-300
	       transition-opacity duration-200 hover:bg-zinc-100 focus-visible:outline
	       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#705dcf]
	       dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600 dark:hover:bg-zinc-700
	       print:hidden {visible ? 'opacity-100' : 'pointer-events-none opacity-0'}"
>
	<span class="block h-4 w-4" aria-hidden="true"><ArrowUp /></span>
</button>
