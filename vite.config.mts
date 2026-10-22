import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(import.meta.dirname, './tests/mocks/obsidian.ts'),
			'../main': resolve(import.meta.dirname, './main.ts'),
			'../../main': resolve(import.meta.dirname, './main.ts')
		}
	}
});
