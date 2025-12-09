import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  ListBucketsCommand,
  type _Object,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { S3DestinationConfigFull } from '../db/backup-destinations.js';

export interface S3FileInfo {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
}

export interface S3BrowseItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  lastModified: Date;
}

export interface S3BrowseResult {
  items: S3BrowseItem[];
  prefix: string;
}

function createS3Client(config: S3DestinationConfigFull): S3Client {
  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: config.region,
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
  };

  // Support S3-compatible storage (MinIO, Backblaze B2, etc.)
  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = true; // Required for most S3-compatible services
  }

  return new S3Client(clientConfig);
}

export async function testS3Connection(config: S3DestinationConfigFull): Promise<void> {
  const client = createS3Client(config);

  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch (error: unknown) {
    // Extract more detailed error information from AWS SDK errors
    const err = error as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    const statusCode = err.$metadata?.httpStatusCode;
    const code = err.Code || err.name || 'UnknownError';
    const message = err.message || 'Unknown error occurred';

    console.error('S3 connection test failed:', {
      code,
      statusCode,
      message,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
    });

    // Provide more helpful error messages
    let detailedMessage = message;
    if (statusCode === 403) {
      detailedMessage = 'Access denied. Check your access key ID and secret access key have permission to access the bucket.';
    } else if (statusCode === 404) {
      detailedMessage = `Bucket "${config.bucket}" not found. Verify the bucket name and region are correct.`;
    } else if (statusCode === 301) {
      detailedMessage = `Bucket is in a different region. Try a different region or check the endpoint configuration.`;
    } else if (code === 'UnknownEndpoint' || code === 'NetworkingError' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
      detailedMessage = `Cannot reach S3 endpoint${config.endpoint ? ` (${config.endpoint})` : ''}. Check the endpoint URL and network connectivity.`;
    } else if (code === 'InvalidAccessKeyId') {
      detailedMessage = 'Invalid access key ID. Check your credentials.';
    } else if (code === 'SignatureDoesNotMatch') {
      detailedMessage = 'Invalid secret access key. Check your credentials.';
    } else if (code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      detailedMessage = `SSL/TLS error. If using a self-signed certificate, ensure the endpoint URL uses the correct protocol (http:// vs https://).`;
    } else if (code === 'TimeoutError' || code === 'ETIMEDOUT') {
      detailedMessage = `Connection timed out. Check if the endpoint is reachable and not blocked by a firewall.`;
    } else if (code === 'CredentialsProviderError') {
      detailedMessage = 'Credentials error. Verify access key ID and secret access key are correct.';
    }

    throw new Error(`${code}: ${detailedMessage}`);
  } finally {
    client.destroy();
  }
}

/**
 * Test S3 credentials without requiring a bucket.
 * Uses ListBuckets to validate that the credentials are valid.
 */
export async function testS3Credentials(config: {
  endpoint?: string;
  region?: string;
  access_key_id: string;
  secret_access_key: string;
}): Promise<void> {
  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = true;
  }

  const client = new S3Client(clientConfig);

  try {
    // ListBuckets validates the credentials
    await client.send(new ListBucketsCommand({}));
  } catch (error: unknown) {
    const err = error as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    const statusCode = err.$metadata?.httpStatusCode;
    const code = err.Code || err.name || 'UnknownError';
    const message = err.message || 'Unknown error occurred';

    console.error('S3 credentials test failed:', {
      code,
      statusCode,
      message,
      region: config.region,
      endpoint: config.endpoint,
    });

    let detailedMessage = message;
    if (statusCode === 403) {
      detailedMessage = 'Access denied. The credentials may be valid but lack permission to list buckets. This is common for restricted credentials.';
    } else if (code === 'UnknownEndpoint' || code === 'NetworkingError' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
      detailedMessage = `Cannot reach S3 endpoint${config.endpoint ? ` (${config.endpoint})` : ''}. Check the endpoint URL and network connectivity.`;
    } else if (code === 'InvalidAccessKeyId') {
      detailedMessage = 'Invalid access key ID. Check your credentials.';
    } else if (code === 'SignatureDoesNotMatch') {
      detailedMessage = 'Invalid secret access key. Check your credentials.';
    } else if (code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      detailedMessage = `SSL/TLS error. Check that the endpoint URL uses the correct protocol (http:// vs https://).`;
    } else if (code === 'TimeoutError' || code === 'ETIMEDOUT') {
      detailedMessage = `Connection timed out. Check if the endpoint is reachable.`;
    } else if (code === 'CredentialsProviderError') {
      detailedMessage = 'Invalid credentials. Verify access key ID and secret access key are correct.';
    }

    throw new Error(`${code}: ${detailedMessage}`);
  } finally {
    client.destroy();
  }
}

