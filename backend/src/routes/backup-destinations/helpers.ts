/**
 * Backup destinations specific helpers
 */

import { stat, mkdir, access, constants, readdir } from 'fs/promises';
import path from 'path';
import { decryptSensitiveFields } from '../../utils/encryption.js';
import { testS3Connection, listS3Files, browseS3, type S3BrowseResult } from '../../services/s3-service.js';
import { S3DestinationConfigFull } from '../../db/backup-destinations.js';
import { maskValue } from '../helpers/masking.js';

// Credential provider sensitive fields (for masking)
export const CREDENTIAL_SENSITIVE_FIELDS = ['secret_access_key', 'access_key_id'];

/**
 * Mask credential provider config for API response
 */
export function maskCredentialProviderConfig(config: unknown): unknown {
  const configObj = config as Record<string, unknown>;
  const decrypted = decryptSensitiveFields(configObj, CREDENTIAL_SENSITIVE_FIELDS);
  const masked = { ...decrypted };

  for (const field of CREDENTIAL_SENSITIVE_FIELDS) {
    if (masked[field] && typeof masked[field] === 'string') {
      masked[field] = maskValue(masked[field] as string);
    }
  }
  return masked;
}

/**
 * Validate destination config based on type
 */
export function validateConfig(
  type: string,
  config: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (type === 'local') {
    if (!config.path) {
      return { valid: false, error: 'Missing required field: path' };
    }
    const pathStr = config.path as string;
    if (!pathStr.startsWith('/')) {
      return { valid: false, error: 'Path must be an absolute path starting with /' };
    }
  } else if (type === 's3') {
    if (!config.bucket) {
      return { valid: false, error: 'Missing required field: bucket' };
    }
  }
  return { valid: true };
}

/**
 * Test destination connectivity/access
 */
export async function testDestination(
  type: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; error?: string; details?: object }> {
  if (type === 'local') {
    const destPath = config.path as string;

    try {
      // Try to access the directory
      await access(destPath, constants.R_OK | constants.W_OK);

      // Get disk space info
      const stats = await stat(destPath);

      return {
        success: true,
        details: {
          path: destPath,
          writable: true,
          isDirectory: stats.isDirectory()
        }
      };
    } catch {
      // Try to create the directory
      try {
        await mkdir(destPath, { recursive: true });
        return {
          success: true,
          details: {
            path: destPath,
            created: true,
            writable: true
          }
        };
      } catch (mkdirError) {
        return {
          success: false,
          error: `Cannot access or create directory: ${destPath}. ${mkdirError instanceof Error ? mkdirError.message : ''}`
        };
      }
    }
  } else if (type === 's3') {
    try {
      const s3Config = config as unknown as S3DestinationConfigFull;
      await testS3Connection(s3Config);
      return {
        success: true,
        details: {
          bucket: s3Config.bucket,
          region: s3Config.region,
          endpoint: s3Config.endpoint || 'AWS S3',
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `S3 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  return {
    success: false,
    error: `Unknown destination type: ${type}`
  };
}

/**
 * Resolve S3 config with credentials from provider
 */
export function resolveS3Config(
  baseConfig: Record<string, unknown>,
  providerConfig: Record<string, unknown>
): Record<string, unknown> {
  const decrypted = decryptSensitiveFields(providerConfig, CREDENTIAL_SENSITIVE_FIELDS);
  return {
    ...baseConfig,
    endpoint: decrypted.endpoint,
    // Default to 'auto' for S3-compatible services that don't need a real region
    region: decrypted.region || 'auto',
    access_key_id: decrypted.access_key_id,
    secret_access_key: decrypted.secret_access_key,
  };
}

// File listing types and helpers
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
}

/**
 * Get total size of a directory recursively
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      const stats = await stat(entryPath);
      totalSize += stats.size;
    } else if (entry.isDirectory()) {
      totalSize += await getDirectorySize(entryPath);
    }
  }

  return totalSize;
}

/**
 * List files in a destination
 */
export async function listDestinationFiles(
  type: string,
  config: Record<string, unknown>,
  limit: number = 100
): Promise<FileInfo[]> {
  if (type === 'local') {
    const destPath = config.path as string;

    try {
      const entries = await readdir(destPath, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const filePath = path.join(destPath, entry.name);
        const stats = await stat(filePath);

        if (entry.isFile()) {
          files.push({
            name: entry.name,
            path: filePath,
            size: stats.size,
            lastModified: stats.mtime,
          });
        } else if (entry.isDirectory()) {
          // Include directories (e.g., MongoDB dump folders)
          const dirSize = await getDirectorySize(filePath);
          files.push({
            name: entry.name,
            path: filePath,
            size: dirSize,
            lastModified: stats.mtime,
          });
        }
      }

      // Sort by last modified descending (newest first)
      files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
      // Apply limit
      return files.slice(0, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // Directory doesn't exist yet
      }
      throw error;
    }
  } else if (type === 's3') {
    const s3Config = config as unknown as S3DestinationConfigFull;
    const s3Files = await listS3Files(s3Config, undefined, limit);
    return s3Files.map(f => ({
      name: f.name,
      path: f.key,
      size: f.size,
      lastModified: f.lastModified,
    }));
  }

  return [];
}

// Browsing types for folder-like navigation
export interface BrowseItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  lastModified: Date;
}

export interface BrowseResult {
  items: BrowseItem[];
  currentPath: string;
}

/**
 * Browse destination with folder-like navigation
 */
export async function browseDestinationFiles(
  type: string,
  config: Record<string, unknown>,
  browsePath?: string,
  limit: number = 100
): Promise<BrowseResult> {
  if (type === 'local') {
    const destPath = config.path as string;
    const fullPath = browsePath ? path.join(destPath, browsePath) : destPath;

    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const items: BrowseItem[] = [];

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        const stats = await stat(entryPath);
        const relativePath = browsePath ? path.join(browsePath, entry.name) : entry.name;

        if (entry.isFile()) {
          items.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: stats.size,
            lastModified: stats.mtime,
          });
        } else if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            path: relativePath,
            type: 'folder',
            size: 0,
            lastModified: stats.mtime,
          });
        }
      }

      // Sort: folders first, then by name
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        items: items.slice(0, limit),
        currentPath: browsePath || '',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { items: [], currentPath: browsePath || '' };
      }
      throw error;
    }
  } else if (type === 's3') {
    const s3Config = config as unknown as S3DestinationConfigFull;
    const result: S3BrowseResult = await browseS3(s3Config, browsePath, limit);
    return {
      items: result.items.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        lastModified: item.lastModified,
      })),
      currentPath: result.prefix,
    };
  }

  return { items: [], currentPath: '' };
}
