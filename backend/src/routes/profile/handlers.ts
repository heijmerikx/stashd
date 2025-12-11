/**
 * Profile route handlers
 */

import { Response } from 'express';
import {
  getUserById,
  updateUserProfile,
  updateUserPassword,
  getUserPasswordHash,
  getUserTotpStatus,
  setUserTotpSecret,
  enableUserTotp,
  disableUserTotp,
  getUserTotpSecretForSetup,
  getUserBackupCodes,
  updateUserBackupCodes,
} from '../../db/index.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../utils/password.js';
import { AuthRequest } from '../../middleware/auth.js';
import {
  generateTotpSecret,
  generateTotpQRCode,
  verifyTotpCode,
  generateBackupCodes,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyBackupCode,
} from '../../utils/totp.js';

/**
 * GET / - Get current user profile
 */
export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name || '',
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

/**
 * PUT / - Update user profile (name)
 */
export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name } = req.body;
    const user = await updateUserProfile(userId, name);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name || '',
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * POST /change-password - Change password
 */
export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const currentHash = await getUserPasswordHash(userId);
    if (!currentHash) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isValidPassword = await verifyPassword(currentPassword, currentHash);
    if (!isValidPassword) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      res.status(400).json({
        error: 'New password does not meet requirements',
        details: validation.errors,
      });
      return;
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await updateUserPassword(userId, hashedPassword);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

/**
 * GET /totp/status - Get TOTP status for current user
 */
export async function getTotpStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const status = await getUserTotpStatus(userId);
    if (!status) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      enabled: status.totp_enabled || false,
      hasSecret: status.has_secret || false,
    });
  } catch (error) {
    console.error('Error getting TOTP status:', error);
    res.status(500).json({ error: 'Failed to get TOTP status' });
  }
}

/**
 * POST /totp/setup - Start TOTP setup (generate secret and QR code)
 */
export async function setupTotp(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    if (!userId || !userEmail) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if TOTP is already enabled
    const status = await getUserTotpStatus(userId);
    if (status?.totp_enabled) {
      res.status(400).json({ error: 'TOTP is already enabled. Disable it first to set up again.' });
      return;
    }

    // Generate new secret
    const secret = generateTotpSecret();
    const encryptedSecret = encryptTotpSecret(secret);

    // Store encrypted secret (not yet enabled)
    await setUserTotpSecret(userId, encryptedSecret);

    // Generate QR code
    const qrCode = await generateTotpQRCode(secret, userEmail);

    res.json({
      secret, // Show plain secret for manual entry
      qrCode, // Data URL for QR code image
    });
  } catch (error) {
    console.error('Error setting up TOTP:', error);
    res.status(500).json({ error: 'Failed to set up TOTP' });
  }
}

/**
 * POST /totp/verify - Verify TOTP code and enable 2FA
 */
export async function verifyAndEnableTotp(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    // Get the stored secret
    const encryptedSecret = await getUserTotpSecretForSetup(userId);
    if (!encryptedSecret) {
      res.status(400).json({ error: 'No TOTP setup in progress. Start setup first.' });
      return;
    }

    // Decrypt and verify
    const secret = decryptTotpSecret(encryptedSecret);
    const isValid = verifyTotpCode(code, secret);

    if (!isValid) {
      res.status(400).json({ error: 'Invalid verification code. Please try again.' });
      return;
    }

    // Generate backup codes
    const { plain: backupCodes, encrypted: encryptedBackupCodes } = generateBackupCodes();

    // Enable TOTP
    const success = await enableUserTotp(userId, encryptedBackupCodes);
    if (!success) {
      res.status(500).json({ error: 'Failed to enable TOTP' });
      return;
    }

    res.json({
      message: 'TOTP enabled successfully',
      backupCodes, // Show backup codes once - user must save them
    });
  } catch (error) {
    console.error('Error verifying TOTP:', error);
    res.status(500).json({ error: 'Failed to verify TOTP' });
  }
}

/**
 * POST /totp/disable - Disable TOTP (requires password or backup code)
 */
export async function disableTotp(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { password, code } = req.body;

    // Require either password or TOTP code for security
    if (!password && !code) {
      res.status(400).json({ error: 'Password or TOTP code is required to disable 2FA' });
      return;
    }

    // Verify password if provided
    if (password) {
      const currentHash = await getUserPasswordHash(userId);
      if (!currentHash) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const isValidPassword = await verifyPassword(password, currentHash);
      if (!isValidPassword) {
        res.status(400).json({ error: 'Invalid password' });
        return;
      }
    } else if (code) {
      // Verify TOTP code if provided
      const encryptedSecret = await getUserTotpSecretForSetup(userId);
      if (!encryptedSecret) {
        res.status(400).json({ error: 'TOTP is not set up' });
        return;
      }

      const secret = decryptTotpSecret(encryptedSecret);
      const isValid = verifyTotpCode(code, secret);

      if (!isValid) {
        res.status(400).json({ error: 'Invalid TOTP code' });
        return;
      }
    }

    // Disable TOTP
    const success = await disableUserTotp(userId);
    if (!success) {
      res.status(500).json({ error: 'Failed to disable TOTP' });
      return;
    }

    res.json({ message: 'TOTP disabled successfully' });
  } catch (error) {
    console.error('Error disabling TOTP:', error);
    res.status(500).json({ error: 'Failed to disable TOTP' });
  }
}

/**
 * POST /totp/regenerate-backup-codes - Generate new backup codes
 */
export async function regenerateBackupCodes(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'TOTP code is required to regenerate backup codes' });
      return;
    }

    // Verify TOTP is enabled and code is valid
    const encryptedSecret = await getUserTotpSecretForSetup(userId);
    if (!encryptedSecret) {
      res.status(400).json({ error: 'TOTP is not enabled' });
      return;
    }

    const secret = decryptTotpSecret(encryptedSecret);
    const isValid = verifyTotpCode(code, secret);

    if (!isValid) {
      res.status(400).json({ error: 'Invalid TOTP code' });
      return;
    }

    // Generate new backup codes
    const { plain: backupCodes, encrypted: encryptedBackupCodes } = generateBackupCodes();

    // Update backup codes
    const success = await updateUserBackupCodes(userId, encryptedBackupCodes);
    if (!success) {
      res.status(500).json({ error: 'Failed to regenerate backup codes' });
      return;
    }

    res.json({
      message: 'Backup codes regenerated successfully',
      backupCodes,
    });
  } catch (error) {
    console.error('Error regenerating backup codes:', error);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
}
