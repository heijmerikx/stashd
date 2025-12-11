/**
 * Backup jobs specific helpers
 * - Config encryption/decryption
 * - Config validation
 * - Config masking
 */

import { encrypt, decrypt, isEncrypted } from '../../utils/encryption.js';
import { maskValue, isMaskedValue, maskConnectionString } from '../helpers/masking.js';

// Sensitive fields per backup job type
const SENSITIVE_FIELDS: Record<string, string[]> = {
  postgres: ['password'],
  mysql: ['password'],
  mongodb: [], // connection_string handled separately
  redis: ['password'],
  files: [],
  s3: ['access_key_id', 'secret_access_key']
};

export function getSensitiveFields(type: string): string[] {
  return SENSITIVE_FIELDS[type] || [];
}

/**
 * Encrypt sensitive fields in backup job config
 */
export function encryptConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };
  const sensitiveFields = getSensitiveFields(type);

  // Encrypt standard sensitive fields
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      const value = result[field] as string;
      if (!isEncrypted(value) && !isMaskedValue(value)) {
        result[field] = encrypt(value);
      }
    }
  }

  // Handle MongoDB connection string separately
  if (type === 'mongodb' && result.connection_string) {
    const connStr = String(result.connection_string);
    // Only encrypt if not already encrypted and not masked
    if (!connStr.includes('****')) {
      const match = connStr.match(/\/\/([^:]+):([^@]+)@/);
      if (match && !isEncrypted(match[2])) {
        const encryptedPass = encrypt(match[2]);
        result.connection_string = connStr.replace(
          /\/\/([^:]+):([^@]+)@/,
          (_, user) => `//${user}:${encryptedPass}@`
        );
      }
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in backup job config
 */
export function decryptConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };
  const sensitiveFields = getSensitiveFields(type);

  // Decrypt standard sensitive fields
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      const value = result[field] as string;
      if (isEncrypted(value)) {
        try {
          result[field] = decrypt(value);
        } catch {
          console.error(`Failed to decrypt field: ${field}`);
        }
      }
    }
  }

  // Handle MongoDB connection string separately
  if (type === 'mongodb' && result.connection_string) {
    const connStr = String(result.connection_string);
    const match = connStr.match(/\/\/([^:]+):([^@]+)@/);
    if (match && isEncrypted(match[2])) {
      try {
        const decryptedPass = decrypt(match[2]);
        result.connection_string = connStr.replace(
          /\/\/([^:]+):([^@]+)@/,
          (_, user) => `//${user}:${decryptedPass}@`
        );
      } catch {
        console.error('Failed to decrypt MongoDB connection string password');
      }
    }
  }

  return result;
}

/**
 * Get decrypted config for a job (used by backup executor)
 */
export function getDecryptedConfig(type: string, config: unknown): Record<string, unknown> {
  return decryptConfig(type, config as Record<string, unknown>);
}

/**
 * Mask sensitive fields in config for API response
 */
export function maskSensitiveConfig(type: string, config: unknown): unknown {
  // Decrypt first, then mask
  const decrypted = decryptConfig(type, config as Record<string, unknown>);

  if (type === 'postgres' || type === 'mysql' || type === 'redis') {
    return {
      ...decrypted,
      password: decrypted.password ? maskValue(decrypted.password as string) : undefined
    };
  } else if (type === 'mongodb') {
    if (decrypted.connection_string) {
      // Mask password in connection string, showing first 4 chars
      const masked = String(decrypted.connection_string).replace(
        /\/\/([^:]+):([^@]+)@/,
        (_, user, pass) => `//${user}:${maskValue(pass)}@`
      );
      return { ...decrypted, connection_string: masked };
    }
  } else if (type === 's3') {
    return {
      ...decrypted,
      access_key_id: decrypted.access_key_id ? maskValue(decrypted.access_key_id as string) : undefined,
      secret_access_key: decrypted.secret_access_key ? maskValue(decrypted.secret_access_key as string) : undefined,
    };
  }
  return decrypted;
}

/**
 * Get config changes for audit log (masks sensitive values, only shows what changed)
 */
