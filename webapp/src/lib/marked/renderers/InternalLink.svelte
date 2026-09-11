<script lang="ts">
	import FaRegQuestionCircle from 'svelte-icons/fa/FaRegQuestionCircle.svelte';
	import { parseWikiLink } from '$lib/util/headingSlug';
	import { scrollToId } from '$lib/util/scrollToId';

	export let text: string = '';
	export let displayText: string = '';
	export let useSlot = false;

	// `[[#Heading]]` and `[[#Heading|alias]]` point at a heading in *this* note,
	// so they can be resolved and followed. Everything else ([[Other page]],
	// [[Other page#Heading]]) refers to a note that was never shared, and stays
	// inert with the "unresolvable" marker.
	$: parsed = parseWikiLink(text);
	$: anchor = parsed.anchor;

	$: if (!displayText) {
		if (parsed.alias) {
			displayText = parsed.alias;
		} else {
			const headerMatch = parsed.target.match(/^(.[^|]+)#(.[^|]*)$/);
			displayText = headerMatch ? `${headerMatch[1]} > ${headerMatch[2]}` : parsed.target;
		}
	}

	function follow() {
		if (anchor) scrollToId(anchor);
	}
</script>

{#if anchor && !useSlot}
	<!--
		The default is prevented on purpose: this page's URL fragment carries the
		note's decryption key, so letting the browser navigate to "#heading" would
		throw the key away and break a reload. The href is kept so the element is a
		real link for assistive tech and keyboard users.
	-->
	<a
		href="#{anchor}"
		on:click|preventDefault={follow}
		class="internal-link text-[#705dcf] underline cursor-pointer hover:opacity-80"
		title="Jump to “{displayText}” in this note">{displayText}</a
	>
{:else}
	<dfn class="not-italic" title="Internal link">
		<span class="underline cursor-not-allowed inline-flex items-center">
			<span class="internal-link text-[#705dcf] opacity-50">
				{#if useSlot}
					<slot />
				{:else}
					{displayText}
				{/if}
			</span>
			<span class="w-3 h-3 inline-block mb-2 text-zinc-400 ml-0.5"><FaRegQuestionCircle /></span>
		</span>
	</dfn>
{/if}
