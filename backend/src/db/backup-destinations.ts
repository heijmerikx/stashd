import { pool } from './index.js';

export interface LocalDestinationConfig {
  path: string;
}

// Full S3 config with all credentials (used by s3-service for actual operations)
// Credentials are resolved from credential_provider at runtime
export interface S3DestinationConfigFull {
  bucket: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  endpoint?: string;
  prefix?: string;
}

// S3 config as stored in DB - credentials come from credential_provider_id
export interface S3DestinationConfig {
  bucket: string;
  prefix?: string;
}

export type DestinationConfig = LocalDestinationConfig | S3DestinationConfig;

export interface BackupDestination {
  id: number;
  name: string;
  type: 'local' | 's3';
  config: DestinationConfig;
  credential_provider_id: number | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getAllBackupDestinations(): Promise<BackupDestination[]> {
  const result = await pool.query(
    'SELECT * FROM backup_destinations ORDER BY name'
  );
  return result.rows;
}

export async function getBackupDestinationById(id: number): Promise<BackupDestination | null> {
  const result = await pool.query(
    'SELECT * FROM backup_destinations WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getEnabledBackupDestinations(): Promise<BackupDestination[]> {
  const result = await pool.query(
    'SELECT * FROM backup_destinations WHERE enabled = true ORDER BY name'
  );
  return result.rows;
}

export async function createBackupDestination(
  name: string,
  type: string,
  config: object,
  enabled: boolean = true,
  credentialProviderId: number | null = null
): Promise<BackupDestination> {
  const result = await pool.query(
    `INSERT INTO backup_destinations (name, type, config, enabled, credential_provider_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, type, JSON.stringify(config), enabled, credentialProviderId]
  );
  return result.rows[0];
}

export async function updateBackupDestination(
  id: number,
  name: string,
  type: string,
  config: object,
  enabled: boolean,
  credentialProviderId: number | null = null
): Promise<BackupDestination | null> {
  const result = await pool.query(
    `UPDATE backup_destinations
     SET name = $1, type = $2, config = $3, enabled = $4, credential_provider_id = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [name, type, JSON.stringify(config), enabled, credentialProviderId, id]
  );
  return result.rows[0] || null;
}

export async function deleteBackupDestination(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM backup_destinations WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// Batch load destinations for multiple jobs at once (fixes N+1 query problem)
export async function getDestinationsForJobsBatch(jobIds: number[]): Promise<Map<number, BackupDestination[]>> {
  if (jobIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT bjd.backup_job_id, d.*
     FROM backup_destinations d
     JOIN backup_job_destinations bjd ON d.id = bjd.destination_id
     WHERE bjd.backup_job_id = ANY($1)
     ORDER BY d.name`,
    [jobIds]
  );

  const destMap = new Map<number, BackupDestination[]>();

  // Initialize with empty arrays for all requested job IDs
  for (const id of jobIds) {
    destMap.set(id, []);
  }

  // Group results by job ID
  for (const row of result.rows) {
    const jobId = row.backup_job_id;
    const dests = destMap.get(jobId) || [];
    dests.push({
      id: row.id,
      name: row.name,
      type: row.type,
      config: row.config,
      credential_provider_id: row.credential_provider_id,
      enabled: row.enabled,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    destMap.set(jobId, dests);
  }

  return destMap;
}

// Get destinations for a specific backup job
export async function getDestinationsForJob(jobId: number): Promise<BackupDestination[]> {
  const result = await pool.query(
    `SELECT d.* FROM backup_destinations d
     JOIN backup_job_destinations bjd ON d.id = bjd.destination_id
     WHERE bjd.backup_job_id = $1
     ORDER BY d.name`,
    [jobId]
  );
  return result.rows;
}

// Set destinations for a backup job (replaces existing)
export async function setDestinationsForJob(jobId: number, destinationIds: number[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove existing destinations
    await client.query(
      'DELETE FROM backup_job_destinations WHERE backup_job_id = $1',
      [jobId]
    );

    // Add new destinations
    for (const destId of destinationIds) {
      await client.query(
        'INSERT INTO backup_job_destinations (backup_job_id, destination_id) VALUES ($1, $2)',
        [jobId, destId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Check if a destination is in use by any backup jobs
export async function isDestinationInUse(destinationId: number): Promise<boolean> {
  const result = await pool.query(
    'SELECT COUNT(*) FROM backup_job_destinations WHERE destination_id = $1',
    [destinationId]
  );
  return parseInt(result.rows[0].count) > 0;
}

// Get storage stats for a destination
export async function getDestinationStats(destinationId: number): Promise<{
  total_backups: number;
  total_size: number;
  last_backup: Date | null;
}> {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_backups,
       COALESCE(SUM(file_size), 0) as total_size,
       MAX(completed_at) as last_backup
     FROM backup_history
     WHERE destination_id = $1 AND status = 'completed'`,
    [destinationId]
  );
  return {
    total_backups: parseInt(result.rows[0].total_backups),
    total_size: parseInt(result.rows[0].total_size),
    last_backup: result.rows[0].last_backup
  };
}

export interface DestinationStats {
  successful_backups: number;
  total_size: number;
  last_backup: Date | null;
}

// Batch load stats for multiple destinations (fixes N+1 query problem)
export async function getDestinationStatsBatch(destinationIds: number[]): Promise<Map<number, DestinationStats>> {
  if (destinationIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT
       destination_id,
       COUNT(*) as successful_backups,
       COALESCE(SUM(file_size), 0) as total_size,
       MAX(completed_at) as last_backup
     FROM backup_history
     WHERE destination_id = ANY($1) AND status = 'completed'
     GROUP BY destination_id`,
    [destinationIds]
  );

  const statsMap = new Map<number, DestinationStats>();

  // Initialize with zeros for all requested destination IDs
  for (const id of destinationIds) {
    statsMap.set(id, {
      successful_backups: 0,
      total_size: 0,
      last_backup: null
    });
  }

  // Fill in actual stats from query results
  for (const row of result.rows) {
    statsMap.set(row.destination_id, {
      successful_backups: parseInt(row.successful_backups),
      total_size: parseInt(row.total_size),
      last_backup: row.last_backup
    });
  }

  return statsMap;
}

// Get destinations with credential provider info joined
export interface BackupDestinationWithProvider extends BackupDestination {
  credential_provider?: {
    id: number;
    name: string;
    type: string;
    config: object;
  } | null;
}

export async function getAllBackupDestinationsWithProviders(): Promise<BackupDestinationWithProvider[]> {
  const result = await pool.query(
    `SELECT
       bd.*,
       cp.id as cp_id,
       cp.name as cp_name,
       cp.type as cp_type,
       cp.config as cp_config
     FROM backup_destinations bd
     LEFT JOIN credential_providers cp ON bd.credential_provider_id = cp.id
     ORDER BY bd.name`
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    config: row.config,
    credential_provider_id: row.credential_provider_id,
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    credential_provider: row.cp_id ? {
      id: row.cp_id,
      name: row.cp_name,
      type: row.cp_type,
      config: row.cp_config,
    } : null,
  }));
}
