import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Database,
  Loader2,
  Pause,
  Play,
  Zap,
} from 'lucide-react';
import type { BackupJob } from '@/lib/api';

interface JobHeaderProps {
  job: BackupJob;
  togglingJob: boolean;
  runningJob: boolean;
  handleToggle: () => Promise<void>;
  handleRunNow: () => Promise<void>;
}

export function JobHeader({
  job,
  togglingJob,
  runningJob,
  handleToggle,
  handleRunNow,
}: JobHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => navigate('/backup-jobs')}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{job.name}</h1>
          {job.enabled ? (
            <Badge variant="default" className="bg-green-600">Active</Badge>
          ) : (
            <Badge variant="secondary">Paused</Badge>
          )}
        </div>
        <p className="text-muted-foreground flex items-center gap-2">
          <Database className="h-4 w-4" />
          {job.type} backup job
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={handleToggle}
          disabled={togglingJob}
          variant={job.enabled ? 'outline' : 'default'}
        >
          {togglingJob ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : job.enabled ? (
            <Pause className="mr-2 h-4 w-4" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {job.enabled ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="outline" onClick={handleRunNow} disabled={runningJob}>
          {runningJob ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Zap className="mr-2 h-4 w-4" />
          )}
          Run Now
        </Button>
      </div>
    </div>
  );
}
