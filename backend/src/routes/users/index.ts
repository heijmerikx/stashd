/**
 * Users Router (Team Management)
 *
 * Endpoints:
 * - GET    /       List all users (Enterprise only)
 * - POST   /       Create a new user (Enterprise only)
 * - PUT    /:id    Update a user (Enterprise only)
 * - DELETE /:id    Delete a user (Enterprise only)
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { listUsers, addUser, updateUser, removeUser } from './handlers.js';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(255)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Password must contain at least one special character'
    ),
  name: z.string().max(255).optional(),
});

const updateUserSchema = z.object({
  name: z.string().max(255).optional(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(255)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Password must contain at least one special character'
    )
    .optional(),
});

router.get('/', listUsers);
router.post('/', validate(createUserSchema), addUser);
router.put('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', removeUser);

export default router;
