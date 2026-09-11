import { sveltekit } from '@sveltejs/kit/vite';
import { marked } from 'marked';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Turns an imported .md file into `export const html`.
 *
 * Replaces vite-plugin-markdown, which pulls an old markdown-it/linkify-it with
 * high-severity advisories and no upstream fix. We only ever used its `html`
 * export (never `toc`), and marked is already a dependency of this app.
 */
function markdownHtml() {
	return {
		name: 'markdown-html',
		enforce: 'pre',
		async transform(code, id) {
			if (!id.endsWith('.md')) return null;
			const html = await marked.parse(code);
			return { code: `export const html = ${JSON.stringify(html)};`, map: null };
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), markdownHtml()],
	optimizeDeps: {
		include: ['highlight.js', 'highlight.js/lib/core']
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		setupFiles: ['setupTest.js']
	},
	// Svelte 5 ships separate client and server builds. Under vitest the SvelteKit
	// plugin isn't driving resolution, so without this @testing-library/svelte gets
	// the server build and every render() dies with "mount(...) is not available on
	// the server".
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	server: {
		fs: {
			// Allow serving CHANGELOG.md file
			allow: [searchForWorkspaceRoot(process.cwd()), '/CHANGELOG.md']
		}
	}
});
