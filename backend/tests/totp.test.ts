/**
 * TOTP Two-Factor Authentication tests
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { authenticator } from 'otplib';

// Note: setup.ts is loaded via vitest.config.ts setupFiles
// Do NOT import it here - it must run first to set env vars

let app: Express;

// Dynamically import app AFTER setup has run (containers started, env vars set)
beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  app = createApp({ skipRateLimiting: true });
});

describe('TOTP Two-Factor Authentication', () => {
  // Helper to create a user and get their token
  async function createUserAndLogin(email: string, password: string = 'SecurePassword123!'): Promise<{ token: string; cookies: string[] }> {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    return {
      token: loginResponse.body.token,
      cookies: loginResponse.headers['set-cookie'] || [],
    };
  }

  describe('TOTP Utility Functions', () => {
    it('should generate valid TOTP secret', async () => {
      // Import the utility functions after env is set up
      const { generateTotpSecret, verifyTotpCode } = await import('../src/utils/totp.js');

      const secret = generateTotpSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThan(10);

      // Generate a valid code and verify it
      const validCode = authenticator.generate(secret);
      expect(verifyTotpCode(validCode, secret)).toBe(true);
    });

    it('should reject invalid TOTP code', async () => {
      const { generateTotpSecret, verifyTotpCode } = await import('../src/utils/totp.js');

      const secret = generateTotpSecret();
      expect(verifyTotpCode('000000', secret)).toBe(false);
      expect(verifyTotpCode('123456', secret)).toBe(false);
    });

    it('should generate backup codes', async () => {
      const { generateBackupCodes, verifyBackupCode } = await import('../src/utils/totp.js');

      const { plain, encrypted } = generateBackupCodes();

      // Should generate 10 codes
      expect(plain).toHaveLength(10);
      expect(encrypted).toHaveLength(10);

      // Each plain code should be 8 characters
      plain.forEach(code => {
        expect(code).toMatch(/^[A-Z0-9]{8}$/);
      });

      // Each encrypted code should be verifiable
      plain.forEach((code, index) => {
        const foundIndex = verifyBackupCode(code, encrypted);
        expect(foundIndex).toBe(index);
      });
    });

    it('should encrypt and decrypt TOTP secret', async () => {
      const { generateTotpSecret, encryptTotpSecret, decryptTotpSecret } = await import('../src/utils/totp.js');

      const secret = generateTotpSecret();
      const encrypted = encryptTotpSecret(secret);

      expect(encrypted).not.toBe(secret);
      expect(encrypted).toContain(':'); // Our encryption format

      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('should generate QR code data URL', async () => {
      const { generateTotpSecret, generateTotpQRCode } = await import('../src/utils/totp.js');

      const secret = generateTotpSecret();
      const qrCode = await generateTotpQRCode(secret, 'test@example.com');

      expect(qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('GET /api/profile/totp/status', () => {
    it('should return disabled status for new user', async () => {
      const { token } = await createUserAndLogin('totp-status@example.com');

      const response = await request(app)
        .get('/api/profile/totp/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        enabled: false,
        hasSecret: false,
      });
    });

    it('should reject unauthenticated request', async () => {
      await request(app)
        .get('/api/profile/totp/status')
        .expect(401);
    });
  });

  describe('POST /api/profile/totp/setup', () => {
    it('should return QR code and secret for setup', async () => {
      const { token } = await createUserAndLogin('totp-setup@example.com');

      const response = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.secret).toBeDefined();
      expect(response.body.secret.length).toBeGreaterThan(10);
      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it('should update hasSecret status after setup', async () => {
      const { token } = await createUserAndLogin('totp-setup2@example.com');

      // Setup TOTP
      await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Check status
      const response = await request(app)
        .get('/api/profile/totp/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        enabled: false,
        hasSecret: true,
      });
    });
  });

  describe('POST /api/profile/totp/verify', () => {
    it('should enable TOTP with valid code', async () => {
      const { token } = await createUserAndLogin('totp-verify@example.com');

      // Setup TOTP
      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;

      // Generate valid code
      const validCode = authenticator.generate(secret);

      // Verify and enable
      const verifyResponse = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      expect(verifyResponse.body.message).toBe('TOTP enabled successfully');
      expect(verifyResponse.body.backupCodes).toHaveLength(10);

      // Check status is now enabled
      const statusResponse = await request(app)
        .get('/api/profile/totp/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(statusResponse.body.enabled).toBe(true);
    });

    it('should reject invalid code', async () => {
      const { token } = await createUserAndLogin('totp-verify-invalid@example.com');

      // Setup TOTP
      await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Try invalid code
      const response = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' })
        .expect(400);

      expect(response.body.error).toBe('Invalid verification code. Please try again.');
    });

    it('should reject without setup', async () => {
      const { token } = await createUserAndLogin('totp-no-setup@example.com');

      // Try to verify without setup
      const response = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '123456' })
        .expect(400);

      expect(response.body.error).toBe('No TOTP setup in progress. Start setup first.');
    });
  });

  describe('POST /api/profile/totp/disable', () => {
    it('should disable TOTP with valid password', async () => {
      const password = 'SecurePassword123!';
      const { token } = await createUserAndLogin('totp-disable@example.com', password);

      // Setup and enable TOTP
      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Disable with password
      const disableResponse = await request(app)
        .post('/api/profile/totp/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password })
        .expect(200);

      expect(disableResponse.body.message).toBe('TOTP disabled successfully');

      // Check status is now disabled
      const statusResponse = await request(app)
        .get('/api/profile/totp/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(statusResponse.body.enabled).toBe(false);
    });

    it('should disable TOTP with valid TOTP code', async () => {
      const { token } = await createUserAndLogin('totp-disable-code@example.com');

      // Setup and enable TOTP
      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Generate new code for disabling
      const disableCode = authenticator.generate(secret);

      // Disable with TOTP code
      const disableResponse = await request(app)
        .post('/api/profile/totp/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: disableCode })
        .expect(200);

      expect(disableResponse.body.message).toBe('TOTP disabled successfully');
    });

    it('should reject disable with wrong password', async () => {
      const { token } = await createUserAndLogin('totp-disable-wrong@example.com');

      // Setup and enable TOTP
      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Try to disable with wrong password
      const response = await request(app)
        .post('/api/profile/totp/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'WrongPassword123!' })
        .expect(400);

      expect(response.body.error).toBe('Invalid password');
    });
  });

  describe('POST /api/profile/totp/regenerate-backup-codes', () => {
    it('should regenerate backup codes with valid TOTP code', async () => {
      const { token } = await createUserAndLogin('totp-regen@example.com');

      // Setup and enable TOTP
      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      const verifyResponse = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      const originalBackupCodes = verifyResponse.body.backupCodes;

      // Wait a moment to ensure we get a new TOTP code
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate new code for regeneration
      const regenCode = authenticator.generate(secret);

      // Regenerate backup codes
      const regenResponse = await request(app)
        .post('/api/profile/totp/regenerate-backup-codes')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: regenCode })
        .expect(200);

      expect(regenResponse.body.message).toBe('Backup codes regenerated successfully');
      expect(regenResponse.body.backupCodes).toHaveLength(10);

      // New codes should be different from original
      const hasNewCodes = regenResponse.body.backupCodes.some(
        (code: string) => !originalBackupCodes.includes(code)
      );
      expect(hasNewCodes).toBe(true);
    });
  });

  describe('Login with TOTP', () => {
    it('should require TOTP code when 2FA is enabled', async () => {
      const email = 'totp-login@example.com';
      const password = 'SecurePassword123!';

      // Create user and enable TOTP
      const { token } = await createUserAndLogin(email, password);

      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Try to login without TOTP code
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      expect(loginResponse.body.requiresTotp).toBe(true);
      expect(loginResponse.body.token).toBeUndefined();
    });

    it('should login successfully with valid TOTP code', async () => {
      const email = 'totp-login-success@example.com';
      const password = 'SecurePassword123!';

      // Create user and enable TOTP
      const { token } = await createUserAndLogin(email, password);

      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      let validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Wait to get a fresh code
      await new Promise(resolve => setTimeout(resolve, 100));

      // Login with TOTP code
      validCode = authenticator.generate(secret);
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password, totpCode: validCode })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user.email).toBe(email);
    });

    it('should reject login with invalid TOTP code', async () => {
      const email = 'totp-login-invalid@example.com';
      const password = 'SecurePassword123!';

      // Create user and enable TOTP
      const { token } = await createUserAndLogin(email, password);

      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      // Login with wrong TOTP code
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password, totpCode: '000000' })
        .expect(401);

      expect(loginResponse.body.error).toBe('Invalid two-factor authentication code');
    });

    it('should login with backup code', async () => {
      const email = 'totp-login-backup@example.com';
      const password = 'SecurePassword123!';

      // Create user and enable TOTP
      const { token } = await createUserAndLogin(email, password);

      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      const verifyResponse = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      const backupCode = verifyResponse.body.backupCodes[0];

      // Login with backup code
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password, totpCode: backupCode })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user.email).toBe(email);
    });

    it('should not reuse backup code', async () => {
      const email = 'totp-backup-reuse@example.com';
      const password = 'SecurePassword123!';

      // Create user and enable TOTP
      const { token } = await createUserAndLogin(email, password);

      const setupResponse = await request(app)
        .post('/api/profile/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const secret = setupResponse.body.secret;
      const validCode = authenticator.generate(secret);

      const verifyResponse = await request(app)
        .post('/api/profile/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode })
        .expect(200);

      const backupCode = verifyResponse.body.backupCodes[0];

      // First login with backup code should succeed
      await request(app)
        .post('/api/auth/login')
        .send({ email, password, totpCode: backupCode })
        .expect(200);

      // Second login with same backup code should fail
      const secondLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email, password, totpCode: backupCode })
        .expect(401);

      expect(secondLoginResponse.body.error).toBe('Invalid two-factor authentication code');
    });
  });
});
