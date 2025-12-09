import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  File,
  XCircle,
} from 'lucide-react';

interface ErrorLogDialogProps {
  selectedError: { date: string; message: string; log?: string | null } | null;
  setSelectedError: (error: { date: string; message: string; log?: string | null } | null) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

export function ErrorLogDialog({
  selectedError,
  setSelectedError,
}: ErrorLogDialogProps) {
  return (
    <Dialog open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
      <DialogContent className="sm:max-w-5xl! w-[90vw] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedError?.message ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Backup Details
              </>
            ) : (
              <>
                <File className="h-5 w-5" />
                Execution Log
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedError && formatDate(selectedError.date)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1">
          {selectedError?.message && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Error Message
              </h4>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <pre className="text-sm whitespace-pre-wrap wrap-break-word font-mono text-destructive">
                  {selectedError.message}
                </pre>
              </div>
            </div>
          )}
          {selectedError?.log && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <File className="h-4 w-4" />
                Execution Log
              </h4>
              <div className="bg-muted border rounded-lg p-4">
                <pre className="text-sm whitespace-pre-wrap wrap-break-word font-mono">
                  {selectedError.log}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
