/**
 * Shared types for destination handlers
 *
 * Destination handlers are responsible ONLY for destination-specific operations:
 * - Copying files to the destination
 * - Uploading files to remote storage
 *
 * They do NOT handle backup execution - that's the job of backup handlers.
 */
import { BackupDestination } from '../../../db/backup-destinations.js';

export interface CopyResult {
  fileSize: number;
  filePath: string;
  executionLog: string;
}

export interface DestinationHandler {
  /**
   * Copy a backup file to this destination
   * @param sourceFilePath - Path to the backup file to copy
   * @param destination - The destination configuration
   * @returns Copy result with file size, path, and execution log
   */
  copy(sourceFilePath: string, destination: BackupDestination): Promise<CopyResult>;
}
