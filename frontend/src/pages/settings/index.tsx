import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  getQueueStats,
  getQueueJobs,
  getScheduledJobs,
  getQueueWorkers,
  pauseQueue,
  resumeQueue,
  clearCompletedJobs,
  clearFailedJobs,
  retryFailedJobs,
  removeQueueJob,
  drainQueue,
  type QueueStats,
  type QueueJob,
  type ScheduledJobsResponse,
  type QueueWorker,
} from '@/lib/api';
import {
  Loader2,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  RotateCcw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Timer,
  Activity,
  Server,
} from 'lucide-react';

export function SettingsPage() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobsResponse | null>(null);
  const [workers, setWorkers] = useState<QueueWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Queue - Stashd';
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  async function loadData() {
    try {
      const [statsData, jobsData, scheduledData, workersData] = await Promise.all([
        getQueueStats(),
        getQueueJobs(statusFilter),
        getScheduledJobs(),
        getQueueWorkers(),
      ]);
      setStats(statsData);
      setJobs(jobsData);
      setScheduledJobs(scheduledData);
      setWorkers(workersData);
    } catch (error) {
      console.error('Failed to load queue data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    try {
      const jobsData = await getQueueJobs(statusFilter);
      setJobs(jobsData);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handlePauseResume() {
    setActionLoading('pause');
    try {
      if (stats?.paused) {
        await resumeQueue();
      } else {
        await pauseQueue();
      }
      await loadData();
    } catch (error) {
      console.error('Failed to pause/resume queue:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClearCompleted() {
    setActionLoading('clearCompleted');
    try {
      await clearCompletedJobs();
      await loadData();
    } catch (error) {
      console.error('Failed to clear completed jobs:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClearFailed() {
    setActionLoading('clearFailed');
    try {
      await clearFailedJobs();
      await loadData();
    } catch (error) {
      console.error('Failed to clear failed jobs:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetryFailed() {
    setActionLoading('retry');
    try {
      await retryFailedJobs();
      await loadData();
    } catch (error) {
      console.error('Failed to retry failed jobs:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDrain() {
    setActionLoading('drain');
    try {
      await drainQueue();
      await loadData();
    } catch (error) {
      console.error('Failed to drain queue:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveJob(jobId: string) {
    try {
      await removeQueueJob(jobId);
      await loadJobs();
    } catch (error) {
      console.error('Failed to remove job:', error);
    }
  }

  function formatDate(timestamp: number | undefined): string {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'active':
        return (
          <Badge variant="default" className="bg-blue-600 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Active
          </Badge>
        );
      case 'waiting':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Waiting
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case 'delayed':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Delayed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Queue</h1>
          <p className="text-muted-foreground">
            Manage the backup job queue
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Queue Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Workers</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Server className="h-6 w-6 text-muted-foreground" />
              {workers.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Waiting</CardDescription>
            <CardTitle className="text-3xl">{stats?.waiting ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats?.active ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats?.completed ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats?.failed ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-xl">
              {stats?.paused ? (
                <Badge variant="secondary" className="text-lg">Paused</Badge>
              ) : (
                <Badge variant="default" className="bg-green-600 text-lg">Running</Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Workers */}
      {workers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Connected Workers
            </CardTitle>
            <CardDescription>
              Worker instances processing backup jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Idle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.id}>
                    <TableCell className="font-mono text-sm">{worker.id}</TableCell>
                    <TableCell>{worker.name}</TableCell>
                    <TableCell className="font-mono text-sm">{worker.addr}</TableCell>
                    <TableCell>{worker.age}s</TableCell>
                    <TableCell>{worker.idle}s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Queue Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Actions</CardTitle>
          <CardDescription>Manage the backup job queue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={stats?.paused ? 'default' : 'secondary'}
              onClick={handlePauseResume}
              disabled={actionLoading === 'pause'}
            >
              {actionLoading === 'pause' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : stats?.paused ? (
                <Play className="mr-2 h-4 w-4" />
              ) : (
                <Pause className="mr-2 h-4 w-4" />
              )}
              {stats?.paused ? 'Resume Queue' : 'Pause Queue'}
            </Button>

            <Button
              variant="outline"
              onClick={handleRetryFailed}
              disabled={actionLoading === 'retry' || (stats?.failed ?? 0) === 0}
            >
              {actionLoading === 'retry' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Retry Failed ({stats?.failed ?? 0})
            </Button>

            <Button
              variant="outline"
              onClick={handleClearCompleted}
              disabled={actionLoading === 'clearCompleted' || (stats?.completed ?? 0) === 0}
            >
              {actionLoading === 'clearCompleted' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Clear Completed
            </Button>

            <Button
              variant="outline"
              onClick={handleClearFailed}
              disabled={actionLoading === 'clearFailed' || (stats?.failed ?? 0) === 0}
            >
              {actionLoading === 'clearFailed' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Clear Failed
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={actionLoading === 'drain' || (stats?.waiting ?? 0) === 0}
                >
                  {actionLoading === 'drain' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertCircle className="mr-2 h-4 w-4" />
                  )}
                  Drain Queue
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Drain Queue?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all waiting jobs from the queue. This action cannot be undone.
                    Active jobs will continue to completion.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDrain}>Drain Queue</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Jobs</CardTitle>
          <CardDescription>
            Repeatable backup jobs configured with cron schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheduledJobs?.repeatable.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No scheduled jobs configured.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Key</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Next Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledJobs?.repeatable.map((job) => (
                  <TableRow key={job.key}>
                    <TableCell className="font-mono text-sm">{job.key}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {job.pattern}
                      </code>
                    </TableCell>
                    <TableCell>{formatDate(job.next)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Queue Jobs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Queue Jobs</CardTitle>
              <CardDescription>Current jobs in the queue</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No jobs found with the selected filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const isSystemJob = job.queue === 'system';
                  const jobName = isSystemJob
                    ? job.data?.type || job.name
                    : job.data?.name || 'Unknown';

                  return (
                    <TableRow key={job.id || job.timestamp}>
                      <TableCell className="font-mono text-sm">
                        {job.id ? `${job.id.substring(0, 12)}...` : '-'}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {jobName}
                            {isSystemJob && (
                              <Badge variant="secondary" className="text-xs bg-foreground text-background">System</Badge>
                            )}
                          </div>
                          {!isSystemJob && job.data?.jobId && (
                            <div className="text-xs text-muted-foreground">
                              {job.data?.type} (ID: {job.data?.jobId})
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>{job.attemptsMade}</TableCell>
                      <TableCell>{formatDate(job.timestamp)}</TableCell>
                      <TableCell>
                        {job.failedReason && (
                          <span className="text-destructive text-sm" title={job.failedReason}>
                            {job.failedReason.substring(0, 30)}...
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {job.id && job.status !== 'active' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveJob(job.id!)}
                            title="Remove job"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
