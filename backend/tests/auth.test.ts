/**
 * Authentication API tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Note: setup.ts is loaded via vitest.config.ts setupFiles
// Do NOT import it here - it must run first to set env vars

let app: Express;

// Dynamically import app AFTER setup has run (containers started, env vars set)
beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  app = createApp({ skipRateLimiting: true });
});

describe('Auth API', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api/auth/check-first-user', () => {
    it('should return isFirstUser: true when no users exist', async () => {
      const response = await request(app)
        .get('/api/auth/check-first-user')
        .expect(200);

      expect(response.body).toEqual({ isFirstUser: true });
    });
  });

  describe('POST /api/auth/login', () => {
    describe('First user registration', () => {
      it('should create first user with valid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@example.com',
            password: 'SecurePassword123!',
          })
          .expect(200);

        expect(response.body).toMatchObject({
          message: 'First user account created successfully',
          isFirstUser: true,
          user: {
            email: 'admin@example.com',
          },
        });
        expect(response.body.token).toBeDefined();
        expect(response.body.user.id).toBeDefined();

        // Should set refresh token cookie
        expect(response.headers['set-cookie']).toBeDefined();
        expect(response.headers['set-cookie'][0]).toContain('refreshToken');
      });

      it('should reject weak password for first user', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'admin@example.com',
            password: 'weak',
          })
          .expect(400);

        expect(response.body.error).toBe('Password does not meet requirements');
        expect(response.body.isFirstUser).toBe(true);
        expect(response.body.details).toBeDefined();
      });

      it('should reject invalid email format', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'not-an-email',
            password: 'SecurePassword123!',
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('Normal login', () => {
      it('should login existing user with correct credentials', async () => {
        // First create a user
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'SecurePassword123!',
          });

        // Then login
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'SecurePassword123!',
          })
          .expect(200);

        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe('user@example.com');
        expect(response.body.isFirstUser).toBeUndefined();
      });

      it('should reject login with wrong password', async () => {
        // First create a user
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'SecurePassword123!',
          });

        // Try wrong password
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'WrongPassword123!',
          })
          .expect(401);

        expect(response.body.error).toBe('Invalid credentials');
      });

      it('should reject login with non-existent email', async () => {
        // First create a user (so it's not first-user mode)
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'user@example.com',
            password: 'SecurePassword123!',
          });

        // Try non-existent email
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@example.com',
            password: 'SecurePassword123!',
          })
          .expect(401);

        expect(response.body.error).toBe('Invalid credentials');
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      // First create a user and get tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'SecurePassword123!',
        });

      // Extract refresh token cookie
      const cookies = loginResponse.headers['set-cookie'];

      // Refresh token
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.token).toBeDefined();
    });

    it('should reject refresh without cookie', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .expect(401);

      expect(response.body.error).toBe('No refresh token');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.message).toBe('Logged out successfully');
      // Should clear the cookie
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('Protected routes', () => {
    it('should reject access without token', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should reject access with invalid token', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    it('should allow access with valid token', async () => {
      // Create user and get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'SecurePassword123!',
        });

      const token = loginResponse.body.token;

      // Access protected route
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
