import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// Flat config: eslint-plugin-svelte v3 dropped .eslintrc support.
export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// *.cjs config files are CommonJS by definition.
		files: ['**/*.cjs'],
		rules: { '@typescript-eslint/no-require-imports': 'off' }
	},
	{
		ignores: ['build/', '.svelte-kit/', 'package/', 'node_modules/', 'src/generated/']
	}
);
