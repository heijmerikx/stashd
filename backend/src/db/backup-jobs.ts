import { pool } from './index.js';

export type BackupJobType = 'postgres' | 'mongodb' | 'mysql' | 'redis' | 'files' | 's3';

export interface BackupJob {
  id: number;
  name: string;
  type: BackupJobType;
  config: PostgresBackupConfig | MongoDBBackupConfig | S3SourceBackupConfig | object;
  schedule: string | null;
  retention_days: number;
  retry_count: number;
  enabled: boolean;
  source_credential_provider_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostgresBackupConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface MongoDBBackupConfig {
  connection_string: string;
  database: string;
}

export interface RedisBackupConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: number;
  tls?: boolean;
}

// S3 source config with inline credentials
export interface S3SourceBackupConfigInline {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  access_key_id: string;
  secret_access_key: string;
}

// S3 source config when using credential provider
export interface S3SourceBackupConfigWithProvider {
  bucket: string;
  prefix?: string;
}

export type S3SourceBackupConfig = S3SourceBackupConfigInline | S3SourceBackupConfigWithProvider;

export interface BackupJobWithNotifications extends BackupJob {
  notification_channels: {
    id: number;
    name: string;
    on_success: boolean;
    on_failure: boolean;
  }[];
}

export async function getAllBackupJobs(): Promise<BackupJob[]> {
  const result = await pool.query(
    'SELECT * FROM backup_jobs ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getBackupJobById(id: number): Promise<BackupJob | null> {
  const result = await pool.query(
    'SELECT * FROM backup_jobs WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getBackupJobWithNotifications(id: number): Promise<BackupJobWithNotifications | null> {
  const jobResult = await pool.query(
    'SELECT * FROM backup_jobs WHERE id = $1',
    [id]
  );

  if (!jobResult.rows[0]) return null;

  const notificationsResult = await pool.query(
    `SELECT nc.id, nc.name, bjn.on_success, bjn.on_failure
     FROM backup_job_notifications bjn
     JOIN notification_channels nc ON nc.id = bjn.notification_channel_id
     WHERE bjn.backup_job_id = $1`,
    [id]
  );

  return {
    ...jobResult.rows[0],
    notification_channels: notificationsResult.rows
  };
}

export async function createBackupJob(
  name: string,
  type: string,
  config: object,
  schedule: string | null,
  retention_days: number,
  retry_count: number = 3,
  enabled: boolean = true,
  sourceCredentialProviderId: number | null = null
): Promise<BackupJob> {
  const result = await pool.query(
    `INSERT INTO backup_jobs (name, type, config, schedule, retention_days, retry_count, enabled, source_credential_provider_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, type, JSON.stringify(config), schedule, retention_days, retry_count, enabled, sourceCredentialProviderId]
  );
  return result.rows[0];
}

export async function updateBackupJob(
  id: number,
  name: string,
  type: string,
  config: object,
  schedule: string | null,
  retention_days: number,
  retry_count: number,
  enabled: boolean,
  sourceCredentialProviderId: number | null = null
): Promise<BackupJob | null> {
  const result = await pool.query(
    `UPDATE backup_jobs
     SET name = $1, type = $2, config = $3, schedule = $4,
         retention_days = $5, retry_count = $6, enabled = $7, source_credential_provider_id = $8, updated_at = CURRENT_TIMESTAMP
     WHERE id = $9
     RETURNING *`,
    [name, type, JSON.stringify(config), schedule, retention_days, retry_count, enabled, sourceCredentialProviderId, id]
  );
  return result.rows[0] || null;
}

export async function deleteBackupJob(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM backup_jobs WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setBackupJobNotifications(
  backupJobId: number,
  notifications: { channelId: number; onSuccess: boolean; onFailure: boolean }[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove existing notifications
    await client.query(
      'DELETE FROM backup_job_notifications WHERE backup_job_id = $1',
      [backupJobId]
    );

    // Add new notifications
    for (const notification of notifications) {
      await client.query(
        `INSERT INTO backup_job_notifications (backup_job_id, notification_channel_id, on_success, on_failure)
         VALUES ($1, $2, $3, $4)`,
        [backupJobId, notification.channelId, notification.onSuccess, notification.onFailure]
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

export async function getEnabledBackupJobs(): Promise<BackupJob[]> {
  const result = await pool.query(
    'SELECT * FROM backup_jobs WHERE enabled = true'
  );
  return result.rows;
}

export async function getBackupJobsWithSchedule(): Promise<BackupJob[]> {
  const result = await pool.query(
    'SELECT * FROM backup_jobs WHERE enabled = true AND schedule IS NOT NULL'
  );
  return result.rows;
}
