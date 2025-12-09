/**
 * Auth Router
 *
 * Endpoints:
 * - POST   /login           Login or create first user
 * - POST   /refresh         Refresh access token (from httpOnly cookie)
 * - POST   /logout          Clear refresh token cookie
 * - GET    /check-first-user Check if first user setup
 */

import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { loginSchema } from '../../schemas/auth.js';
import { login, refresh, logout, checkFirstUser } from './handlers.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh); // No body validation - uses httpOnly cookie
router.post('/logout', logout);
router.get('/check-first-user', checkFirstUser);

export default router;
