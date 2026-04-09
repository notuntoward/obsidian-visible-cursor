import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: [
			{ find: 'obsidian', replacement: resolve(__dirname, './tests/mocks/obsidian.ts') },
			// Force bare '../main' imports in tests to resolve to source .ts, not built main.js
			{ find: /^\.\.\/main$/, replacement: resolve(__dirname, './main.ts') }
		]
	},
	test: {
		environment: 'node',
		globals: true,
		pool: 'vmThreads',
		setupFiles: ['./tests/setup.ts'],
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts', '*.ts'],
			exclude: ['main.ts', 'tests/**']
		}
	}
});
