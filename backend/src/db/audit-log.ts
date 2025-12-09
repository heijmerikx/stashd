import { pool } from './index.js';

export type AuditEntityType = 'backup_job' | 'backup_destination' | 'notification_channel' | 'credential_provider';

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  entity_type: AuditEntityType;
  entity_id: number;
  entity_name: string | null;
  action: 'create' | 'update' | 'delete' | 'run';
  changes: object | null;
  created_at: Date;
}

export interface CreateAuditLogParams {
  userId?: number | null;
  userEmail?: string | null;
  entityType: AuditEntityType;
  entityId: number;
  entityName?: string | null;
  action: 'create' | 'update' | 'delete' | 'run';
  changes?: object | null;
}

export async function createAuditLogEntry(params: CreateAuditLogParams): Promise<AuditLogEntry> {
  const result = await pool.query(
    `INSERT INTO audit_log (user_id, user_email, entity_type, entity_id, entity_name, action, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.userId || null,
      params.userEmail || null,
      params.entityType,
      params.entityId,
      params.entityName || null,
      params.action,
      params.changes ? JSON.stringify(params.changes) : null
    ]
  );
  return result.rows[0];
}

export async function getAuditLogByEntity(
  entityType: string,
  entityId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const [entriesResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM audit_log
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [entityType, entityId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM audit_log
       WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    )
  ]);

  return {
    entries: entriesResult.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

export async function getRecentAuditLog(
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const [entriesResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM audit_log
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query(`SELECT COUNT(*) as total FROM audit_log`)
  ]);

  return {
    entries: entriesResult.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

export async function getAuditLogByUser(
  userId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const [entriesResult, countResult] = await Promise.all([
    pool.query(
      `SELECT * FROM audit_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM audit_log WHERE user_id = $1`,
      [userId]
    )
  ]);

  return {
    entries: entriesResult.rows,
    total: parseInt(countResult.rows[0].total)
  };
}
