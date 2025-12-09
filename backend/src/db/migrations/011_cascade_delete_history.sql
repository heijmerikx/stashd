-- Change backup_history foreign keys from SET NULL to CASCADE
-- This ensures history records are deleted when their parent job or destination is deleted

-- Drop existing constraints
ALTER TABLE backup_history DROP CONSTRAINT IF EXISTS backup_history_backup_job_id_fkey;
ALTER TABLE backup_history DROP CONSTRAINT IF EXISTS backup_history_destination_id_fkey;

-- Re-add with CASCADE
ALTER TABLE backup_history
    ADD CONSTRAINT backup_history_backup_job_id_fkey
    FOREIGN KEY (backup_job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE;

ALTER TABLE backup_history
    ADD CONSTRAINT backup_history_destination_id_fkey
    FOREIGN KEY (destination_id) REFERENCES backup_destinations(id) ON DELETE CASCADE;
