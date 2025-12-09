import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  File,
  FolderOpen,
  HardDrive,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { BackupRun } from '@/lib/api';

interface HistoryTabProps {
  runs: BackupRun[];
  runsLoading: boolean;
  runsPage: number;
  setRunsPage: (page: number) => void;
  runsTotalPages: number;
  expandedRuns: Set<string>;
  toggleRunExpand: (runId: string) => void;
  hasRunningJob: boolean;
  refreshProgress: number;
  setSelectedError: (error: { date: string; message: string; log?: string | null } | null) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return '-';
  const start = new Date(started);
  const end = new Date(completed);
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="default" className="bg-green-600 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Completed
        </Badge>
      );
    case 'partial':
      return (
        <Badge variant="default" className="bg-amber-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Partial
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="secondary" className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
          </span>
          Running
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {status}
        </Badge>
      );
  }
}

export function HistoryTab({
  runs,
  runsLoading,
  runsPage,
  setRunsPage,
  runsTotalPages,
  expandedRuns,
  toggleRunExpand,
  hasRunningJob,
  refreshProgress,
  setSelectedError,
}: HistoryTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Backup History</CardTitle>
            <CardDescription>Recent backup runs for this job</CardDescription>
          </div>
          {hasRunningJob && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Auto-refresh</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="opacity-20"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 10}
                  strokeDashoffset={2 * Math.PI * 10 * (1 - refreshProgress / 100)}
                  className="text-primary -rotate-90 origin-center"
                />
              </svg>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {runsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No backup history yet.</p>
        ) : (
          <>
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.run_id} className="border rounded-lg">
                  <button
                    onClick={() => toggleRunExpand(run.run_id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      {getStatusBadge(run.status)}
                      <div>
                        <p className="font-medium">{formatDate(run.started_at)}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDuration(run.started_at, run.completed_at)}
                          {run.total_size > 0 && ` • ${formatFileSize(run.total_size)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-right">
                        <span className="text-muted-foreground">
                          {run.successful_destinations}/{run.total_destinations} destinations
                        </span>
                        {run.failed_destinations > 0 && (
                          <span className="text-destructive ml-2">
                            ({run.failed_destinations} failed)
                          </span>
                        )}
                      </div>
                      <FolderOpen
                        className={`h-4 w-4 transition-transform ${expandedRuns.has(run.run_id) ? 'rotate-0' : '-rotate-90'
                          }`}
                      />
                    </div>
                  </button>

                  {expandedRuns.has(run.run_id) && run.destinations.length > 0 && (
                    <div className="border-t px-4 py-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Destination</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {run.destinations.map((dest) => (
                            <TableRow key={dest.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                                  <span>{dest.destination_name || `Destination ${dest.destination_id}`}</span>
                                  {dest.destination_type && (
                                    <Badge variant="outline" className="text-xs">
                                      {dest.destination_type}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{getStatusBadge(dest.status)}</TableCell>
                              <TableCell>{formatFileSize(dest.file_size)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {dest.execution_log && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedError({
                                          date: dest.started_at,
                                          message: dest.error_message || '',
                                          log: dest.execution_log
                                        });
                                      }}
                                      className="text-muted-foreground text-sm flex items-center gap-1 hover:text-foreground cursor-pointer"
                                      title="View execution log"
                                    >
                                      <File className="h-3 w-3" />
                                      Log
                                    </button>
                                  )}
                                  {dest.error_message && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedError({
                                          date: dest.started_at,
                                          message: dest.error_message!,
                                          log: dest.execution_log
                                        });
                                      }}
                                      className="text-destructive text-sm flex items-center gap-1 hover:underline cursor-pointer text-left"
                                    >
                                      <AlertCircle className="h-3 w-3 shrink-0" />
                                      <span className="truncate max-w-32">
                                        {dest.error_message.length > 30
                                          ? `${dest.error_message.substring(0, 30)}...`
                                          : dest.error_message}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {runsTotalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setRunsPage(Math.max(0, runsPage - 1))}
                      className={runsPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, runsTotalPages) }, (_, i) => {
                    const pageNum = runsPage < 3 ? i : runsPage - 2 + i;
                    if (pageNum >= runsTotalPages) return null;
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setRunsPage(pageNum)}
                          isActive={pageNum === runsPage}
                          className="cursor-pointer"
                        >
                          {pageNum + 1}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setRunsPage(Math.min(runsTotalPages - 1, runsPage + 1))}
                      className={runsPage >= runsTotalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
