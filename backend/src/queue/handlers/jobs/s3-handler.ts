/**
 * S3 Sync Backup Handler
 *
 * Handles S3-to-S3 and S3-to-local sync jobs.
 *
 * Strategy: Execute per destination because each sync operation is unique -
 * different destinations may have different sync states and the sync is
 * incremental based on what's already at the destination.
 */
import { BackupDestination } from '../../../db/backup-destinations.js';
import { createBackupHistoryEntry, completeBackupHistory, failBackupHistory, updateBackupHeartbeat } from '../../../db/backup-history.js';
import { executeBackup, BackupResult } from '../../../services/backup-executor.js';
import { BackupJobContext, DestinationResult, BackupHandler } from '../types.js';

/**
 * Execute S3 sync for a single destination
 */
async function executeS3SyncForDestination(
  context: BackupJobContext,
  config: object,
  destination: BackupDestination
): Promise<BackupResult> {
  const destinationName = destination.name;

  console.log(`Executing S3 sync for destination: ${destinationName} (run: ${context.runId})`);

  const historyEntry = await createBackupHistoryEntry(context.jobId, destination.id, context.runId, 'running');

  const heartbeatInterval = setInterval(async () => {
    try {
      await updateBackupHeartbeat(historyEntry.id);
    } catch (err) {
      console.error('Failed to update heartbeat:', err);
    }
  }, 30000);

  try {
    const result = await executeBackup(context.type, config, destination);

    clearInterval(heartbeatInterval);

    await completeBackupHistory(
      historyEntry.id,
      result.fileSize,
      result.filePath,
      result.metadata,
      result.executionLog
    );

    console.log(`S3 sync completed for destination: ${destinationName}`);
    return result;
  } catch (error) {
    clearInterval(heartbeatInterval);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const executionLog = (error as Error & { executionLog?: string }).executionLog;

    await failBackupHistory(historyEntry.id, errorMessage, executionLog);

    console.error(`S3 sync failed for destination ${destinationName}:`, error);
    throw error;
  }
}

export const s3Handler: BackupHandler = {
  async execute(
    context: BackupJobContext,
    decryptedConfig: object,
    destinations: BackupDestination[]
  ): Promise<{ results: DestinationResult[]; hasFailures: boolean }> {
    const results: DestinationResult[] = [];
    let hasFailures = false;

    if (destinations.length === 0) {
      throw new Error('S3 backup requires at least one destination to be configured');
    }

    // S3 sync: execute per destination (each sync is unique based on destination state)
    for (const destination of destinations) {
      try {
        const result = await executeS3SyncForDestination(context, decryptedConfig, destination);
        results.push({ destination, result });
      } catch (error) {
        hasFailures = true;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ destination, error: errorMessage });
      }
    }

    return { results, hasFailures };
  }
};
