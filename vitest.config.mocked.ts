import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/mocked/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ]
  },
});