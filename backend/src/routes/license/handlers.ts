/**
 * License route handlers
 */

import { Request, Response } from 'express';
import { getLicenseKey, setLicenseKey } from '../../db/settings.js';
import { getLicenseStatus } from '../../services/license-service.js';

/**
 * GET /status - Get current license status
 */
export async function getStatus(_req: Request, res: Response) {
  const licenseKey = await getLicenseKey();
  const status = getLicenseStatus(licenseKey);

  res.json({
    registered: status.registered,
    valid: status.valid,
    company: status.company,
    email: status.email,
    issued_at: status.issuedAt?.toISOString() || null,
    expires_at: status.expiresAt?.toISOString() || null,
    expired: status.expired,
    error: status.error,
    tier: status.tier,
    tier_name: status.tierName,
    seats: status.seats,
  });
}

/**
 * PUT / - Update license key
 */
export async function updateLicense(req: Request, res: Response) {
  const { license_key } = req.body;

  // Validate the new license key before saving (if not empty)
  if (license_key && license_key.trim() !== '') {
    const status = getLicenseStatus(license_key);

    if (!status.valid && status.error) {
      res.status(400).json({ error: status.error });
      return;
    }
  }

  await setLicenseKey(license_key);
  const status = getLicenseStatus(license_key);

  res.json({
    message: license_key ? 'License key updated' : 'License key removed',
    registered: status.registered,
    valid: status.valid,
    company: status.company,
    email: status.email,
    issued_at: status.issuedAt?.toISOString() || null,
    expires_at: status.expiresAt?.toISOString() || null,
    expired: status.expired,
    tier: status.tier,
    tier_name: status.tierName,
    seats: status.seats,
  });
}

/**
 * DELETE / - Remove license key
 */
export async function removeLicense(_req: Request, res: Response) {
  await setLicenseKey('');

  res.json({
    message: 'License key removed',
    registered: false,
    valid: false,
    company: null,
  });
}
