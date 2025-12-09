import { pool } from './index.js';

// S3-compatible provider presets
export type S3ProviderPreset = 'aws' | 'hetzner' | 'backblaze' | 'wasabi' | 'minio' | 'cloudflare' | 'custom';

export interface S3CredentialConfig {
  endpoint?: string; // For S3-compatible storage (Hetzner, MinIO, etc.)
  region?: string;   // Required for AWS, optional/ignored for most S3-compatible services
  access_key_id: string;
  secret_access_key: string;
}

export type CredentialConfig = S3CredentialConfig;

export interface CredentialProvider {
  id: number;
  name: string;
  type: 's3'; // Currently only S3, can extend later
  provider_preset: S3ProviderPreset;
  config: CredentialConfig;
  created_at: Date;
  updated_at: Date;
}

export async function getAllCredentialProviders(): Promise<CredentialProvider[]> {
  const result = await pool.query(
    'SELECT * FROM credential_providers ORDER BY name'
  );
  return result.rows;
}

export async function getCredentialProviderById(id: number): Promise<CredentialProvider | null> {
  const result = await pool.query(
    'SELECT * FROM credential_providers WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getCredentialProvidersByType(type: string): Promise<CredentialProvider[]> {
  const result = await pool.query(
    'SELECT * FROM credential_providers WHERE type = $1 ORDER BY name',
    [type]
  );
  return result.rows;
}

export async function createCredentialProvider(
  name: string,
  type: string,
  config: CredentialConfig | Record<string, unknown>,
  providerPreset: S3ProviderPreset = 'custom'
): Promise<CredentialProvider> {
  const result = await pool.query(
    `INSERT INTO credential_providers (name, type, config, provider_preset)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, type, JSON.stringify(config), providerPreset]
  );
  return result.rows[0];
}

export async function updateCredentialProvider(
  id: number,
  name: string,
  type: string,
  config: CredentialConfig | Record<string, unknown>,
  providerPreset: S3ProviderPreset = 'custom'
): Promise<CredentialProvider | null> {
  const result = await pool.query(
    `UPDATE credential_providers
     SET name = $1, type = $2, config = $3, provider_preset = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [name, type, JSON.stringify(config), providerPreset, id]
  );
  return result.rows[0] || null;
}

export async function deleteCredentialProvider(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM credential_providers WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// Check if a credential provider is in use by any destinations or jobs
export async function isCredentialProviderInUse(id: number): Promise<{
  inUse: boolean;
  destinationCount: number;
  jobCount: number;
}> {
  const destResult = await pool.query(
    'SELECT COUNT(*) FROM backup_destinations WHERE credential_provider_id = $1',
    [id]
  );
  const jobResult = await pool.query(
    'SELECT COUNT(*) FROM backup_jobs WHERE source_credential_provider_id = $1',
    [id]
  );

  const destinationCount = parseInt(destResult.rows[0].count);
  const jobCount = parseInt(jobResult.rows[0].count);

  return {
    inUse: destinationCount > 0 || jobCount > 0,
    destinationCount,
    jobCount,
  };
}
