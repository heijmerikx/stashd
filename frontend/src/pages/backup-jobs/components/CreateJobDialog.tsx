import { useState, useEffect, useMemo } from 'react';
import cronstrue from 'cronstrue';
import slugify from 'slugify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MultiSelect } from '@/components/ui/multi-select';
import { Loader2, HardDrive, Cloud, Bell, AlertCircle, Plus } from 'lucide-react';
import {
  createBackupJob,
  createBackupDestination,
  getBackupDestinations,
  getNotificationChannels,
  getCredentialProviders,
  type BackupDestination,
  type NotificationChannel,
  type CredentialProvider,
} from '@/lib/api';
import { JobTypeConfigFields } from './JobTypeConfigFields';

export type JobType = 'postgres' | 'mongodb' | 'mysql' | 'redis' | 's3';

interface NotificationSetting {
  channelId: number;
  onSuccess: boolean;
  onFailure: boolean;
}

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobCreated: () => void;
}

export function CreateJobDialog({ open, onOpenChange, onJobCreated }: CreateJobDialogProps) {
  // Data loading state
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[]>([]);
  const [credentialProviders, setCredentialProviders] = useState<CredentialProvider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Form state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<JobType>('postgres');
  const [schedule, setSchedule] = useState('');
  const [retentionDays, setRetentionDays] = useState('30');
  const [retryCount, setRetryCount] = useState('3');
  const [enabled, setEnabled] = useState(true);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<number[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSetting[]>([]);

  // Inline destination creation state
  const [showInlineDestination, setShowInlineDestination] = useState(false);
  const [newDestType, setNewDestType] = useState<'local' | 's3'>('s3');
  const [newDestName, setNewDestName] = useState('');
  // Local destination fields
  const [newDestPath, setNewDestPath] = useState('/data/backups');
  // S3 destination fields
  const [newDestBucket, setNewDestBucket] = useState('');
  const [newDestPrefix, setNewDestPrefix] = useState('');
  const [newDestCredentialProviderId, setNewDestCredentialProviderId] = useState<number | null>(null);
  const [prefixManuallyEdited, setPrefixManuallyEdited] = useState(false);

  // Type-specific config state
  const [configValues, setConfigValues] = useState<Record<string, string>>({
    host: '',
    port: '5432',
    database: '',
    username: '',
    password: '',
    connectionString: '',
    redisUsername: '',
    redisDatabase: '0',
    redisTls: 'false',
    s3Endpoint: '',
    s3Region: '',
    s3Bucket: '',
    s3Prefix: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
  });

  // Load destinations and notification channels when dialog opens
  useEffect(() => {
    if (open && !dataLoaded) {
      loadDialogData();
    }
  }, [open, dataLoaded]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  // Set default port when type changes
  useEffect(() => {
    if (type === 'postgres') setConfigValues(prev => ({ ...prev, port: '5432' }));
    else if (type === 'mysql') setConfigValues(prev => ({ ...prev, port: '3306' }));
    else if (type === 'mongodb') setConfigValues(prev => ({ ...prev, port: '27017' }));
    else if (type === 'redis') setConfigValues(prev => ({ ...prev, port: '6379' }));
  }, [type]);

  // Auto-populate destination prefix from job name and type (if not manually edited)
  useEffect(() => {
    if (showInlineDestination && !prefixManuallyEdited && name) {
      const slug = slugify(name, { lower: true, strict: true });
      setNewDestPrefix(slug ? `${slug}/${type}/` : '');
    }
  }, [name, type, showInlineDestination, prefixManuallyEdited]);

  // When job type changes to S3 Copy, force S3 destination type and filter out local destinations
  useEffect(() => {
    if (type === 's3') {
      // Force S3 destination type for inline creation
      setNewDestType('s3');
      // Remove any selected local destinations
      setSelectedDestinationIds(prev =>
        prev.filter(id => {
          const dest = destinations.find(d => d.id === id);
          return dest?.type === 's3';
        })
      );
    }
  }, [type, destinations]);

  async function loadDialogData() {
    setDataLoading(true);
    try {
      const [destinationsData, channelsData, providersData] = await Promise.all([
        getBackupDestinations(),
        getNotificationChannels(),
        getCredentialProviders(),
      ]);
      setDestinations(destinationsData);
      setNotificationChannels(channelsData);
      setCredentialProviders(providersData);
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load dialog data:', error);
    } finally {
      setDataLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setType('postgres');
    setSchedule('');
    setRetentionDays('30');
    setRetryCount('3');
    setEnabled(false);
    setSelectedDestinationIds([]);
    setNotificationSettings([]);
    setConfigValues({
      host: '',
      port: '5432',
      database: '',
      username: '',
      password: '',
      connectionString: '',
      redisUsername: '',
      redisDatabase: '0',
      redisTls: 'false',
      s3Endpoint: '',
      s3Region: '',
      s3Bucket: '',
      s3Prefix: '',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
    });
    setError(null);
    // Reset inline destination state
    setShowInlineDestination(false);
    setNewDestType('s3');
    setNewDestName('');
    setNewDestPath('/data/backups');
    setNewDestBucket('');
    setNewDestPrefix('');
    setNewDestCredentialProviderId(null);
    setPrefixManuallyEdited(false);
  }

  function handleDestinationChange(ids: (string | number)[]) {
    const newIds = ids.map(id => Number(id));
    setSelectedDestinationIds(newIds);
    if (newIds.length === 0) {
      setEnabled(false);
    }
  }

  // S3 Copy jobs can only use S3 destinations
  const destinationOptions = useMemo(() => {
    return destinations
      .filter(d => d.enabled)
      .filter(d => type !== 's3' || d.type === 's3') // S3 Copy jobs only allow S3 destinations
      .map(dest => ({
        value: dest.id,
        label: dest.name,
        icon: dest.type === 's3' ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />,
      }));
  }, [destinations, type]);

  // For S3 Copy jobs, force S3 destination type
  const canChooseLocalDestination = type !== 's3';

  // Get unique buckets used with the selected credential provider
  const bucketsForProvider = useMemo(() => {
    if (!newDestCredentialProviderId) return [];
    const buckets = destinations
      .filter(d => d.credential_provider_id === newDestCredentialProviderId && d.config && 'bucket' in d.config)
      .map(d => (d.config as { bucket: string }).bucket)
      .filter((bucket, index, arr) => arr.indexOf(bucket) === index); // unique
    return buckets;
  }, [destinations, newDestCredentialProviderId]);

  function toggleNotificationChannel(channelId: number, field: 'onSuccess' | 'onFailure') {
    setNotificationSettings(prev => {
      const existing = prev.find(n => n.channelId === channelId);
      if (existing) {
        const updated = { ...existing, [field]: !existing[field] };
        if (!updated.onSuccess && !updated.onFailure) {
          return prev.filter(n => n.channelId !== channelId);
        }
        return prev.map(n => n.channelId === channelId ? updated : n);
      } else {
        return [...prev, { channelId, onSuccess: field === 'onSuccess', onFailure: field === 'onFailure' }];
      }
    });
  }

  function isNotificationEnabled(channelId: number, field: 'onSuccess' | 'onFailure'): boolean {
    const setting = notificationSettings.find(n => n.channelId === channelId);
    return setting ? setting[field] : false;
  }

  function checkAllNotifications() {
    const enabledChannels = notificationChannels.filter(ch => ch.enabled);
    setNotificationSettings(
      enabledChannels.map(ch => ({
        channelId: ch.id,
        onSuccess: true,
        onFailure: true,
      }))
    );
  }

  function uncheckAllNotifications() {
    setNotificationSettings([]);
  }

  const allNotificationsChecked = notificationChannels.filter(ch => ch.enabled).every(ch => {
    const setting = notificationSettings.find(n => n.channelId === ch.id);
    return setting?.onSuccess && setting?.onFailure;
  }) && notificationChannels.filter(ch => ch.enabled).length > 0;

  const scheduleDescription = useMemo(() => {
    if (!schedule) return '';
    try {
      return cronstrue.toString(schedule, { verbose: false });
    } catch {
      return schedule;
    }
  }, [schedule]);

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    // Collect final destination IDs (may include newly created destination)
    let finalDestinationIds = [...selectedDestinationIds];

    // Validate inline destination if being created
    if (showInlineDestination) {
      if (newDestType === 'local') {
        if (!newDestPath) {
          setError('Path is required for the new destination');
          setSaving(false);
          return;
        }
      } else {
        if (!newDestBucket) {
          setError('Bucket is required for the new destination');
          setSaving(false);
          return;
        }
        if (!newDestCredentialProviderId) {
          setError('Credential provider is required for the new destination');
          setSaving(false);
          return;
        }
      }
    }

    // Check if we have at least one destination (existing or new)
    const willHaveDestination = finalDestinationIds.length > 0 || showInlineDestination;
    if (enabled && !willHaveDestination) {
      setError('At least one destination is required to enable a backup job');
      setSaving(false);
      return;
    }

    try {
      // Create inline destination first if needed
      if (showInlineDestination) {
        const destName = newDestName || `${name} Destination`;
        let newDest;
        if (newDestType === 'local') {
          newDest = await createBackupDestination({
            name: destName,
            type: 'local',
            config: { path: newDestPath },
            enabled: true,
            credential_provider_id: null,
          });
        } else {
          newDest = await createBackupDestination({
            name: destName,
            type: 's3',
            config: {
              bucket: newDestBucket,
              ...(newDestPrefix && { prefix: newDestPrefix }),
            },
            enabled: true,
            credential_provider_id: newDestCredentialProviderId!,
          });
        }
        finalDestinationIds = [...finalDestinationIds, newDest.id];
      }

      let config: Record<string, unknown> = {};

      if (type === 'postgres') {
        config = {
          host: configValues.host,
          port: parseInt(configValues.port),
          database: configValues.database,
          username: configValues.username,
          password: configValues.password || undefined,
        };
      } else if (type === 'mysql') {
        config = {
          host: configValues.host,
          port: parseInt(configValues.port),
          database: configValues.database,
          username: configValues.username,
          password: configValues.password || undefined,
          ssl: configValues.ssl !== 'false', // Default true
        };
      } else if (type === 'mongodb') {
        config = {
          connection_string: configValues.connectionString,
        };
      } else if (type === 'redis') {
        config = {
          host: configValues.host,
          port: parseInt(configValues.port),
          username: configValues.redisUsername || undefined,
          password: configValues.password || undefined,
          database: parseInt(configValues.redisDatabase) || 0,
          tls: configValues.redisTls === 'true',
        };
      } else if (type === 's3') {
        config = {
          endpoint: configValues.s3Endpoint || undefined,
          region: configValues.s3Region,
          bucket: configValues.s3Bucket,
          prefix: configValues.s3Prefix || undefined,
          access_key_id: configValues.s3AccessKeyId,
          secret_access_key: configValues.s3SecretAccessKey,
        };
      }

      await createBackupJob({
        name,
        type,
        config,
        schedule: schedule || null,
        destination_ids: finalDestinationIds,
        retention_days: parseInt(retentionDays),
        retry_count: parseInt(retryCount),
        enabled,
        notifications: notificationSettings,
      });

      onOpenChange(false);
      onJobCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Backup Job</DialogTitle>
          <DialogDescription>
            Configure a new backup job for your database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-3 w-3" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Job Configuration Section */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job Configuration</h3>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production DB Backup"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="type" className="text-xs">Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as JobType)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="redis">Redis</SelectItem>
                    <SelectItem value="s3">S3 Copy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <JobTypeConfigFields
              type={type}
              values={configValues}
              onChange={(key, value) => setConfigValues(prev => ({ ...prev, [key]: value }))}
            />

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1">
                <Label htmlFor="schedule" className="text-xs">Schedule</Label>
                <Input
                  id="schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="0 0 * * *"
                  className="h-8 text-sm"
                />
                {scheduleDescription && (
                  <p className="text-[10px] text-primary truncate">{scheduleDescription}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="retention" className="text-xs">Retention</Label>
                <Input
                  id="retention"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  placeholder="30"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="retryCount" className="text-xs">Retries</Label>
                <Input
                  id="retryCount"
                  type="number"
                  min="0"
                  max="10"
                  value={retryCount}
                  onChange={(e) => setRetryCount(e.target.value)}
                  placeholder="3"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Destinations Section */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinations</h3>
            {dataLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <>
                {destinations.length > 0 && (
                  <MultiSelect
                    options={destinationOptions}
                    selected={selectedDestinationIds}
                    onChange={handleDestinationChange}
                    placeholder="Select destinations..."
                    emptyMessage="No enabled destinations"
                  />
                )}

                {/* Create new destination inline */}
                {!showInlineDestination ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInlineDestination(true)}
                    className="w-full h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Create New Destination
                  </Button>
                ) : (
                  <div className="border rounded-md p-2 space-y-2 bg-background/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">New Destination</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowInlineDestination(false);
                          setNewDestType('s3');
                          setNewDestName('');
                          setNewDestPath('/data/backups');
                          setNewDestBucket('');
                          setNewDestPrefix('');
                          setNewDestCredentialProviderId(null);
                          setPrefixManuallyEdited(false);
                        }}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        Cancel
                      </Button>
                    </div>

                    {/* Type selector - only show if local is allowed */}
                    {canChooseLocalDestination ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setNewDestType('local')}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${newDestType === 'local'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                            }`}
                        >
                          <HardDrive className="h-3 w-3" />
                          Local
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewDestType('s3')}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${newDestType === 's3'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                            }`}
                        >
                          <Cloud className="h-3 w-3" />
                          S3
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Cloud className="h-3 w-3" />
                        S3 destination (required for S3 Copy jobs)
                      </div>
                    )}

                    {newDestType === 'local' && canChooseLocalDestination ? (
                      <div className="space-y-1">
                        <Label htmlFor="new_dest_path" className="text-[10px]">Path *</Label>
                        <Input
                          id="new_dest_path"
                          value={newDestPath}
                          onChange={(e) => setNewDestPath(e.target.value)}
                          placeholder="/data/backups"
                          className="h-7 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Credentials *</Label>
                            {credentialProviders.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground">
                                <a href="/credential-providers" className="underline">Create provider</a> first
                              </p>
                            ) : (
                              <Select
                                value={newDestCredentialProviderId?.toString() || ''}
                                onValueChange={(v) => setNewDestCredentialProviderId(v ? parseInt(v) : null)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Select" />
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
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="new_dest_bucket" className="text-[10px]">Bucket *</Label>
                            <Input
                              id="new_dest_bucket"
                              value={newDestBucket}
                              onChange={(e) => setNewDestBucket(e.target.value)}
                              placeholder="my-bucket"
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                        {bucketsForProvider.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {bucketsForProvider.map((bucket) => (
                              <button
                                key={bucket}
                                type="button"
                                onClick={() => setNewDestBucket(bucket)}
                                className={`text-[10px] px-1 py-0.5 rounded-sm transition-colors ${newDestBucket === bucket
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80'
                                  }`}
                              >
                                {bucket}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label htmlFor="new_dest_prefix" className="text-[10px]">Prefix</Label>
                          <Input
                            id="new_dest_prefix"
                            value={newDestPrefix}
                            onChange={(e) => {
                              setNewDestPrefix(e.target.value);
                              setPrefixManuallyEdited(true);
                            }}
                            placeholder="backups/"
                            className="h-7 text-xs"
                          />
                        </div>
                      </>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="new_dest_name" className="text-[10px]">Name (optional)</Label>
                      <Input
                        id="new_dest_name"
                        value={newDestName}
                        onChange={(e) => setNewDestName(e.target.value)}
                        placeholder={name ? `${name} Destination` : 'My Destination'}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notifications Section */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</h3>
              {!dataLoading && notificationChannels.filter(ch => ch.enabled).length > 0 && (
                <button
                  type="button"
                  onClick={allNotificationsChecked ? uncheckAllNotifications : checkAllNotifications}
                  className="text-[10px] bg-foreground text-background px-1 py-0.5 rounded-sm hover:bg-foreground/80 transition-colors"
                >
                  {allNotificationsChecked ? 'Uncheck all' : 'Check all'}
                </button>
              )}
            </div>
            {dataLoading ? (
              <Skeleton className="h-6 w-full" />
            ) : notificationChannels.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">
                No channels configured. <a href="/notifications" className="underline">Add one</a>
              </p>
            ) : (
              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                {notificationChannels.filter(ch => ch.enabled).map((channel) => (
                  <div key={channel.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-background/50">
                    <div className="flex items-center gap-1.5">
                      <Bell className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{channel.name}</span>
                      <span className="text-muted-foreground text-[10px]">({channel.type})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Checkbox
                          id={`notify-success-${channel.id}`}
                          checked={isNotificationEnabled(channel.id, 'onSuccess')}
                          onCheckedChange={() => toggleNotificationChannel(channel.id, 'onSuccess')}
                          className="h-3 w-3"
                        />
                        <label htmlFor={`notify-success-${channel.id}`} className="text-[10px] cursor-pointer">
                          Success
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <Checkbox
                          id={`notify-failure-${channel.id}`}
                          checked={isNotificationEnabled(channel.id, 'onFailure')}
                          onCheckedChange={() => toggleNotificationChannel(channel.id, 'onFailure')}
                          className="h-3 w-3"
                        />
                        <label htmlFor={`notify-failure-${channel.id}`} className="text-[10px] cursor-pointer">
                          Failure
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Enabled toggle */}
            <div className="flex items-center gap-2 pt-1 border-t mt-2">
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={selectedDestinationIds.length === 0 && !showInlineDestination}
                className="scale-90"
              />
              <Label htmlFor="enabled" className="text-xs">Enabled</Label>
              {selectedDestinationIds.length === 0 && !showInlineDestination && (
                <span className="text-[10px] text-muted-foreground">
                  (select destination)
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Create Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
