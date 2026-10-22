import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: [
			{ find: 'obsidian', replacement: resolve(import.meta.dirname, './tests/mocks/obsidian.ts') },
			// Force bare '../main' imports in tests to resolve to source .ts, not built main.js
			{ find: /^\.\.\/main$/, replacement: resolve(import.meta.dirname, './main.ts') },
			{ find: 'commons/workspace', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/workspace/index.ts') },
			{ find: 'commons/windows', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/windows/index.ts') },
			{ find: 'commons/modal', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/modal/index.ts') },
			{ find: 'commons/search', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/search/index.ts') },
			{ find: 'commons/geometry', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/geometry/index.ts') },
			{ find: 'commons/os', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/os/index.ts') },
			{ find: 'commons/testing', replacement: resolve(import.meta.dirname, '../obsidian-commons/src/testing/index.ts') }
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
