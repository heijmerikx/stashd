import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { runMigrations } from './db/migrator.js';
import { cleanupStaleRunningJobs } from './db/backup-history.js';
import { startBackupWorker, shutdownWorker } from './queue/backup-queue.js';
import { startSystemWorker, initializeSystemJobs, shutdownSystemWorker } from './queue/system-queue.js';
import { initializeScheduler } from './services/scheduler-service.js';
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

// MODE can be: 'api-only', 'worker-only', or undefined (both)
const MODE = process.env.MODE;
const isApiEnabled = MODE !== 'worker-only';
const isWorkerEnabled = MODE !== 'api-only';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for running behind reverse proxies (nginx, traefik, etc.)
// Using 1 instead of true to satisfy express-rate-limit security requirements
// 1 = trust the first proxy (the immediate reverse proxy)
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
  crossOriginEmbedderPolicy: false, // Allow frontend to embed
}));

// Rate limiting - general API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});

// Rate limiting for expensive operations (backup runs, tests, etc.)
const expensiveOpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 10 operations per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many operations, please wait before trying again' },
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser for httpOnly refresh tokens
app.use(cookieParser());

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

// Apply stricter rate limiting to expensive operations
// These endpoints trigger backups, tests, or other resource-intensive operations
app.post('/api/backup-jobs/:id/run', expensiveOpLimiter);
app.post('/api/notification-channels/:id/test', expensiveOpLimiter);
app.post('/api/backup-destinations/:id/test', expensiveOpLimiter);
app.post('/api/credential-providers/:id/test', expensiveOpLimiter);
app.post('/api/queue/retry-failed', expensiveOpLimiter);
app.post('/api/queue/drain', expensiveOpLimiter);

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

async function start() {
  try {
    console.log(`Starting in ${MODE || 'combined'} mode...`);

    // Run database migrations (only from API to avoid race conditions)
    if (isApiEnabled) {
      await runMigrations();
    }

    // Clean up any stale "running" jobs from previous crashes (only from worker)
    if (isWorkerEnabled) {
      const cleanedUp = await cleanupStaleRunningJobs();
      if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} stale running job(s) from previous crash`);
      }
    }

    // Start backup worker
    if (isWorkerEnabled) {
      startBackupWorker();
      // Initialize scheduled backup jobs
      await initializeScheduler();
      console.log('Backup worker started');

      // Start system worker and initialize system jobs (cleanup, maintenance, etc.)
      startSystemWorker();
      await initializeSystemJobs();
    }

    let server: ReturnType<typeof app.listen> | null = null;

    // Start HTTP server
    if (isApiEnabled) {
      server = app.listen(PORT, () => {
        console.log(`API server running on port ${PORT}`);
      });
    }

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);

      // Stop accepting new connections
      if (server) {
        server.close(() => {
          console.log('HTTP server closed');
        });
      }

      // Wait for workers to finish active jobs
      if (isWorkerEnabled) {
        await shutdownWorker();
        await shutdownSystemWorker();
      }

      console.log('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Keep worker process alive if running in worker-only mode
    if (!isApiEnabled && isWorkerEnabled) {
      console.log('Worker running, waiting for jobs...');
    }
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
