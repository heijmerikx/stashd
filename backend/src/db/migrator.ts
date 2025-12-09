import { pool } from './index.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'migrations');

interface Migration {
  version: number;
  name: string;
  filename: string;
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<number>> {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map(row => row.version));
}

async function getMigrationFiles(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const migrations: Migration[] = [];

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    // Parse filename: 001_initial_schema.sql -> version: 1, name: initial_schema
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      console.warn(`Skipping invalid migration filename: ${file}`);
      continue;
    }

    migrations.push({
      version: parseInt(match[1], 10),
      name: match[2],
      filename: file
    });
  }

  // Sort by version
  return migrations.sort((a, b) => a.version - b.version);
}

async function applyMigration(migration: Migration): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, migration.filename);
  const sql = await readFile(filePath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Execute the migration SQL
    await client.query(sql);

    // Record the migration
    await client.query(
      'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
      [migration.version, migration.name]
    );

    await client.query('COMMIT');
    console.log(`Applied migration ${migration.version}: ${migration.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');

  await ensureMigrationsTable();

  const appliedMigrations = await getAppliedMigrations();
  const allMigrations = await getMigrationFiles();

  const pendingMigrations = allMigrations.filter(m => !appliedMigrations.has(m.version));

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Found ${pendingMigrations.length} pending migration(s)`);

  for (const migration of pendingMigrations) {
    await applyMigration(migration);
  }

  console.log('All migrations applied successfully');
}

export async function getMigrationStatus(): Promise<{
  applied: { version: number; name: string; applied_at: Date }[];
  pending: { version: number; name: string }[];
}> {
  await ensureMigrationsTable();

  const appliedResult = await pool.query(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
  );
  const applied = appliedResult.rows;

  const appliedVersions = new Set(applied.map(m => m.version));
  const allMigrations = await getMigrationFiles();
  const pending = allMigrations
    .filter(m => !appliedVersions.has(m.version))
    .map(m => ({ version: m.version, name: m.name }));

  return { applied, pending };
}
