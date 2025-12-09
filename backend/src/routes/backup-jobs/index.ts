/**
 * Backup Jobs Router
 *
 * Endpoints:
 * - GET    /                 List all backup jobs
 * - GET    /stats            Get stats for multiple jobs (batch loading)
 * - GET    /:id              Get single backup job
 * - GET    /:id/stats        Get stats for single job (per-row loading)
 * - GET    /:id/history      Get backup job history
 * - GET    /:id/runs         Get backup job runs
 * - GET    /:id/audit-log    Get audit log for a job
 * - POST   /                 Create backup job
 * - PUT    /:id              Update backup job
 * - DELETE /:id              Delete backup job
 * - POST   /:id/duplicate    Duplicate backup job
 * - PATCH  /:id/toggle       Toggle job enabled status
 * - POST   /:id/run          Trigger manual backup
 */

import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { createBackupJobSchema, updateBackupJobSchema } from '../../schemas/backup-jobs.js';
import {
  listJobs,
  getStats,
  getSingleJobStats,
  getJob,
  getHistory,
  getRuns,
  getAuditLog,
  createJob,
  updateJob,
  deleteJob,
  duplicateJob,
  toggleJob,
  runJob,
} from './handlers.js';

const router = Router();

// List routes
router.get('/', listJobs);
router.get('/stats', getStats);

// Single job routes
router.get('/:id', getJob);
router.get('/:id/stats', getSingleJobStats);
router.get('/:id/history', getHistory);
router.get('/:id/runs', getRuns);
router.get('/:id/audit-log', getAuditLog);

// Mutation routes
router.post('/', validate(createBackupJobSchema), createJob);
router.put('/:id', validate(updateBackupJobSchema), updateJob);
router.delete('/:id', deleteJob);

// Action routes
router.post('/:id/duplicate', duplicateJob);
router.patch('/:id/toggle', toggleJob);
router.post('/:id/run', runJob);

export default router;

// Re-export getDecryptedConfig for use by backup executor
export { getDecryptedConfig } from './helpers.js';
