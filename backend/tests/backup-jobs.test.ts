/**
 * Backup Jobs API tests
 *
 * Tests CRUD operations, validation, and job management
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Note: setup.ts is loaded via vitest.config.ts setupFiles

let app: Express;
let authToken: string;

// Helper to create authenticated user and get token
async function getAuthToken(): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'admin@example.com',
      password: 'SecurePassword123!',
    });
  return response.body.token;
}

// Helper to create a destination (required for enabling jobs)
async function createDestination(): Promise<number> {
  const response = await request(app)
    .post('/api/backup-destinations')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      name: 'Test Local Destination',
      type: 'local',
      config: {
        path: '/tmp/backups',
      },
    });
  return response.body.id;
}

beforeAll(async () => {
  const { createApp } = await import('../src/app.js');
  app = createApp({ skipRateLimiting: true });
});

// Get fresh auth token before each test (since beforeEach in setup.ts clears users)
beforeEach(async () => {
  authToken = await getAuthToken();
});

describe('Backup Jobs API', () => {
  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/backup-jobs' },
        { method: 'post', path: '/api/backup-jobs' },
        { method: 'get', path: '/api/backup-jobs/1' },
        { method: 'put', path: '/api/backup-jobs/1' },
        { method: 'delete', path: '/api/backup-jobs/1' },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](endpoint.path);
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('No token provided');
      }
    });
  });

  describe('GET /api/backup-jobs', () => {
    it('should return empty array when no jobs exist', async () => {
      const response = await request(app)
        .get('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return list of jobs', async () => {
      // Create a job first
      await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test PostgreSQL Backup',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'user',
            password: 'pass',
          },
        });

      const response = await request(app)
        .get('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Test PostgreSQL Backup');
      expect(response.body[0].type).toBe('postgres');
      // Password should be masked
      expect(response.body[0].config.password).toBe('********');
    });
  });

  describe('POST /api/backup-jobs', () => {
    describe('PostgreSQL jobs', () => {
      it('should create a postgres backup job', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'My PostgreSQL Backup',
            type: 'postgres',
            config: {
              host: 'db.example.com',
              port: 5432,
              database: 'production',
              username: 'backup_user',
              password: 'secret123',
            },
            schedule: '0 2 * * *',
            retention_days: 30,
          })
          .expect(201);

        expect(response.body.id).toBeDefined();
        expect(response.body.name).toBe('My PostgreSQL Backup');
        expect(response.body.type).toBe('postgres');
        expect(response.body.schedule).toBe('0 2 * * *');
        expect(response.body.retention_days).toBe(30);
        // Password should be masked in response (shows first 4 chars + ****)
        expect(response.body.config.password).toMatch(/^.{4}\*{4}$|^\*{8}$/);
      });

      it('should reject postgres job without required fields', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Incomplete Job',
            type: 'postgres',
            config: {
              host: 'localhost',
              // missing port, database, username
            },
          })
          .expect(400);

        // validateConfig returns specific error message for missing fields
        expect(response.body.error).toMatch(/Missing required field:/);
      });

      // Note: Per-type config validation (e.g., port range) is not enforced by the current
      // Zod schema due to the union fallback to z.object({}). Type-specific field presence
      // is validated by validateConfig() helper instead.
    });

    describe('MySQL jobs', () => {
      it('should create a mysql backup job', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'My MySQL Backup',
            type: 'mysql',
            config: {
              host: 'mysql.example.com',
              port: 3306,
              database: 'production',
              username: 'backup_user',
              password: 'secret123',
              ssl: true,
            },
          })
          .expect(201);

        expect(response.body.type).toBe('mysql');
        expect(response.body.config.ssl).toBe(true);
      });
    });

    describe('MongoDB jobs', () => {
      it('should create a mongodb backup job', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'My MongoDB Backup',
            type: 'mongodb',
            config: {
              connection_string: 'mongodb://user:pass@mongo.example.com:27017/mydb',
            },
          })
          .expect(201);

        expect(response.body.type).toBe('mongodb');
        // Connection string password is masked, showing ********
        expect(response.body.config.connection_string).toContain('********');
        expect(response.body.config.connection_string).toContain('mongo.example.com');
      });

      it('should reject mongodb job without connection string', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Bad MongoDB Job',
            type: 'mongodb',
            config: {},
          })
          .expect(400);

        // validateConfig returns specific error message
        expect(response.body.error).toBe('Missing connection_string');
      });
    });

    describe('Redis jobs', () => {
      it('should create a redis backup job', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'My Redis Backup',
            type: 'redis',
            config: {
              host: 'redis.example.com',
              port: 6379,
              password: 'redispass',
              database: 0,
            },
          })
          .expect(201);

        expect(response.body.type).toBe('redis');
        // Password should be masked (shows first 4 chars + ****)
        expect(response.body.config.password).toMatch(/^.{4}\*{4}$|^\*{8}$/);
      });

      it('should allow redis job without password', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Redis No Auth',
            type: 'redis',
            config: {
              host: 'localhost',
              port: 6379,
            },
          })
          .expect(201);

        expect(response.body.type).toBe('redis');
      });
    });

    describe('Common validation', () => {
      it('should reject empty name', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: '',
            type: 'postgres',
            config: {
              host: 'localhost',
              port: 5432,
              database: 'test',
              username: 'user',
            },
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid job type', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Invalid Type Job',
            type: 'oracle', // Not supported
            config: {},
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject name longer than 255 chars', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'A'.repeat(256),
            type: 'postgres',
            config: {
              host: 'localhost',
              port: 5432,
              database: 'test',
              username: 'user',
            },
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid retention_days', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Bad Retention',
            type: 'postgres',
            config: {
              host: 'localhost',
              port: 5432,
              database: 'test',
              username: 'user',
            },
            retention_days: 0, // Must be >= 1
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should default retry_count to 3', async () => {
        const response = await request(app)
          .post('/api/backup-jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Default Retry',
            type: 'postgres',
            config: {
              host: 'localhost',
              port: 5432,
              database: 'test',
              username: 'user',
            },
          })
          .expect(201);

        expect(response.body.retry_count).toBe(3);
      });
    });
  });

  describe('GET /api/backup-jobs/:id', () => {
    it('should return a single job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Single Job Test',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/backup-jobs/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(jobId);
      expect(response.body.name).toBe('Single Job Test');
      expect(response.body.stats).toBeDefined();
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/api/backup-jobs/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Backup job not found');
    });
  });

  describe('PUT /api/backup-jobs/:id', () => {
    it('should update a job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Original Name',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      // Update the job
      const response = await request(app)
        .put(`/api/backup-jobs/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
          type: 'postgres',
          config: {
            host: 'newhost.example.com',
            port: 5432,
            database: 'newdb',
            username: 'newuser',
            password: '********', // Masked password should keep existing
          },
          schedule: '0 3 * * *',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
      expect(response.body.config.host).toBe('newhost.example.com');
      expect(response.body.schedule).toBe('0 3 * * *');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .put('/api/backup-jobs/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        })
        .expect(404);

      expect(response.body.error).toBe('Backup job not found');
    });
  });

  describe('DELETE /api/backup-jobs/:id', () => {
    it('should delete a job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'To Be Deleted',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      // Delete the job
      await request(app)
        .delete(`/api/backup-jobs/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify it's deleted
      await request(app)
        .get(`/api/backup-jobs/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .delete('/api/backup-jobs/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Backup job not found');
    });
  });

  describe('POST /api/backup-jobs/:id/duplicate', () => {
    it('should duplicate a job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Original Job',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
          schedule: '0 2 * * *',
        });

      const jobId = createResponse.body.id;

      // Duplicate the job
      const response = await request(app)
        .post(`/api/backup-jobs/${jobId}/duplicate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.id).not.toBe(jobId);
      expect(response.body.name).toBe('Original Job (copy)');
      expect(response.body.enabled).toBe(false); // Duplicates are disabled
      expect(response.body.schedule).toBe('0 2 * * *');
    });
  });

  describe('PATCH /api/backup-jobs/:id/toggle', () => {
    it('should toggle job enabled status', async () => {
      // Create a destination first
      const destinationId = await createDestination();

      // Create a disabled job with destination
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Toggle Test',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
          destination_ids: [destinationId],
          enabled: false,
        });

      const jobId = createResponse.body.id;

      // Toggle to enabled
      const enableResponse = await request(app)
        .patch(`/api/backup-jobs/${jobId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(enableResponse.body.enabled).toBe(true);

      // Toggle back to disabled
      const disableResponse = await request(app)
        .patch(`/api/backup-jobs/${jobId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(disableResponse.body.enabled).toBe(false);
    });

    it('should reject enabling job without destinations', async () => {
      // Create a job without destinations
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'No Destination Job',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
          enabled: false,
        });

      const jobId = createResponse.body.id;

      // Try to enable (should fail)
      const response = await request(app)
        .patch(`/api/backup-jobs/${jobId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Cannot enable a job without at least one destination');
    });
  });

  describe('POST /api/backup-jobs/:id/run', () => {
    it('should reject running job without destinations', async () => {
      // Create a job without destinations
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'No Destination Run',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/backup-jobs/${jobId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Cannot run a job without at least one destination');
    });

    it('should queue a job for execution', async () => {
      // Create a destination
      const destinationId = await createDestination();

      // Create a job with destination
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Run Test Job',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
          destination_ids: [destinationId],
        });

      const jobId = createResponse.body.id;

      const response = await request(app)
        .post(`/api/backup-jobs/${jobId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Backup job queued');
      expect(response.body.queueJobId).toBeDefined();
    });
  });

  describe('GET /api/backup-jobs/:id/history', () => {
    it('should return empty history for new job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'History Test',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/backup-jobs/${jobId}/history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/backup-jobs/:id/stats', () => {
    it('should return stats for a job', async () => {
      // Create a job
      const createResponse = await request(app)
        .post('/api/backup-jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Stats Test',
          type: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'test',
            username: 'user',
          },
        });

      const jobId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/backup-jobs/${jobId}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.total_runs).toBe(0);
      expect(response.body.successful_runs).toBe(0);
      expect(response.body.failed_runs).toBe(0);
      expect(response.body.recent_runs).toEqual([]);
    });
  });
});
