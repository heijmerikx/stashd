-- Add execution_log column to store stdout/stderr from backup commands
ALTER TABLE backup_history
ADD COLUMN IF NOT EXISTS execution_log TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN backup_history.execution_log IS 'Captured stdout/stderr from backup command execution';
