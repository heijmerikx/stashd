import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdir, stat, unlink, rm, writeFile, copyFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { createReadStream } from 'fs';
import { BackupDestination, LocalDestinationConfig, S3DestinationConfigFull } from '../db/backup-destinations.js';
import { decryptSensitiveFields } from '../utils/encryption.js';
import { uploadToS3, syncS3ToS3, S3SourceConfig } from './s3-service.js';
import { getCredentialProviderById } from '../db/credential-providers.js';

/**
 * Execute a command safely using spawn with argument array (prevents shell injection)
 * @param command - The command to execute
 * @param args - Array of arguments (NOT interpolated into a shell string)
 * @param options - Execution options
 */
function execCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; outputFile?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: options.env || process.env,
      shell: false, // Explicitly disable shell to prevent injection
    });

    let stdout = '';
    let stderr = '';
    let outputStream: ReturnType<typeof createWriteStream> | null = null;
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Set up timeout if specified
    if (options.timeoutMs) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        // Force kill after 5 seconds if SIGTERM doesn't work
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, options.timeoutMs);
    }

    // If outputFile is specified, pipe stdout to file
    if (options.outputFile) {
      outputStream = createWriteStream(options.outputFile);
      proc.stdout.pipe(outputStream);
    } else {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (outputStream) outputStream.close();
      reject(new Error(`Failed to execute ${command}: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (outputStream) outputStream.close();

      if (timedOut) {
        const error = new Error(`Command timed out after ${options.timeoutMs}ms`);
        (error as Error & { stdout: string; stderr: string }).stdout = stdout;
        (error as Error & { stdout: string; stderr: string }).stderr = stderr;
        reject(error);
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`Command failed with exit code ${code}: ${stderr || stdout}`);
        (error as Error & { stdout: string; stderr: string }).stdout = stdout;
        (error as Error & { stdout: string; stderr: string }).stderr = stderr;
        reject(error);
      }
    });
  });
}

/**
 * Validate a string contains only safe characters for use in filenames/database names
 * Allows alphanumeric, underscore, hyphen, and dot
 */
function validateSafeString(value: string, fieldName: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error(`Invalid ${fieldName}: contains unsafe characters`);
  }
  return value;
}

/**
 * Validate hostname (alphanumeric, dots, hyphens)
 */
function validateHostname(value: string): string {
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) {
    throw new Error(`Invalid hostname: contains unsafe characters`);
  }
  return value;
}

/**
 * Validate port number
 */
function validatePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port number: ${value}`);
  }
  return value;
}

/**
 * Compress a file or directory to tar.gz using Node.js streams (no shell commands)
 * @param sourcePath - The file or directory to compress
 * @returns The path to the compressed file and its size
 */
async function compressToTarGz(sourcePath: string): Promise<{ compressedPath: string; size: number }> {
  const stats = await stat(sourcePath);
  const baseName = path.basename(sourcePath);
  const dirName = path.dirname(sourcePath);

  // For directories, compress the whole directory
  // For files, compress just the file
  const compressedFileName = stats.isDirectory()
    ? `${baseName}.tar.gz`
    : `${baseName}.gz`;
  const compressedPath = path.join(dirName, compressedFileName);

  if (stats.isDirectory()) {
    // Compress directory using tar with spawn (safe argument passing)
    console.log(`Compressing directory ${sourcePath} to ${compressedPath}`);
    await execCommand('tar', ['-czf', compressedPath, '-C', dirName, baseName]);
    // Remove original directory
    await rm(sourcePath, { recursive: true, force: true });
  } else {
    // Compress file with gzip using Node.js streams (no shell)
    const readStream = createReadStream(sourcePath);
    const gzipStream = createGzip();
    const writeStream = createWriteStream(compressedPath);
    await pipeline(readStream, gzipStream, writeStream);
    // Remove original file
    await unlink(sourcePath);
  }

  const compressedStats = await stat(compressedPath);
  return { compressedPath, size: compressedStats.size };
}

