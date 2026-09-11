import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import ScrollToTop from '$lib/components/ScrollToTop.svelte';

/** happy-dom does not move window.scrollY on its own, so drive it directly. */
async function scrollTo(y: number) {
	Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
	window.dispatchEvent(new Event('scroll'));
	await tick();
}

describe('ScrollToTop', () => {
	beforeEach(async () => {
		Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
		window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof matchMedia;
	});

	it('is hidden at the top of the page', async () => {
		render(ScrollToTop);
		await tick();
		expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
	});

	it('stays hidden just below the threshold', async () => {
		render(ScrollToTop);
		await scrollTo(300);
		expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
	});

	it('appears once scrolled past the threshold', async () => {
		render(ScrollToTop);
		await scrollTo(301);
		expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();
	});

	it('hides again when scrolled back to the top', async () => {
		render(ScrollToTop);
		await scrollTo(900);
		expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();
		await scrollTo(0);
		// the fade-out transition has to finish before the node is removed
		await new Promise((r) => setTimeout(r, 250));
		expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
	});

	it('scrolls smoothly to the top when clicked', async () => {
		const scrollToSpy = vi.fn();
		window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;

		render(ScrollToTop);
		await scrollTo(900);
		screen.getByRole('button', { name: 'Scroll to top' }).click();

		expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
	});

	it('jumps instantly when the user prefers reduced motion', async () => {
		const scrollToSpy = vi.fn();
		window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
		window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia;

		render(ScrollToTop);
		await scrollTo(900);
		screen.getByRole('button', { name: 'Scroll to top' }).click();

		expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
	});

	it('is visible immediately if the page loads already scrolled', async () => {
		Object.defineProperty(window, 'scrollY', { value: 900, writable: true, configurable: true });
		render(ScrollToTop);
		await tick();
		expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();
	});
});
