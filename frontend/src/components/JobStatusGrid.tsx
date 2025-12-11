import { Link } from 'react-router-dom';
import type { JobOverview, RecentRunStatus } from '@/lib/api';
import { statusColors } from '@/lib/status-colors';

interface JobStatusGridProps {
  jobs: JobOverview[];
}

function getJobStatus(job: JobOverview): 'healthy' | 'attention' | 'disabled' | 'never-run' | 'running' {
  if (!job.enabled) return 'disabled';
  if (!job.stats.last_run) return 'never-run';

  const lastRunStatus = job.stats.recent_runs?.[0]?.status;

  if (lastRunStatus === 'running') {
    return 'running';
  }

  if (lastRunStatus === 'failed') {
    return 'attention';
  }

  return 'healthy';
}

function getStatusLabel(status: ReturnType<typeof getJobStatus>): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'running':
      return 'Running';
    case 'attention':
      return 'Needs attention';
    case 'disabled':
      return 'Disabled';
    case 'never-run':
      return 'Never run';
  }
}

function getRunStatusColor(status: RecentRunStatus['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    case 'partial':
      return 'bg-amber-500';
    case 'running':
      return 'bg-blue-500';
    default:
      return 'bg-muted';
  }
}

function getRunTextColor(status: RecentRunStatus['status']): string {
  switch (status) {
    case 'completed':
      return 'text-green-600 dark:text-green-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'partial':
      return 'text-amber-600 dark:text-amber-400';
    case 'running':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-muted-foreground';
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--:--';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }) + ' ' + date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const MAX_RUNS = 5;

export function JobStatusGrid({ jobs }: JobStatusGridProps) {
  if (jobs.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-4">
        No backup jobs configured
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {jobs.map((job) => {
        const status = getJobStatus(job);
        const statusLabel = getStatusLabel(status);
        const recentRuns = job.stats.recent_runs || [];
        const isRunning = status === 'running';
        const isDisabled = status === 'disabled';

        // Build lines array - newest at top (index 0), oldest at bottom
        type LineData = {
          status: RecentRunStatus['status'] | 'empty' | 'disabled';
          started_at: string | null;
          duration_seconds: number | null;
        };
        const lines: LineData[] = [];
        const hasHistory = recentRuns.length > 0;
        for (let i = 0; i < MAX_RUNS; i++) {
          if (i < recentRuns.length) {
            // Show actual history for both enabled and disabled jobs
            lines.push({
              status: recentRuns[i].status,
              started_at: recentRuns[i].started_at,
              duration_seconds: recentRuns[i].duration_seconds
            });
          } else if (isDisabled && !hasHistory) {
            lines.push({ status: 'disabled', started_at: null, duration_seconds: null });
          } else {
            lines.push({ status: 'empty', started_at: null, duration_seconds: null });
          }
        }

        return (
          <Link
            key={job.id}
            to={`/backup-jobs/${job.id}`}
            className="group relative"
            title={`${job.name} - ${statusLabel}`}
          >
            <div
              className={`relative bg-background border border-border/50 transition-all group-hover:border-primary/50 overflow-hidden ${isRunning ? 'border-blue-500/50' : ''
                }`}
            >
              {/* Job name header */}
              <div className="px-2 py-1.5 border-b border-border/30 bg-muted/30">
                <span className="text-xs font-medium truncate block">{job.name}</span>
              </div>

              {/* Run history lines */}
              <div className="p-1.5 space-y-0.5">
                {lines.map((line, idx) => {
                  const isCurrentlyRunning = line.status === 'running';
                  const bgColor = line.status === 'empty'
                    ? 'bg-muted/50'
                    : line.status === 'disabled'
                      ? 'bg-muted/30'
                      : getRunStatusColor(line.status as RecentRunStatus['status']);
                  const textColor = line.status === 'empty' || line.status === 'disabled'
                    ? 'text-muted-foreground/50'
                    : getRunTextColor(line.status as RecentRunStatus['status']);

                  return (
                    <div
                      key={idx}
                      className={`flex items-center h-4 px-1.5 ${isCurrentlyRunning ? 'animate-pulse' : ''}`}
                    >
                      {/* Status indicator bar */}
                      <div
                        className={`w-1 h-full mr-2 ${bgColor}`}
                      />
                      {/* Time and duration */}
                      <span className={`text-[10px] font-mono ${textColor} flex-1`}>
                        {line.status === 'empty' || line.status === 'disabled'
                          ? '—'
                          : formatTime(line.started_at)
                        }
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {line.status === 'empty' || line.status === 'disabled'
                          ? ''
                          : line.status === 'running'
                            ? '...'
                            : formatDuration(line.duration_seconds)
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {isRunning && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full animate-ping ${statusColors.runningPing} opacity-75 rounded-full`} />
                <span className={`relative inline-flex h-2.5 w-2.5 ${statusColors.running} rounded-full`} />
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
