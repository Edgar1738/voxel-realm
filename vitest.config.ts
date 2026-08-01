import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Several world-generation suites are intentionally CPU/memory heavy. On high-core-count
    // machines Vitest's default process fan-out can exhaust a worker and fail the run after every
    // assertion passed. Four workers keeps useful parallelism and is stable locally and in CI.
    maxWorkers: 4,
    // Biome worldgen + two-pass meshing make the streaming integration tests heavy.
    testTimeout: 20000,
  },
});