export interface BackupResult {
  fileSize: number;
  filePath: string;
  metadata: object;
  executionLog?: string;
}

// Default backup directory (used when no destination specified - for backwards compatibility)
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups';

// Temporary directory for creating backups before uploading to S3
const TEMP_BACKUP_DIR = process.env.TEMP_BACKUP_DIR || '/tmp/stashd-backups';

// Get the backup directory based on destination type
function getBackupDir(destination: BackupDestination | null): string {
  if (!destination) {
    return DEFAULT_BACKUP_DIR;
  }

  if (destination.type === 'local') {
    const config = destination.config as LocalDestinationConfig;
    return config.path || DEFAULT_BACKUP_DIR;
  }

  // For S3 and other remote destinations, use temp directory
  return TEMP_BACKUP_DIR;
}

export async function executeBackup(
  type: string,
  config: object,
  destination: BackupDestination | null = null
): Promise<BackupResult> {
  const backupDir = getBackupDir(destination);

  // Ensure backup directory exists
  await mkdir(backupDir, { recursive: true });

  // Execute the backup to local/temp directory
  let result: BackupResult;
  switch (type) {
    case 'postgres':
      result = await executePostgresBackup(config as PostgresConfig, backupDir);
      break;
    case 'mongodb':
      result = await executeMongoDBBackup(config as MongoDBConfig, backupDir);
      break;
    case 'mysql':
      result = await executeMySQLBackup(config as MySQLConfig, backupDir);
      break;
    case 'redis':
      result = await executeRedisBackup(config as RedisConfig, backupDir);
      break;
    case 's3':
      // S3 sync is handled differently - it syncs directly to the destination
      return executeS3Backup(config as S3Config, destination);
    default:
      throw new Error(`Unsupported backup type: ${type}`);
  }

  // If destination is S3, upload the backup file and clean up temp file
  if (destination?.type === 's3') {
    // S3 destinations require a credential provider
    if (!destination.credential_provider_id) {
      throw new Error('S3 destination requires a credential provider');
    }

    // Fetch credentials from the credential provider
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
    const s3Config: S3DestinationConfigFull = {
      bucket: destConfig.bucket,
      prefix: destConfig.prefix,
      endpoint: providerConfig.endpoint as string | undefined,
      region: (providerConfig.region as string) || 'auto',
      access_key_id: providerConfig.access_key_id as string,
      secret_access_key: providerConfig.secret_access_key as string,
    };

    try {
      // Backups are already compressed, just upload directly
      const fileName = path.basename(result.filePath);
      const { key } = await uploadToS3(s3Config, result.filePath, fileName);

      // Clean up temporary file after successful upload
      await unlink(result.filePath).catch(() => {
        // Ignore cleanup errors
      });

      // Append S3 upload info to execution log
      const s3LogEntry = `[${new Date().toISOString()}] Uploaded to S3: s3://${s3Config.bucket}/${key}`;
      const executionLog = result.executionLog
        ? `${result.executionLog}\n${s3LogEntry}`
        : s3LogEntry;

      // Return S3 path instead of local path
      return {
        fileSize: result.fileSize,
        filePath: `s3://${s3Config.bucket}/${key}`,
        metadata: {
          ...result.metadata as object,
          s3_key: key,
          s3_bucket: s3Config.bucket,
        },
        executionLog,
      };
    } catch (error) {
      // Clean up temp file on failure too
      await unlink(result.filePath).catch(() => {
        // Ignore cleanup errors
      });

      // Enhance error with execution log for better debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown S3 upload error';
      const s3ErrorLog = `[${new Date().toISOString()}] S3 upload failed: ${errorMessage}`;
      const executionLog = result.executionLog
        ? `${result.executionLog}\n${s3ErrorLog}`
        : s3ErrorLog;

      const enhancedError = new Error(errorMessage) as Error & { executionLog?: string };
      enhancedError.executionLog = executionLog;
      throw enhancedError;
    }
  }

  return result;
}

