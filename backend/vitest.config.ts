import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use threads pool which shares memory/env vars better
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Longer timeout for container startup
    testTimeout: 30000,
    hookTimeout: 120000,
    // Per-file setup that starts containers
    setupFiles: ['tests/setup.ts'],
    // Only run .test.ts files in tests directory
    // Exclude backup-execution tests as they don't use setup.ts
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/backup-execution-*.test.ts', // These run separately with their own setup
    ],
    // Disable watch mode in CI
    watch: false,
    // Ensure tests run in sequence
    sequence: {
      hooks: 'list',
    },
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',           // Entry point
        'src/scripts/**',         // CLI scripts
        'src/db/migrations/**',   // SQL migrations
      ],
      // Thresholds - increase as you add tests
      // Current baseline: ~10% (auth tests only)
      // Target: 60%+ for critical paths
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 3,
        statements: 5,
      },
    },
  },
});
