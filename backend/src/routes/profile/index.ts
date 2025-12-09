/**
 * Profile Router
 *
 * Endpoints:
 * - GET    /                 Get current user profile
 * - PUT    /                 Update user profile
 * - POST   /change-password  Change password
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { getProfile, updateProfile, changePassword } from './handlers.js';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

router.get('/', getProfile);
router.put('/', validate(updateProfileSchema), updateProfile);
router.post('/change-password', validate(changePasswordSchema), changePassword);

export default router;
