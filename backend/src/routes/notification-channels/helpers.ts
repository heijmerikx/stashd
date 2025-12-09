/**
 * Notification channels specific helpers
 */

import { encryptSensitiveFields, decryptSensitiveFields } from '../../utils/encryption.js';
import { maskValue, isMaskedValue } from '../helpers/masking.js';

// Sensitive fields per channel type
const SENSITIVE_FIELDS: Record<string, string[]> = {
  email: ['smtp_pass', 'smtp_user'],
  discord: ['webhook_url']
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
 * Validate notification channel config
 */
export function validateConfig(
  type: string,
  config: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (type === 'email') {
    const required = ['smtp_host', 'smtp_port', 'from_email', 'to_emails'];
    for (const field of required) {
      if (!config[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
    if (!Array.isArray(config.to_emails) || config.to_emails.length === 0) {
      return { valid: false, error: 'to_emails must be a non-empty array' };
    }
  } else if (type === 'discord') {
    if (!config.webhook_url) {
      return { valid: false, error: 'Missing required field: webhook_url' };
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
  const sensitiveFields = getSensitiveFields(type);
  const merged = { ...newConfig };

  // Keep existing encrypted values if new value is masked
  for (const field of sensitiveFields) {
    if (isMaskedValue(merged[field]) && existing[field]) {
      merged[field] = existing[field];
    }
  }

  return merged;
}
