import { pool } from './index.js';

export interface NotificationChannel {
  id: number;
  name: string;
  type: 'email' | 'discord';
  config: EmailConfig | DiscordConfig;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_email: string;
  to_emails: string[];
}

export interface DiscordConfig {
  webhook_url: string;
}

export async function getAllNotificationChannels(): Promise<NotificationChannel[]> {
  const result = await pool.query(
    'SELECT * FROM notification_channels ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getNotificationChannelById(id: number): Promise<NotificationChannel | null> {
  const result = await pool.query(
    'SELECT * FROM notification_channels WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createNotificationChannel(
  name: string,
  type: string,
  config: object,
  enabled: boolean = true
): Promise<NotificationChannel> {
  const result = await pool.query(
    `INSERT INTO notification_channels (name, type, config, enabled)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, type, JSON.stringify(config), enabled]
  );
  return result.rows[0];
}

export async function updateNotificationChannel(
  id: number,
  name: string,
  type: string,
  config: object,
  enabled: boolean
): Promise<NotificationChannel | null> {
  const result = await pool.query(
    `UPDATE notification_channels
     SET name = $1, type = $2, config = $3, enabled = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [name, type, JSON.stringify(config), enabled, id]
  );
  return result.rows[0] || null;
}

export async function deleteNotificationChannel(id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM notification_channels WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getEnabledNotificationChannels(): Promise<NotificationChannel[]> {
  const result = await pool.query(
    'SELECT * FROM notification_channels WHERE enabled = true'
  );
  return result.rows;
}
