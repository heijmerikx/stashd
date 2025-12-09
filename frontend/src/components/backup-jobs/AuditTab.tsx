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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Eye,
  Loader2,
  User,
} from 'lucide-react';
import type { AuditLogEntry } from '@/lib/api';

interface AuditTabProps {
  auditLog: AuditLogEntry[];
  auditLoading: boolean;
  auditPage: number;
  setAuditPage: (page: number) => void;
  auditTotalPages: number;
  selectedAuditEntry: AuditLogEntry | null;
  setSelectedAuditEntry: (entry: AuditLogEntry | null) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function getActionLabel(action: string) {
  switch (action) {
    case 'create':
      return <Badge variant="default" className="bg-green-600">Created</Badge>;
    case 'update':
      return <Badge variant="secondary">Updated</Badge>;
    case 'delete':
      return <Badge variant="destructive">Deleted</Badge>;
    case 'run':
      return <Badge variant="outline">Run Triggered</Badge>;
    default:
      return <Badge variant="secondary">{action}</Badge>;
  }
}

function formatAuditChanges(changes: object | null): string {
  if (!changes) return '-';

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

    const before = changesObj.before;
    const after = changesObj.after;
    for (const key of Object.keys(after)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changedFields.push(key.replace(/_/g, ' '));
      }
    }

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

function hasDetailedAuditChanges(changes: object | null): boolean {
  if (!changes) return false;
  return 'before' in changes && 'after' in changes;
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderAuditChangesDetail(changes: { before: Record<string, unknown>; after: Record<string, unknown>; config?: { before: Record<string, unknown>; after: Record<string, unknown> } }) {
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
                    {formatAuditValue(before)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatAuditValue(after)}
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
                      {formatAuditValue(before)}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {formatAuditValue(after)}
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

export function AuditTab({
  auditLog,
  auditLoading,
  auditPage,
  setAuditPage,
  auditTotalPages,
  selectedAuditEntry,
  setSelectedAuditEntry,
}: AuditTabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
          <CardDescription>Changes made to this backup job</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : auditLog.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit log entries yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{getActionLabel(entry.action)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <User className="h-3 w-3" />
                          {entry.user_email || 'System'}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(entry.created_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {hasDetailedAuditChanges(entry.changes) ? (
                          <button
                            className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer text-left"
                            onClick={() => setSelectedAuditEntry(entry)}
                          >
                            <span>{formatAuditChanges(entry.changes)}</span>
                            <Eye className="h-3 w-3 opacity-50" />
                          </button>
                        ) : (
                          <span>{formatAuditChanges(entry.changes)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {auditTotalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
                        className={auditPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, auditTotalPages) }, (_, i) => {
                      const pageNum = auditPage < 3 ? i : auditPage - 2 + i;
                      if (pageNum >= auditTotalPages) return null;
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setAuditPage(pageNum)}
                            isActive={pageNum === auditPage}
                            className="cursor-pointer"
                          >
                            {pageNum + 1}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setAuditPage(Math.min(auditTotalPages - 1, auditPage + 1))}
                        className={auditPage >= auditTotalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Audit Changes Detail Dialog */}
      <Dialog open={!!selectedAuditEntry} onOpenChange={() => setSelectedAuditEntry(null)}>
        <DialogContent className="sm:max-w-[90vw] lg:max-w-[70vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Details</DialogTitle>
            <DialogDescription>
              {selectedAuditEntry && formatDate(selectedAuditEntry.created_at)}
            </DialogDescription>
          </DialogHeader>
          {selectedAuditEntry?.changes && 'before' in selectedAuditEntry.changes && 'after' in selectedAuditEntry.changes && (
            <div className="space-y-4">
              {renderAuditChangesDetail(selectedAuditEntry.changes as { before: Record<string, unknown>; after: Record<string, unknown>; config?: { before: Record<string, unknown>; after: Record<string, unknown> } })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
