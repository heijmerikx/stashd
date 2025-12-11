/**
 * Vitest config for backup execution tests
 *
 * These tests spin up their own database containers and don't use the
 * shared setup.ts file. They test the actual backup executors (pg_dump,
 * mysqldump, mongodump, redis-cli) against real databases.
 *
 * Run with: npm run test:execution
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each test file manages its own containers
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Longer timeouts for container startup and backup operations
    testTimeout: 120000,
    hookTimeout: 300000,
    // Only run backup execution tests
    include: ['tests/backup-execution-*.test.ts'],
    // No shared setup file - each test manages its own containers
    setupFiles: [],
    // Disable watch mode
    watch: false,
    // Run tests sequentially
    sequence: {
      hooks: 'list',
    },
  },
});
