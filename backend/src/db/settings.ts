import { pool } from './index.js';

export interface Setting {
  key: string;
  value: string;
  updated_at: Date;
}

export async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query<Setting>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function getLicenseKey(): Promise<string | null> {
  return getSetting('license_key');
}

export async function setLicenseKey(licenseKey: string): Promise<void> {
  return setSetting('license_key', licenseKey);
}
