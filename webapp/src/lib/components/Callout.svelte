<script lang="ts">
	import { getCalloutColor, getCalloutIcon } from '$lib/util/callout';
	import CalloutIcon from '$lib/components/CalloutIcon.svelte';

	export let title = '';
	export let type = 'note';
	let color = '--callout-warning';
	let icon = 'note';
	let init = false;

	let content: HTMLElement;

	// The callout header is the first line of the first <p>, i.e. everything up to
	// the first <br>. This reads that boundary out of innerHTML rather than relying
	// on innerText turning <br> into "\n" -- real browsers do, but happy-dom (used
	// by the tests) stopped doing so in v20, which silently swallowed the title.
	function splitFirstLine(element: HTMLElement): { first: string; rest: string | null } {
		const html = element.innerHTML;
		const br = /<br\s*\/?>/i.exec(html);
		if (!br) {
			return { first: html, rest: null };
		}
		return {
			first: html.substring(0, br.index),
			rest: html.substring(br.index + br[0].length)
		};
	}

	function htmlToText(html: string): string {
		const scratch = document.createElement('div');
		scratch.innerHTML = html;
		return scratch.textContent ?? '';
	}

	$: if (content) {
		const titleElement = content.getElementsByTagName('p')[0];
		const preFilled = title != '';
		const { first, rest } = splitFirstLine(titleElement);
		const match = htmlToText(first).match(/\[!(.+)\]([+-]?)(?:\s(.+))?/);
		if (match && !preFilled) {
			type = match[1]?.trim();
			title = match[3]?.trim() ?? type[0].toUpperCase() + type.substring(1).toLowerCase();
		}

		color = `--${getCalloutColor(type)}`;
		icon = getCalloutIcon(type);

		// Remove title from content
		if (!preFilled) {
			titleElement.innerHTML = rest ?? '';
		}
		init = true;
	}
</script>

<div
	style="--callout-color: var({color})"
	class="border-l-4 border-l-callout bg-zinc-100 dark:bg-zinc-800 my-4"
>
	<div class="p-[10px] bg-callout-bg flex items-center gap-2">
		<span class="callout-icon font-bold text-md text-callout h-5 w-5 inline-block"
			><CalloutIcon {icon} /></span
		>
		<span class="callout-title font-bold text-md">{title}</span>
	</div>
	<div bind:this={content} class="callout-content prose-p:my-0 prose-p:mx-0 py-4 px-3">
		<slot />
	</div>
</div>
