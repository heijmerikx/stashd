/**
 * Auth route handlers
 */

import { Request, Response } from 'express';
import {
  getUserByEmail,
  createUser,
  getUserCount,
  getUserTotpStatus,
  getUserTotpSecret,
  getUserBackupCodes,
  updateUserBackupCodes,
} from '../../db/index.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../utils/password.js';
import { generateTokens, generateAccessToken, verifyRefreshToken } from '../../utils/jwt.js';
import { verifyTotpCode, decryptTotpSecret, verifyBackupCode } from '../../utils/totp.js';

// Cookie settings for refresh token
const REFRESH_TOKEN_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/api/auth', // Only sent to auth endpoints
  });
}

function clearRefreshTokenCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

/**
 * POST /login - Login or create first user
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password, totpCode } = req.body;

    const userCount = await getUserCount();
    const existingUser = await getUserByEmail(email);

    // First user registration flow
    if (userCount === 0) {
      // Validate password strength for new user
      const validation = validatePasswordStrength(password);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Password does not meet requirements',
          details: validation.errors,
          isFirstUser: true
        });
        return;
      }

      // Create first user
      const hashedPassword = await hashPassword(password);
      const newUser = await createUser(email, hashedPassword);

      const { accessToken, refreshToken } = generateTokens({ userId: newUser.id, email: newUser.email });

      // Set refresh token as httpOnly cookie
      setRefreshTokenCookie(res, refreshToken);

      res.json({
        message: 'First user account created successfully',
        token: accessToken,
        user: { id: newUser.id, email: newUser.email },
        isFirstUser: true
      });
      return;
    }

    // Normal login flow
    if (!existingUser) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValidPassword = await verifyPassword(password, existingUser.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if TOTP is enabled for this user
    const totpStatus = await getUserTotpStatus(existingUser.id);
    if (totpStatus?.totp_enabled) {
      // TOTP is required
      if (!totpCode) {
        // No code provided - tell client to prompt for TOTP
        res.status(200).json({
          requiresTotp: true,
          message: 'Two-factor authentication required'
        });
        return;
      }

      // Verify TOTP code
      const encryptedSecret = await getUserTotpSecret(existingUser.id);
      if (!encryptedSecret) {
        res.status(500).json({ error: 'TOTP configuration error' });
        return;
      }

      const secret = decryptTotpSecret(encryptedSecret);
      let isValidTotp = verifyTotpCode(totpCode, secret);

      // If TOTP code is invalid, try backup codes
      if (!isValidTotp) {
        const encryptedBackupCodes = await getUserBackupCodes(existingUser.id);
        if (encryptedBackupCodes && encryptedBackupCodes.length > 0) {
          const backupCodeIndex = verifyBackupCode(totpCode, encryptedBackupCodes);
          if (backupCodeIndex >= 0) {
            // Valid backup code - remove it so it can't be reused
            const updatedCodes = [...encryptedBackupCodes];
            updatedCodes.splice(backupCodeIndex, 1);
            await updateUserBackupCodes(existingUser.id, updatedCodes);
            isValidTotp = true;
          }
        }
      }

      if (!isValidTotp) {
        res.status(401).json({ error: 'Invalid two-factor authentication code' });
        return;
      }
    }

    const { accessToken, refreshToken } = generateTokens({ userId: existingUser.id, email: existingUser.email });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      token: accessToken,
      user: { id: existingUser.id, email: existingUser.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /refresh - Refresh access token
 * Reads refresh token from httpOnly cookie
 */
export async function refresh(req: Request, res: Response) {
  try {
    // Read refresh token from cookie
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    const newAccessToken = generateAccessToken(payload);

    res.json({ token: newAccessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    // Clear invalid cookie
    clearRefreshTokenCookie(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

/**
 * POST /logout - Clear refresh token cookie
 */
export async function logout(_req: Request, res: Response) {
  clearRefreshTokenCookie(res);
  res.json({ message: 'Logged out successfully' });
}

/**
 * GET /check-first-user - Check if this is first user setup
 */
export async function checkFirstUser(_req: Request, res: Response) {
  try {
    const userCount = await getUserCount();
    res.json({ isFirstUser: userCount === 0 });
  } catch (error) {
    console.error('Check first user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
