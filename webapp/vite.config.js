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
	server: {
		fs: {
			// Allow serving CHANGELOG.md file
			allow: [searchForWorkspaceRoot(process.cwd()), '/CHANGELOG.md']
		}
	}
});
