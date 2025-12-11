/**
 * Shared types for backup job handlers
 */
import { BackupDestination } from '../../db/backup-destinations.js';
import { BackupResult } from '../../services/backup-executor.js';
import { CopyResult } from './destinations/types.js';

export interface BackupJobContext {
  jobId: number;
  name: string;
  type: string;
  config: object;
  runId: string;
}

export interface DestinationResult {
  destination: BackupDestination;
  result?: BackupResult | CopyResult;
  error?: string;
}

export interface BackupHandler {
  /**
   * Execute backup for all destinations
   * @returns Array of results per destination and whether any failures occurred
   */
  execute(
    context: BackupJobContext,
    decryptedConfig: object,
    destinations: BackupDestination[]
  ): Promise<{ results: DestinationResult[]; hasFailures: boolean }>;
}
