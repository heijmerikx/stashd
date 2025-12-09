import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stashd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

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
