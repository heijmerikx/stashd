import { useState, useEffect } from 'react';
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Play,
  User,
  Database,
  HardDrive,
  Bell,
  ClipboardList,
  Eye,
} from 'lucide-react';
import { getAllAuditLog, type AuditLogEntry } from '@/lib/api';

export function AuditLogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const limit = 25;

  useEffect(() => {
    document.title = 'Audit Log - Stashd';
  }, []);

  useEffect(() => {
    loadAuditLog();
  }, [page]);

  async function loadAuditLog() {
    setLoading(true);
    try {
      const data = await getAllAuditLog(page, limit);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'create':
        return <Plus className="h-4 w-4" />;
      case 'update':
        return <Pencil className="h-4 w-4" />;
      case 'delete':
        return <Trash2 className="h-4 w-4" />;
      case 'run':
        return <Play className="h-4 w-4" />;
      default:
        return null;
    }
  }

  function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (action) {
      case 'create':
        return 'default';
      case 'update':
        return 'secondary';
      case 'delete':
        return 'destructive';
      case 'run':
        return 'outline';
      default:
        return 'secondary';
    }
  }

  function getEntityIcon(entityType: string) {
    switch (entityType) {
      case 'backup_job':
        return <Database className="h-4 w-4" />;
      case 'backup_destination':
        return <HardDrive className="h-4 w-4" />;
      case 'notification_channel':
        return <Bell className="h-4 w-4" />;
      default:
        return null;
    }
  }

  function formatEntityType(entityType: string): string {
    switch (entityType) {
      case 'backup_job':
        return 'Backup Job';
      case 'backup_destination':
        return 'Destination';
      case 'notification_channel':
        return 'Notification';
      default:
        return entityType;
    }
  }

  function getEntityLink(entityType: string, entityId: number): string | null {
    switch (entityType) {
      case 'backup_job':
        return `/backup-jobs/${entityId}`;
      case 'backup_destination':
        return `/destinations`;
      case 'notification_channel':
        return `/notifications`;
      default:
        return null;
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function formatChanges(changes: object | null): string {
    if (!changes) return '-';

    // Extract meaningful info from changes
    if ('toggled' in changes) {
      return `${(changes as { toggled: string }).toggled}`;
    }
    if ('manual' in changes) {
      return 'Manual run';
    }
    if ('duplicated_from' in changes) {
      const from = (changes as { duplicated_from: { name: string } }).duplicated_from;
      return `Duplicated from "${from.name}"`;
    }
    if ('deleted' in changes) {
      return 'Deleted';
    }
    if ('before' in changes && 'after' in changes) {
      const changesObj = changes as { before: Record<string, unknown>; after: Record<string, unknown>; config?: object };
      const changedFields: string[] = [];

      // Compare before and after to find changed fields
      const before = changesObj.before;
      const after = changesObj.after;
      for (const key of Object.keys(after)) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changedFields.push(key.replace(/_/g, ' '));
        }
      }

      // Check for config changes
      if (changesObj.config) {
        changedFields.push('config');
      }

      if (changedFields.length === 0) {
        return 'No changes';
      }
      if (changedFields.length <= 2) {
        return `Updated ${changedFields.join(', ')}`;
      }
      return `Updated ${changedFields.length} fields`;
    }

    return 'Changes made';
  }

  function hasDetailedChanges(changes: object | null): boolean {
    if (!changes) return false;
    return 'before' in changes && 'after' in changes;
  }

  const totalPages = Math.ceil(total / limit);

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          Audit Log
        </h1>
        <p className="text-muted-foreground">
          View all system activity and changes
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
          <CardDescription>
            {total} total entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No audit log entries yet.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const link = getEntityLink(entry.entity_type, entry.entity_id);
                    return (
                      <TableRow
                        key={entry.id}
                        className={link ? 'cursor-pointer hover:bg-muted/50' : ''}
                        onClick={() => link && navigate(link)}
                      >
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(entry.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {entry.user_email || 'System'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(entry.action)}>
                            <span className="flex items-center gap-1">
                              {getActionIcon(entry.action)}
                              {entry.action}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEntityIcon(entry.entity_type)}
                            <span className="text-sm">
                              {formatEntityType(entry.entity_type)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.entity_name || `ID: ${entry.entity_id}`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {hasDetailedChanges(entry.changes) ? (
                            <button
                              className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEntry(entry);
                              }}
                            >
                              <span>{formatChanges(entry.changes)}</span>
                              <Eye className="h-3 w-3 opacity-50" />
                            </button>
                          ) : (
                            <span>{formatChanges(entry.changes)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage(Math.max(0, page - 1))}
                          className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i;
                        } else if (page < 3) {
                          pageNum = i;
                        } else if (page > totalPages - 4) {
                          pageNum = totalPages - 5 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setPage(pageNum)}
                              isActive={page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum + 1}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                          className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Changes Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="sm:max-w-[90vw] lg:max-w-[70vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Details</DialogTitle>
            <DialogDescription>
              {selectedEntry && (
                <>
                  {formatEntityType(selectedEntry.entity_type)}: {selectedEntry.entity_name} - {formatDate(selectedEntry.created_at)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedEntry?.changes && 'before' in selectedEntry.changes && 'after' in selectedEntry.changes && (
            <div className="space-y-4">
              {renderChangesDetail(selectedEntry.changes as { before: Record<string, unknown>; after: Record<string, unknown>; config?: { before: Record<string, unknown>; after: Record<string, unknown> } })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderChangesDetail(changes: { before: Record<string, unknown>; after: Record<string, unknown>; config?: { before: Record<string, unknown>; after: Record<string, unknown> } }) {
    const sections: React.ReactNode[] = [];

    // Regular field changes
    const fieldChanges: { field: string; before: unknown; after: unknown }[] = [];
    for (const key of Object.keys(changes.after)) {
      if (key === 'config') continue;
      if (JSON.stringify(changes.before[key]) !== JSON.stringify(changes.after[key])) {
        fieldChanges.push({
          field: key.replace(/_/g, ' '),
          before: changes.before[key],
          after: changes.after[key]
        });
      }
    }

    if (fieldChanges.length > 0) {
      sections.push(
        <div key="fields" className="space-y-2">
          <h4 className="font-medium text-sm">Field Changes</h4>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Field</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fieldChanges.map(({ field, before, after }) => (
                  <TableRow key={field}>
                    <TableCell className="font-medium capitalize">{field}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {formatValue(before)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatValue(after)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }

    // Config changes
    if (changes.config) {
      const configChanges: { field: string; before: unknown; after: unknown }[] = [];
      const allConfigKeys = new Set([
        ...Object.keys(changes.config.before || {}),
        ...Object.keys(changes.config.after || {})
      ]);

      for (const key of allConfigKeys) {
        const beforeVal = changes.config.before?.[key];
        const afterVal = changes.config.after?.[key];
        if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
          configChanges.push({
            field: key.replace(/_/g, ' '),
            before: beforeVal,
            after: afterVal
          });
        }
      }

      if (configChanges.length > 0) {
        sections.push(
          <div key="config" className="space-y-2">
            <h4 className="font-medium text-sm">Configuration Changes</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Setting</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configChanges.map(({ field, before, after }) => (
                    <TableRow key={field}>
                      <TableCell className="font-medium capitalize">{field}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs break-all">
                        {formatValue(before)}
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {formatValue(after)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      }
    }

    return sections.length > 0 ? sections : <p className="text-muted-foreground">No detailed changes available.</p>;
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
