import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the WXT '@' → src alias for tests.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/unit/**/*.test.ts', 'test/dsp/**/*.test.ts', 'test/render/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
