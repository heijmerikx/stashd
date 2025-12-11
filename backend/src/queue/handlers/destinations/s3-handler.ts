/**
 * S3 Destination Handler
 *
 * Handles copying/uploading backups to S3-compatible storage destinations.
 */
import path from 'path';
import { stat } from 'fs/promises';
import { BackupDestination, S3DestinationConfigFull } from '../../../db/backup-destinations.js';
import { getCredentialProviderById } from '../../../db/credential-providers.js';
import { decryptSensitiveFields } from '../../../utils/encryption.js';
import { uploadToS3 } from '../../../services/s3-service.js';
import { DestinationHandler, CopyResult } from './types.js';

/**
 * Resolve S3 credentials from destination's credential provider
 */
export async function resolveS3Config(destination: BackupDestination): Promise<S3DestinationConfigFull> {
  if (!destination.credential_provider_id) {
    throw new Error('S3 destination requires a credential provider');
  }

  const provider = await getCredentialProviderById(destination.credential_provider_id);
  if (!provider) {
    throw new Error(`Credential provider ${destination.credential_provider_id} not found`);
  }

  // Decrypt provider credentials
  const providerConfig = decryptSensitiveFields(
    provider.config as unknown as Record<string, unknown>,
    ['access_key_id', 'secret_access_key']
  );

  // Merge destination config (bucket, prefix) with provider credentials
  const destConfig = destination.config as { bucket: string; prefix?: string };

  return {
    bucket: destConfig.bucket,
    prefix: destConfig.prefix,
    endpoint: providerConfig.endpoint as string | undefined,
    region: (providerConfig.region as string) || 'auto',
    access_key_id: providerConfig.access_key_id as string,
    secret_access_key: providerConfig.secret_access_key as string,
  };
}

export const s3Handler: DestinationHandler = {
  async copy(sourceFilePath: string, destination: BackupDestination): Promise<CopyResult> {
    const s3Config = await resolveS3Config(destination);
    const fileName = path.basename(sourceFilePath);

    const logLines: string[] = [];
    logLines.push(`[${new Date().toISOString()}] Uploading backup to S3 destination: ${destination.name}`);

    try {
      const { key } = await uploadToS3(s3Config, sourceFilePath, fileName);
      const stats = await stat(sourceFilePath);

      logLines.push(`[${new Date().toISOString()}] Uploaded to S3: s3://${s3Config.bucket}/${key}`);

      return {
        fileSize: stats.size,
        filePath: `s3://${s3Config.bucket}/${key}`,
        executionLog: logLines.join('\n'),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown S3 upload error';
      logLines.push(`[${new Date().toISOString()}] S3 upload failed: ${errorMessage}`);

      const enhancedError = new Error(errorMessage) as Error & { executionLog?: string };
      enhancedError.executionLog = logLines.join('\n');
      throw enhancedError;
    }
  }
};
