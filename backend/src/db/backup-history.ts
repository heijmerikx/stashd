import { pool } from './index.js';

export interface BackupHistory {
  id: number;
  backup_job_id: number | null;
  destination_id: number | null;
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: Date;
  completed_at: Date | null;
  file_size: number | null;
  file_path: string | null;
  error_message: string | null;
  execution_log: string | null;
  metadata: object | null;
}

export interface BackupHistoryWithJob extends BackupHistory {
  job_name: string | null;
  job_type: string | null;
  destination_name: string | null;
  destination_type: string | null;
}

// Represents a single backup run (which may have multiple destinations)
export interface BackupRun {
  run_id: string;
  backup_job_id: number | null;
  job_name: string | null;
  started_at: Date;
  completed_at: Date | null;
  status: 'running' | 'completed' | 'partial' | 'failed'; // partial = some destinations failed
  total_destinations: number;
  successful_destinations: number;
  failed_destinations: number;
  total_size: number;
  destinations: BackupRunDestination[];
}

export interface BackupRunDestination {
  id: number;
  destination_id: number | null;
  destination_name: string | null;
  destination_type: string | null;
  status: string;
  file_size: number | null;
  file_path: string | null;
  error_message: string | null;
  execution_log: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export async function createBackupHistoryEntry(
  backupJobId: number,
  destinationId: number | null,
  runId: string,
  status: string = 'pending'
): Promise<BackupHistory> {
  const result = await pool.query(
    `INSERT INTO backup_history (backup_job_id, destination_id, run_id, status, heartbeat_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     RETURNING *`,
    [backupJobId, destinationId, runId, status]
  );
  return result.rows[0];
}

// Update heartbeat for a running backup (call periodically during long backups)
export async function updateBackupHeartbeat(id: number): Promise<void> {
  await pool.query(
    `UPDATE backup_history SET heartbeat_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

export async function updateBackupHistoryStatus(
  id: number,
  status: string,
  errorMessage?: string
): Promise<BackupHistory | null> {
  const result = await pool.query(
    `UPDATE backup_history
     SET status = $1, error_message = $2,
         completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
     WHERE id = $3
     RETURNING *`,
    [status, errorMessage || null, id]
  );
  return result.rows[0] || null;
}

export async function completeBackupHistory(
  id: number,
  fileSize: number,
  filePath: string,
  metadata?: object,
  executionLog?: string
): Promise<BackupHistory | null> {
  const result = await pool.query(
    `UPDATE backup_history
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
         file_size = $1, file_path = $2, metadata = $3, execution_log = $4
     WHERE id = $5
     RETURNING *`,
    [fileSize, filePath, metadata ? JSON.stringify(metadata) : null, executionLog || null, id]
  );
  return result.rows[0] || null;
}

export async function failBackupHistory(
  id: number,
  errorMessage: string,
  executionLog?: string
): Promise<BackupHistory | null> {
  const result = await pool.query(
    `UPDATE backup_history
     SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = $1, execution_log = $2
     WHERE id = $3
     RETURNING *`,
    [errorMessage, executionLog || null, id]
  );
  return result.rows[0] || null;
}

// Mark any stale "running" entries as failed (called on startup to clean up after crashes)
// Uses heartbeat_at to determine if a job is truly stale (no heartbeat for 2 minutes = dead)
export async function cleanupStaleRunningJobs(): Promise<number> {
  const result = await pool.query(
    `UPDATE backup_history
     SET status = 'failed',
         completed_at = CURRENT_TIMESTAMP,
         error_message = 'Job interrupted (server restart or crash)'
     WHERE status = 'running'
       AND (heartbeat_at IS NULL OR heartbeat_at < NOW() - INTERVAL '2 minutes')
     RETURNING id`
  );
  return result.rowCount || 0;
}

export async function getBackupHistoryByJobId(
  jobId: number,
  limit: number = 50
): Promise<BackupHistory[]> {
  const result = await pool.query(
    `SELECT * FROM backup_history
     WHERE backup_job_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [jobId, limit]
  );
  return result.rows;
}

export async function getBackupHistoryByJobIdPaginated(
  jobId: number,
  limit: number = 10,
  offset: number = 0
): Promise<{ entries: BackupHistoryWithJob[]; total: number }> {
  const [entriesResult, countResult] = await Promise.all([
    pool.query(
      `SELECT bh.*, bd.name as destination_name, bd.type as destination_type
       FROM backup_history bh
       LEFT JOIN backup_destinations bd ON bd.id = bh.destination_id
       WHERE bh.backup_job_id = $1
       ORDER BY bh.started_at DESC
       LIMIT $2 OFFSET $3`,
      [jobId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM backup_history WHERE backup_job_id = $1`,
      [jobId]
    )
  ]);

  return {
    entries: entriesResult.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

export async function getRecentBackupHistory(limit: number = 50): Promise<BackupHistoryWithJob[]> {
  const result = await pool.query(
    `SELECT bh.*, bj.name as job_name, bj.type as job_type,
            bd.name as destination_name, bd.type as destination_type
     FROM backup_history bh
     LEFT JOIN backup_jobs bj ON bj.id = bh.backup_job_id
     LEFT JOIN backup_destinations bd ON bd.id = bh.destination_id
     ORDER BY bh.started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getBackupStats(): Promise<{
  total_jobs: number;
  total_backups: number;
  successful_backups: number;
  failed_backups: number;
  total_size: number;
  last_24h_backups: number;
  last_24h_failures: number;
}> {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM backup_jobs) as total_jobs,
      (SELECT COUNT(*) FROM backup_history) as total_backups,
      (SELECT COUNT(*) FROM backup_history WHERE status = 'completed') as successful_backups,
      (SELECT COUNT(*) FROM backup_history WHERE status = 'failed') as failed_backups,
      (SELECT COALESCE(SUM(file_size), 0) FROM backup_history WHERE status = 'completed') as total_size,
      (SELECT COUNT(*) FROM backup_history WHERE started_at > NOW() - INTERVAL '24 hours') as last_24h_backups,
      (SELECT COUNT(*) FROM backup_history WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours') as last_24h_failures
  `);
  return {
    total_jobs: parseInt(result.rows[0].total_jobs),
    total_backups: parseInt(result.rows[0].total_backups),
    successful_backups: parseInt(result.rows[0].successful_backups),
    failed_backups: parseInt(result.rows[0].failed_backups),
    total_size: parseInt(result.rows[0].total_size),
    last_24h_backups: parseInt(result.rows[0].last_24h_backups),
    last_24h_failures: parseInt(result.rows[0].last_24h_failures)
  };
}

export async function getJobStats(jobId: number): Promise<{
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run: Date | null;
  last_success: Date | null;
  avg_duration_seconds: number;
}> {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
      MAX(started_at) as last_run,
      MAX(started_at) FILTER (WHERE status = 'completed') as last_success,
      AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_duration_seconds
    FROM backup_history
    WHERE backup_job_id = $1
  `, [jobId]);

  return {
    total_runs: parseInt(result.rows[0].total_runs),
    successful_runs: parseInt(result.rows[0].successful_runs),
    failed_runs: parseInt(result.rows[0].failed_runs),
    last_run: result.rows[0].last_run,
    last_success: result.rows[0].last_success,
    avg_duration_seconds: parseFloat(result.rows[0].avg_duration_seconds) || 0
  };
}

// Each run contains an array of destination statuses
export interface RecentRunStatus {
  status: 'running' | 'completed' | 'partial' | 'failed';
  destinations: Array<{ status: string }>;
  started_at: string | null;
  duration_seconds: number | null;
}

// Batch load stats for multiple jobs at once (fixes N+1 query problem)
export async function getJobStatsBatch(jobIds: number[]): Promise<Map<number, {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run: Date | null;
  last_success: Date | null;
  avg_duration_seconds: number;
}>> {
  if (jobIds.length === 0) return new Map();

  const result = await pool.query(`
    SELECT
      backup_job_id,
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
      MAX(started_at) as last_run,
      MAX(started_at) FILTER (WHERE status = 'completed') as last_success,
      AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_duration_seconds
    FROM backup_history
    WHERE backup_job_id = ANY($1)
    GROUP BY backup_job_id
  `, [jobIds]);

  const statsMap = new Map();

  // Initialize with empty stats for all requested job IDs
  for (const id of jobIds) {
    statsMap.set(id, {
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      last_run: null,
      last_success: null,
      avg_duration_seconds: 0
    });
  }

  // Update with actual stats
  for (const row of result.rows) {
    statsMap.set(row.backup_job_id, {
      total_runs: parseInt(row.total_runs),
      successful_runs: parseInt(row.successful_runs),
      failed_runs: parseInt(row.failed_runs),
      last_run: row.last_run,
      last_success: row.last_success,
      avg_duration_seconds: parseFloat(row.avg_duration_seconds) || 0
    });
  }

  return statsMap;
}

// Batch load recent run statuses for multiple jobs at once
// Optimized: uses DISTINCT ON instead of ROW_NUMBER for better performance
export async function getRecentRunStatusesBatch(jobIds: number[], limit: number = 10): Promise<Map<number, RecentRunStatus[]>> {
  if (jobIds.length === 0) return new Map();

  // First get the most recent run_ids per job (fast with index)
  // Then aggregate statuses for those runs
  const result = await pool.query(`
    WITH recent_runs AS (
      SELECT DISTINCT ON (backup_job_id, run_id)
        backup_job_id,
        run_id,
        started_at
      FROM backup_history
      WHERE backup_job_id = ANY($1)
      ORDER BY backup_job_id, run_id, started_at DESC
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY backup_job_id ORDER BY started_at DESC) as rn
      FROM recent_runs
    ),
    limited_runs AS (
      SELECT backup_job_id, run_id
      FROM ranked
      WHERE rn <= $2
    )
    SELECT
      bh.backup_job_id,
      bh.run_id,
      MIN(bh.started_at) as started_at,
      MAX(bh.completed_at) as completed_at,
      CASE
        WHEN COUNT(*) FILTER (WHERE bh.status = 'running') > 0 THEN 'running'
        WHEN COUNT(*) FILTER (WHERE bh.status = 'failed') = COUNT(*) THEN 'failed'
        WHEN COUNT(*) FILTER (WHERE bh.status = 'failed') > 0 THEN 'partial'
        ELSE 'completed'
      END as status,
      array_agg(bh.status ORDER BY bh.destination_id) as destination_statuses,
      EXTRACT(EPOCH FROM (MAX(bh.completed_at) - MIN(bh.started_at)))::integer as duration_seconds
    FROM backup_history bh
    INNER JOIN limited_runs lr ON bh.backup_job_id = lr.backup_job_id AND bh.run_id = lr.run_id
    GROUP BY bh.backup_job_id, bh.run_id
    ORDER BY bh.backup_job_id, MIN(bh.started_at) DESC
  `, [jobIds, limit]);

  const runsMap = new Map<number, RecentRunStatus[]>();

  // Initialize with empty arrays for all requested job IDs
  for (const id of jobIds) {
    runsMap.set(id, []);
  }

  // Group results by job ID
  for (const row of result.rows) {
    const runs = runsMap.get(row.backup_job_id) || [];
    runs.push({
      status: row.status as 'running' | 'completed' | 'partial' | 'failed',
      destinations: (row.destination_statuses || []).map((s: string) => ({ status: s })),
      started_at: row.started_at?.toISOString() || null,
      duration_seconds: row.duration_seconds ?? null
    });
    runsMap.set(row.backup_job_id, runs);
  }

  return runsMap;
}

export async function getRecentRunStatuses(jobId: number, limit: number = 10): Promise<RecentRunStatus[]> {
  // Group backup history by run_id and return status based on destination results
  const result = await pool.query(`
    WITH run_statuses AS (
      SELECT
        run_id,
        MIN(started_at) as started_at,
        MAX(completed_at) as completed_at,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        array_agg(status ORDER BY destination_id) as destination_statuses
      FROM backup_history
      WHERE backup_job_id = $1
      GROUP BY run_id
      ORDER BY started_at DESC
      LIMIT $2
    )
    SELECT
      CASE
        WHEN running > 0 THEN 'running'
        WHEN failed = total THEN 'failed'
        WHEN failed > 0 THEN 'partial'
        ELSE 'completed'
      END as status,
      destination_statuses,
      started_at,
      CASE
        WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - started_at))::integer
        ELSE NULL
      END as duration_seconds
    FROM run_statuses
  `, [jobId, limit]);

  return result.rows.map(row => ({
    status: row.status as 'running' | 'completed' | 'partial' | 'failed',
    destinations: (row.destination_statuses || []).map((s: string) => ({ status: s })),
    started_at: row.started_at ? row.started_at.toISOString() : null,
    duration_seconds: row.duration_seconds
  }));
}

// Get runs for a job with destination breakdown
export async function getBackupRunsByJobId(
  jobId: number,
  limit: number = 10,
  offset: number = 0
): Promise<{ runs: BackupRun[]; total: number }> {
  // Get total count of unique runs
  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT run_id) as total FROM backup_history WHERE backup_job_id = $1`,
    [jobId]
  );
  const total = parseInt(countResult.rows[0].total);

  // Get run summaries
  const runsResult = await pool.query(`
    SELECT
      run_id,
      backup_job_id,
      MIN(started_at) as started_at,
      MAX(completed_at) as completed_at,
      COUNT(*) as total_destinations,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_destinations,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_destinations,
      COUNT(*) FILTER (WHERE status = 'running') as running_destinations,
      COALESCE(SUM(file_size) FILTER (WHERE status = 'completed'), 0) as total_size
    FROM backup_history
    WHERE backup_job_id = $1
    GROUP BY run_id, backup_job_id
    ORDER BY MIN(started_at) DESC
    LIMIT $2 OFFSET $3
  `, [jobId, limit, offset]);

  // Get destination details for each run
  const runIds = runsResult.rows.map(r => r.run_id);

  let destinationsMap: Map<string, BackupRunDestination[]> = new Map();

  if (runIds.length > 0) {
    const destResult = await pool.query(`
      SELECT
        bh.id,
        bh.run_id,
        bh.destination_id,
        bd.name as destination_name,
        bd.type as destination_type,
        bh.status,
        bh.file_size,
        bh.file_path,
        bh.error_message,
        bh.execution_log,
        bh.started_at,
        bh.completed_at
      FROM backup_history bh
      LEFT JOIN backup_destinations bd ON bd.id = bh.destination_id
      WHERE bh.run_id = ANY($1)
      ORDER BY bh.started_at
    `, [runIds]);

    for (const row of destResult.rows) {
      const runDests = destinationsMap.get(row.run_id) || [];
      runDests.push({
        id: row.id,
        destination_id: row.destination_id,
        destination_name: row.destination_name,
        destination_type: row.destination_type,
        status: row.status,
        file_size: row.file_size,
        file_path: row.file_path,
        error_message: row.error_message,
        execution_log: row.execution_log,
        started_at: row.started_at,
        completed_at: row.completed_at,
      });
      destinationsMap.set(row.run_id, runDests);
    }
  }

  const runs: BackupRun[] = runsResult.rows.map(row => {
    const runningCount = parseInt(row.running_destinations);
    const failedCount = parseInt(row.failed_destinations);
    const totalCount = parseInt(row.total_destinations);

    let status: 'running' | 'completed' | 'partial' | 'failed';
    if (runningCount > 0) {
      status = 'running';
    } else if (failedCount === totalCount) {
      status = 'failed';
    } else if (failedCount > 0) {
      status = 'partial';
    } else {
      status = 'completed';
    }

    return {
      run_id: row.run_id,
      backup_job_id: row.backup_job_id,
      job_name: null,
      started_at: row.started_at,
      completed_at: row.completed_at,
      status,
      total_destinations: totalCount,
      successful_destinations: parseInt(row.successful_destinations),
      failed_destinations: failedCount,
      total_size: parseInt(row.total_size),
      destinations: destinationsMap.get(row.run_id) || [],
    };
  });

  return { runs, total };
}
