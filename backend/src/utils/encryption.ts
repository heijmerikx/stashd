import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
// Fixed salt for deterministic key derivation
// Security relies on ENCRYPTION_SECRET being unique per deployment
const SALT = 'stashd-salt';

let encryptionKeyCache: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (encryptionKeyCache) {
    return encryptionKeyCache;
  }

  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    console.warn('WARNING: ENCRYPTION_SECRET should be at least 32 characters for security');
  }
  // Derive a 32-byte key from the secret using scrypt
  encryptionKeyCache = scryptSync(secret, SALT, 32);
  return encryptionKeyCache;
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all in hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  // Validate component lengths
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(text: string): boolean {
  // Check if the text matches our encrypted format (hex:hex:hex)
  const parts = text.split(':');
  if (parts.length !== 3) return false;

  // Check if all parts are valid hex
  const hexRegex = /^[0-9a-f]+$/i;
  return parts.every(part => hexRegex.test(part));
}

function isMaskedValue(value: string): boolean {
  return value === '********' || value.endsWith('****');
}

/**
 * Encrypt sensitive fields in an object
 * @throws Error if encryption fails - caller should handle appropriately
 */
export function encryptSensitiveFields(
  obj: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result = { ...obj };

  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      const value = result[field] as string;
      // Don't re-encrypt already encrypted values or masked values
      if (!isEncrypted(value) && !isMaskedValue(value)) {
        // Let encryption errors propagate - don't silently store unencrypted data
        result[field] = encrypt(value);
      }
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in an object
 * @throws Error if decryption fails for any field
 */
export function decryptSensitiveFields(
  obj: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result = { ...obj };

  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      const value = result[field] as string;
      if (isEncrypted(value)) {
        // Let decryption errors propagate - caller should handle failures
        // This prevents silent failures that could lead to security issues
        result[field] = decrypt(value);
      }
    }
  }

  return result;
}
