-- Add retry_count column to backup_jobs if it doesn't exist
-- This column was added to 001_initial_schema.sql after some deployments

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'backup_jobs' AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE backup_jobs ADD COLUMN retry_count INTEGER DEFAULT 3;
    END IF;
END $$;
