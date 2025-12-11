/**
 * Profile Router
 *
 * Endpoints:
 * - GET    /                          Get current user profile
 * - PUT    /                          Update user profile
 * - POST   /change-password           Change password
 * - GET    /totp/status               Get TOTP 2FA status
 * - POST   /totp/setup                Start TOTP setup (get QR code)
 * - POST   /totp/verify               Verify code and enable TOTP
 * - POST   /totp/disable              Disable TOTP
 * - POST   /totp/regenerate-backup-codes  Regenerate backup codes
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import {
  getProfile,
  updateProfile,
  changePassword,
  getTotpStatus,
  setupTotp,
  verifyAndEnableTotp,
  disableTotp,
  regenerateBackupCodes,
} from './handlers.js';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

const totpCodeSchema = z.object({
  code: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d+$/, 'TOTP code must contain only digits'),
});

const disableTotpSchema = z.object({
  password: z.string().optional(),
  code: z.string().optional(),
}).refine(data => data.password || data.code, {
  message: 'Either password or TOTP code is required',
});

// Profile routes
router.get('/', getProfile);
router.put('/', validate(updateProfileSchema), updateProfile);
router.post('/change-password', validate(changePasswordSchema), changePassword);

// TOTP 2FA routes
router.get('/totp/status', getTotpStatus);
router.post('/totp/setup', setupTotp);
router.post('/totp/verify', validate(totpCodeSchema), verifyAndEnableTotp);
router.post('/totp/disable', validate(disableTotpSchema), disableTotp);
router.post('/totp/regenerate-backup-codes', validate(totpCodeSchema), regenerateBackupCodes);

export default router;
