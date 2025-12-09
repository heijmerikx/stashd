/**
 * Dashboard Router
 *
 * Endpoints:
 * - GET    /stats           Get dashboard stats
 * - GET    /recent-backups  Get recent backup history
 * - GET    /jobs-overview   Get all jobs with their stats
 */

import { Router } from 'express';
import { getStats, getRecentBackups, getJobsOverview } from './handlers.js';

const router = Router();

router.get('/stats', getStats);
router.get('/recent-backups', getRecentBackups);
router.get('/jobs-overview', getJobsOverview);

export default router;
