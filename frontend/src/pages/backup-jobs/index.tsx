import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import cronstrue from 'cronstrue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getBackupJobs,
  getBackupJobStats,
  toggleBackupJob,
  duplicateBackupJob,
  runBackupJob,
  type BackupJob,
  type JobStats,
} from '@/lib/api';
import { Plus, Database, Loader2, Clock, Pause, Play, Pencil, Copy, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RecentRunsIndicator } from '@/components/RecentRunsIndicator';
import { CreateJobDialog } from './components/CreateJobDialog';

export function BackupJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [stats, setStats] = useState<Record<number, JobStats>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [togglingJob, setTogglingJob] = useState<number | null>(null);
  const [runningJob, setRunningJob] = useState<number | null>(null);
  const [duplicatingJob, setDuplicatingJob] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Backup Jobs - Stashd';
  }, []);

  const loadStats = useCallback(async (jobIds: number[], merge = false) => {
    if (jobIds.length === 0) {
      setStatsLoading(false);
      return;
    }
    try {
      const statsData = await getBackupJobStats(jobIds);
      if (merge) {
        setStats(prev => ({ ...prev, ...statsData }));
      } else {
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const jobsData = await getBackupJobs();
      setJobs(jobsData);
      setLoading(false);
      // Load stats in background (non-blocking)
      if (jobsData.length > 0) {
        loadStats(jobsData.map(j => j.id));
      } else {
        setStatsLoading(false);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
      setLoading(false);
      setStatsLoading(false);
    }
  }, [loadStats]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function handleToggle(id: number) {
    setTogglingJob(id);
    try {
      const updatedJob = await toggleBackupJob(id);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: updatedJob.enabled } : j));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle job');
    } finally {
      setTogglingJob(null);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicatingJob(id);
    try {
      await duplicateBackupJob(id);
      loadJobs();
    } catch (error) {
      console.error('Failed to duplicate job:', error);
    } finally {
      setDuplicatingJob(null);
    }
  }

  async function handleRunOnce(id: number) {
    setRunningJob(id);
    try {
      await runBackupJob(id);
      // Poll for stats updates to show running/completed status
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await loadStats([id], true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to run job');
    } finally {
      setRunningJob(null);
    }
  }

  function handleJobCreated() {
    loadJobs();
  }

  function formatCronExpression(cron: string): string {
    try {
      return cronstrue.toString(cron, { verbose: false });
    } catch {
      return cron;
    }
  }

  function formatLastRun(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  const SkeletonRow = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell>
        <div className="space-y-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </TableCell>
    </TableRow>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Backup Jobs</h1>
            <p className="text-muted-foreground">
              Configure and manage your automated backups
            </p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Job
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Schedule / Last Run</TableHead>
                  <TableHead>Recent Runs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backup Jobs</h1>
          <p className="text-muted-foreground">
            Configure and manage your automated backups
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Job
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>
            {jobs.length} backup job{jobs.length !== 1 && 's'} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No backup jobs configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Schedule / Last Run</TableHead>
                  <TableHead>Recent Runs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/backup-jobs/${job.id}`)}
                        className="font-medium hover:underline text-left cursor-pointer"
                      >
                        {job.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {job.type}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {job.schedule ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3" />
                            <span>{formatCronExpression(job.schedule)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Manual</span>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {statsLoading ? (
                            <Skeleton className="h-3 w-24" />
                          ) : (
                            <>Last: {formatLastRun(stats[job.id]?.last_run ?? null)}</>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {statsLoading ? (
                        <Skeleton className="h-4 w-20" />
                      ) : (
                        <RecentRunsIndicator recentRuns={stats[job.id]?.recent_runs} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRunOnce(job.id)}
                            disabled={runningJob === job.id}
                          >
                            {runningJob === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run now</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(job.id)}
                            disabled={togglingJob === job.id}
                          >
                            {togglingJob === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : job.enabled ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{job.enabled ? 'Pause job' : 'Resume job'}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(job.id)}
                            disabled={duplicatingJob === job.id}
                          >
                            {duplicatingJob === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Duplicate</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/backup-jobs/${job.id}`)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateJobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onJobCreated={handleJobCreated}
      />
    </div>
  );
}
