import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MarkdownRenderer from '$lib/components/MarkdownRenderer.svelte';
import { headingSlug, parseWikiLink } from '$lib/util/headingSlug';

describe('headingSlug', () => {
	it('keeps letters and digits, drops punctuation', () => {
		expect(headingSlug('Fr, 16.10. — Hamburg → Winnenden')).toBe('fr-1610-hamburg-winnenden');
	});

	it('is Unicode-aware', () => {
		expect(headingSlug('Überblick')).toBe('überblick');
		expect(headingSlug('Vor der Abfahrt')).toBe('vor-der-abfahrt');
	});

	it('is a pure function — no dedup counter, so links always match headings', () => {
		expect(headingSlug('Winnenden')).toBe(headingSlug('Winnenden'));
	});

	it('returns empty for text with nothing sluggable', () => {
		expect(headingSlug('— → …')).toBe('');
	});
});

describe('parseWikiLink', () => {
	it('resolves a same-note heading link', () => {
		expect(parseWikiLink('#Vor der Abfahrt')).toMatchObject({
			target: '#Vor der Abfahrt',
			anchor: 'vor-der-abfahrt'
		});
	});

	it('resolves the alias form', () => {
		expect(parseWikiLink('#Fr, 16.10. — Hamburg → Winnenden|16.10.')).toMatchObject({
			alias: '16.10.',
			anchor: 'fr-1610-hamburg-winnenden'
		});
	});

	it('un-escapes the \\| that Obsidian writes inside table cells', () => {
		expect(parseWikiLink('#Sa, 17.10. — Winnenden\\|17.10.')).toMatchObject({
			alias: '17.10.',
			anchor: 'sa-1710-winnenden'
		});
	});

	it('does not resolve links to other notes', () => {
		expect(parseWikiLink('Some other note').anchor).toBeUndefined();
		expect(parseWikiLink('Other note#Heading').anchor).toBeUndefined();
		expect(parseWikiLink('Other note#Heading|alias').anchor).toBeUndefined();
	});
});

describe('rendering [[#heading]] links', () => {
	const md = [
		'- [[#Vor der Abfahrt]]',
		'',
		'| Tag | Ort |',
		'| --- | --- |',
		'| [[#Fr, 16.10. — Hamburg → Winnenden\\|16.10.]] | Hamburg |',
		'',
		'- [[Some other note]]',
		'',
		'## Vor der Abfahrt',
		'',
		'Body.',
		'',
		'## Fr, 16.10. — Hamburg → Winnenden',
		'',
		'More body.'
	].join('\n');

	it('gives headings matching anchor ids', async () => {
		const { container } = render(MarkdownRenderer, { plaintext: md });
		await new Promise((r) => setTimeout(r, 250));
		expect(container.querySelector('#vor-der-abfahrt')).not.toBeNull();
		expect(container.querySelector('#fr-1610-hamburg-winnenden')).not.toBeNull();
	});

	it('renders same-note heading links as real anchors', async () => {
		const { container } = render(MarkdownRenderer, { plaintext: md });
		await new Promise((r) => setTimeout(r, 250));

		const anchors = [...container.querySelectorAll('a.internal-link')];
		const hrefs = anchors.map((a) => a.getAttribute('href'));
		expect(hrefs).toContain('#vor-der-abfahrt');
		expect(hrefs).toContain('#fr-1610-hamburg-winnenden');

		// every anchor points at a heading that actually exists on the page
		for (const href of hrefs) {
			expect(container.querySelector(href as string)).not.toBeNull();
		}
	});

	it('uses the alias as the link text inside tables', async () => {
		render(MarkdownRenderer, { plaintext: md });
		const el = await screen.findByText('16.10.');
		expect(el.tagName).toBe('A');
		expect(el).toHaveClass('internal-link');
	});

	it('leaves links to other notes inert', async () => {
		const { container } = render(MarkdownRenderer, { plaintext: md });
		await new Promise((r) => setTimeout(r, 250));
		const inert = screen.getByText('Some other note');
		expect(inert.tagName).not.toBe('A');
		expect(container.querySelector('a[href="#some-other-note"]')).toBeNull();
	});
});
