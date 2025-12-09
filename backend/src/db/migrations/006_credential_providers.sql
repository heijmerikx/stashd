-- Credential Providers for reusable cloud credentials
CREATE TABLE credential_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 's3' for S3-compatible (AWS, Hetzner, MinIO, etc.)
    config JSONB NOT NULL, -- encrypted credentials: endpoint, region, access_key_id, secret_access_key
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add credential_provider_id to backup_destinations (nullable for local destinations)
ALTER TABLE backup_destinations
ADD COLUMN credential_provider_id INTEGER REFERENCES credential_providers(id) ON DELETE SET NULL;

-- Add credential_provider_id to backup_jobs for S3 source type (nullable for non-S3 sources)
ALTER TABLE backup_jobs
ADD COLUMN source_credential_provider_id INTEGER REFERENCES credential_providers(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX idx_backup_destinations_credential_provider ON backup_destinations(credential_provider_id);
CREATE INDEX idx_backup_jobs_source_credential_provider ON backup_jobs(source_credential_provider_id);