export async function uploadToS3(
  config: S3DestinationConfigFull,
  localFilePath: string,
  remoteName?: string
): Promise<{ key: string; size: number }> {
  const client = createS3Client(config);

  try {
    const fileName = remoteName || path.basename(localFilePath);
    const key = config.prefix ? `${config.prefix.replace(/\/$/, '')}/${fileName}` : fileName;

    const fileStats = await stat(localFilePath);
    const fileStream = createReadStream(localFilePath);

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: fileStream,
        ContentLength: fileStats.size,
      })
    );

    return { key, size: fileStats.size };
  } finally {
    client.destroy();
  }
}

export async function listS3Files(
  config: S3DestinationConfigFull,
  prefix?: string,
  limit?: number
): Promise<S3FileInfo[]> {
  const client = createS3Client(config);
  const maxFiles = limit || 1000; // Default to 1000 files max

  try {
    const searchPrefix = prefix || config.prefix || '';
    const files: S3FileInfo[] = [];
    let continuationToken: string | undefined;

    // Paginate through results up to the limit
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: searchPrefix,
          MaxKeys: Math.min(1000, maxFiles - files.length),
          ContinuationToken: continuationToken,
        })
      );

      const pageFiles = (response.Contents || [])
        // Filter out directory entries (keys ending with '/' or with size 0 and no extension)
        .filter((obj: _Object) => {
          const key = obj.Key || '';
          const size = obj.Size || 0;
          // Skip entries that are directory markers (end with /)
          if (key.endsWith('/')) {
            return false;
          }
          // Skip entries with size 0 that have no file extension (likely directory placeholders)
          if (size === 0 && !path.extname(key)) {
            return false;
          }
          return true;
        })
        .map((obj: _Object) => ({
          key: obj.Key || '',
          name: path.basename(obj.Key || ''),
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
        }));

      files.push(...pageFiles);

      // Check if there are more results and we haven't reached the limit
      continuationToken = response.IsTruncated && files.length < maxFiles
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    // Sort by last modified descending (newest first)
    files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    // Ensure we don't exceed the limit after sorting
    return files.slice(0, maxFiles);
  } finally {
    client.destroy();
  }
}

/**
 * Browse S3 bucket with folder-like navigation using delimiter
 */
export async function browseS3(
  config: S3DestinationConfigFull,
  browsePath?: string,
  limit?: number
): Promise<S3BrowseResult> {
  const client = createS3Client(config);
  const maxItems = limit || 100;

  try {
    // Build the prefix: config.prefix + browsePath
    let prefix = config.prefix || '';
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/';
    }
    if (browsePath) {
      prefix += browsePath;
      if (!prefix.endsWith('/')) {
        prefix += '/';
      }
    }

    const items: S3BrowseItem[] = [];

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: maxItems,
      })
    );

    // Add folders (CommonPrefixes)
    for (const commonPrefix of response.CommonPrefixes || []) {
      if (commonPrefix.Prefix) {
        // Get folder name by removing the prefix and trailing slash
        const folderPath = commonPrefix.Prefix;
        const folderName = folderPath.slice(prefix.length, -1); // Remove prefix and trailing /
        if (folderName) {
          items.push({
            name: folderName,
            path: folderPath.slice((config.prefix || '').length).replace(/^\//, ''), // Path relative to destination prefix
            type: 'folder',
            size: 0,
            lastModified: new Date(),
          });
        }
      }
    }

    // Add files (Contents)
    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Key !== prefix) { // Skip the folder marker itself
        const fileName = path.basename(obj.Key);
        // Skip directory markers (keys ending with / or zero-size without extension)
        if (obj.Key.endsWith('/')) continue;
        if ((obj.Size || 0) === 0 && !path.extname(fileName)) continue;

        items.push({
          name: fileName,
          path: obj.Key.slice((config.prefix || '').length).replace(/^\//, ''), // Path relative to destination prefix
          type: 'file',
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
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
      items,
      prefix: browsePath || '',
    };
  } finally {
    client.destroy();
  }
}

export async function deleteS3File(config: S3DestinationConfigFull, key: string): Promise<void> {
  const client = createS3Client(config);

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
  } finally {
    client.destroy();
  }
}

