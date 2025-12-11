import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './encryption.js';

// Configure TOTP settings
authenticator.options = {
  digits: 6,
  step: 30, // 30 second window
  window: 1, // Allow 1 step before/after for clock drift
};

const APP_NAME = 'Stashd';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

/**
 * Generate a new TOTP secret
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Generate a QR code data URL for the TOTP secret
 */
export async function generateTotpQRCode(secret: string, email: string): Promise<string> {
  const otpauth = authenticator.keyuri(email, APP_NAME, secret);
  return QRCode.toDataURL(otpauth);
}

/**
 * Verify a TOTP code against a secret
 */
export function verifyTotpCode(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}

/**
 * Generate backup codes for account recovery
 * Returns both plain codes (to show user) and hashed codes (to store)
 */
export function generateBackupCodes(): { plain: string[]; encrypted: string[] } {
  const plain: string[] = [];
  const encrypted: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // Generate random alphanumeric code (easier to type than hex)
    const code = randomBytes(BACKUP_CODE_LENGTH)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, BACKUP_CODE_LENGTH)
      .toUpperCase();

    plain.push(code);
    encrypted.push(encrypt(code));
  }

  return { plain, encrypted };
}

/**
 * Verify a backup code against stored encrypted codes
 * Returns the index of the matched code, or -1 if not found
 */
export function verifyBackupCode(code: string, encryptedCodes: string[]): number {
  const normalizedCode = code.toUpperCase().replace(/\s/g, '');

  for (let i = 0; i < encryptedCodes.length; i++) {
    try {
      const decrypted = decrypt(encryptedCodes[i]);
      if (decrypted === normalizedCode) {
        return i;
      }
    } catch {
      // Skip invalid encrypted codes
      continue;
    }
  }

  return -1;
}

/**
 * Encrypt a TOTP secret for storage
 */
export function encryptTotpSecret(secret: string): string {
  return encrypt(secret);
}

/**
 * Decrypt a stored TOTP secret
 */
export function decryptTotpSecret(encryptedSecret: string): string {
  return decrypt(encryptedSecret);
}
