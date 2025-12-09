/**
 * Backup jobs route handlers
 */

import { Response } from 'express';
import {
  getAllBackupJobs,
  getBackupJobById,
  getBackupJobWithNotifications,
  createBackupJob as dbCreateBackupJob,
  updateBackupJob as dbUpdateBackupJob,
  deleteBackupJob as dbDeleteBackupJob,
  setBackupJobNotifications,
} from '../../db/backup-jobs.js';
import { getCredentialProviderById } from '../../db/credential-providers.js';
import {
  getJobStats,
  getJobStatsBatch,
  getBackupHistoryByJobId,
  getBackupHistoryByJobIdPaginated,
  getRecentRunStatusesBatch,
  getRecentRunStatuses,
  getBackupRunsByJobId,
} from '../../db/backup-history.js';
import { getAuditLogByEntity, createAuditLogEntry } from '../../db/audit-log.js';
import {
  getDestinationsForJob,
  getDestinationsForJobsBatch,
  setDestinationsForJob,
} from '../../db/backup-destinations.js';
import { addBackupJobToQueue } from '../../queue/backup-queue.js';
import { scheduleBackupJob, updateJobSchedule, unscheduleBackupJob } from '../../services/scheduler-service.js';
import { AuthRequest } from '../../middleware/auth.js';
import { getCached, setCache, invalidateCache } from '../helpers/cache.js';
import {
  encryptConfig,
  maskSensitiveConfig,
  validateConfig,
  mergeConfigWithExisting,
  getConfigChanges,
} from './helpers.js';

/**
 * GET / - Get all backup jobs
 */
