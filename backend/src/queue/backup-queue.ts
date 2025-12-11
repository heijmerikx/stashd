/**
 * Backup Queue - Main queue orchestration for backup jobs
 *
 * This module handles:
 * - Queue and worker setup
 * - Job dispatch to appropriate handlers based on type
 * - Notification sending
 * - Graceful shutdown
 */
import { Queue, Worker, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { connection } from './connection.js';
import { BackupJob, getBackupJobWithNotifications } from '../db/backup-jobs.js';
import { getDestinationsForJob } from '../db/backup-destinations.js';
import { getCredentialProviderById } from '../db/credential-providers.js';
import { sendNotification } from '../services/notification-service.js';
import { getDecryptedConfig } from '../routes/backup-jobs/index.js';
import { decryptSensitiveFields } from '../utils/encryption.js';
import { databaseHandler, s3Handler, BackupHandler } from './handlers/index.js';

export const backupQueue = new Queue('backup-jobs', { connection });

export interface BackupJobData {
  jobId: number;
  name: string;
  type: string;
  config: object;
}

export async function addBackupJobToQueue(job: BackupJob): Promise<Job<BackupJobData>> {
  return backupQueue.add(
    'backup',
    {
      jobId: job.id,
      name: job.name,
      type: job.type,
      config: job.config
    },
    {
      attempts: job.retry_count,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    }
  );
}

/**
 * Get the appropriate handler for a backup job type
 */
function getHandler(type: string): BackupHandler {
  switch (type) {
    case 'postgres':
    case 'mysql':
    case 'mongodb':
    case 'redis':
      return databaseHandler;
    case 's3':
      return s3Handler;
    default:
      throw new Error(`Unsupported backup type: ${type}`);
  }
}

let activeWorker: Worker<BackupJobData> | null = null;

export function startBackupWorker() {
  const worker = new Worker<BackupJobData>(
    'backup-jobs',
    async (job) => {
      const { jobId } = job.data;

      // Fetch fresh job data from DB to get latest config
      const backupJob = await getBackupJobWithNotifications(jobId);
      if (!backupJob) {
        throw new Error(`Backup job ${jobId} not found - may have been deleted`);
      }

      const { name, type, config, source_credential_provider_id } = backupJob;
      const runId = randomUUID();
      const startTime = Date.now();
      console.log(`Starting backup job: ${name} (ID: ${jobId}, Run: ${runId})`);

      // Decrypt sensitive fields in the job config
      let decryptedConfig = getDecryptedConfig(type, config);

      // If the job uses a credential provider, resolve and merge credentials
      if (source_credential_provider_id && type === 's3') {
        const provider = await getCredentialProviderById(source_credential_provider_id);
        if (!provider) {
          throw new Error(`Credential provider ${source_credential_provider_id} not found`);
        }
        // Decrypt the provider credentials
        const providerConfig = decryptSensitiveFields(
          provider.config as unknown as Record<string, unknown>,
          ['access_key_id', 'secret_access_key']
        );
        // Merge provider credentials into config
        decryptedConfig = {
          ...decryptedConfig,
          endpoint: providerConfig.endpoint,
          region: providerConfig.region,
          access_key_id: providerConfig.access_key_id,
          secret_access_key: providerConfig.secret_access_key,
        };
        console.log(`Using credential provider: ${provider.name}`);
      }

      // Get destinations for this job - fetched fresh from DB at runtime
      const destinations = await getDestinationsForJob(jobId);
      console.log(`Job ${jobId} destinations:`, destinations.map(d => ({ id: d.id, name: d.name, type: d.type })));

      // Get the appropriate handler and execute
      const handler = getHandler(type);
      const context = { jobId, name, type, config, runId };
      const { results, hasFailures } = await handler.execute(context, decryptedConfig, destinations);

      // Build destination results for notifications
      const destinationResults = results.map(r => ({
        name: r.destination.name,
        status: r.error ? 'failed' as const : 'completed' as const,
        fileSize: r.result?.fileSize,
        filePath: r.result?.filePath,
        error: r.error
      }));

      // Send consolidated notifications
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      if (hasFailures) {
        const failedDestinations = results.filter(r => r.error).map(r => r.destination.name);
        await sendJobNotifications(jobId, 'failure', {
          jobName: name,
          jobType: type,
          error: `Backup failed for destinations: ${failedDestinations.join(', ')}`,
          durationSeconds,
          destinations: destinationResults
        });
      } else {
        const totalSize = results.reduce((sum, r) => sum + (r.result?.fileSize || 0), 0);
        await sendJobNotifications(jobId, 'success', {
          jobName: name,
          jobType: type,
          fileSize: totalSize,
          durationSeconds,
          destinations: destinationResults
        });
      }

      // If any destination failed, throw to mark job as failed
      if (hasFailures) {
        const errors = results.filter(r => r.error).map(r => `${r.destination.name}: ${r.error}`);
        throw new Error(errors.join('; '));
      }

      return results;
    },
    {
      connection,
      concurrency: 2
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  activeWorker = worker;
  console.log('Backup worker started');
  return worker;
}

// Graceful shutdown - wait for active jobs to complete
export async function shutdownWorker(): Promise<void> {
  if (!activeWorker) return;

  console.log('Shutting down backup worker gracefully...');

  // Check if there are active jobs and wait for them
  const activeCount = await backupQueue.getActiveCount();
  if (activeCount > 0) {
    console.log(`Waiting for ${activeCount} active job(s) to complete...`);

    // Wait for all active jobs to finish (poll every 2 seconds)
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        const remaining = await backupQueue.getActiveCount();
        if (remaining === 0) {
          clearInterval(checkInterval);
          resolve();
        } else {
          console.log(`Still waiting for ${remaining} active job(s)...`);
        }
      }, 2000);
    });
  }

  // Now close the worker (no active jobs remain)
  await activeWorker.close();

  // Close the queue connection
  await backupQueue.close();

  console.log('Backup worker shut down');
}

async function sendJobNotifications(
  jobId: number,
  eventType: 'success' | 'failure',
  data: {
    jobName: string;
    jobType?: string;
    fileSize?: number;
    filePath?: string;
    error?: string;
    durationSeconds?: number;
    destinations?: Array<{
      name: string;
      status: 'completed' | 'failed';
      fileSize?: number;
      filePath?: string;
      error?: string;
    }>;
  }
) {
  try {
    const job = await getBackupJobWithNotifications(jobId);
    if (!job) return;

    const channels = job.notification_channels.filter((ch) =>
      eventType === 'success' ? ch.on_success : ch.on_failure
    );

    for (const channel of channels) {
      await sendNotification(channel.id, eventType, data);
    }
  } catch (error) {
    console.error('Failed to send notifications:', error);
  }
}

export async function getQueueStats() {
  const waiting = await backupQueue.getWaitingCount();
  const active = await backupQueue.getActiveCount();
  const completed = await backupQueue.getCompletedCount();
  const failed = await backupQueue.getFailedCount();

  return { waiting, active, completed, failed };
}

export async function getQueueWorkers() {
  const workers = await backupQueue.getWorkers();
  return workers.map(worker => ({
    id: worker.id,
    name: worker.name,
    addr: worker.addr,
    age: worker.age,
    idle: worker.idle,
  }));
}