/**
 * Execute a backup without uploading to any destination.
 * Used when we need to create the backup once and then copy to multiple destinations.
 */
export async function executeBackupToTemp(
  type: string,
  config: object
): Promise<BackupResult> {
  // Always use temp directory for initial backup
  await mkdir(TEMP_BACKUP_DIR, { recursive: true });

  switch (type) {
    case 'postgres':
      return executePostgresBackup(config as PostgresConfig, TEMP_BACKUP_DIR);
    case 'mongodb':
      return executeMongoDBBackup(config as MongoDBConfig, TEMP_BACKUP_DIR);
    case 'mysql':
      return executeMySQLBackup(config as MySQLConfig, TEMP_BACKUP_DIR);
    case 'redis':
      return executeRedisBackup(config as RedisConfig, TEMP_BACKUP_DIR);
    default:
      throw new Error(`Unsupported backup type: ${type}`);
  }
}

export interface CopyResult {
  fileSize: number;
  filePath: string;
  executionLog: string;
}

/**
 * Copy an existing backup file to a destination (local or S3).
 * Used after executeBackupToTemp to distribute the backup to multiple destinations.
 */
export async function copyBackupToDestination(
  sourceFilePath: string,
  destination: BackupDestination
): Promise<CopyResult> {
  const fileName = path.basename(sourceFilePath);
  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] Copying backup to destination: ${destination.name}`);

  if (destination.type === 'local') {
    const config = destination.config as LocalDestinationConfig;
    const destDir = config.path || DEFAULT_BACKUP_DIR;
    const destPath = path.join(destDir, fileName);

    await mkdir(destDir, { recursive: true });
    await copyFile(sourceFilePath, destPath);

    const stats = await stat(destPath);
    logLines.push(`[${new Date().toISOString()}] Copied to: ${destPath} (${stats.size} bytes)`);

    return {
      fileSize: stats.size,
      filePath: destPath,
      executionLog: logLines.join('\n'),
    };
  } else if (destination.type === 's3') {
    if (!destination.credential_provider_id) {
      throw new Error('S3 destination requires a credential provider');
    }

    const provider = await getCredentialProviderById(destination.credential_provider_id);
    if (!provider) {
      throw new Error(`Credential provider ${destination.credential_provider_id} not found`);
    }

    const providerConfig = decryptSensitiveFields(
      provider.config as unknown as Record<string, unknown>,
      ['access_key_id', 'secret_access_key']
    );

    const destConfig = destination.config as { bucket: string; prefix?: string };
    const s3Config: S3DestinationConfigFull = {
      bucket: destConfig.bucket,
      prefix: destConfig.prefix,
      endpoint: providerConfig.endpoint as string | undefined,
      region: (providerConfig.region as string) || 'auto',
      access_key_id: providerConfig.access_key_id as string,
      secret_access_key: providerConfig.secret_access_key as string,
    };

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
      // Enhance error with execution log for better debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown S3 upload error';
      logLines.push(`[${new Date().toISOString()}] S3 upload failed: ${errorMessage}`);

      const enhancedError = new Error(errorMessage) as Error & { executionLog?: string };
      enhancedError.executionLog = logLines.join('\n');
      throw enhancedError;
    }
  }

  throw new Error(`Unsupported destination type: ${destination.type}`);
}

interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
}

/**
 * Get the PostgreSQL server version by connecting and querying
 */
async function getPostgresServerVersion(config: PostgresConfig): Promise<number> {
  const env = { ...process.env };
  if (config.password) {
    env.PGPASSWORD = config.password;
  }

  // Validate inputs
  const host = validateHostname(config.host);
  const port = validatePort(config.port);
  const username = validateSafeString(config.username, 'username');
  const database = validateSafeString(config.database, 'database');

  try {
    // Query the server version using psql with safe argument passing
    const { stdout } = await execCommand('psql', [
      '-h', host,
      '-p', String(port),
      '-U', username,
      '-d', database,
      '-t',
      '-c', 'SHOW server_version_num'
    ], { env });

    // server_version_num returns something like "170006" for 17.0.6
    // We want the major version (first 2 digits for v10+, first 1 digit for v9.x)
    const versionNum = parseInt(stdout.trim(), 10);
    const majorVersion = Math.floor(versionNum / 10000);

    console.log(`Detected PostgreSQL server version: ${majorVersion} (version_num: ${versionNum})`);
    return majorVersion;
  } catch (error) {
    console.warn('Failed to detect PostgreSQL version, falling back to default pg_dump:', error);
    // Return 0 to indicate unknown version - will use default pg_dump
    return 0;
  }
}

/**
 * Get the path to pg_dump for a specific PostgreSQL major version
 * Falls back to default pg_dump if version-specific binary is not available
 */
async function getPgDumpPath(majorVersion: number): Promise<string> {
  // Supported versions in our Docker image
  const supportedVersions = [17, 16, 15, 14];

  // Paths vary by OS:
  // - Debian/Ubuntu: /usr/lib/postgresql/VERSION/bin/pg_dump
  // - Alpine: /usr/libexec/postgresqlVERSION/pg_dump or /usr/bin/pg_dumpVERSION
  const pathPatterns = [
    (v: number) => `/usr/lib/postgresql/${v}/bin/pg_dump`,  // Debian/Ubuntu
    (v: number) => `/usr/libexec/postgresql${v}/pg_dump`,   // Alpine
    (v: number) => `/usr/bin/pg_dump${v}`,                   // Alternative
  ];

  if (majorVersion > 0 && supportedVersions.includes(majorVersion)) {
    // Try version-specific pg_dump first
    for (const pattern of pathPatterns) {
      const versionedPath = pattern(majorVersion);
      try {
        await stat(versionedPath);
        console.log(`Using version-specific pg_dump: ${versionedPath}`);
        return versionedPath;
      } catch {
        // Try next pattern
      }
    }
    console.warn(`pg_dump for version ${majorVersion} not found, checking available versions...`);
  }

  // If server version is newer than our newest client, use the newest available
  // pg_dump is forward-compatible (newer pg_dump can dump older servers)
  // but NOT backward-compatible (older pg_dump cannot dump newer servers)
  if (majorVersion > 0) {
    for (const version of supportedVersions) {
      if (version >= majorVersion) continue; // Skip versions older than server

      for (const pattern of pathPatterns) {
        const versionedPath = pattern(version);
        try {
          await stat(versionedPath);
          console.log(`Server version ${majorVersion} is newer than available clients, using newest: ${versionedPath}`);
          return versionedPath;
        } catch {
          // Try next pattern/version
        }
      }
    }
  }

  // Fallback to default pg_dump in PATH
  console.log('Using default pg_dump from PATH');
  return 'pg_dump';
}

async function executePostgresBackup(config: PostgresConfig, backupDir: string): Promise<BackupResult> {
  // Validate inputs before using them
  const host = validateHostname(config.host);
  const port = validatePort(config.port);
  const username = validateSafeString(config.username, 'username');
  const database = validateSafeString(config.database, 'database');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `postgres_${database}_${timestamp}.sql`;
  const filePath = path.join(backupDir, filename);

  const env = { ...process.env };
  if (config.password) {
    // Pass password via environment variable (secure, not on command line)
    env.PGPASSWORD = config.password;
  }

  // Detect server version and get appropriate pg_dump
  const serverVersion = await getPostgresServerVersion(config);
  const pgDumpPath = await getPgDumpPath(serverVersion);

  // Build argument array (safe from injection)
  const args = [
    '-h', host,
    '-p', String(port),
    '-U', username,
    '-d', database,
    '-F', 'c',
    '-f', filePath
  ];

  console.log('Executing command:', pgDumpPath, args.join(' '));

  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] Starting PostgreSQL backup`);
  logLines.push(`[${new Date().toISOString()}] Command: ${pgDumpPath} -h ${host} -p ${port} -U ${username} -d ${database} -F c`);
  logLines.push(`[${new Date().toISOString()}] Server version: ${serverVersion || 'unknown'}`);

  try {
    const { stdout, stderr } = await execCommand(pgDumpPath, args, { env });
    if (stdout) logLines.push(`[stdout] ${stdout}`);
    if (stderr) logLines.push(`[stderr] ${stderr}`);
    logLines.push(`[${new Date().toISOString()}] Backup completed successfully`);
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    if (execError.stdout) logLines.push(`[stdout] ${execError.stdout}`);
    if (execError.stderr) logLines.push(`[stderr] ${execError.stderr}`);
    logLines.push(`[${new Date().toISOString()}] Backup failed: ${execError.message || String(error)}`);
    const errorMessage = execError.stderr || execError.message || String(error);
    const err = new Error(`PostgreSQL backup failed: ${errorMessage}`);
    (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
    throw err;
  }

  const stats = await stat(filePath);
  logLines.push(`[${new Date().toISOString()}] Output file size: ${stats.size} bytes`);

  return {
    fileSize: stats.size,
    filePath,
    metadata: {
      database: config.database,
      host: config.host,
      format: 'custom',
      server_version: serverVersion || 'unknown',
      pg_dump: pgDumpPath,
    },
    executionLog: logLines.join('\n'),
  };
}

