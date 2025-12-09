/**
 * Dashboard route handlers
 */

import { Request, Response } from 'express';
import { getBackupStats, getRecentBackupHistory, getJobStatsBatch, getRecentRunStatusesBatch } from '../../db/backup-history.js';
import { getAllBackupJobs } from '../../db/backup-jobs.js';

/**
 * GET /stats - Get dashboard stats
 */
export async function getStats(_req: Request, res: Response) {
  try {
    const stats = await getBackupStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}

/**
 * GET /recent-backups - Get recent backup history
 */
export async function getRecentBackups(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const history = await getRecentBackupHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching recent backups:', error);
    res.status(500).json({ error: 'Failed to fetch recent backups' });
  }
}

/**
 * GET /jobs-overview - Get all jobs with their stats for dashboard
 */
export async function getJobsOverview(_req: Request, res: Response) {
  try {
    const jobs = await getAllBackupJobs();

    if (jobs.length === 0) {
      res.json([]);
      return;
    }

    // Batch load all stats and recent runs in parallel (2 queries instead of 2*N)
    const jobIds = jobs.map(job => job.id);
    const [statsMap, recentRunsMap] = await Promise.all([
      getJobStatsBatch(jobIds),
      getRecentRunStatusesBatch(jobIds, 10)
    ]);

    const jobsWithStats = jobs.map(job => {
      const stats = statsMap.get(job.id) || {
        total_runs: 0,
        successful_runs: 0,
        failed_runs: 0,
        last_run: null,
        last_success: null,
        avg_duration_seconds: 0
      };
      const recentRuns = recentRunsMap.get(job.id) || [];

      return {
        id: job.id,
        name: job.name,
        type: job.type,
        schedule: job.schedule,
        enabled: job.enabled,
        stats: {
          ...stats,
          recent_runs: recentRuns
        }
      };
    });

    res.json(jobsWithStats);
  } catch (error) {
    console.error('Error fetching jobs overview:', error);
    res.status(500).json({ error: 'Failed to fetch jobs overview' });
  }
}
