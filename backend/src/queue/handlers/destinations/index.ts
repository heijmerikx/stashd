/**
 * Destination Handlers
 *
 * Each handler implements destination-specific logic for copying backups:
 * - localHandler: Local filesystem destinations
 * - s3Handler: S3-compatible storage destinations
 */
import { BackupDestination } from '../../../db/backup-destinations.js';
import { DestinationHandler } from './types.js';
import { localHandler } from './local-handler.js';
import { s3Handler } from './s3-handler.js';

export { localHandler } from './local-handler.js';
export { s3Handler } from './s3-handler.js';
export type { DestinationHandler, CopyResult } from './types.js';

/**
 * Get the appropriate handler for a destination type
 */
export function getDestinationHandler(destination: BackupDestination): DestinationHandler {
  switch (destination.type) {
    case 'local':
      return localHandler;
    case 's3':
      return s3Handler;
    default:
      throw new Error(`Unsupported destination type: ${destination.type}`);
  }
}
