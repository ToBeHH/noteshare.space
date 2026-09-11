import { describe, it, expect, beforeAll } from 'vitest';
import { marked } from 'marked';
import extensions, { obsidianStrikethrough } from '$lib/marked/extensions';

/**
 * Regression test for notes that use "~" to mean "approximately".
 *
 * GFM (and therefore marked's default) accepts a single tilde as a strikethrough
 * delimiter, so "~6:35 h ... ~3:15 h" struck through everything in between.
 * Obsidian only honours "~~", so such notes rendered correctly in Obsidian and
 * wrong in the web app.
 */

function delTokens(src: string): string[] {
	const found: string[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(function walk(tokens: any[]) {
		for (const t of tokens || []) {
			if (t.type === 'del') found.push(t.raw);
			if (t.tokens) walk(t.tokens);
			if (t.items) walk(t.items);
			if (t.rows) for (const row of t.rows) for (const cell of row) walk(cell.tokens);
			if (t.header) for (const cell of t.header) walk(cell.tokens);
		}
	})(marked.lexer(src));
	return found;
}

describe('Obsidian-compatible strikethrough', () => {
	beforeAll(() => {
		// @ts-expect-error - typing mismatch, same call as MarkdownRenderer.svelte
		marked.use({ extensions });
		marked.use(obsidianStrikethrough);
	});

	it('does not strike through text between single tildes', () => {
		const src = 'Aufstieg ~45 min, weiter Blick (~45 km) über das Albvorland.';
		expect(delTokens(src)).toHaveLength(0);
	});

	it('leaves a whole note full of "approximately" tildes alone', () => {
		const src = [
			'| Etappe | Dauer |',
			'| --- | --- |',
			'| Hamburg → Winnenden | 647 km · ~6:35 h |',
			'| Winnenden → Ulm | 291 km · ~3:15 h |',
			'',
			'Sonnenuntergang am 16.10. ~18:35, am 24.10. ~18:05.',
			'',
			'- **Wasserkuppe / Rhön** (~330 km, ~25 min Umweg) — höchster Berg Hessens.',
			'- **Ebnisee** (~30 km) — Seerundweg ~1 h.'
		].join('\n');
		expect(delTokens(src)).toHaveLength(0);
	});

	it('still renders real ~~strikethrough~~', () => {
		expect(delTokens('This is ~~gone~~ now.')).toEqual(['~~gone~~']);
	});

	it('handles real strikethrough and approximate values in one line', () => {
		expect(delTokens('~~dropped~~ and ~5 km and ~6 km')).toEqual(['~~dropped~~']);
	});
});
