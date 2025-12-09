/**
 * Audit log route handlers
 */

import { Response } from 'express';
import { getRecentAuditLog } from '../../db/audit-log.js';
import { AuthRequest } from '../../middleware/auth.js';

/**
 * GET / - Get all audit log entries (paginated)
 */
export async function listAuditLog(req: AuthRequest, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 0;
    const offset = page * limit;

    const result = await getRecentAuditLog(limit, offset);
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
}
