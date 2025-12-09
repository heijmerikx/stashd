import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import type { BackupHistoryEntry } from '@/lib/api';
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { statusColors } from '@/lib/status-colors';
import { useSettingsStore } from '@/stores/settings';

interface RecentBackupsCardProps {
  backups: BackupHistoryEntry[];
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function RecentBackupsCard({ backups }: RecentBackupsCardProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const { recentBackupsLimit, setRecentBackupsLimit } = useSettingsStore();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className={statusColors.completed}>
            <CheckCircle className="mr-1 h-2.5 w-2.5" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-2.5 w-2.5" />
            Failed
          </Badge>
        );
      case 'running':
        return (
          <Badge variant="secondary" className="gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className={`absolute inline-flex h-full w-full animate-ping ${statusColors.runningPing} opacity-75`} />
              <span className={`relative inline-flex h-1.5 w-1.5 ${statusColors.running}`} />
            </span>
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-2.5 w-2.5" />
            {status}
          </Badge>
        );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Backups
          </CardTitle>
          <Select
            value={String(recentBackupsLimit)}
            onValueChange={(value) => {
              setRecentBackupsLimit(Number(value));
              setPage(0);
            }}
          >
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardDescription>
          Latest 50 backup activities
        </CardDescription>
      </CardHeader>
      <CardContent>
        {backups.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No backups yet
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Job</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups
                  .slice(page * recentBackupsLimit, (page + 1) * recentBackupsLimit)
                  .map((backup) => (
                    <TableRow
                      key={backup.id}
                      className={backup.backup_job_id ? 'cursor-pointer hover:bg-muted/50' : ''}
                      onClick={() => backup.backup_job_id && navigate(`/backup-jobs/${backup.backup_job_id}`)}
                    >
                      <TableCell className="font-medium py-1.5 text-xs">
                        {backup.job_name || 'Unknown'}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">
                        {backup.job_type || '-'}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs">{getStatusBadge(backup.status)}</TableCell>
                      <TableCell className="text-muted-foreground py-1.5 text-xs">
                        {formatDate(backup.started_at)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {backups.length > recentBackupsLimit && (
              <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                <span>
                  {page * recentBackupsLimit + 1}-{Math.min((page + 1) * recentBackupsLimit, backups.length)} of {backups.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(Math.ceil(backups.length / recentBackupsLimit) - 1, p + 1))}
                    disabled={(page + 1) * recentBackupsLimit >= backups.length}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
