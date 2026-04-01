import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(__dirname, './tests/mocks/obsidian.ts')
		}
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
