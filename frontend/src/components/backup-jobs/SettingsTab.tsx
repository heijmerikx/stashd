import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Bell,
  Cloud,
  HardDrive,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { BackupJobFormState, BackupType } from '@/hooks/useBackupJobDetail';
import type { BackupDestination, NotificationChannel } from '@/lib/api';

interface SettingsTabProps {
  form: BackupJobFormState;
  updateForm: <K extends keyof BackupJobFormState>(key: K, value: BackupJobFormState[K]) => void;
  error: string | null;
  saving: boolean;
  handleSave: () => Promise<void>;
  handleDelete: () => Promise<void>;
  deleting: boolean;
  destinations: BackupDestination[];
  notificationChannels: NotificationChannel[];
  destinationOptions: { value: number; label: string; type: string }[];
  handleDestinationChange: (ids: (string | number)[]) => void;
  toggleNotificationChannel: (channelId: number, field: 'onSuccess' | 'onFailure') => void;
  isNotificationEnabled: (channelId: number, field: 'onSuccess' | 'onFailure') => boolean;
  checkAllNotifications: () => void;
  uncheckAllNotifications: () => void;
  allNotificationsChecked: boolean;
  scheduleDescription: string;
}

export function SettingsTab({
  form,
  updateForm,
  error,
  saving,
  handleSave,
  handleDelete,
  deleting,
  destinations,
  notificationChannels,
  destinationOptions,
  handleDestinationChange,
  toggleNotificationChannel,
  isNotificationEnabled,
  checkAllNotifications,
  uncheckAllNotifications,
  allNotificationsChecked,
  scheduleDescription,
}: SettingsTabProps) {
  const destinationOptionsWithIcons = destinationOptions.map(opt => ({
    ...opt,
    icon: opt.type === 's3' ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />,
  }));

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job Configuration</CardTitle>
          <CardDescription>Edit the backup job settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Production Database Backup"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Backup Type</Label>
              <Select value={form.type} onValueChange={(v) => updateForm('type', v as BackupType)}>
                <SelectTrigger>
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

          {(form.type === 'postgres' || form.type === 'mysql') && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" value={form.host} onChange={(e) => updateForm('host', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input id="port" value={form.port} onChange={(e) => updateForm('port', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="database">Database</Label>
                <Input id="database" value={form.database} onChange={(e) => updateForm('database', e.target.value)} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={form.username} onChange={(e) => updateForm('username', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} />
                </div>
              </div>
              {form.type === 'mysql' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mysqlSsl"
                      checked={form.mysqlSsl}
                      onCheckedChange={(checked) => updateForm('mysqlSsl', !!checked)}
                    />
                    <Label htmlFor="mysqlSsl" className="text-sm font-normal">
                      Require SSL connection
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Most cloud databases (AWS RDS, PlanetScale, etc.) require SSL. Disable for local databases.
                  </p>
                </div>
              )}
            </>
          )}

          {form.type === 'mongodb' && (
            <div className="space-y-2">
              <Label htmlFor="connectionString">Connection String</Label>
              <Input
                id="connectionString"
                value={form.connectionString}
                onChange={(e) => updateForm('connectionString', e.target.value)}
                placeholder="mongodb://user:pass@host:27017/mydb?authSource=admin"
              />
              <p className="text-xs text-muted-foreground">Full MongoDB connection URI including database name</p>
            </div>
          )}

          {form.type === 'redis' && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" value={form.host} onChange={(e) => updateForm('host', e.target.value)} placeholder="localhost" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input id="port" value={form.port} onChange={(e) => updateForm('port', e.target.value)} placeholder="6379" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="redisUsername">Username</Label>
                  <Input id="redisUsername" value={form.redisUsername} onChange={(e) => updateForm('redisUsername', e.target.value)} placeholder="default" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => updateForm('password', e.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="redisDatabase">Database Number</Label>
                  <Input id="redisDatabase" value={form.redisDatabase} onChange={(e) => updateForm('redisDatabase', e.target.value)} placeholder="0" />
                  <p className="text-xs text-muted-foreground">Redis database number (0-15)</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 pt-8">
                    <Checkbox
                      id="redisTls"
                      checked={form.redisTls}
                      onCheckedChange={(checked) => updateForm('redisTls', !!checked)}
                    />
                    <Label htmlFor="redisTls" className="text-sm font-normal">
                      Use TLS (rediss://)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only enable if your Redis requires TLS. Most proxy connections (e.g. Railway) don't need this.
                  </p>
                </div>
              </div>
            </>
          )}

          {form.type === 's3' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="s3Endpoint">Endpoint (optional)</Label>
                <Input
                  id="s3Endpoint"
                  value={form.s3Endpoint}
                  onChange={(e) => updateForm('s3Endpoint', e.target.value)}
                  placeholder="https://s3.eu-central-1.amazonaws.com"
                />
                <p className="text-xs text-muted-foreground">For S3-compatible storage (MinIO, Backblaze, etc.)</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3Region">Region</Label>
                  <Input
                    id="s3Region"
                    value={form.s3Region}
                    onChange={(e) => updateForm('s3Region', e.target.value)}
                    placeholder="eu-central-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3Bucket">Bucket</Label>
                  <Input
                    id="s3Bucket"
                    value={form.s3Bucket}
                    onChange={(e) => updateForm('s3Bucket', e.target.value)}
                    placeholder="my-source-bucket"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3Prefix">Prefix (optional)</Label>
                <Input
                  id="s3Prefix"
                  value={form.s3Prefix}
                  onChange={(e) => updateForm('s3Prefix', e.target.value)}
                  placeholder="backups/"
                />
                <p className="text-xs text-muted-foreground">Only sync files with this prefix</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3AccessKeyId">Access Key ID</Label>
                  <Input
                    id="s3AccessKeyId"
                    value={form.s3AccessKeyId}
                    onChange={(e) => updateForm('s3AccessKeyId', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3SecretAccessKey">Secret Access Key</Label>
                  <Input
                    id="s3SecretAccessKey"
                    type="password"
                    value={form.s3SecretAccessKey}
                    onChange={(e) => updateForm('s3SecretAccessKey', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Files from this S3 source will be synced to the selected destination(s).
              </p>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="schedule">Schedule (cron expression)</Label>
            <Input
              id="schedule"
              value={form.schedule}
              onChange={(e) => updateForm('schedule', e.target.value)}
              placeholder="0 0 * * *"
            />
            {scheduleDescription ? (
              <p className="text-xs text-primary">{scheduleDescription}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Leave empty for manual backups only</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="retention">Retention (days)</Label>
              <Input
                id="retention"
                value={form.retentionDays}
                onChange={(e) => updateForm('retentionDays', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retryCount">Retry Count</Label>
              <Input
                id="retryCount"
                type="number"
                min="0"
                max="10"
                value={form.retryCount}
                onChange={(e) => updateForm('retryCount', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Number of retries on failure (0-10)</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destinations</Label>
            {destinations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No destinations configured. <Link to="/destinations" className="underline">Add one first.</Link>
              </p>
            ) : (
              <MultiSelect
                options={destinationOptionsWithIcons}
                selected={form.selectedDestinationIds}
                onChange={handleDestinationChange}
                placeholder="Select destinations..."
                emptyMessage="No enabled destinations"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Notifications</Label>
              {notificationChannels.filter(ch => ch.enabled).length > 0 && (
                <button
                  type="button"
                  onClick={allNotificationsChecked ? uncheckAllNotifications : checkAllNotifications}
                  className="text-[10px] bg-foreground text-background px-1.5 py-0.5 rounded-sm hover:bg-foreground/80 transition-colors"
                >
                  {allNotificationsChecked ? 'Uncheck all' : 'Check all'}
                </button>
              )}
            </div>
            {notificationChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notification channels configured. <Link to="/notifications" className="underline">Add one first.</Link>
              </p>
            ) : (
              <div className="border rounded-md p-3 space-y-3 max-h-40 overflow-y-auto">
                {notificationChannels.filter(ch => ch.enabled).map((channel) => (
                  <div key={channel.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bell className="h-3 w-3" />
                      {channel.name}
                      <span className="text-muted-foreground font-normal">({channel.type})</span>
                    </div>
                    <div className="flex items-center gap-4 ml-5">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`notify-success-${channel.id}`}
                          checked={isNotificationEnabled(channel.id, 'onSuccess')}
                          onCheckedChange={() => toggleNotificationChannel(channel.id, 'onSuccess')}
                        />
                        <label htmlFor={`notify-success-${channel.id}`} className="text-xs cursor-pointer">
                          On Success
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`notify-failure-${channel.id}`}
                          checked={isNotificationEnabled(channel.id, 'onFailure')}
                          onCheckedChange={() => toggleNotificationChannel(channel.id, 'onFailure')}
                        />
                        <label htmlFor={`notify-failure-${channel.id}`} className="text-xs cursor-pointer">
                          On Failure
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => updateForm('enabled', checked)}
                disabled={form.selectedDestinationIds.length === 0}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            {form.selectedDestinationIds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Select at least one destination to enable this job
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Delete Job
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Backup Job</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">
                      Are you sure you want to delete this backup job? This will permanently delete the job configuration and all run history.
                    </span>
                    <span className="block text-foreground font-medium">
                      Note: Backup files stored at your destinations will not be deleted. Check your storage destinations if you wish to remove the actual backup data.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Job
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
