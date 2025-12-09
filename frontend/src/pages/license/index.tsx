import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Building2,
  Mail,
  Calendar,
  XCircle,
  Clock,
  Users,
  Sparkles,
} from 'lucide-react';
import { getLicenseStatus, updateLicense, removeLicense, type LicenseStatus } from '@/lib/api';

export function LicensePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'License - Stashd';
  }, []);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const data = await getLicenseStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load license status');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await updateLicense(licenseKey.trim());
      setStatus(data);
      setLicenseKey('');
      setSuccess('License key updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update license');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Are you sure you want to remove the license key?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await removeLicense();
      setStatus({
        registered: false,
        valid: false,
        company: null,
        email: null,
        issued_at: null,
        expires_at: null,
        expired: false,
        error: null,
        tier: null,
        tier_name: null,
        seats: null,
      });
      setSuccess('License key removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove license');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">License</h1>
        <p className="text-muted-foreground">
          Manage your Stashd commercial license
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Current License Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            License Status
          </CardTitle>
          <CardDescription>
            Your current license registration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status?.registered ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {status.valid ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : status.expired ? (
                  <Badge variant="destructive">
                    <Clock className="h-3 w-3 mr-1" />
                    Expired
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Invalid
                  </Badge>
                )}
                {status.tier_name && (
                  <Badge variant="secondary">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {status.tier_name}
                  </Badge>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Registered To</p>
                    <p className="font-medium">{status.company}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Email</p>
                    <p className="font-medium">{status.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">User Seats</p>
                    <p className="font-medium">
                      {status.seats === -1 ? 'Unlimited' : status.seats ?? 1}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Expires</p>
                    <p className="font-medium">
                      {status.expires_at ? formatDate(status.expires_at) : 'Never (Perpetual)'}
                    </p>
                  </div>
                </div>
              </div>

              {status.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{status.error}</AlertDescription>
                </Alert>
              )}

              <div className="pt-4 border-t">
                <Button variant="outline" onClick={handleRemove} disabled={saving}>
                  Remove License
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <KeyRound className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No License Registered</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Enter your license key below to register your copy of Stashd
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enter License Key */}
      <Card>
        <CardHeader>
          <CardTitle>{status?.registered ? 'Update License Key' : 'Register License'}</CardTitle>
          <CardDescription>
            {status?.registered
              ? 'Enter a new license key to update your registration'
              : 'Paste your license key to activate commercial features'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="licenseKey">License Key</Label>
            <Textarea
              id="licenseKey"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="STASHD-xxxxx..."
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Paste your complete license key starting with STASHD-
            </p>
          </div>

          <Button onClick={handleSave} disabled={!licenseKey.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {status?.registered ? 'Update License' : 'Register License'}
          </Button>
        </CardContent>
      </Card>

      {/* Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>About Licensing</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            Stashd is free for personal use. Commercial use requires a valid license.
          </p>
          <p>
            Your license key contains your company name and is cryptographically signed.
            It cannot be modified or transferred to another organization.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
