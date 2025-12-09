import { useState, useEffect } from 'react';
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
  getNotificationChannels,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  type NotificationChannel,
  type EmailConfig,
  type DiscordConfig,
} from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, Mail, MessageSquare, Loader2, Send, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationChannelsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'email' | 'discord'>('email');
  const [enabled, setEnabled] = useState(true);

  // Email config
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [toEmails, setToEmails] = useState('');

  // Discord config
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    document.title = 'Backup Notifications - Stashd';
  }, []);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    try {
      const data = await getNotificationChannels();
      setChannels(data);
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setType('email');
    setEnabled(true);
    setSmtpHost('');
    setSmtpPort('587');
    setSmtpSecure(false);
    setSmtpUser('');
    setSmtpPass('');
    setFromEmail('');
    setToEmails('');
    setWebhookUrl('');
    setEditingChannel(null);
    setError(null);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(channel: NotificationChannel) {
    setEditingChannel(channel);
    setName(channel.name);
    setType(channel.type);
    setEnabled(channel.enabled);

    if (channel.type === 'email') {
      const config = channel.config as EmailConfig;
      setSmtpHost(config.smtp_host || '');
      setSmtpPort(String(config.smtp_port || 587));
      setSmtpSecure(config.smtp_secure || false);
      setSmtpUser(config.smtp_user || '');
      setSmtpPass(config.smtp_pass || '');
      setFromEmail(config.from_email || '');
      setToEmails(config.to_emails?.join(', ') || '');
    } else if (channel.type === 'discord') {
      const config = channel.config as DiscordConfig;
      setWebhookUrl(config.webhook_url || '');
    }

    setDialogOpen(true);
  }

  function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      let config;
      if (type === 'email') {
        const emailList = toEmails.split(',').map(e => e.trim()).filter(Boolean);

        // Validate each email in the list
        const invalidEmails = emailList.filter(email => !isValidEmail(email));
        if (invalidEmails.length > 0) {
          setError(`Invalid email address${invalidEmails.length > 1 ? 'es' : ''}: ${invalidEmails.join(', ')}`);
          setSaving(false);
          return;
        }

        if (emailList.length === 0) {
          setError('At least one recipient email address is required');
          setSaving(false);
          return;
        }

        config = {
          smtp_host: smtpHost,
          smtp_port: parseInt(smtpPort),
          smtp_secure: smtpSecure,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          from_email: fromEmail,
          to_emails: emailList,
        };
      } else {
        config = { webhook_url: webhookUrl };
      }

      if (editingChannel) {
        await updateNotificationChannel(editingChannel.id, { name, type, config, enabled });
      } else {
        await createNotificationChannel({ name, type, config, enabled });
      }

      setDialogOpen(false);
      resetForm();
      loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this notification channel?')) return;

    try {
      await deleteNotificationChannel(id);
      loadChannels();
    } catch (error) {
      console.error('Failed to delete channel:', error);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setTestResult(null);
    try {
      await testNotificationChannel(id);
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

  // Skeleton table row component
  const SkeletonRow = () => (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-16" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
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
            <h1 className="text-2xl font-bold">Notification Channels</h1>
            <p className="text-muted-foreground">
              Configure how you receive backup notifications
            </p>
          </div>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Channel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
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
          <h1 className="text-2xl font-bold">Notification Channels</h1>
          <p className="text-muted-foreground">
            Configure how you receive backup notifications
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Channel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            {channels.length} notification channel{channels.length !== 1 && 's'} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No notification channels configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((channel) => (
                  <TableRow key={channel.id}>
                    <TableCell className="font-medium">{channel.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {channel.type === 'email' ? (
                          <Mail className="h-4 w-4" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                        {channel.type}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={channel.enabled ? 'default' : 'secondary'}>
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTest(channel.id)}
                        disabled={testingId === channel.id}
                        title="Send test notification"
                      >
                        {testingId === channel.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : testResult?.id === channel.id ? (
                          testResult.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(channel)}
                        title="Edit channel"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(channel.id)}
                        title="Delete channel"
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
              {editingChannel ? 'Edit Channel' : 'Add Notification Channel'}
            </DialogTitle>
            <DialogDescription>
              Configure a notification channel for backup alerts.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Email Notifications"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'email' | 'discord')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="discord">Discord</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === 'email' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp_host">SMTP Host</Label>
                    <Input
                      id="smtp_host"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp_port">SMTP Port</Label>
                    <Input
                      id="smtp_port"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="587"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="smtp_secure"
                    checked={smtpSecure}
                    onCheckedChange={setSmtpSecure}
                  />
                  <Label htmlFor="smtp_secure">Use TLS/SSL</Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp_user">Username</Label>
                    <Input
                      id="smtp_user"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp_pass">Password</Label>
                    <Input
                      id="smtp_pass"
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="from_email">From Email</Label>
                  <Input
                    id="from_email"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="backups@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="to_emails">To Emails (comma separated)</Label>
                  <Input
                    id="to_emails"
                    value={toEmails}
                    onChange={(e) => setToEmails(e.target.value)}
                    placeholder="admin@example.com, ops@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter one or more email addresses separated by commas
                  </p>
                </div>
              </>
            )}

            {type === 'discord' && (
              <div className="space-y-2">
                <Label htmlFor="webhook_url">Webhook URL</Label>
                <Input
                  id="webhook_url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </div>
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
              {editingChannel ? 'Save Changes' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
