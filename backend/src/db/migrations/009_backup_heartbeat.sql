-- Add heartbeat column to track active backups
-- This helps distinguish between running jobs and orphaned jobs from crashes

ALTER TABLE backup_history
ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP;

-- Update existing running entries to have a heartbeat (prevents immediate cleanup)
UPDATE backup_history
SET heartbeat_at = started_at
WHERE status = 'running' AND heartbeat_at IS NULL;
