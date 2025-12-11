/**
 * Express app factory - creates and configures the Express application
 * Separated from index.ts to enable testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth/index.js';
import notificationChannelsRoutes from './routes/notification-channels/index.js';
import backupJobsRoutes from './routes/backup-jobs/index.js';
import backupDestinationsRoutes from './routes/backup-destinations/index.js';
import dashboardRoutes from './routes/dashboard/index.js';
import queueRoutes from './routes/queue/index.js';
import licenseRoutes from './routes/license/index.js';
import profileRoutes from './routes/profile/index.js';
import auditLogRoutes from './routes/audit-log/index.js';
import credentialProvidersRoutes from './routes/credential-providers/index.js';
import usersRoutes from './routes/users/index.js';

export interface CreateAppOptions {
  /** Skip rate limiting (useful for tests) */
  skipRateLimiting?: boolean;
  /** CORS origin override */
  corsOrigin?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  // Trust proxy for running behind reverse proxies (nginx, traefik, etc.)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting (can be skipped for tests)
  if (!options.skipRateLimiting) {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication attempts, please try again later' },
    });

    const expensiveOpLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many operations, please wait before trying again' },
    });

    app.use('/api/', apiLimiter);
    app.use('/api/auth', authLimiter);
    app.post('/api/backup-jobs/:id/run', expensiveOpLimiter);
    app.post('/api/notification-channels/:id/test', expensiveOpLimiter);
    app.post('/api/backup-destinations/:id/test', expensiveOpLimiter);
    app.post('/api/credential-providers/:id/test', expensiveOpLimiter);
    app.post('/api/queue/retry-failed', expensiveOpLimiter);
    app.post('/api/queue/drain', expensiveOpLimiter);
  }

  app.use(cors({
    origin: options.corsOrigin || process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parser with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parser for httpOnly refresh tokens
  app.use(cookieParser());

  // Public routes
  app.use('/api/auth', authRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Protected routes
  app.use('/api/notification-channels', authMiddleware, notificationChannelsRoutes);
  app.use('/api/backup-jobs', authMiddleware, backupJobsRoutes);
  app.use('/api/backup-destinations', authMiddleware, backupDestinationsRoutes);
  app.use('/api/dashboard', authMiddleware, dashboardRoutes);
  app.use('/api/queue', authMiddleware, queueRoutes);
  app.use('/api/license', authMiddleware, licenseRoutes);
  app.use('/api/profile', authMiddleware, profileRoutes);
  app.use('/api/audit-log', authMiddleware, auditLogRoutes);
  app.use('/api/credential-providers', authMiddleware, credentialProvidersRoutes);
  app.use('/api/users', authMiddleware, usersRoutes);

  return app;
}
