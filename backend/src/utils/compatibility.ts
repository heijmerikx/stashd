import { BackupJobType } from '../db/backup-jobs.js';

export type DestinationType = 'local' | 's3';

/**
 * Determines which destination types are compatible with a given backup job type.
 *
 * Compatibility rules:
 * - Database backups (postgres, mongodb, mysql) can go to any destination type
 * - Files backup can go to any destination type
 * - S3 source backup can go to S3 or local destinations (S3-to-S3 sync or download to local)
 *
 * Future considerations:
 * - postgres-to-postgres replication would need a new destination type
 * - remote file systems might need specific destination types
 */
export function getCompatibleDestinationTypes(jobType: BackupJobType): DestinationType[] {
  switch (jobType) {
    case 'postgres':
    case 'mongodb':
    case 'mysql':
      // Database dumps can be stored anywhere
      return ['local', 's3'];
    case 'files':
      // File backups can be stored anywhere
      return ['local', 's3'];
    case 's3':
      // S3 source can sync to S3 or download to local
      return ['local', 's3'];
    default:
      // Default to supporting all destination types
      return ['local', 's3'];
  }
}

/**
 * Check if a specific destination type is compatible with a job type.
 */
export function isDestinationTypeCompatible(
  jobType: BackupJobType,
  destinationType: DestinationType
): boolean {
  const compatibleTypes = getCompatibleDestinationTypes(jobType);
  return compatibleTypes.includes(destinationType);
}

/**
 * Filter destinations to only return those compatible with the job type.
 */
export function filterCompatibleDestinations<T extends { type: DestinationType }>(
  destinations: T[],
  jobType: BackupJobType
): T[] {
  const compatibleTypes = getCompatibleDestinationTypes(jobType);
  return destinations.filter(dest => compatibleTypes.includes(dest.type));
}
