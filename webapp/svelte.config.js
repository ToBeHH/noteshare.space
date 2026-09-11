import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// vitePreprocess replaces svelte-preprocess: it runs style/script blocks
	// through Vite's own pipeline, so postcss.config.cjs (tailwind, autoprefixer)
	// still applies without extra configuration.
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