interface MongoDBConfig {
  connection_string: string;
}

async function executeMongoDBBackup(config: MongoDBConfig, backupDir: string): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mongodb_${timestamp}`;
  const tempDirPath = path.join(backupDir, filename);

  // Mask connection string in logs (hide password)
  const maskedUri = config.connection_string.replace(/:([^:@]+)@/, ':********@');

  // Build argument array (safe from injection)
  // Connection string is passed as a single argument, not interpolated into shell
  const args = [
    `--uri=${config.connection_string}`,
    `--out=${tempDirPath}`
  ];

  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] Starting MongoDB backup`);
  logLines.push(`[${new Date().toISOString()}] Command: mongodump --uri="${maskedUri}" --out=${tempDirPath}`);

  try {
    console.log('Executing command: mongodump', args.map(a => a.startsWith('--uri=') ? '--uri=***' : a).join(' '));
    const { stdout, stderr } = await execCommand('mongodump', args);
    if (stdout) logLines.push(`[stdout] ${stdout}`);
    if (stderr) logLines.push(`[stderr] ${stderr}`);
    logLines.push(`[${new Date().toISOString()}] Dump completed successfully`);
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    if (execError.stdout) logLines.push(`[stdout] ${execError.stdout}`);
    if (execError.stderr) logLines.push(`[stderr] ${execError.stderr}`);
    logLines.push(`[${new Date().toISOString()}] Backup failed: ${execError.message || String(error)}`);
    const errorMessage = execError.stderr || execError.message || String(error);
    const err = new Error(`MongoDB backup failed: ${errorMessage}`);
    (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
    throw err;
  }

  // Compress the directory to tar.gz
  logLines.push(`[${new Date().toISOString()}] Compressing backup...`);
  const { compressedPath, size } = await compressToTarGz(tempDirPath);
  logLines.push(`[${new Date().toISOString()}] Compression complete, size: ${size} bytes`);

  return {
    fileSize: size,
    filePath: compressedPath,
    metadata: {
      format: 'bson',
      compressed: true
    },
    executionLog: logLines.join('\n'),
  };
}

interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  ssl?: boolean; // Default true - most cloud providers require SSL
}

async function executeMySQLBackup(config: MySQLConfig, backupDir: string): Promise<BackupResult> {
  // Validate inputs before using them
  const host = validateHostname(config.host);
  const port = validatePort(config.port);
  const username = validateSafeString(config.username, 'username');
  const database = validateSafeString(config.database, 'database');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mysql_${database}_${timestamp}.sql`;
  const tempFilePath = path.join(backupDir, filename);

  // Build argument array (safe from injection)
  // Use defaults-extra-file for password to avoid exposing it on command line
  const useSSL = config.ssl !== false; // Default to true
  const args = [
    '-h', host,
    '-P', String(port),
    '-u', username,
    `--ssl-mode=${useSSL ? 'REQUIRED' : 'DISABLED'}`,
    '--result-file', tempFilePath,
    database
  ];

  // If password is provided, use defaults-extra-file method (more secure than -p)
  let defaultsFilePath: string | null = null;
  if (config.password) {
    // Create a temporary defaults file with the password
    defaultsFilePath = path.join(backupDir, `.mysql-defaults-${timestamp}`);
    await writeFile(defaultsFilePath, `[client]\npassword=${config.password}\n`, { mode: 0o600 });
    args.unshift(`--defaults-extra-file=${defaultsFilePath}`);
  }

  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] Starting MySQL backup`);
  logLines.push(`[${new Date().toISOString()}] Command: mysqldump -h ${host} -P ${port} -u ${username} ${config.password ? '--defaults-extra-file=*** ' : ''}${database}`);

  try {
    const { stdout, stderr } = await execCommand('mysqldump', args);
    if (stdout) logLines.push(`[stdout] ${stdout}`);
    if (stderr) logLines.push(`[stderr] ${stderr}`);
    logLines.push(`[${new Date().toISOString()}] Dump completed successfully`);
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    if (execError.stdout) logLines.push(`[stdout] ${execError.stdout}`);
    if (execError.stderr) logLines.push(`[stderr] ${execError.stderr}`);
    logLines.push(`[${new Date().toISOString()}] Backup failed: ${execError.message || String(error)}`);
    const errorMessage = execError.stderr || execError.message || String(error);
    const err = new Error(`MySQL backup failed: ${errorMessage}`);
    (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
    throw err;
  } finally {
    // Clean up the defaults file
    if (defaultsFilePath) {
      await unlink(defaultsFilePath).catch(() => {});
    }
  }

  // Compress the SQL file
  logLines.push(`[${new Date().toISOString()}] Compressing backup...`);
  const { compressedPath, size } = await compressToTarGz(tempFilePath);
  logLines.push(`[${new Date().toISOString()}] Compression complete, size: ${size} bytes`);

  return {
    fileSize: size,
    filePath: compressedPath,
    metadata: {
      database: config.database,
      host: config.host,
      format: 'sql',
      compressed: true
    },
    executionLog: logLines.join('\n'),
  };
}

