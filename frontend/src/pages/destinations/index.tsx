import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  getBackupDestinations,
  createBackupDestination,
  updateBackupDestination,
  deleteBackupDestination,
  testBackupDestination,
  duplicateBackupDestination,
  getCredentialProviders,
  type BackupDestination,
  type S3DestinationConfig,
  type LocalDestinationConfig,
  type CredentialProvider,
} from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, Cloud, Loader2, CheckCircle, AlertCircle, Copy, Key, XCircle, HardDrive, Info, Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settings';

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDestinationLocation(destination: BackupDestination): string {
  if (destination.type === 'local') {
    const config = destination.config as LocalDestinationConfig;
    return config.path;
  }

  const s3Config = destination.config as S3DestinationConfig;
  const provider = destination.credential_provider;
  if (provider) {
    const providerConfig = provider.config as { endpoint?: string; region?: string };
    if (providerConfig.endpoint) {
      try {
        const url = new URL(providerConfig.endpoint);
        return `${url.hostname}/${s3Config.bucket}`;
      } catch {
        return `${providerConfig.endpoint}/${s3Config.bucket}`;
      }
    }
    return `s3://${providerConfig.region}/${s3Config.bucket}`;
  }
  return `s3://${s3Config.bucket}`;
}

export function DestinationsPage() {
  const { destinationsPageSize, setDestinationsPageSize } = useSettingsStore();
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [credentialProviders, setCredentialProviders] = useState<CredentialProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState<BackupDestination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'provider' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter and sort destinations
  const filteredDestinations = useMemo(() => {
    let result = [...destinations];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(dest =>
        dest.name.toLowerCase().includes(query) ||
        dest.type.toLowerCase().includes(query) ||
        getDestinationLocation(dest).toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortField) {
      result.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'provider': {
            // Sort by credential provider name (local destinations have no provider)
            const aProvider = a.type === 'local' ? 'Local' : (a.credential_provider?.name || 'unknown');
            const bProvider = b.type === 'local' ? 'Local' : (b.credential_provider?.name || 'unknown');
            comparison = aProvider.localeCompare(bProvider);
            break;
          }
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }, [destinations, searchQuery, sortField, sortDirection]);

  function handleSort(field: 'name' | 'provider') {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function getSortIcon(field: 'name' | 'provider') {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  const totalPages = Math.ceil(filteredDestinations.length / destinationsPageSize);
  const paginatedDestinations = filteredDestinations.slice(
    currentPage * destinationsPageSize,
    (currentPage + 1) * destinationsPageSize
  );

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery]);

  // Form state
  const [name, setName] = useState('');
  const [destinationType, setDestinationType] = useState<'local' | 's3'>('s3');
  const [enabled, setEnabled] = useState(true);

  // Local config
  const [localPath, setLocalPath] = useState('/data/backups');

  // S3 config
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Prefix, setS3Prefix] = useState('');
  const [credentialProviderId, setCredentialProviderId] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Backup Destinations - Stashd';
  }, []);

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const [destData, providerData] = await Promise.all([
        getBackupDestinations(),
        getCredentialProviders(),
      ]);
      setDestinations(destData);
      setCredentialProviders(providerData);
    } catch (error) {
      console.error('Failed to load destinations:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setDestinationType('s3');
    setEnabled(true);
    setLocalPath('/data/backups');
    setS3Bucket('');
    setS3Prefix('');
    setCredentialProviderId(null);
    setEditingDestination(null);
    setError(null);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(destination: BackupDestination) {
    setEditingDestination(destination);
    setName(destination.name);
    setDestinationType(destination.type);
    setEnabled(destination.enabled);
    setCredentialProviderId(destination.credential_provider_id || null);

    if (destination.type === 'local') {
      const config = destination.config as LocalDestinationConfig;
      setLocalPath(config.path || '/data/backups');
    } else {
      const config = destination.config as S3DestinationConfig;
      setS3Bucket(config.bucket || '');
      setS3Prefix(config.prefix || '');
    }

    setDialogOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    try {
      if (destinationType === 's3') {
        if (!credentialProviderId) {
          setError('S3 destinations require a credential provider');
          setSaving(false);
          return;
        }

        const config: S3DestinationConfig = {
          bucket: s3Bucket,
          ...(s3Prefix && { prefix: s3Prefix }),
        };

        const payload = {
          name,
          type: 's3' as const,
          config,
          enabled,
          credential_provider_id: credentialProviderId,
        };

        if (editingDestination) {
          await updateBackupDestination(editingDestination.id, payload);
        } else {
          await createBackupDestination(payload);
        }
      } else {
        // Local destination
        if (!localPath) {
          setError('Path is required');
          setSaving(false);
          return;
        }

        const config: LocalDestinationConfig = {
          path: localPath,
        };

        const payload = {
          name,
          type: 'local' as const,
          config,
          enabled,
          credential_provider_id: null,
        };

        if (editingDestination) {
          await updateBackupDestination(editingDestination.id, payload);
        } else {
          await createBackupDestination(payload);
        }
      }

      setDialogOpen(false);
      resetForm();
      loadDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save destination');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this destination?')) return;

    try {
      await deleteBackupDestination(id);
      loadDestinations();
    } catch (error) {
      alert(`Failed to delete destination: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      await testBackupDestination(id);
      setTestResult({ id, success: true });
    } catch {
      setTestResult({ id, success: false });
    } finally {
      setTestingId(null);
      // Clear the result after 3 seconds
      setTimeout(() => {
        setTestResult(prev => prev?.id === id ? null : prev);
      }, 3000);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicatingId(id);
    try {
      await duplicateBackupDestination(id);
      loadDestinations();
    } catch (error) {
      alert(`Failed to duplicate destination: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDuplicatingId(null);
    }
  }

  // Skeleton table row component
  const SkeletonRow = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-12" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
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
            <h1 className="text-2xl font-bold">Backup Destinations</h1>
            <p className="text-muted-foreground">
              Configure where your backups are stored
            </p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Destination
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Destinations</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Backups</TableHead>
                  <TableHead>Status</TableHead>
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
          <h1 className="text-2xl font-bold">Backup Destinations</h1>
          <p className="text-muted-foreground">
            Configure where your backups are stored
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Destination
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Destinations</CardTitle>
              <CardDescription>
                {filteredDestinations.length === destinations.length
                  ? `${destinations.length} destination${destinations.length !== 1 ? 's' : ''} configured`
                  : `${filteredDestinations.length} of ${destinations.length} destination${destinations.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {(searchQuery || sortField) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSortField(null);
                    setSortDirection('asc');
                  }}
                  className="h-9 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search destinations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {destinations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No backup destinations configured yet.
            </p>
          ) : filteredDestinations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No destinations match your search.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center hover:text-foreground cursor-pointer"
                      >
                        Name
                        {getSortIcon('name')}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        onClick={() => handleSort('provider')}
                        className="flex items-center hover:text-foreground cursor-pointer"
                      >
                        Provider
                        {getSortIcon('provider')}
                      </button>
                    </TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Backups</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDestinations.map((destination) => (
                    <TableRow key={destination.id}>
                      <TableCell className="font-medium">
                        {destination.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {destination.type === 'local' ? (
                            <HardDrive className="h-4 w-4" />
                          ) : (
                            <Cloud className="h-4 w-4" />
                          )}
                          {destination.type === 'local' ? 'Local' : (destination.credential_provider?.name || 'S3')}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {getDestinationLocation(destination)}
                      </TableCell>
                      <TableCell>
                        {destination.stats ? (
                          <span className="text-sm">
                            {destination.stats.successful_backups} ({formatBytes(destination.stats.total_size)})
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={destination.enabled ? 'default' : 'secondary'}>
                          {destination.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTest(destination.id)}
                          disabled={testingId === destination.id}
                          title="Test destination"
                        >
                          {testingId === destination.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : testResult?.id === destination.id ? (
                            testResult.success ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(destination.id)}
                          disabled={duplicatingId === destination.id}
                          title="Duplicate destination"
                        >
                          {duplicatingId === destination.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(destination)}
                          title="Edit destination"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(destination.id)}
                          title="Delete destination"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Rows per page</span>
                  <Select
                    value={String(destinationsPageSize)}
                    onValueChange={(value) => {
                      setDestinationsPageSize(Number(value));
                      setCurrentPage(0);
                    }}
                  >
                    <SelectTrigger className="w-16 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {totalPages > 1 && (
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                          className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = currentPage < 3 ? i : currentPage - 2 + i;
                        if (pageNum >= totalPages) return null;
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNum)}
                              isActive={pageNum === currentPage}
                              className="cursor-pointer"
                            >
                              {pageNum + 1}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                          className={currentPage >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingDestination ? 'Edit Destination' : 'Add Backup Destination'}
            </DialogTitle>
            <DialogDescription>
              Configure a storage destination for your backups.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Primary Storage"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={destinationType}
                onValueChange={(v) => setDestinationType(v as 'local' | 's3')}
                disabled={!!editingDestination}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Local Storage
                    </div>
                  </SelectItem>
                  <SelectItem value="s3">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      S3 Compatible
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {destinationType === 'local' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="local_path">Path</Label>
                  <Input
                    id="local_path"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="/data/backups"
                  />
                </div>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Use paths mounted in the container. The default <code className="text-xs bg-muted px-1 rounded">/data/backups</code> is
                    available in Docker Compose. Configure additional paths via volume mounts.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="s3_bucket">Bucket</Label>
                  <Input
                    id="s3_bucket"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="my-backups"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="s3_prefix">Path Prefix (optional)</Label>
                  <Input
                    id="s3_prefix"
                    value={s3Prefix}
                    onChange={(e) => setS3Prefix(e.target.value)}
                    placeholder="backups/"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Credential Provider
                  </Label>
                  {credentialProviders.length === 0 ? (
                    <div className="text-sm text-muted-foreground border rounded-lg p-3">
                      No credential providers configured.{' '}
                      <Link to="/credential-providers" className="text-primary underline">
                        Create one first
                      </Link>
                    </div>
                  ) : (
                    <Select
                      value={credentialProviderId?.toString() || ''}
                      onValueChange={(v) => setCredentialProviderId(v ? parseInt(v) : null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select credential provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {credentialProviders.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id.toString()}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    S3 credentials (region, access key, endpoint) are managed via credential providers.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingDestination ? 'Save Changes' : 'Create Destination'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
