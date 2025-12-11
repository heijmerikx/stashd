import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  getCredentialProviders,
  createCredentialProvider,
  updateCredentialProvider,
  deleteCredentialProvider,
  type CredentialProvider,
  type S3CredentialConfig,
  type S3ProviderPreset,
} from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, Loader2, AlertCircle, Key } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Provider preset configurations
const PROVIDER_PRESETS: Record<S3ProviderPreset, {
  name: string;
  description: string;
  endpointPlaceholder?: string;
  endpointHelp?: string;
  showRegion: boolean;
  regionRequired: boolean;
  regionPlaceholder?: string;
  regionHelp?: string;
  defaultRegion?: string;
}> = {
  aws: {
    name: 'Amazon S3',
    description: 'Amazon Web Services S3',
    showRegion: true,
    regionRequired: true,
    regionPlaceholder: 'us-east-1',
    regionHelp: 'AWS region where your bucket is located',
  },
  hetzner: {
    name: 'Hetzner Object Storage',
    description: 'Hetzner Cloud Object Storage',
    endpointPlaceholder: 'https://fsn1.your-objectstorage.com',
    endpointHelp: 'Your Hetzner Object Storage endpoint (found in Cloud Console)',
    showRegion: false,
    regionRequired: false,
  },
  cloudflare: {
    name: 'Cloudflare R2',
    description: 'Cloudflare R2 Storage',
    endpointPlaceholder: 'https://<account-id>.r2.cloudflarestorage.com',
    endpointHelp: 'Your R2 S3-compatible endpoint (found in Cloudflare dashboard)',
    showRegion: false,
    regionRequired: false,
  },
  railway: {
    name: 'Railway',
    description: 'Railway Object Storage',
    endpointPlaceholder: 'https://<bucket>.railway.app',
    endpointHelp: 'Your Railway storage endpoint (found in service settings)',
    showRegion: true,
    regionRequired: true,
    defaultRegion: 'auto',
  },
  custom: {
    name: 'Custom / Other',
    description: 'Other S3-compatible storage',
    endpointPlaceholder: 'https://s3.example.com',
    endpointHelp: 'S3-compatible endpoint URL',
    showRegion: true,
    regionRequired: false,
    regionPlaceholder: 'us-east-1',
    regionHelp: 'Region (if required by provider)',
  },
};

function getProviderIcon(preset: S3ProviderPreset): string {
  switch (preset) {
    case 'aws': return 'AWS';
    case 'hetzner': return 'Hetzner';
    case 'cloudflare': return 'R2';
    case 'railway': return 'Railway';
    default: return 'S3';
  }
}

