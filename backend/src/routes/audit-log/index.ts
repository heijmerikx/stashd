/**
 * Audit Log Router
 *
 * Endpoints:
 * - GET    /         Get all audit log entries (paginated)
 */

import { Router } from 'express';
import { listAuditLog } from './handlers.js';

const router = Router();

router.get('/', listAuditLog);

export default router;