export async function listJobs(req: AuthRequest, res: Response) {
  try {
    const includeStats = req.query.includeStats === 'true';
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = page * limit;

    // Check cache first
    const cacheKey = `jobs:${includeStats}:${page}:${limit}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const jobs = await getAllBackupJobs();

    if (jobs.length === 0) {
      res.json([]);
      return;
    }

    // Apply pagination
    const paginatedJobs = jobs.slice(offset, offset + limit);
    const jobIds = paginatedJobs.map(job => job.id);

    // Always load destinations (fast query)
    const destinationsMap = await getDestinationsForJobsBatch(jobIds);

    // Optionally load stats (slower queries) - for backwards compatibility
    let statsMap: Map<number, { total_runs: number; successful_runs: number; failed_runs: number; last_run: Date | null; last_success: Date | null; avg_duration_seconds: number }> | null = null;
    let recentRunsMap: Map<number, { status: string; destinations: { status: string }[] }[]> | null = null;

    if (includeStats) {
      [statsMap, recentRunsMap] = await Promise.all([
        getJobStatsBatch(jobIds),
        getRecentRunStatusesBatch(jobIds, 10)
      ]);
    }

    // Combine data for each job
    const jobsWithData = paginatedJobs.map(job => {
      const destinations = destinationsMap.get(job.id) || [];

      const result: Record<string, unknown> = {
        ...job,
        config: maskSensitiveConfig(job.type, job.config),
        destination_ids: destinations.map(d => d.id),
        destinations
      };

      if (includeStats && statsMap && recentRunsMap) {
        const stats = statsMap.get(job.id) || {
          total_runs: 0,
          successful_runs: 0,
          failed_runs: 0,
          last_run: null,
          last_success: null,
          avg_duration_seconds: 0
        };
        const recentRuns = recentRunsMap.get(job.id) || [];
        result.stats = {
          ...stats,
          recent_runs: recentRuns
        };
      }

      return result;
    });

    // Cache the result
    setCache(cacheKey, jobsWithData);

    res.json(jobsWithData);
  } catch (error) {
    console.error('Error fetching backup jobs:', error);
    res.status(500).json({ error: 'Failed to fetch backup jobs' });
  }
}

/**
 * GET /stats - Get stats for multiple jobs (lazy loading)
 */
export async function getStats(req: AuthRequest, res: Response) {
  try {
    const jobIdsParam = req.query.ids as string;
    if (!jobIdsParam) {
      res.status(400).json({ error: 'Missing ids parameter' });
      return;
    }

    const jobIds = jobIdsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    if (jobIds.length === 0) {
      res.json({});
      return;
    }

    // Check cache
    const cacheKey = `stats:${jobIds.sort().join(',')}`;
    const cached = getCached<Record<number, unknown>>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [statsMap, recentRunsMap] = await Promise.all([
      getJobStatsBatch(jobIds),
      getRecentRunStatusesBatch(jobIds, 10)
    ]);

    const result: Record<number, unknown> = {};
    for (const jobId of jobIds) {
      const stats = statsMap.get(jobId) || {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        last_run: null,
        last_success: null,
        avg_duration_seconds: 0
      };
      const recentRuns = recentRunsMap.get(jobId) || [];
      result[jobId] = {
        ...stats,
        recent_runs: recentRuns
      };
    }

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Error fetching job stats:', error);
    res.status(500).json({ error: 'Failed to fetch job stats' });
  }
}

/**
 * GET /:id/stats - Get stats for a single job (fast per-row loading)
 */
export async function getSingleJobStats(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);

    // Run both queries in parallel for this single job
    const [stats, recentRuns] = await Promise.all([
      getJobStats(id),
      getRecentRunStatuses(id, 10)
    ]);

    res.json({
      ...stats,
      recent_runs: recentRuns
    });
  } catch (error) {
    console.error('Error fetching single job stats:', error);
    res.status(500).json({ error: 'Failed to fetch job stats' });
  }
}

/**
 * GET /:id - Get single backup job with notifications
 */
export async function getJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const job = await getBackupJobWithNotifications(id);

    if (!job) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    const [stats, destinations] = await Promise.all([
      getJobStats(id),
      getDestinationsForJob(id)
    ]);

    res.json({
      ...job,
      config: maskSensitiveConfig(job.type, job.config),
      stats,
      destination_ids: destinations.map(d => d.id),
      destinations
    });
  } catch (error) {
    console.error('Error fetching backup job:', error);
    res.status(500).json({ error: 'Failed to fetch backup job' });
  }
}

/**
 * GET /:id/history - Get backup job history
 */
export async function getHistory(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 0;

    // If page parameter is provided, use paginated version
    if (req.query.page !== undefined) {
      const offset = page * limit;
      const result = await getBackupHistoryByJobIdPaginated(id, limit, offset);
      res.json(result);
    } else {
      const history = await getBackupHistoryByJobId(id, limit);
      res.json(history);
    }
  } catch (error) {
    console.error('Error fetching backup history:', error);
    res.status(500).json({ error: 'Failed to fetch backup history' });
  }
}

/**
 * GET /:id/runs - Get backup job runs (grouped by run_id)
 */
export async function getRuns(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 10;
    const page = parseInt(req.query.page as string) || 0;
    const offset = page * limit;

    const result = await getBackupRunsByJobId(id, limit, offset);
    res.json(result);
  } catch (error) {
    console.error('Error fetching backup runs:', error);
    res.status(500).json({ error: 'Failed to fetch backup runs' });
  }
}

/**
 * GET /:id/audit-log - Get audit log for a backup job
 */
export async function getAuditLog(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 0;
    const offset = page * limit;

    const result = await getAuditLogByEntity('backup_job', id, limit, offset);
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
}

/**
 * POST / - Create backup job
 */
export async function createJob(req: AuthRequest, res: Response) {
  try {
    const { name, type, config, schedule, destination_ids, retention_days, retry_count, enabled, notifications, source_credential_provider_id } = req.body;

    // Validate credential provider if specified
    const hasCredentialProvider = !!source_credential_provider_id;
    if (source_credential_provider_id) {
      const provider = await getCredentialProviderById(source_credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Invalid credential provider' });
        return;
      }
      // For S3 jobs, ensure the provider is an S3 provider
      if (type === 's3' && provider.type !== 's3') {
        res.status(400).json({ error: 'S3 backup jobs require an S3 credential provider' });
        return;
      }
    }

    const validation = validateConfig(type, config, hasCredentialProvider);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptConfig(type, config);

    const job = await dbCreateBackupJob(
      name,
      type,
      encryptedConfig,
      schedule || null,
      retention_days || 30,
      retry_count ?? 3,
      enabled ?? true,
      source_credential_provider_id || null
    );

    // Set destinations if provided
    if (destination_ids && Array.isArray(destination_ids)) {
      await setDestinationsForJob(job.id, destination_ids);
    }

    // Set notifications if provided
    if (notifications && Array.isArray(notifications)) {
      await setBackupJobNotifications(job.id, notifications);
    }

    // Schedule the job if it has a schedule
    if (job.schedule && job.enabled) {
      await scheduleBackupJob(job);
    }

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_job',
      entityId: job.id,
      entityName: job.name,
      action: 'create',
      changes: { name, type, schedule, destination_ids, retention_days, retry_count: retry_count ?? 3, enabled, source_credential_provider_id: source_credential_provider_id || null }
    });

    // Invalidate cache
    invalidateCache('jobs');

    res.status(201).json({
      ...job,
      config: maskSensitiveConfig(job.type, job.config),
      destination_ids: destination_ids || [],
      source_credential_provider_id: job.source_credential_provider_id
    });
  } catch (error) {
    console.error('Error creating backup job:', error);
    res.status(500).json({ error: 'Failed to create backup job' });
  }
}

/**
 * PUT /:id - Update backup job
 */
export async function updateJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { name, type, config, schedule, destination_ids, retention_days, retry_count, enabled, notifications, source_credential_provider_id } = req.body;

    // Validate credential provider if specified
    const hasCredentialProvider = !!source_credential_provider_id;
    if (source_credential_provider_id) {
      const provider = await getCredentialProviderById(source_credential_provider_id);
      if (!provider) {
        res.status(400).json({ error: 'Invalid credential provider' });
        return;
      }
      // For S3 jobs, ensure the provider is an S3 provider
      if (type === 's3' && provider.type !== 's3') {
        res.status(400).json({ error: 'S3 backup jobs require an S3 credential provider' });
        return;
      }
    }

    const validation = validateConfig(type, config, hasCredentialProvider);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Get existing job to merge sensitive config
    const existingJob = await getBackupJobById(id);
    if (!existingJob) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    const mergedConfig = mergeConfigWithExisting(type, config, existingJob.config as object);

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptConfig(type, mergedConfig as Record<string, unknown>);

    const job = await dbUpdateBackupJob(
      id,
      name,
      type,
      encryptedConfig,
      schedule || null,
      retention_days || 30,
      retry_count ?? existingJob.retry_count,
      enabled ?? true,
      source_credential_provider_id ?? null
    );

    if (!job) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    // Update destinations if provided
    if (destination_ids && Array.isArray(destination_ids)) {
      await setDestinationsForJob(job.id, destination_ids);
    }

    // Update notifications if provided
    if (notifications && Array.isArray(notifications)) {
      await setBackupJobNotifications(job.id, notifications);
    }

    // Update the job schedule
    await updateJobSchedule(job);

    // Audit log - include config changes if any
    const configChanges = getConfigChanges(
      type,
      existingJob.config as Record<string, unknown>,
      encryptedConfig
    );

    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_job',
      entityId: job.id,
      entityName: job.name,
      action: 'update',
      changes: {
        before: { name: existingJob.name, type: existingJob.type, schedule: existingJob.schedule, retention_days: existingJob.retention_days, retry_count: existingJob.retry_count, enabled: existingJob.enabled, source_credential_provider_id: existingJob.source_credential_provider_id },
        after: { name, type, schedule, retention_days, retry_count: retry_count ?? existingJob.retry_count, enabled, source_credential_provider_id: source_credential_provider_id ?? null },
        ...(configChanges && { config: configChanges })
      }
    });

    // Invalidate cache
    invalidateCache('jobs');
    invalidateCache('stats');

    res.json({
      ...job,
      config: maskSensitiveConfig(job.type, job.config),
      destination_ids: destination_ids || [],
      source_credential_provider_id: job.source_credential_provider_id
    });
  } catch (error) {
    console.error('Error updating backup job:', error);
    res.status(500).json({ error: 'Failed to update backup job' });
  }
}

/**
 * DELETE /:id - Delete backup job
 */
export async function deleteJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);

    // Get job info for audit log before deletion
    const existingJob = await getBackupJobById(id);

    // Unschedule the job first
    await unscheduleBackupJob(id);

    const deleted = await dbDeleteBackupJob(id);

    if (!deleted) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    // Audit log
    if (existingJob) {
      await createAuditLogEntry({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        entityType: 'backup_job',
        entityId: id,
        entityName: existingJob.name,
        action: 'delete',
        changes: { deleted: { name: existingJob.name, type: existingJob.type } }
      });
    }

    // Invalidate cache
    invalidateCache('jobs');
    invalidateCache('stats');

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting backup job:', error);
    res.status(500).json({ error: 'Failed to delete backup job' });
  }
}

/**
 * POST /:id/duplicate - Duplicate backup job
 */
export async function duplicateJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const existingJob = await getBackupJobWithNotifications(id);

    if (!existingJob) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    // Get destinations for the existing job
    const destinations = await getDestinationsForJob(id);

    // Create a copy with "(copy)" suffix and disabled
    const newName = `${existingJob.name} (copy)`;
    const newJob = await dbCreateBackupJob(
      newName,
      existingJob.type,
      existingJob.config as object,
      existingJob.schedule,
      existingJob.retention_days,
      existingJob.retry_count,
      false, // disabled by default
      existingJob.source_credential_provider_id
    );

    // Copy destinations
    if (destinations.length > 0) {
      await setDestinationsForJob(newJob.id, destinations.map(d => d.id));
    }

    // Copy notification settings
    if (existingJob.notification_channels && existingJob.notification_channels.length > 0) {
      const notifications = existingJob.notification_channels.map(nc => ({
        channelId: nc.id,
        onSuccess: nc.on_success,
        onFailure: nc.on_failure
      }));
      await setBackupJobNotifications(newJob.id, notifications);
    }

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_job',
      entityId: newJob.id,
      entityName: newJob.name,
      action: 'create',
      changes: { duplicated_from: { id: existingJob.id, name: existingJob.name }, source_credential_provider_id: existingJob.source_credential_provider_id }
    });

    // Invalidate cache
    invalidateCache('jobs');

    res.status(201).json({
      ...newJob,
      config: maskSensitiveConfig(newJob.type, newJob.config),
      destination_ids: destinations.map(d => d.id),
      source_credential_provider_id: newJob.source_credential_provider_id
    });
  } catch (error) {
    console.error('Error duplicating backup job:', error);
    res.status(500).json({ error: 'Failed to duplicate backup job' });
  }
}

/**
 * PATCH /:id/toggle - Toggle job enabled status
 */
export async function toggleJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const existingJob = await getBackupJobById(id);

    if (!existingJob) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    const newEnabled = !existingJob.enabled;

    // Check if trying to enable a job without destinations
    if (newEnabled) {
      const destinations = await getDestinationsForJob(id);
      if (destinations.length === 0) {
        res.status(400).json({ error: 'Cannot enable a job without at least one destination' });
        return;
      }
    }

    const job = await dbUpdateBackupJob(
      id,
      existingJob.name,
      existingJob.type,
      existingJob.config as object,
      existingJob.schedule,
      existingJob.retention_days,
      existingJob.retry_count,
      newEnabled,
      existingJob.source_credential_provider_id
    );

    if (!job) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    // Update the job schedule (will unschedule if disabled)
    await updateJobSchedule(job);

    // Audit log
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_job',
      entityId: job.id,
      entityName: job.name,
      action: 'update',
      changes: {
        toggled: newEnabled ? 'enabled' : 'disabled',
        before: { enabled: existingJob.enabled },
        after: { enabled: newEnabled }
      }
    });

    // Invalidate cache
    invalidateCache('jobs');

    res.json({
      ...job,
      config: maskSensitiveConfig(job.type, job.config),
      enabled: newEnabled
    });
  } catch (error) {
    console.error('Error toggling backup job:', error);
    res.status(500).json({ error: 'Failed to toggle backup job' });
  }
}

/**
 * POST /:id/run - Trigger manual backup
 */
export async function runJob(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const job = await getBackupJobById(id);

    if (!job) {
      res.status(404).json({ error: 'Backup job not found' });
      return;
    }

    // Check if job has destinations
    const destinations = await getDestinationsForJob(id);
    if (destinations.length === 0) {
      res.status(400).json({ error: 'Cannot run a job without at least one destination' });
      return;
    }

    const queueJob = await addBackupJobToQueue(job);

    // Audit log for manual run
    await createAuditLogEntry({
      userId: req.user?.userId,
      userEmail: req.user?.email,
      entityType: 'backup_job',
      entityId: job.id,
      entityName: job.name,
      action: 'run',
      changes: { manual: true, queueJobId: queueJob.id }
    });

    res.json({
      message: 'Backup job queued',
      queueJobId: queueJob.id
    });
  } catch (error) {
    console.error('Error triggering backup:', error);
    res.status(500).json({ error: 'Failed to trigger backup' });
  }
}
