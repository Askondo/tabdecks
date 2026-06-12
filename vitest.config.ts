import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/dsp/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