export async function getS3FileStream(
  config: S3DestinationConfigFull,
  key: string
): Promise<NodeJS.ReadableStream> {
  const client = createS3Client(config);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  return response.Body as NodeJS.ReadableStream;
}

export interface S3SourceConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  access_key_id: string;
  secret_access_key: string;
}

export interface S3SyncResult {
  filesCopied: number;
  totalSize: number;
  files: Array<{ key: string; size: number }>;
}

/**
 * Download a file from S3 source to a local temp file
 */
export async function downloadFromS3(
  config: S3SourceConfig,
  key: string,
  localPath: string
): Promise<number> {
  const client = createS3Client(config as S3DestinationConfigFull);

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error('No body in S3 response');
    }

    // Ensure directory exists
    await mkdir(path.dirname(localPath), { recursive: true });

    // Stream the file to disk
    const writeStream = createWriteStream(localPath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

    const fileStats = await stat(localPath);
    return fileStats.size;
  } finally {
    client.destroy();
  }
}

/**
 * Sync files from one S3 source to a destination S3 bucket
 * Downloads files from source and uploads them to destination
 * Creates a timestamped folder for each backup run
 */
export async function syncS3ToS3(
  sourceConfig: S3SourceConfig,
  destConfig: S3DestinationConfigFull,
  tempDir: string
): Promise<S3SyncResult> {
  // Create timestamp prefix for this backup run (e.g., "2025-12-06T10-30-00")
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');

  // List files from source
  const sourceFiles = await listS3Files(sourceConfig as S3DestinationConfigFull, sourceConfig.prefix);

  if (sourceFiles.length === 0) {
    return { filesCopied: 0, totalSize: 0, files: [] };
  }

  const result: S3SyncResult = {
    filesCopied: 0,
    totalSize: 0,
    files: [],
  };

  // Process each file
  for (const file of sourceFiles) {
    try {
      // Create a unique temp file name
      const tempFileName = `${Date.now()}_${path.basename(file.key)}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      // Download from source
      await downloadFromS3(sourceConfig, file.key, tempFilePath);

      // Determine destination key - always preserve path structure within timestamped folder
      let relativePath: string;
      if (sourceConfig.prefix && file.key.startsWith(sourceConfig.prefix)) {
        // Keep the relative path structure after the prefix
        relativePath = file.key.substring(sourceConfig.prefix.length).replace(/^\//, '');
      } else {
        // No prefix configured - preserve the full key path
        relativePath = file.key;
      }

      // Add timestamp prefix to create: [dest_prefix/]timestamp/relative/path/file.ext
      const destKey = `${timestamp}/${relativePath}`;

      // Upload to destination
      const { size } = await uploadToS3(destConfig, tempFilePath, destKey);

      // Clean up temp file
      await unlink(tempFilePath).catch(() => {});

      result.filesCopied++;
      result.totalSize += size;
      result.files.push({ key: destKey, size });
    } catch (error) {
      console.error(`Failed to sync file ${file.key}:`, error);
      throw error;
    }
  }

  return result;
}
