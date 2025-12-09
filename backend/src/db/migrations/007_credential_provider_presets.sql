-- Add provider_preset to track which S3-compatible service is being used
-- This allows the UI to show appropriate fields and auto-fill defaults

ALTER TABLE credential_providers
ADD COLUMN provider_preset VARCHAR(50) DEFAULT 'custom';

-- Update the comment for clarity
COMMENT ON COLUMN credential_providers.provider_preset IS 'S3-compatible provider preset: aws, hetzner, backblaze, wasabi, minio, cloudflare, railway, custom';
