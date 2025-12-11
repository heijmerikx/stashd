/**
 * Global test setup - runs once before any tests
 * Sets up Testcontainers and environment variables
 */

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

export async function setup() {
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

  // Set environment variables - these will be available to all test files
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

  // Create a pool and run migrations
  const pool = new pg.Pool({
    host: pgContainer.getHost(),
    port: pgContainer.getPort(),
    database: 'stashd_test',
    user: 'test',
    password: 'test',
  });

  await runTestMigrations(pool);
  await pool.end();

  console.log('Test containers ready');

  // Return container info for teardown and provide to tests
  return {
    pgHost: pgContainer.getHost(),
    pgPort: pgContainer.getPort(),
    redisHost: redisContainer.getHost(),
    redisPort: redisContainer.getPort(),
  };
}

export async function teardown() {
  console.log('Stopping test containers...');

  await Promise.all([
    pgContainer?.stop(),
    redisContainer?.stop(),
  ]);

  console.log('Test containers stopped');
}