export function CredentialProvidersPage() {
  const [providers, setProviders] = useState<CredentialProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<CredentialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [providerPreset, setProviderPreset] = useState<S3ProviderPreset>('hetzner');

  // S3 config
  const [s3Region, setS3Region] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');

  useEffect(() => {
    document.title = 'Credential Providers - Stashd';
  }, []);

  useEffect(() => {
    loadProviders();
  }, []);

  // Set default region when provider preset changes (only for new providers)
  useEffect(() => {
    if (!editingProvider) {
      const preset = PROVIDER_PRESETS[providerPreset];
      if (preset.defaultRegion) {
        setS3Region(preset.defaultRegion);
      } else {
        setS3Region('');
      }
    }
  }, [providerPreset, editingProvider]);

  async function loadProviders() {
    try {
      const data = await getCredentialProviders();
      setProviders(data);
    } catch (error) {
      console.error('Failed to load credential providers:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setProviderPreset('hetzner');
    setS3Region('');
    setS3AccessKeyId('');
    setS3SecretAccessKey('');
    setS3Endpoint('');
    setEditingProvider(null);
    setError(null);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(provider: CredentialProvider) {
    setEditingProvider(provider);
    setName(provider.name);
    setProviderPreset(provider.provider_preset || 'custom');

    const config = provider.config as S3CredentialConfig;
    setS3Region(config.region || '');
    setS3AccessKeyId(config.access_key_id || '');
    setS3SecretAccessKey(config.secret_access_key || '');
    setS3Endpoint(config.endpoint || '');

    setDialogOpen(true);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    try {
      const presetConfig = PROVIDER_PRESETS[providerPreset];

      // Validate required fields based on preset
      if (presetConfig.regionRequired && !s3Region) {
        setError('Region is required for this provider');
        setSaving(false);
        return;
      }

      if (providerPreset !== 'aws' && providerPreset !== 'custom' && !s3Endpoint) {
        setError('Endpoint is required for this provider');
        setSaving(false);
        return;
      }

      const config: S3CredentialConfig = {
        access_key_id: s3AccessKeyId,
        secret_access_key: s3SecretAccessKey,
        ...(s3Endpoint && { endpoint: s3Endpoint }),
        ...(s3Region && { region: s3Region }),
      };

      if (editingProvider) {
        await updateCredentialProvider(editingProvider.id, {
          name,
          type: 's3',
          provider_preset: providerPreset,
          config
        });
      } else {
        await createCredentialProvider({
          name,
          type: 's3',
          provider_preset: providerPreset,
          config
        });
      }

      setDialogOpen(false);
      resetForm();
      loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credential provider');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this credential provider? Destinations and jobs using it will need to be updated.')) return;

    try {
      await deleteCredentialProvider(id);
      loadProviders();
    } catch (error) {
      alert(`Failed to delete credential provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const presetConfig = PROVIDER_PRESETS[providerPreset];

  // Skeleton table row component
  const SkeletonRow = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 font-mono" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
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
            <h1 className="text-2xl font-bold">Credential Providers</h1>
            <p className="text-muted-foreground">
              Manage reusable credentials for S3 and cloud storage
            </p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Providers</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Access Key</TableHead>
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
          <h1 className="text-2xl font-bold">Credential Providers</h1>
          <p className="text-muted-foreground">
            Manage reusable credentials for S3 and cloud storage
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>
            {providers.length} credential provider{providers.length !== 1 && 's'} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-8">
              <Key className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No credential providers configured yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Credential providers allow you to reuse S3 credentials across multiple destinations and backup jobs.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Access Key</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded">
                          {getProviderIcon(provider.provider_preset || 'custom')}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {PROVIDER_PRESETS[provider.provider_preset || 'custom']?.name || 'S3'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(() => {
                        const config = provider.config as S3CredentialConfig;
                        if (config.endpoint) {
                          try {
                            const url = new URL(config.endpoint);
                            return url.hostname;
                          } catch {
                            return config.endpoint;
                          }
                        }
                        return config.region ? `AWS (${config.region})` : 'AWS';
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {(provider.config as S3CredentialConfig).access_key_id}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(provider)}
                        title="Edit provider"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(provider.id)}
                        title="Delete provider"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? 'Edit Credential Provider' : 'Add Credential Provider'}
            </DialogTitle>
            <DialogDescription>
              Configure credentials that can be reused across destinations and backup jobs.
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
                placeholder="Production Backups"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider">Storage Provider</Label>
              <Select value={providerPreset} onValueChange={(v) => setProviderPreset(v as S3ProviderPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hetzner">Hetzner Object Storage</SelectItem>
                  <SelectItem value="aws">Amazon S3</SelectItem>
                  <SelectItem value="cloudflare">Cloudflare R2</SelectItem>
                  <SelectItem value="railway">Railway</SelectItem>
                  <SelectItem value="custom">Custom / Other S3-compatible</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {presetConfig.description}
              </p>
            </div>

            {/* Endpoint - shown for all except AWS */}
            {providerPreset !== 'aws' && (
              <div className="space-y-2">
                <Label htmlFor="s3_endpoint">
                  Endpoint
                  {providerPreset !== 'custom' && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id="s3_endpoint"
                  value={s3Endpoint}
                  onChange={(e) => setS3Endpoint(e.target.value)}
                  placeholder={presetConfig.endpointPlaceholder}
                />
                {presetConfig.endpointHelp && (
                  <p className="text-xs text-muted-foreground">
                    {presetConfig.endpointHelp}
                  </p>
                )}
              </div>
            )}

            {/* Region - shown for AWS (required) and Custom (optional) */}
            {presetConfig.showRegion && (
              <div className="space-y-2">
                <Label htmlFor="s3_region">
                  Region
                  {presetConfig.regionRequired && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Input
                  id="s3_region"
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  placeholder={presetConfig.regionPlaceholder}
                />
                {presetConfig.regionHelp && (
                  <p className="text-xs text-muted-foreground">
                    {presetConfig.regionHelp}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="s3_access_key">
                Access Key ID
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="s3_access_key"
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="s3_secret_key">
                Secret Access Key
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="s3_secret_key"
                type="password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingProvider ? 'Save Changes' : 'Create Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
