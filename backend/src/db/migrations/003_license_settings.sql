-- License settings table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default license key (empty = not registered)
INSERT INTO settings (key, value) VALUES ('license_key', '') ON CONFLICT (key) DO NOTHING;