export function getConfigChanges(
  type: string,
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const sensitiveFields = getSensitiveFields(type);
  const changes: { before: Record<string, unknown>; after: Record<string, unknown> } = {
    before: {},
    after: {}
  };

  // Decrypt both configs for comparison
  const decryptedOld = decryptConfig(type, oldConfig);
  const decryptedNew = decryptConfig(type, newConfig);

  // Check each field for changes
  const allKeys = new Set([...Object.keys(decryptedOld), ...Object.keys(decryptedNew)]);

  for (const key of allKeys) {
    const oldVal = decryptedOld[key];
    const newVal = decryptedNew[key];

    // Skip if values are the same
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    // Mask sensitive fields
    if (sensitiveFields.includes(key)) {
      changes.before[key] = oldVal ? '[changed]' : '[not set]';
      changes.after[key] = newVal ? '[changed]' : '[removed]';
    } else if (key === 'connection_string' && type === 'mongodb') {
      // For MongoDB, show masked connection strings
      changes.before[key] = oldVal ? maskConnectionString(String(oldVal)) : '[not set]';
      changes.after[key] = newVal ? maskConnectionString(String(newVal)) : '[removed]';
    } else {
      // Non-sensitive fields can be shown as-is
      changes.before[key] = oldVal;
      changes.after[key] = newVal;
    }
  }

  // Return null if no changes
  if (Object.keys(changes.before).length === 0) return null;

  return changes;
}

/**
 * Validate backup job config based on type
 */
export function validateConfig(
  type: string,
  config: Record<string, unknown>,
  hasCredentialProvider: boolean = false
): { valid: boolean; error?: string } {
  if (type === 'postgres') {
    const required = ['host', 'port', 'database', 'username'];
    for (const field of required) {
      if (!config[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  } else if (type === 'mongodb') {
    if (!config.connection_string) {
      return { valid: false, error: 'Missing connection_string' };
    }
  } else if (type === 's3') {
    // Bucket is always required
    if (!config.bucket) {
      return { valid: false, error: 'Missing required field: bucket' };
    }
    // If not using credential provider, require inline credentials
    if (!hasCredentialProvider) {
      const required = ['region', 'access_key_id', 'secret_access_key'];
      for (const field of required) {
        if (!config[field]) {
          return { valid: false, error: `Missing required field: ${field} (or use a credential provider)` };
        }
      }
    }
  }
  return { valid: true };
}

/**
 * Merge new config with existing, preserving masked sensitive values
 */
export function mergeConfigWithExisting(
  type: string,
  newConfig: Record<string, unknown>,
  existingConfig: object
): object {
  const existing = existingConfig as Record<string, unknown>;

  if ((type === 'postgres' || type === 'mysql' || type === 'redis') && isMaskedValue(newConfig.password)) {
    return { ...newConfig, password: existing.password };
  }

  if (type === 'mongodb' && String(newConfig.connection_string).includes('****')) {
    // Extract the original password from existing connection string
    const existingConnStr = String(existing.connection_string);
    const newConnStr = String(newConfig.connection_string);

    const existingMatch = existingConnStr.match(/\/\/([^:]+):([^@]+)@/);
    if (existingMatch) {
      const originalPassword = existingMatch[2];
      // Replace the masked password in the new connection string with the original
      const mergedConnStr = newConnStr.replace(
        /\/\/([^:]+):[^@]+@/,
        (_, user) => `//${user}:${originalPassword}@`
      );
      return { ...newConfig, connection_string: mergedConnStr };
    }
    // Fallback to replacing entire connection string if pattern doesn't match
    return { ...newConfig, connection_string: existing.connection_string };
  }

  if (type === 's3') {
    const merged = { ...newConfig };
    if (isMaskedValue(newConfig.access_key_id)) {
      merged.access_key_id = existing.access_key_id;
    }
    if (isMaskedValue(newConfig.secret_access_key)) {
      merged.secret_access_key = existing.secret_access_key;
    }
    return merged;
  }

  return newConfig;
}

// Re-export masking utilities for convenience
export { maskValue, isMaskedValue, maskConnectionString };
