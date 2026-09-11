/**
 * Anchor id for a heading — and the matching target for an Obsidian
 * `[[#Heading]]` link.
 *
 * Deliberately *not* `github-slugger` (which the markdown renderer uses for its
 * own heading ids): that keeps state and appends `-1`, `-2` to repeated
 * headings, so the same text slugs differently depending on what came before it.
 * A link and its heading are rendered by different components and would
 * disagree. This is a pure function of the text, so they always agree; if a note
 * really does repeat a heading, every link to it resolves to the first one,
 * which is predictable and matches what Obsidian does.
 *
 * Unicode-aware: `## Fr, 16.10. — Hamburg → Winnenden` keeps its letters and
 * digits and drops the punctuation, giving `fr-1610-hamburg-winnenden`.
 *
 * Returns `''` when nothing usable is left (a heading of pure punctuation).
 * Callers treat that as "no anchor" rather than emitting an invalid empty id.
 */
export function headingSlug(text: string): string {
	return text
		.normalize('NFC')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\p{L}\p{N}_-]/gu, '')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Splits an Obsidian wiki-link target into its parts.
 *
 * Handles the alias form `[[target|alias]]`, and un-escapes the `\|` that
 * Obsidian writes when a link sits inside a table cell.
 */
export function parseWikiLink(text: string): {
	target: string;
	alias?: string;
	/** Anchor id when this points at a heading in the *same* note, else undefined. */
	anchor?: string;
} {
	const unescaped = text.replace(/\\\|/g, '|');
	const pipe = unescaped.indexOf('|');
	const target = (pipe === -1 ? unescaped : unescaped.slice(0, pipe)).trim();
	const alias = pipe === -1 ? undefined : unescaped.slice(pipe + 1).trim();

	// Only a leading "#" means "a heading in this note". "Page#Heading" points at
	// a different note, which we cannot resolve from a single shared note.
	const anchor = target.startsWith('#') ? headingSlug(target.slice(1)) || undefined : undefined;

	return { target, alias, anchor };
}
