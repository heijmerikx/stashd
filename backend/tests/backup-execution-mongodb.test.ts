/**
 * MongoDB Backup Execution Tests
 *
 * These tests verify the actual backup process for MongoDB databases.
 * They use testcontainers to spin up real MongoDB instances.
 *
 * NOTE: MongoDB containers can be slow to start and may fail on resource-constrained
 * systems. These tests are skipped by default - set ENABLE_MONGODB_TESTS=true to run.
 *
 * Run with: ENABLE_MONGODB_TESTS=true npm run test:execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { mkdir, rm, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skip MongoDB tests unless explicitly enabled (they require significant resources)
const skipMongoDBTests = !process.env.ENABLE_MONGODB_TESTS;

// Import backup executor - need to do dynamic import to ensure env vars are set first
let executeMongoDBBackup: (config: object, backupDir: string) => Promise<{
  fileSize: number;
  filePath: string;
  metadata: object;
  executionLog?: string;
}>;

describe.skipIf(skipMongoDBTests)('MongoDB Backup Execution', () => {
  // Use test directory within the project to avoid /tmp permission issues
  const testRunId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const testBackupDir = join(__dirname, `.test-backups-mongodb-${testRunId}`);
  let container: StartedMongoDBContainer;
  let connectionString: string;

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
    executeMongoDBBackup = async (config: object, _backupDir: string) => {
      return executeBackupToTemp('mongodb', config);
    };

    // Start MongoDB container with extended startup timeout
    console.log('Starting MongoDB container...');
    container = await new MongoDBContainer('mongo:7.0')
      .withStartupTimeout(120000) // 2 minutes for MongoDB startup
      .start();
    connectionString = container.getConnectionString();

    console.log(`MongoDB ready at ${connectionString}`);

    // Create test data using MongoDB client
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(connectionString);

    try {
      await client.connect();
      const db = client.db('testdb');

      // Create users collection
      await db.collection('users').insertMany([
        { name: 'Alice', email: 'alice@example.com', createdAt: new Date() },
        { name: 'Bob', email: 'bob@example.com', createdAt: new Date() },
        { name: 'Charlie', email: 'charlie@example.com', createdAt: new Date() },
      ]);

      // Create orders collection
      await db.collection('orders').insertMany([
        { userId: 1, amount: 99.99, status: 'completed', createdAt: new Date() },
        { userId: 1, amount: 49.99, status: 'pending', createdAt: new Date() },
        { userId: 2, amount: 199.99, status: 'completed', createdAt: new Date() },
      ]);

      console.log('MongoDB test data created');
    } finally {
      await client.close();
    }
  }, 180000); // 3 minute timeout for container startup

  afterAll(async () => {
    console.log('Cleaning up MongoDB container...');

    // Stop container
    if (container) {
      await container.stop();
    }

    // Clean up test backup directory
    await rm(testBackupDir, { recursive: true, force: true });

    console.log('MongoDB cleanup complete');
  }, 60000);

  describe('MongoDB 7.0', () => {
    it('should create a backup successfully', async () => {
      // Append database name to connection string
      const config = {
        connection_string: `${connectionString}/testdb`,
      };

      const result = await executeMongoDBBackup(config, testBackupDir);

      // Verify result structure
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.filePath).toContain('mongodb_');
      expect(result.filePath).toContain('.tar.gz'); // Compressed
      expect(result.metadata).toBeDefined();
      expect(result.executionLog).toBeDefined();

      // Verify the backup file exists
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBe(result.fileSize);

      // Verify metadata contains expected info
      const metadata = result.metadata as { format: string; compressed: boolean };
      expect(metadata.format).toBe('bson');
      expect(metadata.compressed).toBe(true);
    }, 60000);

    it('should include execution log with timestamps', async () => {
      const config = {
        connection_string: `${connectionString}/testdb`,
      };

      const result = await executeMongoDBBackup(config, testBackupDir);

      // Verify execution log contains expected entries
      expect(result.executionLog).toContain('Starting MongoDB backup');
      expect(result.executionLog).toContain('Dump completed successfully');
      expect(result.executionLog).toContain('Compressing backup');

      // Verify timestamps in log
      const isoDatePattern = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(result.executionLog).toMatch(isoDatePattern);
    }, 60000);

    it('should fail with invalid connection string', async () => {
      const config = {
        connection_string: 'mongodb://invalid:27017/testdb?serverSelectionTimeoutMS=1000',
      };

      await expect(executeMongoDBBackup(config, testBackupDir)).rejects.toThrow();
    }, 30000);
  });

  describe('Backup file content', () => {
    it('should produce a compressed BSON backup', async () => {
      const config = {
        connection_string: `${connectionString}/testdb`,
      };

      const result = await executeMongoDBBackup(config, testBackupDir);

      // Check file exists and is compressed
      expect(result.filePath).toMatch(/\.tar\.gz$/);
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBeGreaterThan(100); // Should have meaningful content
    }, 60000);
  });

  describe('Multiple sequential backups', () => {
    it('should create unique backup files for each run', async () => {
      const config = {
        connection_string: `${connectionString}/testdb`,
      };

      // Run multiple backups with a small delay
      const results = await Promise.all([
        executeMongoDBBackup(config, testBackupDir),
        new Promise(resolve => setTimeout(resolve, 100)).then(() =>
          executeMongoDBBackup(config, testBackupDir)
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
