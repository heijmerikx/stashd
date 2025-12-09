/**
 * Queue route handlers
 */

import { Response } from 'express';
import { backupQueue, getQueueStats, getQueueWorkers } from '../../queue/backup-queue.js';
import { systemQueue, getSystemQueueStats, getSystemRepeatableJobs } from '../../queue/system-queue.js';
import { getScheduledJobsInfo } from '../../services/scheduler-service.js';
import { AuthRequest } from '../../middleware/auth.js';

/**
 * GET /stats - Get queue statistics
 */
export async function getStats(_req: AuthRequest, res: Response) {
  try {
    const stats = await getQueueStats();
    const systemStats = await getSystemQueueStats();
    const isPaused = await backupQueue.isPaused();

    res.json({
      ...stats,
      paused: isPaused,
      system: systemStats,
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
}

/**
 * GET /jobs - Get detailed queue jobs
 */
export async function getJobs(req: AuthRequest, res: Response) {
  try {
    const status = req.query.status as string || 'all';
    const queueFilter = req.query.queue as string || 'all'; // 'all', 'backup', or 'system'
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    interface QueueJob {
      id: string | undefined;
      name: string;
      data: object;
      status: string;
      attemptsMade: number;
      timestamp: number;
      processedOn?: number;
      finishedOn?: number;
      failedReason?: string;
      progress: unknown;
      queue: 'backup' | 'system';
    }

    const jobs: QueueJob[] = [];

    // Helper to fetch jobs from a queue
    async function fetchFromQueue(queue: typeof backupQueue | typeof systemQueue, queueName: 'backup' | 'system') {
      if (status === 'all' || status === 'waiting') {
        const waiting = await queue.getWaiting(0, limit);
        jobs.push(...waiting.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          status: 'waiting',
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          progress: j.progress,
          queue: queueName,
        })));
      }

      if (status === 'all' || status === 'active') {
        const active = await queue.getActive(0, limit);
        jobs.push(...active.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          status: 'active',
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          progress: j.progress,
          queue: queueName,
        })));
      }

      if (status === 'all' || status === 'completed') {
        const completed = await queue.getCompleted(0, limit);
        jobs.push(...completed.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          status: 'completed',
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
          progress: j.progress,
          queue: queueName,
        })));
      }

      if (status === 'all' || status === 'failed') {
        const failed = await queue.getFailed(0, limit);
        jobs.push(...failed.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          status: 'failed',
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
          failedReason: j.failedReason,
          progress: j.progress,
          queue: queueName,
        })));
      }

      if (status === 'all' || status === 'delayed') {
        const delayed = await queue.getDelayed(0, limit);
        jobs.push(...delayed.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          status: 'delayed',
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          progress: j.progress,
          queue: queueName,
        })));
      }
    }

    // Fetch from backup queue
    if (queueFilter === 'all' || queueFilter === 'backup') {
      await fetchFromQueue(backupQueue, 'backup');
    }

    // Fetch from system queue
    if (queueFilter === 'all' || queueFilter === 'system') {
      await fetchFromQueue(systemQueue, 'system');
    }

    // Sort by timestamp descending
    jobs.sort((a, b) => b.timestamp - a.timestamp);

    res.json(jobs.slice(0, limit));
  } catch (error) {
    console.error('Error fetching queue jobs:', error);
    res.status(500).json({ error: 'Failed to fetch queue jobs' });
  }
}

/**
 * GET /scheduled - Get scheduled/repeatable jobs
 */
export async function getScheduled(_req: AuthRequest, res: Response) {
  try {
    const scheduledJobs = await getScheduledJobsInfo();
    const repeatableJobs = await backupQueue.getRepeatableJobs();
    const systemRepeatableJobs = await getSystemRepeatableJobs();

    res.json({
      scheduled: scheduledJobs,
      repeatable: repeatableJobs.map(j => ({
        key: j.key,
        name: j.name,
        pattern: j.pattern,
        next: j.next,
        endDate: j.endDate,
        queue: 'backup',
      })),
      system: systemRepeatableJobs.map(j => ({
        key: j.key,
        name: j.name,
        every: j.every,
        pattern: j.pattern,
        next: j.next,
        queue: 'system',
      })),
    });
  } catch (error) {
    console.error('Error fetching scheduled jobs:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled jobs' });
  }
}

/**
 * POST /pause - Pause queue
 */
export async function pauseQueue(_req: AuthRequest, res: Response) {
  try {
    await backupQueue.pause();
    res.json({ message: 'Queue paused' });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({ error: 'Failed to pause queue' });
  }
}

/**
 * POST /resume - Resume queue
 */
export async function resumeQueue(_req: AuthRequest, res: Response) {
  try {
    await backupQueue.resume();
    res.json({ message: 'Queue resumed' });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({ error: 'Failed to resume queue' });
  }
}

/**
 * DELETE /completed - Clear completed jobs
 */
export async function clearCompleted(_req: AuthRequest, res: Response) {
  try {
    await backupQueue.clean(0, 1000, 'completed');
    res.json({ message: 'Completed jobs cleared' });
  } catch (error) {
    console.error('Error clearing completed jobs:', error);
    res.status(500).json({ error: 'Failed to clear completed jobs' });
  }
}

/**
 * DELETE /failed - Clear failed jobs
 */
export async function clearFailed(_req: AuthRequest, res: Response) {
  try {
    await backupQueue.clean(0, 1000, 'failed');
    res.json({ message: 'Failed jobs cleared' });
  } catch (error) {
    console.error('Error clearing failed jobs:', error);
    res.status(500).json({ error: 'Failed to clear failed jobs' });
  }
}

/**
 * POST /retry-failed - Retry all failed jobs
 */
export async function retryFailed(_req: AuthRequest, res: Response) {
  try {
    const failed = await backupQueue.getFailed(0, 1000);
    let retried = 0;

    for (const job of failed) {
      await job.retry();
      retried++;
    }

    res.json({ message: `Retried ${retried} failed jobs` });
  } catch (error) {
    console.error('Error retrying failed jobs:', error);
    res.status(500).json({ error: 'Failed to retry failed jobs' });
  }
}

/**
 * DELETE /jobs/:jobId - Remove a specific job
 */
export async function removeJob(req: AuthRequest, res: Response) {
  try {
    const job = await backupQueue.getJob(req.params.jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await job.remove();
    res.json({ message: 'Job removed' });
  } catch (error) {
    console.error('Error removing job:', error);
    res.status(500).json({ error: 'Failed to remove job' });
  }
}

/**
 * POST /drain - Drain queue (remove all waiting jobs)
 */
export async function drainQueue(_req: AuthRequest, res: Response) {
  try {
    await backupQueue.drain();
    res.json({ message: 'Queue drained - all waiting jobs removed' });
  } catch (error) {
    console.error('Error draining queue:', error);
    res.status(500).json({ error: 'Failed to drain queue' });
  }
}

/**
 * GET /workers - Get connected workers
 */
export async function getWorkers(_req: AuthRequest, res: Response) {
  try {
    const workers = await getQueueWorkers();
    res.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
}
