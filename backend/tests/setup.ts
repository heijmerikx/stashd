/**
 * Test setup with Testcontainers
 *
 * This file runs BEFORE any test file is imported. It:
 * 1. Starts PostgreSQL and Redis containers
 * 2. Sets environment variables
 * 3. Runs database migrations
 * 4. Provides cleanup helpers
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import pg from 'pg';
import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let testPool: pg.Pool;
let dbInitialized = false;

/**
 * Run all migrations on the test database
 */
async function runTestMigrations(pool: pg.Pool): Promise<void> {
  const migrationsDir = join(__dirname, '..', 'src', 'db', 'migrations');

  // Create migrations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get all migration files
  const files = await readdir(migrationsDir);
  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Apply each migration
  for (const file of migrationFiles) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const name = match[2];
    const filePath = join(migrationsDir, file);
    const sql = await readFile(filePath, 'utf-8');

    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [version, name]
      );
    } catch (error) {
      console.error(`Failed to apply migration ${file}:`, error);
      throw error;
    }
  }
}

/**
 * Clear all data from tables (for test isolation)
 */
async function clearTestData(): Promise<void> {
  if (!testPool) return;

  // Delete in order respecting foreign keys
  await testPool.query('DELETE FROM backup_history');
  await testPool.query('DELETE FROM backup_job_destinations');
  await testPool.query('DELETE FROM backup_job_notifications');
  await testPool.query('DELETE FROM backup_jobs');
  await testPool.query('DELETE FROM backup_destinations');
  await testPool.query('DELETE FROM notification_channels');
  await testPool.query('DELETE FROM credential_providers');
  await testPool.query('DELETE FROM audit_log');
  await testPool.query('DELETE FROM users');
}

// Global setup - runs once before all tests
beforeAll(async () => {
  if (dbInitialized) return;

  console.log('Starting test containers...');

  // Start containers in parallel
  [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16')
      .withDatabase('stashd_test')
      .withUsername('test')
      .withPassword('test')
      .start(),
    new RedisContainer('redis:7').start(),
  ]);

  // Set environment variables BEFORE any app modules are imported
  process.env.DB_HOST = pgContainer.getHost();
  process.env.DB_PORT = pgContainer.getPort().toString();
  process.env.DB_NAME = 'stashd_test';
  process.env.DB_USER = 'test';
  process.env.DB_PASSWORD = 'test';
  process.env.REDIS_HOST = redisContainer.getHost();
  process.env.REDIS_PORT = redisContainer.getPort().toString();
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  process.env.ENCRYPTION_SECRET = 'test-encryption-secret-32chars!';
  process.env.NODE_ENV = 'test';

  // Create test pool
  testPool = new pg.Pool({
    host: pgContainer.getHost(),
    port: pgContainer.getPort(),
    database: 'stashd_test',
    user: 'test',
    password: 'test',
  });

  // Run migrations
  await runTestMigrations(testPool);

  dbInitialized = true;
  console.log('Test containers ready');
}, 120000);

// Clean up between tests
beforeEach(async () => {
  await clearTestData();
});

// Global teardown
afterAll(async () => {
  console.log('Stopping test containers...');

  // Close the app's database pool first
  try {
    const { getPool } = await import('../src/db/index.js');
    const appPool = getPool();
    await appPool.end();
  } catch {
    // Pool may not have been initialized
  }

  // Close the test pool
  if (testPool) {
    await testPool.end();
  }

  // Stop containers
  if (pgContainer) {
    await pgContainer.stop();
  }

  if (redisContainer) {
    await redisContainer.stop();
  }

  console.log('Test containers stopped');
});
