/**
 * System Queue - Handles internal system maintenance jobs
 *
 * These jobs are differentiated from backup jobs and include:
 * - Stale running job cleanup
 * - Future: Database maintenance, log rotation, etc.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { cleanupStaleRunningJobs } from '../db/backup-history.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

export const systemQueue = new Queue('system-jobs', { connection });

// System job types
export type SystemJobType = 'cleanup-stale-jobs';

export interface SystemJobData {
  type: SystemJobType;
}

let activeWorker: Worker<SystemJobData> | null = null;

/**
 * Process system jobs
 */
async function processSystemJob(job: Job<SystemJobData>): Promise<{ cleaned?: number }> {
  const { type } = job.data;

  switch (type) {
    case 'cleanup-stale-jobs': {
      const cleaned = await cleanupStaleRunningJobs();
      if (cleaned > 0) {
        console.log(`System job: cleaned up ${cleaned} stale running job(s)`);
      }
      return { cleaned };
    }

    default:
      throw new Error(`Unknown system job type: ${type}`);
  }
}

/**
 * Start the system worker
 */
export function startSystemWorker(): Worker<SystemJobData> {
  const worker = new Worker<SystemJobData>(
    'system-jobs',
    processSystemJob,
    {
      connection,
      concurrency: 1 // System jobs should run sequentially
    }
  );

  worker.on('completed', (job, result) => {
    // Only log if something was actually cleaned up
    if (result?.cleaned && result.cleaned > 0) {
      console.log(`System job ${job.name} completed: cleaned ${result.cleaned} stale jobs`);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`System job ${job?.name} failed:`, err);
  });

  activeWorker = worker;
  return worker;
}

/**
 * Initialize system jobs (repeatable jobs)
 */
export async function initializeSystemJobs(): Promise<void> {
  console.log('Initializing system jobs...');

  // Clear any existing system repeatable jobs to ensure clean state
  const existingRepeatableJobs = await systemQueue.getRepeatableJobs();
  for (const job of existingRepeatableJobs) {
    if (job.key) {
      await systemQueue.removeRepeatableByKey(job.key);
    }
  }

  // Add stale job cleanup - runs every 2 minutes
  await systemQueue.add(
    'cleanup-stale-jobs',
    { type: 'cleanup-stale-jobs' },
    {
      repeat: {
        every: 2 * 60 * 1000, // 2 minutes
        key: 'system-cleanup-stale-jobs'
      },
      removeOnComplete: 100, // Keep last 100 completed for visibility
      removeOnFail: 100
    }
  );

  console.log('System jobs initialized (stale job cleanup every 2 minutes)');
}

/**
 * Graceful shutdown
 */
export async function shutdownSystemWorker(): Promise<void> {
  if (!activeWorker) return;

  console.log('Shutting down system worker...');
  await activeWorker.close();
  await systemQueue.close();
  console.log('System worker shut down');
}

/**
 * Get system queue statistics
 */
export async function getSystemQueueStats() {
  const waiting = await systemQueue.getWaitingCount();
  const active = await systemQueue.getActiveCount();
  const completed = await systemQueue.getCompletedCount();
  const failed = await systemQueue.getFailedCount();
  const delayed = await systemQueue.getDelayedCount();

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get system repeatable jobs info
 */
export async function getSystemRepeatableJobs() {
  const repeatableJobs = await systemQueue.getRepeatableJobs();
  return repeatableJobs.map(job => ({
    key: job.key,
    name: job.name,
    every: job.every,
    pattern: job.pattern,
    next: job.next,
  }));
}
