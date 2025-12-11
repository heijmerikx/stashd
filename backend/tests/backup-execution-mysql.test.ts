/**
 * MySQL Backup Execution Tests
 *
 * These tests verify the actual backup process for MySQL databases.
 * They use testcontainers to spin up real MySQL instances.
 *
 * NOTE: MySQL containers can be slow to start and may fail on resource-constrained
 * systems. These tests are skipped by default - set ENABLE_MYSQL_TESTS=true to run.
 *
 * Run with: ENABLE_MYSQL_TESTS=true npm run test:execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { mkdir, rm, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skip MySQL tests unless explicitly enabled (they require significant resources)
const skipMySQLTests = !process.env.ENABLE_MYSQL_TESTS;

// Import backup executor - need to do dynamic import to ensure env vars are set first
let executeMySQLBackup: (config: object, backupDir: string) => Promise<{
  fileSize: number;
  filePath: string;
  metadata: object;
  executionLog?: string;
}>;

describe.skipIf(skipMySQLTests)('MySQL Backup Execution', () => {
  // Use test directory within the project to avoid /tmp permission issues
  const testRunId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const testBackupDir = join(__dirname, `.test-backups-mysql-${testRunId}`);
  let container: StartedMySqlContainer;

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
    executeMySQLBackup = async (config: object, _backupDir: string) => {
      return executeBackupToTemp('mysql', config);
    };

    // Start MySQL container with extended startup timeout
    console.log('Starting MySQL container...');
    container = await new MySqlContainer('mysql:8.0')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withRootPassword('rootpass')
      .withUserPassword('testpass')
      .withStartupTimeout(120000) // 2 minutes for MySQL startup
      .start();

    console.log(`MySQL ready at ${container.getHost()}:${container.getPort()}`);

    // Create test data using container's exec functionality
    const result = await container.executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await container.executeQuery(`
      INSERT INTO users (name, email) VALUES
      ('Alice', 'alice@example.com'),
      ('Bob', 'bob@example.com'),
      ('Charlie', 'charlie@example.com')
    `);

    await container.executeQuery(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await container.executeQuery(`
      INSERT INTO orders (user_id, amount, status) VALUES
      (1, 99.99, 'completed'),
      (1, 49.99, 'pending'),
      (2, 199.99, 'completed')
    `);

    console.log('MySQL test data created');
  }, 180000); // 3 minute timeout for container startup

  afterAll(async () => {
    console.log('Cleaning up MySQL container...');

    // Stop container
    if (container) {
      await container.stop();
    }

    // Clean up test backup directory
    await rm(testBackupDir, { recursive: true, force: true });

    console.log('MySQL cleanup complete');
  }, 60000);

  describe('MySQL 8.0', () => {
    it('should create a backup successfully', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        ssl: false, // Local container doesn't use SSL
      };

      const result = await executeMySQLBackup(config, testBackupDir);

      // Verify result structure
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.filePath).toContain('mysql_testdb_');
      expect(result.filePath).toContain('.gz'); // Compressed
      expect(result.metadata).toBeDefined();
      expect(result.executionLog).toBeDefined();

      // Verify the backup file exists
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBe(result.fileSize);

      // Verify metadata contains expected info
      const metadata = result.metadata as { database: string; host: string; format: string; compressed: boolean };
      expect(metadata.database).toBe('testdb');
      expect(metadata.format).toBe('sql');
      expect(metadata.compressed).toBe(true);
    }, 60000);

    it('should include execution log with timestamps', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        ssl: false,
      };

      const result = await executeMySQLBackup(config, testBackupDir);

      // Verify execution log contains expected entries
      expect(result.executionLog).toContain('Starting MySQL backup');
      expect(result.executionLog).toContain('Dump completed successfully');
      expect(result.executionLog).toContain('Compressing backup');

      // Verify timestamps in log
      const isoDatePattern = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(result.executionLog).toMatch(isoDatePattern);
    }, 60000);

    it('should fail with invalid credentials', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'testdb',
        username: 'testuser',
        password: 'wrong_password',
        ssl: false,
      };

      await expect(executeMySQLBackup(config, testBackupDir)).rejects.toThrow();
    }, 60000);

    it('should fail with non-existent database', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'nonexistent_db',
        username: 'testuser',
        password: 'testpass',
        ssl: false,
      };

      await expect(executeMySQLBackup(config, testBackupDir)).rejects.toThrow();
    }, 60000);
  });

  describe('Backup file content', () => {
    it('should produce a compressed SQL backup', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        ssl: false,
      };

      const result = await executeMySQLBackup(config, testBackupDir);

      // Check file exists and is compressed
      expect(result.filePath).toMatch(/\.sql\.gz$/);
      const fileStats = await stat(result.filePath);
      expect(fileStats.size).toBeGreaterThan(100); // Should have meaningful content
    }, 60000);
  });

  describe('Multiple sequential backups', () => {
    it('should create unique backup files for each run', async () => {
      const config = {
        host: container.getHost(),
        port: container.getPort(),
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        ssl: false,
      };

      // Run multiple backups with a small delay
      const results = await Promise.all([
        executeMySQLBackup(config, testBackupDir),
        new Promise(resolve => setTimeout(resolve, 100)).then(() =>
          executeMySQLBackup(config, testBackupDir)
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
