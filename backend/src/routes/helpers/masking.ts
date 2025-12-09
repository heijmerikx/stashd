/**
 * Generic masking utilities for sensitive values
 */

/**
 * Mask a value, showing first 4 characters followed by ****
 */
export function maskValue(value: string): string {
  if (value.length <= 4) {
    return '********';
  }
  return value.substring(0, 4) + '****';
}

/**
 * Check if a value is already masked
 */
export function isMaskedValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value === '********' || value.endsWith('****');
}

/**
 * Mask a connection string password (show structure but hide password)
 */
export function maskConnectionString(connStr: string): string {
  return connStr.replace(
    /\/\/([^:]+):([^@]+)@/,
    (_, user) => `//${user}:****@`
  );
}
