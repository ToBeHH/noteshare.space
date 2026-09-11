import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ScrollToTop from '$lib/components/ScrollToTop.svelte';

/**
 * The button stays mounted and fades with CSS, so "hidden" is asserted as
 * opacity-0 + inert (out of the tab order and the accessibility tree) rather
 * than as absence from the DOM.
 */
function button(container: HTMLElement): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>('button[aria-label="Scroll to top"]');
	if (!el) throw new Error('scroll-to-top button not rendered');
	return el;
}

/** happy-dom does not move window.scrollY on its own, so drive it directly. */
async function scrollTo(y: number) {
	Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
	window.dispatchEvent(new Event('scroll'));
	await tick();
}

describe('ScrollToTop', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
		window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof matchMedia;
	});

	it('is hidden and non-interactive at the top of the page', async () => {
		const { container } = render(ScrollToTop);
		await tick();
		expect(button(container)).toHaveClass('opacity-0');
		expect(button(container)).toHaveAttribute('inert');
	});

	it('stays hidden just below the threshold', async () => {
		const { container } = render(ScrollToTop);
		await scrollTo(300);
		expect(button(container)).toHaveClass('opacity-0');
	});

	it('appears once scrolled past the threshold', async () => {
		const { container } = render(ScrollToTop);
		await scrollTo(301);
		expect(button(container)).toHaveClass('opacity-100');
		expect(button(container)).not.toHaveAttribute('inert');
	});

	it('hides again when scrolled back to the top', async () => {
		const { container } = render(ScrollToTop);
		await scrollTo(900);
		expect(button(container)).toHaveClass('opacity-100');
		await scrollTo(0);
		expect(button(container)).toHaveClass('opacity-0');
		expect(button(container)).toHaveAttribute('inert');
	});

	it('scrolls smoothly to the top when clicked', async () => {
		const scrollToSpy = vi.fn();
		window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;

		const { container } = render(ScrollToTop);
		await scrollTo(900);
		button(container).click();

		expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
	});

	it('jumps instantly when the user prefers reduced motion', async () => {
		const scrollToSpy = vi.fn();
		window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
		window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia;

		const { container } = render(ScrollToTop);
		await scrollTo(900);
		button(container).click();

		expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
	});

	it('is visible immediately if the page loads already scrolled', async () => {
		Object.defineProperty(window, 'scrollY', { value: 900, writable: true, configurable: true });
		const { container } = render(ScrollToTop);
		await tick();
		expect(button(container)).toHaveClass('opacity-100');
	});
});
