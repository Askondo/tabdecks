import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/dsp/**/*.test.ts', 'test/render/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
