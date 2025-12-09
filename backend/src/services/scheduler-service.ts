import { backupQueue, BackupJobData } from '../queue/backup-queue.js';
import { getBackupJobsWithSchedule, BackupJob } from '../db/backup-jobs.js';
import parser from 'cron-parser';

// Track scheduled job keys for management
const scheduledJobKeys = new Map<number, string>();

/**
 * Validate a cron expression
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    parser.parseExpression(expression);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression'
    };
  }
}

/**
 * Schedule a single backup job using BullMQ repeatable jobs
 */
export async function scheduleBackupJob(job: BackupJob): Promise<void> {
  if (!job.schedule || !job.enabled) {
    return;
  }

  // Validate cron expression
  const validation = validateCronExpression(job.schedule);
  if (!validation.valid) {
    console.error(`Invalid cron expression for job ${job.name}: ${validation.error}`);
    return;
  }

  // Create a unique key for this job's schedule
  const repeatJobKey = `backup-job-${job.id}`;

  // Remove existing schedule if present
  await unscheduleBackupJob(job.id);

  // Add repeatable job
  const jobData: BackupJobData = {
    jobId: job.id,
    name: job.name,
    type: job.type,
    config: job.config as object
  };

  await backupQueue.add('scheduled-backup', jobData, {
    repeat: {
      pattern: job.schedule,
      key: repeatJobKey
    },
    jobId: repeatJobKey,
    attempts: job.retry_count,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });

  scheduledJobKeys.set(job.id, repeatJobKey);
  console.log(`Scheduled backup job: ${job.name} with pattern: ${job.schedule}`);
}

/**
 * Remove a backup job from the schedule
 */
export async function unscheduleBackupJob(jobId: number): Promise<void> {
  const repeatJobKey = scheduledJobKeys.get(jobId) || `backup-job-${jobId}`;

  try {
    // Remove repeatable job by key
    const repeatableJobs = await backupQueue.getRepeatableJobs();
    for (const repeatableJob of repeatableJobs) {
      if (repeatableJob.key === repeatJobKey) {
        await backupQueue.removeRepeatableByKey(repeatableJob.key);
        console.log(`Unscheduled backup job with key: ${repeatJobKey}`);
      }
    }
    scheduledJobKeys.delete(jobId);
  } catch (error) {
    console.error(`Error unscheduling job ${jobId}:`, error);
  }
}

/**
 * Update the schedule for a backup job
 */
export async function updateJobSchedule(job: BackupJob): Promise<void> {
  // First unschedule the existing job
  await unscheduleBackupJob(job.id);

  // Then reschedule if it has a valid schedule and is enabled
  if (job.schedule && job.enabled) {
    await scheduleBackupJob(job);
  }
}

/**
 * Initialize all scheduled backup jobs on server startup
 */
export async function initializeScheduler(): Promise<void> {
  console.log('Initializing backup job scheduler...');

  try {
    // Clear any stale repeatable jobs from previous runs
    const existingRepeatableJobs = await backupQueue.getRepeatableJobs();
    for (const job of existingRepeatableJobs) {
      if (job.key?.startsWith('backup-job-')) {
        await backupQueue.removeRepeatableByKey(job.key);
      }
    }

    // Get all enabled jobs with schedules
    const jobs = await getBackupJobsWithSchedule();
    console.log(`Found ${jobs.length} jobs with schedules`);

    // Schedule each job
    for (const job of jobs) {
      await scheduleBackupJob(job);
    }

    console.log('Backup job scheduler initialized');
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
    throw error;
  }
}

/**
 * Get all currently scheduled jobs info
 */
export async function getScheduledJobsInfo(): Promise<{ key: string; pattern: string; next: Date }[]> {
  const repeatableJobs = await backupQueue.getRepeatableJobs();
  return repeatableJobs
    .filter(job => job.key?.startsWith('backup-job-'))
    .map(job => ({
      key: job.key || '',
      pattern: job.pattern || '',
      next: new Date(job.next || 0)
    }));
}