interface RedisConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: number;
  tls?: boolean;
}

async function executeRedisBackup(config: RedisConfig, backupDir: string): Promise<BackupResult> {
  const host = validateHostname(config.host);
  const port = validatePort(config.port);
  const database = config.database ?? 0;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logLines: string[] = [];
  logLines.push(`[${new Date().toISOString()}] Starting Redis backup`);
  logLines.push(`[${new Date().toISOString()}] Target: ${host}:${port}, database: ${database}, TLS: ${config.tls ? 'yes' : 'no'}`);

  // Build Redis URL: redis[s]://[username:password@]host:port[/database]
  const protocol = config.tls ? 'rediss' : 'redis';
  let redisUrl = `${protocol}://`;
  if (config.password) {
    const username = config.username || 'default';
    redisUrl += `${encodeURIComponent(username)}:${encodeURIComponent(config.password)}@`;
  }
  redisUrl += `${host}:${port}`;
  if (database !== 0) {
    redisUrl += `/${database}`;
  }

  const tempFilePath = path.join(backupDir, `redis_${timestamp}.rdb`);

  // Use redis-cli with -u flag for URL-based connection
  const rdbArgs = ['-u', redisUrl, '--rdb', tempFilePath];

  console.log('Executing command: redis-cli -u [masked] --rdb', tempFilePath);
  logLines.push(`[${new Date().toISOString()}] Executing RDB dump...`);

  try {
    const { stdout, stderr } = await execCommand('redis-cli', rdbArgs, { timeoutMs: 5 * 60 * 1000 });
    if (stdout) logLines.push(`[stdout] ${stdout}`);
    if (stderr && !stderr.includes('Warning: Using a password')) {
      logLines.push(`[stderr] ${stderr}`);
    }

    // Verify the file was actually created and has content
    const fileStats = await stat(tempFilePath);
    if (fileStats.size === 0) {
      throw new Error('RDB file is empty');
    }
    logLines.push(`[${new Date().toISOString()}] RDB dump completed successfully (${fileStats.size} bytes)`);
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    if (execError.stdout) logLines.push(`[stdout] ${execError.stdout}`);
    if (execError.stderr) logLines.push(`[stderr] ${execError.stderr}`);
    logLines.push(`[${new Date().toISOString()}] Backup failed: ${execError.message || String(error)}`);

    // Clean up partial file
    await unlink(tempFilePath).catch(() => {});

    const err = new Error(`Redis backup failed: ${execError.message || String(error)}`);
    (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
    throw err;
  }

  // Compress the backup file
  logLines.push(`[${new Date().toISOString()}] Compressing backup...`);
  const { compressedPath, size } = await compressToTarGz(tempFilePath);
  logLines.push(`[${new Date().toISOString()}] Compression complete, size: ${size} bytes`);

  return {
    fileSize: size,
    filePath: compressedPath,
    metadata: {
      host: config.host,
      port: config.port,
      database: database,
      format: 'rdb',
      compressed: true,
      tls: config.tls || false,
    },
    executionLog: logLines.join('\n'),
  };
}

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  access_key_id: string;
  secret_access_key: string;
}

