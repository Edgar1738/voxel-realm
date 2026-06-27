import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Biome worldgen + two-pass meshing make the streaming integration tests heavy.
    testTimeout: 20000,
  },
});
