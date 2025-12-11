/**
 * Redis Backup Execution Tests
 *
 * These tests verify the actual backup process for Redis databases.
 * They use testcontainers to spin up real Redis instances.
 *
 * Run with: npm run test:execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { mkdir, rm, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import backup executor - need to do dynamic import to ensure env vars are set first
let executeRedisBackup: (config: object, backupDir: string) => Promise<{
  fileSize: number;
  filePath: string;
  metadata: object;
  executionLog?: string;
}>;

describe('Redis Backup Execution', () => {
  // Use test directory within the project to avoid /tmp permission issues
  const testRunId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const testBackupDir = join(__dirname, `.test-backups-redis-${testRunId}`);
  let container: StartedRedisContainer;

  beforeAll(async () => {
    // Create backup directory with explicit permissions
    await mkdir(testBackupDir, { recursive: true });

    // Set required env vars for backup executor BEFORE importing
    process.env.ENCRYPTION_SECRET = 'test-encryption-secret-32chars!';
    process.env.TEMP_BACKUP_DIR = testBackupDir;

    // Import the backup executor
    const executor = await import('../src/services/backup-executor.js');
    const { executeBackupToTemp } = executor;

    // Create a wrapper that uses our test directory
    executeRedisBackup = async (config: object, _backupDir: string) => {
      return executeBackupToTemp('redis', config);
    };

    // Start Redis container
    console.log('Starting Redis container...');
    container = await new RedisContainer('redis:7').start();

    console.log(`Redis ready at ${container.getHost()}:${container.getPort()}`);

    // Create test data using ioredis client
    const redis = new Redis({
      host: container.getHost(),
      port: container.getPort(),
    });

    try {
      // Create various data types
      await redis.set('user:1:name', 'Alice');
      await redis.set('user:1:email', 'alice@example.com');
      await redis.set('user:2:name', 'Bob');
      await redis.set('user:2:email', 'bob@example.com');

      // Hash
      await redis.hset('user:3', {
        name: 'Charlie',
        email: 'charlie@example.com',
        age: '30',
      });

      // List
      await redis.rpush('orders:recent', 'order:1', 'order:2', 'order:3');

      // Set
      await redis.sadd('active:users', 'user:1', 'user:2', 'user:3');

      // Sorted set
      await redis.zadd('leaderboard', 100, 'user:1', 200, 'user:2', 150, 'user:3');

      console.log('Redis test data created');
    } finally {
      await redis.quit();
    }
  }, 180000); // 3 minute timeout for container startup

  afterAll(async () => {
    console.log('Cleaning up Redis container...');

    // Stop container
    if (container) {
      await container.stop();
    }

    // Clean up test backup directory
    await rm(testBackupDir, { recursive: true, force: true });

    console.log('Redis cleanup complete');
  }, 60000);

  describe('Redis 7', () => {
    it('should create a backup successfully', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 0,
      };

      const result = await executeRedisBackup(config, testBackupDir);

      // Verify result structure
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.filePath).toContain('redis_');
      expect(result.filePath).toContain('.gz'); // Compressed
      expect(result.metadata).toBeDefined();
      expect(result.executionLog).toBeDefined();

      // Verify the backup file exists
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBe(result.fileSize);

      // Verify metadata contains expected info
      const metadata = result.metadata as { format: string; compressed: boolean; database: number };
      expect(metadata.format).toBe('rdb');
      expect(metadata.compressed).toBe(true);
      expect(metadata.database).toBe(0);
    }, 60000);

    it('should include execution log with timestamps', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 0,
      };

      const result = await executeRedisBackup(config, testBackupDir);

      // Verify execution log contains expected entries
      expect(result.executionLog).toContain('Starting Redis backup');
      expect(result.executionLog).toContain('RDB dump completed successfully');
      expect(result.executionLog).toContain('Compressing backup');

      // Verify timestamps in log
      const isoDatePattern = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(result.executionLog).toMatch(isoDatePattern);
    }, 60000);

    it('should fail with unreachable host', async () => {
      const config = {
        host: 'localhost',
        port: 59999, // Unlikely to be in use
        database: 0,
      };

      await expect(executeRedisBackup(config, testBackupDir)).rejects.toThrow();
    }, 30000);
  });

  describe('Backup file content', () => {
    it('should produce a compressed RDB backup', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 0,
      };

      const result = await executeRedisBackup(config, testBackupDir);

      // Check file exists and is compressed
      expect(result.filePath).toMatch(/\.rdb\.gz$/);
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBeGreaterThan(50); // RDB files can be small
    }, 60000);
  });

  describe('Multiple sequential backups', () => {
    it('should create unique backup files for each run', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 0,
      };

      // Run multiple backups with a small delay
      const results = await Promise.all([
        executeRedisBackup(config, testBackupDir),
        new Promise(resolve => setTimeout(resolve, 100)).then(() =>
          executeRedisBackup(config, testBackupDir)
        ),
      ]);

      // Each backup should have a unique filename due to timestamp
      const filePaths = results.map(r => r.filePath);
      expect(new Set(filePaths).size).toBe(filePaths.length);

      // Both backups should succeed
      for (const result of results) {
        expect(result.fileSize).toBeGreaterThan(0);
      }
    }, 120000);
  });
});
