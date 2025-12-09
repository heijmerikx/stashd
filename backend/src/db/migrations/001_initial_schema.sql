-- Initial database schema

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Channels
CREATE TABLE notification_channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup Destinations
CREATE TABLE backup_destinations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup Jobs
CREATE TABLE backup_jobs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    schedule VARCHAR(100),
    retention_days INTEGER DEFAULT 30,
    retry_count INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backup Job to Destinations (many-to-many)
CREATE TABLE backup_job_destinations (
    backup_job_id INTEGER REFERENCES backup_jobs(id) ON DELETE CASCADE,
    destination_id INTEGER REFERENCES backup_destinations(id) ON DELETE CASCADE,
    PRIMARY KEY (backup_job_id, destination_id)
);

-- Backup Job Notification Links
CREATE TABLE backup_job_notifications (
    backup_job_id INTEGER REFERENCES backup_jobs(id) ON DELETE CASCADE,
    notification_channel_id INTEGER REFERENCES notification_channels(id) ON DELETE CASCADE,
    on_success BOOLEAN DEFAULT false,
    on_failure BOOLEAN DEFAULT true,
    PRIMARY KEY (backup_job_id, notification_channel_id)
);

-- Backup History
CREATE TABLE backup_history (
    id SERIAL PRIMARY KEY,
    backup_job_id INTEGER REFERENCES backup_jobs(id) ON DELETE CASCADE,
    destination_id INTEGER REFERENCES backup_destinations(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,  -- Groups all destination results for a single job run
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    file_size BIGINT,
    file_path VARCHAR(1024),
    error_message TEXT,
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_backup_history_job_id ON backup_history(backup_job_id);
CREATE INDEX idx_backup_history_destination_id ON backup_history(destination_id);
CREATE INDEX idx_backup_history_run_id ON backup_history(run_id);
CREATE INDEX idx_backup_history_status ON backup_history(status);
CREATE INDEX idx_backup_history_started_at ON backup_history(started_at);
