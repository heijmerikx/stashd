/**
 * Profile route handlers
 */

import { Response } from 'express';
import { getUserById, updateUserProfile, updateUserPassword, getUserPasswordHash } from '../../db/index.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../utils/password.js';
import { AuthRequest } from '../../middleware/auth.js';

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
