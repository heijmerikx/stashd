/**
 * Credential providers specific helpers
 */

import { encryptSensitiveFields, decryptSensitiveFields } from '../../utils/encryption.js';
import { testS3Connection, testS3Credentials } from '../../services/s3-service.js';
import { S3CredentialConfig } from '../../db/credential-providers.js';
import { maskValue, isMaskedValue } from '../helpers/masking.js';

// Sensitive fields per provider type
const SENSITIVE_FIELDS: Record<string, string[]> = {
  s3: ['secret_access_key', 'access_key_id']
};

export function getSensitiveFields(type: string): string[] {
  return SENSITIVE_FIELDS[type] || [];
}

/**
 * Mask sensitive config for API response
 */
export function maskSensitiveConfig(type: string, config: unknown): unknown {
  const configObj = config as Record<string, unknown>;
  const sensitiveFields = getSensitiveFields(type);

  // Decrypt first, then mask
  const decrypted = decryptSensitiveFields(configObj, sensitiveFields);
  const masked = { ...decrypted };

  for (const field of sensitiveFields) {
    if (masked[field] && typeof masked[field] === 'string') {
      masked[field] = maskValue(masked[field] as string);
    }
  }
  return masked;
}

/**
 * Encrypt config for storage
 */
export function encryptConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  return encryptSensitiveFields(config, getSensitiveFields(type));
}

/**
 * Decrypt config for use
 */
export function decryptConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  return decryptSensitiveFields(config, getSensitiveFields(type));
}

/**
 * Validate credential provider config
 */
export function validateConfig(
  type: string,
  providerPreset: string | undefined,
  config: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (type === 's3') {
    // Region is required only for AWS, optional for S3-compatible services
    const preset = providerPreset || 'custom';
    if (preset === 'aws' && !config.region) {
      return { valid: false, error: 'Region is required for AWS S3' };
    }

    // Endpoint is required for non-AWS providers
    if (preset !== 'aws' && preset !== 'custom' && !config.endpoint) {
      return { valid: false, error: 'Endpoint is required for S3-compatible storage providers' };
    }

    // access_key_id and secret_access_key are required but can be masked during update
    if (!config.access_key_id && !isMaskedValue(config.access_key_id)) {
      return { valid: false, error: 'Missing required field: access_key_id' };
    }
    if (!config.secret_access_key && !isMaskedValue(config.secret_access_key)) {
      return { valid: false, error: 'Missing required field: secret_access_key' };
    }
  } else {
    return { valid: false, error: `Unknown provider type: ${type}` };
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
  const sensitiveFields = getSensitiveFields(type);
  const merged = { ...newConfig };

  for (const field of sensitiveFields) {
    if (isMaskedValue(merged[field]) && existing[field]) {
      merged[field] = existing[field];
    }
  }

  return merged;
}

/**
 * Test credential provider connectivity
 */
export async function testProvider(
  type: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; error?: string; details?: object }> {
  if (type === 's3') {
    try {
      const s3Config = config as unknown as S3CredentialConfig & { bucket?: string };

      // If bucket is provided, do a full bucket test
      if (s3Config.bucket) {
        const fullConfig = {
          ...s3Config,
          region: s3Config.region || 'us-east-1',
          bucket: s3Config.bucket,
        };

        await testS3Connection(fullConfig);
        return {
          success: true,
          details: {
            region: s3Config.region || 'auto',
            endpoint: s3Config.endpoint || 'AWS S3',
          }
        };
      }

      // No bucket - test credentials by listing buckets
      await testS3Credentials({
        endpoint: s3Config.endpoint,
        region: s3Config.region,
        access_key_id: s3Config.access_key_id,
        secret_access_key: s3Config.secret_access_key,
      });

      return {
        success: true,
        details: {
          region: s3Config.region || 'auto',
          endpoint: s3Config.endpoint || 'AWS S3',
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  return {
    success: false,
    error: `Unknown provider type: ${type}`
  };
}

// Re-export for convenience
export { isMaskedValue };
