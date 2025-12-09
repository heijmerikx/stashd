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
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { BackupDestination, BrowseItem } from '@/lib/api';

interface FilesTabProps {
  selectedDestinationIds: number[];
  destinations: BackupDestination[];
  destinationFiles: Map<number, BrowseItem[]>;
  currentPath: Map<number, string>;
  filesLoading: Set<number>;
  expandedDestinations: Set<number>;
  loadDestinationFiles: (destId: number, path?: string) => Promise<void>;
  navigateToFolder: (destId: number, folderPath: string) => void;
  navigateUp: (destId: number) => void;
  navigateToRoot: (destId: number) => void;
  getBreadcrumbs: (destId: number) => { name: string; path: string }[];
  toggleDestinationExpand: (destId: number) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

export function FilesTab({
  selectedDestinationIds,
  destinations,
  destinationFiles,
  currentPath,
  filesLoading,
  expandedDestinations,
  loadDestinationFiles,
  navigateToFolder,
  navigateUp,
  navigateToRoot,
  getBreadcrumbs,
  toggleDestinationExpand,
}: FilesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup Files</CardTitle>
        <CardDescription>Browse backup files stored in configured destinations</CardDescription>
      </CardHeader>
      <CardContent>
        {selectedDestinationIds.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No destinations configured for this job. Add destinations in the Settings tab.
          </p>
        ) : (
          <div className="space-y-4">
            {destinations
              .filter(d => selectedDestinationIds.includes(d.id))
              .map((dest) => (
                <div key={dest.id} className="border rounded-lg">
                  <div className="flex items-center justify-between p-4">
                    <button
                      onClick={() => toggleDestinationExpand(dest.id)}
                      className="flex-1 flex items-center gap-3 hover:bg-muted/50 transition-colors rounded -m-2 p-2"
                    >
                      {dest.type === 's3' ? (
                        <Cloud className="h-5 w-5 text-blue-500" />
                      ) : (
                        <HardDrive className="h-5 w-5 text-gray-500" />
                      )}
                      <div className="text-left">
                        <p className="font-medium">{dest.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">
                          {dest.type === 's3'
                            ? `s3://${(dest.config as { bucket: string; prefix?: string }).bucket}/${(dest.config as { bucket: string; prefix?: string }).prefix || ''}`
                            : ((dest.config as { path?: string }).path || 'N/A')}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {expandedDestinations.has(dest.id) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            loadDestinationFiles(dest.id, currentPath.get(dest.id));
                          }}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="Refresh files"
                          disabled={filesLoading.has(dest.id)}
                        >
                          <RefreshCw className={`h-4 w-4 ${filesLoading.has(dest.id) ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => toggleDestinationExpand(dest.id)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                      >
                        <FolderOpen
                          className={`h-4 w-4 transition-transform ${expandedDestinations.has(dest.id) ? 'rotate-0' : '-rotate-90'
                            }`}
                        />
                      </button>
                    </div>
                  </div>

                  {expandedDestinations.has(dest.id) && (
                    <div className="border-t px-4 py-3">
                      {/* Breadcrumb navigation */}
                      {(currentPath.get(dest.id) || '') && (
                        <div className="flex items-center gap-1 mb-3 text-sm flex-wrap">
                          <button
                            onClick={() => navigateToRoot(dest.id)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Home className="h-3.5 w-3.5" />
                          </button>
                          {getBreadcrumbs(dest.id).map((crumb, idx, arr) => (
                            <span key={crumb.path} className="flex items-center gap-1">
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              {idx === arr.length - 1 ? (
                                <span className="font-medium">{crumb.name}</span>
                              ) : (
                                <button
                                  onClick={() => navigateToFolder(dest.id, crumb.path)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {crumb.name}
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {filesLoading.has(dest.id) ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : (destinationFiles.get(dest.id) || []).length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground">
                            {currentPath.get(dest.id) ? 'This folder is empty.' : 'No backup files found in this destination.'}
                          </p>
                          {currentPath.get(dest.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigateUp(dest.id)}
                              className="mt-2"
                            >
                              <ArrowLeft className="mr-2 h-4 w-4" />
                              Go back
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Last Modified</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(destinationFiles.get(dest.id) || []).map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>
                                    {item.type === 'folder' ? (
                                      <button
                                        onClick={() => navigateToFolder(dest.id, item.path)}
                                        className="flex items-center gap-2 hover:text-primary transition-colors group w-full text-left"
                                      >
                                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                                        <span className="font-mono text-sm group-hover:underline">{item.name}</span>
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="font-mono text-sm">{item.name}</span>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {item.type === 'folder' ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : (
                                      formatFileSize(item.size)
                                    )}
                                  </TableCell>
                                  <TableCell>{formatDate(item.lastModified)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
