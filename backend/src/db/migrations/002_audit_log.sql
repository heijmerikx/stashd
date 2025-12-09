-- Audit log table for tracking changes to jobs, destinations, and notification channels

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    entity_type VARCHAR(50) NOT NULL, -- 'backup_job', 'backup_destination', 'notification_channel'
    entity_id INTEGER NOT NULL,
    entity_name VARCHAR(255),
    action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'run'
    changes JSONB, -- Stores the changes made (old and new values)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);
