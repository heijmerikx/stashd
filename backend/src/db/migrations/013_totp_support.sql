-- Add TOTP (Time-based One-Time Password) support to users table
ALTER TABLE users ADD COLUMN totp_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_backup_codes TEXT[];

COMMENT ON COLUMN users.totp_secret IS 'Encrypted TOTP secret for authenticator apps';
COMMENT ON COLUMN users.totp_enabled IS 'Whether TOTP 2FA is enabled for this user';
COMMENT ON COLUMN users.totp_backup_codes IS 'Encrypted backup codes for account recovery';
