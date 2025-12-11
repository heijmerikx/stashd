import pg from 'pg';

const { Pool } = pg;

// Pool instance - can be reconfigured for testing
let pool: pg.Pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stashd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

/**
 * Get the current database pool
 */
export function getPool(): pg.Pool {
  return pool;
}

/**
 * Set a custom pool (used for testing)
 */
export function setPool(customPool: pg.Pool): void {
  pool = customPool;
}

/**
 * Reinitialize the pool with current environment variables
 * Useful after environment variables have been set (e.g., by Testcontainers)
 */
export function reinitializePool(): pg.Pool {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stashd',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  return pool;
}

// User queries
export async function getUserByEmail(email: string) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

export async function createUser(email: string, hashedPassword: string) {
  const result = await pool.query(
    'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, created_at',
    [email, hashedPassword]
  );
  return result.rows[0];
}

export async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count);
}

export async function getUserById(id: number) {
  const result = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function updateUserProfile(id: number, name: string) {
  const result = await pool.query(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, created_at',
    [name, id]
  );
  return result.rows[0] || null;
}

export async function updateUserPassword(id: number, hashedPassword: string) {
  const result = await pool.query(
    'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, email, name, created_at',
    [hashedPassword, id]
  );
  return result.rows[0] || null;
}

export async function getUserPasswordHash(id: number) {
  const result = await pool.query('SELECT password FROM users WHERE id = $1', [id]);
  return result.rows[0]?.password || null;
}

// User management (for team/enterprise features)
export async function getAllUsers() {
  const result = await pool.query(
    'SELECT id, email, name, created_at FROM users ORDER BY created_at ASC'
  );
  return result.rows;
}

export async function deleteUser(id: number) {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// TOTP (Two-Factor Authentication) queries
export async function getUserTotpStatus(id: number) {
  const result = await pool.query(
    'SELECT totp_enabled, totp_secret IS NOT NULL as has_secret FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function setUserTotpSecret(id: number, encryptedSecret: string) {
  const result = await pool.query(
    'UPDATE users SET totp_secret = $1 WHERE id = $2 RETURNING id',
    [encryptedSecret, id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function enableUserTotp(id: number, encryptedBackupCodes: string[]) {
  const result = await pool.query(
    'UPDATE users SET totp_enabled = TRUE, totp_backup_codes = $1 WHERE id = $2 AND totp_secret IS NOT NULL RETURNING id',
    [encryptedBackupCodes, id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function disableUserTotp(id: number) {
  const result = await pool.query(
    'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_backup_codes = NULL WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function getUserTotpSecret(id: number) {
  const result = await pool.query(
    'SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = TRUE',
    [id]
  );
  return result.rows[0]?.totp_secret || null;
}

export async function getUserTotpSecretForSetup(id: number) {
  const result = await pool.query(
    'SELECT totp_secret FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0]?.totp_secret || null;
}

export async function getUserBackupCodes(id: number) {
  const result = await pool.query(
    'SELECT totp_backup_codes FROM users WHERE id = $1 AND totp_enabled = TRUE',
    [id]
  );
  return result.rows[0]?.totp_backup_codes || null;
}

export async function updateUserBackupCodes(id: number, encryptedBackupCodes: string[]) {
  const result = await pool.query(
    'UPDATE users SET totp_backup_codes = $1 WHERE id = $2 RETURNING id',
    [encryptedBackupCodes, id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// For backwards compatibility, also export pool directly
export { pool };
