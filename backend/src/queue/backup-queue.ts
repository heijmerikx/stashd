import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { BackupJob, getBackupJobWithNotifications } from '../db/backup-jobs.js';
import { createBackupHistoryEntry, completeBackupHistory, failBackupHistory, updateBackupHeartbeat } from '../db/backup-history.js';
import { getDestinationsForJob, BackupDestination } from '../db/backup-destinations.js';
import { getCredentialProviderById } from '../db/credential-providers.js';
import { sendNotification } from '../services/notification-service.js';
import { executeBackup, executeBackupToTemp, copyBackupToDestination, BackupResult, CopyResult } from '../services/backup-executor.js';
import { getDecryptedConfig } from '../routes/backup-jobs/index.js';
import { decryptSensitiveFields } from '../utils/encryption.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
});

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

// Execute backup for a single destination and track in history
async function executeBackupForDestination(
  jobId: number,
  type: string,
  config: object,
  destination: BackupDestination | null,
  runId: string
): Promise<BackupResult> {
  const destinationId = destination?.id || null;
  const destinationName = destination?.name || 'default';

  console.log(`Executing backup for destination: ${destinationName} (run: ${runId})`);

  // Create history entry for this destination
  const historyEntry = await createBackupHistoryEntry(jobId, destinationId, runId, 'running');

  // Start heartbeat interval to keep the job marked as alive during long backups
  const heartbeatInterval = setInterval(async () => {
    try {
      await updateBackupHeartbeat(historyEntry.id);
    } catch (err) {
      console.error('Failed to update heartbeat:', err);
    }
  }, 30000); // Every 30 seconds

  try {
    // Execute the backup
    const result = await executeBackup(type, config, destination);

    // Stop heartbeat
    clearInterval(heartbeatInterval);

    // Mark as completed with execution log
    await completeBackupHistory(
      historyEntry.id,
      result.fileSize,
      result.filePath,
      result.metadata,
      result.executionLog
    );

    console.log(`Backup completed for destination: ${destinationName}`);
    return result;
  } catch (error) {
    // Stop heartbeat
    clearInterval(heartbeatInterval);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Extract execution log from error if available
    const executionLog = (error as Error & { executionLog?: string }).executionLog;

    // Mark as failed with execution log
    await failBackupHistory(historyEntry.id, errorMessage, executionLog);

    console.error(`Backup failed for destination ${destinationName}:`, error);
    throw error;
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

      if (destinations.length === 0) {
        console.log(`No destinations configured for job ${name}, using default local storage`);
        // Execute with default destination (null = use default backup dir)
        return executeBackupForDestination(jobId, type, decryptedConfig, null, runId);
      }

      // For S3 copy jobs, each destination needs its own execution (sync is per-destination)
      // For database backups, execute once and copy to all destinations
      const isS3CopyJob = type === 's3';

      const results: { destination: BackupDestination; result?: BackupResult | CopyResult; error?: string }[] = [];
      let hasFailures = false;

      if (isS3CopyJob) {
        // S3 copy: execute per destination (syncs different data based on destination)
        for (const destination of destinations) {
          try {
            const result = await executeBackupForDestination(jobId, type, decryptedConfig, destination, runId);
            results.push({ destination, result });
          } catch (error) {
            hasFailures = true;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.push({ destination, error: errorMessage });
          }
        }
      } else {
        // Database backups: execute once, then copy to all destinations
        console.log(`Executing backup once to temp storage...`);

        let backupResult: BackupResult;
        let tempFilePath: string;

        try {
          backupResult = await executeBackupToTemp(type, decryptedConfig);
          tempFilePath = backupResult.filePath;
          console.log(`Backup created: ${tempFilePath} (${backupResult.fileSize} bytes)`);
        } catch (error) {
          // If backup creation fails, mark all destinations as failed
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const executionLog = (error as Error & { executionLog?: string }).executionLog;

          for (const destination of destinations) {
            const historyEntry = await createBackupHistoryEntry(jobId, destination.id, runId, 'running');
            await failBackupHistory(historyEntry.id, errorMessage, executionLog);
            results.push({ destination, error: errorMessage });
          }
          hasFailures = true;

          // Skip to notification handling
          tempFilePath = '';
          backupResult = null as unknown as BackupResult;
        }

        // If backup succeeded, copy to all destinations
        if (tempFilePath) {
          for (const destination of destinations) {
            const historyEntry = await createBackupHistoryEntry(jobId, destination.id, runId, 'running');

            // Start heartbeat for this copy operation
            const heartbeatInterval = setInterval(async () => {
              try {
                await updateBackupHeartbeat(historyEntry.id);
              } catch (err) {
                console.error('Failed to update heartbeat:', err);
              }
            }, 30000);

            try {
              const copyResult = await copyBackupToDestination(tempFilePath, destination);
              clearInterval(heartbeatInterval);

              // Combine backup execution log with copy log
              const combinedLog = backupResult.executionLog
                ? `${backupResult.executionLog}\n${copyResult.executionLog}`
                : copyResult.executionLog;

              await completeBackupHistory(
                historyEntry.id,
                copyResult.fileSize,
                copyResult.filePath,
                backupResult.metadata,
                combinedLog
              );

              results.push({ destination, result: { ...copyResult, metadata: backupResult.metadata } as BackupResult });
              console.log(`Copied backup to destination: ${destination.name}`);
            } catch (error) {
              clearInterval(heartbeatInterval);
              hasFailures = true;
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              // Use error's execution log if available, otherwise fall back to backup's log
              const errorExecutionLog = (error as Error & { executionLog?: string }).executionLog;
              const combinedLog = errorExecutionLog
                ? (backupResult.executionLog ? `${backupResult.executionLog}\n${errorExecutionLog}` : errorExecutionLog)
                : backupResult.executionLog;
              await failBackupHistory(historyEntry.id, errorMessage, combinedLog);
              results.push({ destination, error: errorMessage });
              console.error(`Failed to copy to destination ${destination.name}:`, error);
            }
          }

          // Clean up temp file after all copies are done
          await unlink(tempFilePath).catch(() => {
            console.warn(`Failed to clean up temp file: ${tempFilePath}`);
          });
        }
      }

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
