/**
 * Local Filesystem Destination Handler
 *
 * Handles copying backups to local filesystem destinations.
 */
import { mkdir, copyFile, stat } from 'fs/promises';
import path from 'path';
import { BackupDestination, LocalDestinationConfig } from '../../../db/backup-destinations.js';
import { DestinationHandler, CopyResult } from './types.js';

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups';

export const localHandler: DestinationHandler = {
  async copy(sourceFilePath: string, destination: BackupDestination): Promise<CopyResult> {
    const config = destination.config as LocalDestinationConfig;
    const destDir = config.path || DEFAULT_BACKUP_DIR;
    const fileName = path.basename(sourceFilePath);
    const destPath = path.join(destDir, fileName);

    const logLines: string[] = [];
    logLines.push(`[${new Date().toISOString()}] Copying backup to local destination: ${destination.name}`);

    await mkdir(destDir, { recursive: true });
    await copyFile(sourceFilePath, destPath);

    const stats = await stat(destPath);
    logLines.push(`[${new Date().toISOString()}] Copied to: ${destPath} (${stats.size} bytes)`);

    return {
      fileSize: stats.size,
      filePath: destPath,
      executionLog: logLines.join('\n'),
    };
  }
};
