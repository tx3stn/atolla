import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/bazel-out/**',
			'**/bazel-bin/**',
			'**/bazel-testlogs/**',
			'**/bazel-music-app/**',
			'**/external/**',
		],
		include: ['src/**/*.test.{ts,tsx}'],
	},
});
