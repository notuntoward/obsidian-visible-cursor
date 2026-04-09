import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(__dirname, './tests/mocks/obsidian.ts'),
			'../main': resolve(__dirname, './main.ts'),
			'../../main': resolve(__dirname, './main.ts')
		}
	}
});
