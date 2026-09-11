import { sveltekit } from '@sveltejs/kit/vite';
import { plugin as markdown } from 'vite-plugin-markdown';
import { searchForWorkspaceRoot } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit(), markdown({ mode: ['html', 'toc'] })],
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
