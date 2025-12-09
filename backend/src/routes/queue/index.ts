/**
 * Queue Router
 *
 * Endpoints:
 * - GET    /stats        Get queue statistics
 * - GET    /jobs         Get detailed queue jobs
 * - GET    /scheduled    Get scheduled/repeatable jobs
 * - GET    /workers      Get connected workers
 * - POST   /pause        Pause queue
 * - POST   /resume       Resume queue
 * - DELETE /completed    Clear completed jobs
 * - DELETE /failed       Clear failed jobs
 * - POST   /retry-failed Retry all failed jobs
 * - DELETE /jobs/:jobId  Remove a specific job
 * - POST   /drain        Drain queue
 */

import { Router } from 'express';
import {
  getStats,
  getJobs,
  getScheduled,
  getWorkers,
  pauseQueue,
  resumeQueue,
  clearCompleted,
  clearFailed,
  retryFailed,
  removeJob,
  drainQueue,
} from './handlers.js';

const router = Router();

router.get('/stats', getStats);
router.get('/jobs', getJobs);
router.get('/scheduled', getScheduled);
router.get('/workers', getWorkers);
router.post('/pause', pauseQueue);
router.post('/resume', resumeQueue);
router.delete('/completed', clearCompleted);
router.delete('/failed', clearFailed);
router.post('/retry-failed', retryFailed);
router.delete('/jobs/:jobId', removeJob);
router.post('/drain', drainQueue);

export default router;
