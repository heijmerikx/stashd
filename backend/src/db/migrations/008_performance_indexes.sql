-- Performance indexes for batch queries

-- Composite index for job stats and recent runs queries
-- Covers: getJobStatsBatch, getRecentRunStatusesBatch
CREATE INDEX IF NOT EXISTS idx_backup_history_job_status_started
ON backup_history(backup_job_id, status, started_at DESC);

-- Composite index for run grouping queries
-- Covers: getBackupRunsByJobId
CREATE INDEX IF NOT EXISTS idx_backup_history_job_run
ON backup_history(backup_job_id, run_id);

-- Composite index for destination stats
-- Covers: getDestinationStats
CREATE INDEX IF NOT EXISTS idx_backup_history_dest_status
ON backup_history(destination_id, status) WHERE status = 'completed';
