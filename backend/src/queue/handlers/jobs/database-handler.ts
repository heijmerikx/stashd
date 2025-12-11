/**
 * Database Backup Handler
 *
 * Handles backup jobs for database types: postgres, mysql, mongodb, redis
 *
 * Strategy: Execute backup once to temp storage, then copy to all destinations.
 * This is efficient because the backup data is the same regardless of destination.
 */
import { unlink } from 'fs/promises';
import { BackupDestination } from '../../../db/backup-destinations.js';
import { createBackupHistoryEntry, completeBackupHistory, failBackupHistory, updateBackupHeartbeat } from '../../../db/backup-history.js';
import { executeBackup, executeBackupToTemp, BackupResult } from '../../../services/backup-executor.js';
import { BackupJobContext, DestinationResult, BackupHandler } from '../types.js';
import { getDestinationHandler } from '../destinations/index.js';

/**
 * Execute backup to default local storage (when no destinations configured)
 */
async function executeBackupToDefaultStorage(
  context: BackupJobContext,
  config: object
): Promise<BackupResult> {
  console.log(`Executing backup to default storage (run: ${context.runId})`);

  const historyEntry = await createBackupHistoryEntry(context.jobId, null, context.runId, 'running');

  const heartbeatInterval = setInterval(async () => {
    try {
      await updateBackupHeartbeat(historyEntry.id);
    } catch (err) {
      console.error('Failed to update heartbeat:', err);
    }
  }, 30000);

  try {
    // Execute backup to default local directory (no destination = default)
    const result = await executeBackup(context.type, config, null);

    clearInterval(heartbeatInterval);

    await completeBackupHistory(
      historyEntry.id,
      result.fileSize,
      result.filePath,
      result.metadata,
      result.executionLog
    );

    console.log(`Backup completed to default storage`);
    return result;
  } catch (error) {
    clearInterval(heartbeatInterval);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const executionLog = (error as Error & { executionLog?: string }).executionLog;

    await failBackupHistory(historyEntry.id, errorMessage, executionLog);

    console.error(`Backup to default storage failed:`, error);
    throw error;
  }
}

export const databaseHandler: BackupHandler = {
  async execute(
    context: BackupJobContext,
    decryptedConfig: object,
    destinations: BackupDestination[]
  ): Promise<{ results: DestinationResult[]; hasFailures: boolean }> {
    const results: DestinationResult[] = [];
    let hasFailures = false;

    if (destinations.length === 0) {
      // No destinations configured - use default local storage
      console.log(`No destinations configured for job ${context.name}, using default local storage`);
      try {
        await executeBackupToDefaultStorage(context, decryptedConfig);
        // Return empty results array since there's no destination object
        return { results: [], hasFailures: false };
      } catch {
        return { results: [], hasFailures: true };
      }
    }

    // Execute backup once to temp storage
    console.log(`Executing backup once to temp storage...`);

    let backupResult: BackupResult;
    let tempFilePath: string;

    try {
      backupResult = await executeBackupToTemp(context.type, decryptedConfig);
      tempFilePath = backupResult.filePath;
      console.log(`Backup created: ${tempFilePath} (${backupResult.fileSize} bytes)`);
    } catch (error) {
      // If backup creation fails, mark all destinations as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const executionLog = (error as Error & { executionLog?: string }).executionLog;

      for (const destination of destinations) {
        const historyEntry = await createBackupHistoryEntry(context.jobId, destination.id, context.runId, 'running');
        await failBackupHistory(historyEntry.id, errorMessage, executionLog);
        results.push({ destination, error: errorMessage });
      }

      return { results, hasFailures: true };
    }

    // Copy to all destinations using appropriate handlers
    for (const destination of destinations) {
      const historyEntry = await createBackupHistoryEntry(context.jobId, destination.id, context.runId, 'running');

      const heartbeatInterval = setInterval(async () => {
        try {
          await updateBackupHeartbeat(historyEntry.id);
        } catch (err) {
          console.error('Failed to update heartbeat:', err);
        }
      }, 30000);

      try {
        const handler = getDestinationHandler(destination);
        const copyResult = await handler.copy(tempFilePath, destination);
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

        results.push({
          destination,
          result: { ...copyResult, metadata: backupResult.metadata } as BackupResult
        });
        console.log(`Copied backup to destination: ${destination.name}`);
      } catch (error) {
        clearInterval(heartbeatInterval);
        hasFailures = true;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

    return { results, hasFailures };
  }
};