async function executeS3Backup(
  config: S3Config,
  destination: BackupDestination | null
): Promise<BackupResult> {
  if (!destination) {
    throw new Error('S3 backup requires a destination to be configured');
  }

  // Decrypt source config credentials
  const sourceConfig = decryptSensitiveFields(
    config as unknown as Record<string, unknown>,
    ['access_key_id', 'secret_access_key']
  ) as unknown as S3SourceConfig;

  if (destination.type === 's3') {
    // S3 to S3 sync - S3 destinations require a credential provider
    if (!destination.credential_provider_id) {
      throw new Error('S3 destination requires a credential provider');
    }

    // Fetch credentials from the credential provider
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
    const destBaseConfig = destination.config as { bucket: string; prefix?: string };
    const destConfig: S3DestinationConfigFull = {
      bucket: destBaseConfig.bucket,
      prefix: destBaseConfig.prefix,
      endpoint: providerConfig.endpoint as string | undefined,
      region: (providerConfig.region as string) || 'auto',
      access_key_id: providerConfig.access_key_id as string,
      secret_access_key: providerConfig.secret_access_key as string,
    };

    // Use temp directory for intermediate files during sync
    const tempDir = path.join(TEMP_BACKUP_DIR, `s3-copy-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    const logLines: string[] = [];
    logLines.push(`[${new Date().toISOString()}] Starting S3 to S3 sync`);
    logLines.push(`[${new Date().toISOString()}] Source: s3://${sourceConfig.bucket}/${sourceConfig.prefix || ''}`);
    logLines.push(`[${new Date().toISOString()}] Destination: s3://${destConfig.bucket}/${destConfig.prefix || ''}`);

    try {
      const result = await syncS3ToS3(sourceConfig, destConfig, tempDir);

      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      logLines.push(`[${new Date().toISOString()}] Sync completed: ${result.filesCopied} files, ${result.totalSize} bytes`);

      return {
        fileSize: result.totalSize,
        filePath: `s3://${destConfig.bucket}/${destConfig.prefix || ''}`,
        metadata: {
          source_bucket: sourceConfig.bucket,
          source_prefix: sourceConfig.prefix,
          dest_bucket: destConfig.bucket,
          dest_prefix: destConfig.prefix,
          files_copied: result.filesCopied,
          files: result.files,
        },
        executionLog: logLines.join('\n'),
      };
    } catch (error) {
      // Clean up temp directory on failure
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      logLines.push(`[${new Date().toISOString()}] Sync failed: ${error instanceof Error ? error.message : String(error)}`);
      const err = error instanceof Error ? error : new Error(String(error));
      (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
      throw err;
    }
  } else if (destination.type === 'local') {
    // S3 to local filesystem sync
    const localConfig = destination.config as LocalDestinationConfig;
    const destPath = localConfig.path;

    // Create timestamp-based subdirectory for this sync
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const syncDir = path.join(destPath, `s3-copy_${sourceConfig.bucket}_${timestamp}`);
    await mkdir(syncDir, { recursive: true });

    const logLines: string[] = [];
    logLines.push(`[${new Date().toISOString()}] Starting S3 to local sync`);
    logLines.push(`[${new Date().toISOString()}] Source: s3://${sourceConfig.bucket}/${sourceConfig.prefix || ''}`);
    logLines.push(`[${new Date().toISOString()}] Destination: ${syncDir}`);

    try {
      const result = await syncS3ToLocal(sourceConfig, syncDir);

      logLines.push(`[${new Date().toISOString()}] Sync completed: ${result.filesCopied} files, ${result.totalSize} bytes`);

      return {
        fileSize: result.totalSize,
        filePath: syncDir,
        metadata: {
          source_bucket: sourceConfig.bucket,
          source_prefix: sourceConfig.prefix,
          dest_path: syncDir,
          files_copied: result.filesCopied,
          files: result.files,
        },
        executionLog: logLines.join('\n'),
      };
    } catch (error) {
      logLines.push(`[${new Date().toISOString()}] Sync failed: ${error instanceof Error ? error.message : String(error)}`);
      const err = error instanceof Error ? error : new Error(String(error));
      (err as Error & { executionLog: string }).executionLog = logLines.join('\n');
      throw err;
    }
  } else {
    throw new Error(`Unsupported destination type for S3 backup: ${destination.type}`);
  }
}

async function syncS3ToLocal(
  sourceConfig: S3SourceConfig,
  destPath: string
): Promise<{ filesCopied: number; totalSize: number; files: Array<{ key: string; size: number }> }> {
  const { listS3Files, downloadFromS3 } = await import('./s3-service.js');

  // List files from source
  const sourceFiles = await listS3Files(sourceConfig as unknown as S3DestinationConfigFull, sourceConfig.prefix);

  if (sourceFiles.length === 0) {
    return { filesCopied: 0, totalSize: 0, files: [] };
  }

  const result = {
    filesCopied: 0,
    totalSize: 0,
    files: [] as Array<{ key: string; size: number }>,
  };

  for (const file of sourceFiles) {
    try {
      // Determine local path - preserve relative path from source prefix
      let relativePath = path.basename(file.key);
      if (sourceConfig.prefix && file.key.startsWith(sourceConfig.prefix)) {
        relativePath = file.key.substring(sourceConfig.prefix.length).replace(/^\//, '');
      }

      const localFilePath = path.join(destPath, relativePath);

      // Ensure parent directory exists
      await mkdir(path.dirname(localFilePath), { recursive: true });

      // Download file
      const size = await downloadFromS3(sourceConfig, file.key, localFilePath);

      result.filesCopied++;
      result.totalSize += size;
      result.files.push({ key: relativePath, size });
    } catch (error) {
      console.error(`Failed to download file ${file.key}:`, error);
      throw error;
    }
  }

  return result;
}
