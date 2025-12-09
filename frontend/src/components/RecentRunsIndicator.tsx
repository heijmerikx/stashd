import type { RecentRunStatus } from '@/lib/api';
import { statusColors } from '@/lib/status-colors';

interface RecentRunsIndicatorProps {
  recentRuns?: RecentRunStatus[];
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return statusColors.completed;
    case 'failed':
      return statusColors.failed;
    case 'running':
      return statusColors.running;
    case 'partial':
      return statusColors.partial;
    default:
      return statusColors.unknown;
  }
}

export function RecentRunsIndicator({ recentRuns }: RecentRunsIndicatorProps) {
  if (!recentRuns || recentRuns.length === 0) {
    return <span className="text-muted-foreground text-xs">No runs</span>;
  }

  return (
    <div
      className="inline-flex items-center h-4"
      title={`Last ${recentRuns.length} runs (newest → oldest)`}
    >
      {recentRuns.map((run, runIdx) => {
        const isLast = runIdx === recentRuns.length - 1;
        const title = `${runIdx === 0 ? 'Latest' : `${runIdx + 1} runs ago`}: ${run.status}${run.destinations.length > 1 ? ` (${run.destinations.length} destinations)` : ''}`;

        const isRunning = run.status === 'running';
        const dotSize = runIdx === 0 ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';

        return (
          <div key={runIdx} className="flex items-center">
            {/* Dot - larger for first (latest) run, with ping animation for running */}
            {isRunning ? (
              <span className="relative flex" title={title}>
                <span className={`absolute inline-flex h-full w-full animate-ping ${statusColors.runningPing} opacity-75 ${dotSize}`} />
                <span className={`relative inline-flex ${statusColors.running} ${dotSize}`} />
              </span>
            ) : (
              <div
                className={`${getStatusColor(run.status)} ${dotSize}`}
                title={title}
              />
            )}
            {/* Connecting line */}
            {!isLast && (
              <div className="w-1.5 h-px bg-muted-foreground/30" />
            )}
          </div>
        );
      })}
    </div>
  );
}
