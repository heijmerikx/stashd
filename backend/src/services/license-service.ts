import crypto from 'crypto';

export type LicenseTier = 'personal' | 'tier_1' | 'tier_2';

export interface LicensePayload {
  // License identifier
  lid: string;
  // Company name (registered to)
  company: string;
  // Contact email
  email: string;
  // Issued at timestamp
  iat: number;
  // Expires at timestamp (optional, null = perpetual)
  exp?: number;
  // Product identifier
  product: 'stashd';
  // License tier
  tier: LicenseTier;
  // Number of seats (users allowed), undefined = 1
  seats?: number;
}

export interface LicenseStatus {
  valid: boolean;
  registered: boolean;
  company: string | null;
  email: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  expired: boolean;
  error: string | null;
  tier: LicenseTier | null;
  tierName: string | null;
  seats: number | null;
}

// Public key for verifying license signatures
// This should match the public key from stashd-web
// Can be provided as raw PEM or base64-encoded PEM
function getPublicKey(): string {
  const raw = process.env.LICENSE_PUBLIC_KEY || '';
  if (!raw) return '';

  // If it already looks like a PEM key, return as-is (handling escaped newlines)
  if (raw.includes('-----BEGIN') || raw.includes('\\n')) {
    return raw.replace(/\\n/g, '\n');
  }

  // Otherwise, assume it's base64 encoded and decode it
  try {
    return Buffer.from(raw, 'base64').toString('utf-8');
  } catch {
    return raw;
  }
}

const LICENSE_PUBLIC_KEY = getPublicKey();

/**
 * Verify and decode a license key
 * Returns the payload if valid, null if invalid
 */
export function verifyLicenseKey(licenseKey: string): LicensePayload | null {
  if (!LICENSE_PUBLIC_KEY) {
    console.warn('LICENSE_PUBLIC_KEY not configured');
    return null;
  }

  try {
    // Remove STASHD- prefix
    if (!licenseKey.startsWith('STASHD-')) {
      return null;
    }

    const keyPart = licenseKey.substring(7); // Remove 'STASHD-'
    const [payloadBase64, signatureBase64] = keyPart.split('.');

    if (!payloadBase64 || !signatureBase64) {
      return null;
    }

    // Verify signature
    const publicKey = crypto.createPublicKey(LICENSE_PUBLIC_KEY);
    const signature = Buffer.from(signatureBase64, 'base64url');
    const isValid = crypto.verify(null, Buffer.from(payloadBase64), publicKey, signature);

    if (!isValid) {
      return null;
    }

    // Decode payload
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString();
    const payload = JSON.parse(payloadJson) as LicensePayload;

    return payload;
  } catch (error) {
    console.error('License verification error:', error);
    return null;
  }
}

// Tier display names
const TIER_NAMES: Record<LicenseTier, string> = {
  personal: 'Personal',
  tier_1: 'Pro',
  tier_2: 'Team',
};

// Get default seats for tier
function getDefaultSeats(tier: LicenseTier): number {
  switch (tier) {
    case 'personal':
    case 'tier_1':
      return 1;
    case 'tier_2':
      return -1; // -1 = unlimited
  }
}

/**
 * Get the full license status from a license key
 */
export function getLicenseStatus(licenseKey: string | null): LicenseStatus {
  // No license key set
  if (!licenseKey || licenseKey.trim() === '') {
    return {
      valid: false,
      registered: false,
      company: null,
      email: null,
      issuedAt: null,
      expiresAt: null,
      expired: false,
      error: null,
      tier: null,
      tierName: null,
      seats: null,
    };
  }

  // No public key configured - can't verify
  if (!LICENSE_PUBLIC_KEY) {
    return {
      valid: false,
      registered: false,
      company: null,
      email: null,
      issuedAt: null,
      expiresAt: null,
      expired: false,
      error: 'License verification not configured',
      tier: null,
      tierName: null,
      seats: null,
    };
  }

  const payload = verifyLicenseKey(licenseKey);

  // Invalid signature
  if (!payload) {
    return {
      valid: false,
      registered: false,
      company: null,
      email: null,
      issuedAt: null,
      expiresAt: null,
      expired: false,
      error: 'Invalid license key',
      tier: null,
      tierName: null,
      seats: null,
    };
  }

  // Check product
  if (payload.product !== 'stashd') {
    return {
      valid: false,
      registered: false,
      company: payload.company,
      email: payload.email,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      expired: false,
      error: 'License is not for this product',
      tier: null,
      tierName: null,
      seats: null,
    };
  }

  // Get tier info (default to personal for older licenses without tier)
  const tier = payload.tier ?? 'personal';
  const tierName = TIER_NAMES[tier];
  const seats = payload.seats ?? getDefaultSeats(tier);

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  const expired = payload.exp ? payload.exp < now : false;

  if (expired) {
    return {
      valid: false,
      registered: true,
      company: payload.company,
      email: payload.email,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      expired: true,
      error: 'License has expired',
      tier,
      tierName,
      seats,
    };
  }

  // Valid license
  return {
    valid: true,
    registered: true,
    company: payload.company,
    email: payload.email,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
    expired: false,
    error: null,
    tier,
    tierName,
    seats,
  };
}
