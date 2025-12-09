/**
 * User management route handlers
 * Only available for tier_2 (Team) licenses with unlimited seats
 */

import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../../middleware/auth.js';
import { getAllUsers, getUserByEmail, createUser, deleteUser, getUserCount, getUserById, updateUserProfile, updateUserPassword } from '../../db/index.js';
import { getLicenseKey } from '../../db/settings.js';
import { getLicenseStatus } from '../../services/license-service.js';

const SALT_ROUNDS = 12;

/**
 * Check if the current license allows user management
 */
async function checkLicenseAllowsUsers(): Promise<{ allowed: boolean; seats: number; error?: string }> {
  const licenseKey = await getLicenseKey();
  const status = getLicenseStatus(licenseKey);

  if (!status.valid) {
    return { allowed: false, seats: 1, error: 'Valid license required for user management' };
  }

  // Only tier_2 (Team) has unlimited seats (-1)
  // Other tiers have seats but are limited to 1
  if (status.seats === null || status.seats === 1) {
    return { allowed: false, seats: 1, error: 'User management requires a Team license' };
  }

  return { allowed: true, seats: status.seats };
}

/**
 * GET / - List all users
 */
export async function listUsers(_req: AuthRequest, res: Response) {
  const licenseCheck = await checkLicenseAllowsUsers();
  if (!licenseCheck.allowed) {
    res.status(403).json({ error: licenseCheck.error });
    return;
  }

  const users = await getAllUsers();
  const userCount = users.length;

  res.json({
    users,
    total: userCount,
    seats: licenseCheck.seats,
    seats_available: licenseCheck.seats === -1 ? 'unlimited' : licenseCheck.seats - userCount,
  });
}

/**
 * POST / - Create a new user
 */
export async function addUser(req: AuthRequest, res: Response) {
  const licenseCheck = await checkLicenseAllowsUsers();
  if (!licenseCheck.allowed) {
    res.status(403).json({ error: licenseCheck.error });
    return;
  }

  const { email, password, name } = req.body;

  // Check if we have available seats (unless unlimited)
  if (licenseCheck.seats !== -1) {
    const currentCount = await getUserCount();
    if (currentCount >= licenseCheck.seats) {
      res.status(403).json({ error: `Seat limit reached (${licenseCheck.seats} seats)` });
      return;
    }
  }

  // Check if user already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    res.status(400).json({ error: 'User with this email already exists' });
    return;
  }

  // Create user
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser(email, hashedPassword);

  res.status(201).json({
    message: 'User created successfully',
    user: {
      id: user.id,
      email: user.email,
      name: name || null,
      created_at: user.created_at,
    },
  });
}

/**
 * DELETE /:id - Delete a user
 */
export async function removeUser(req: AuthRequest, res: Response) {
  const licenseCheck = await checkLicenseAllowsUsers();
  if (!licenseCheck.allowed) {
    res.status(403).json({ error: licenseCheck.error });
    return;
  }

  const userId = parseInt(req.params.id);

  // Prevent deleting yourself
  if (req.user?.userId === userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  // Prevent deleting the last user
  const userCount = await getUserCount();
  if (userCount <= 1) {
    res.status(400).json({ error: 'Cannot delete the last user' });
    return;
  }

  const deleted = await deleteUser(userId);
  if (!deleted) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ message: 'User deleted successfully' });
}

/**
 * PUT /:id - Update a user
 */
export async function updateUser(req: AuthRequest, res: Response) {
  const licenseCheck = await checkLicenseAllowsUsers();
  if (!licenseCheck.allowed) {
    res.status(403).json({ error: licenseCheck.error });
    return;
  }

  const userId = parseInt(req.params.id);
  const { name, password } = req.body;

  // Check user exists
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let updatedUser = existingUser;

  // Update name if provided
  if (name !== undefined) {
    updatedUser = await updateUserProfile(userId, name);
  }

  // Update password if provided
  if (password) {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    updatedUser = await updateUserPassword(userId, hashedPassword);
  }

  res.json({
    message: 'User updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      created_at: updatedUser.created_at,
    },
  });
}
