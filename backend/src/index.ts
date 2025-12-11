import { createApp } from './app.js';
import { runMigrations } from './db/migrator.js';
import { cleanupStaleRunningJobs } from './db/backup-history.js';
import { startBackupWorker, shutdownWorker } from './queue/backup-queue.js';
import { startSystemWorker, initializeSystemJobs, shutdownSystemWorker } from './queue/system-queue.js';
import { initializeScheduler } from './services/scheduler-service.js';

// MODE can be: 'api-only', 'worker-only', or undefined (both)
const MODE = process.env.MODE;
const isApiEnabled = MODE !== 'worker-only';
const isWorkerEnabled = MODE !== 'api-only';

const app = createApp();
const PORT = process.env.PORT || 3000;

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
