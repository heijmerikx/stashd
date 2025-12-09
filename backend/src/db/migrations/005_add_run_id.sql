-- Add run_id column to backup_history to group destination results per job run
ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS run_id UUID;

-- Generate UUIDs for existing records (each record gets its own UUID since we can't group retroactively)
UPDATE backup_history SET run_id = gen_random_uuid() WHERE run_id IS NULL;

-- Make run_id NOT NULL after populating existing records
ALTER TABLE backup_history ALTER COLUMN run_id SET NOT NULL;

-- Add index for efficient grouping by run_id
CREATE INDEX IF NOT EXISTS idx_backup_history_run_id ON backup_history(run_id);
