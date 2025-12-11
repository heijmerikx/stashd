import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { checkFirstUser, login, setUser } from '@/lib/api';
import { AlertCircle, Loader2, Database, Cloud, Shield, Clock, KeyRound } from 'lucide-react';
import { Logo } from '@/components/logo';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null);
  const [checkingFirstUser, setCheckingFirstUser] = useState(true);
  const [requiresTotp, setRequiresTotp] = useState(false);

  useEffect(() => {
    checkFirstUser()
      .then(setIsFirstUser)
      .catch(() => setIsFirstUser(false))
      .finally(() => setCheckingFirstUser(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(email, password, requiresTotp ? totpCode : undefined);

      // Check if TOTP is required
      if (response.requiresTotp) {
        setRequiresTotp(true);
        setLoading(false);
        return;
      }

      // Login successful
      if (response.user) {
        setUser(response.user);
        onLoginSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      // If TOTP code was wrong, don't reset the requiresTotp state
      if (!requiresTotp) {
        setTotpCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setRequiresTotp(false);
    setTotpCode('');
    setError('');
  };

  if (checkingFirstUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const features = [
    { icon: Database, label: 'PostgreSQL, MySQL, MongoDB' },
    { icon: Cloud, label: 'S3-compatible storage' },
    { icon: Shield, label: 'Encrypted at rest' },
    { icon: Clock, label: 'Scheduled backups' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-br from-primary via-primary to-primary/80" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div>
            {/* Logo/Brand */}
            <div className="flex items-center gap-3">
              <Logo size="lg" className="text-primary-foreground" />
              <span className="text-2xl font-semibold tracking-tight">stashd</span>
            </div>
          </div>

          {/* Tagline and features */}
          <div className="space-y-8">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight">
                Automated backup management
              </h1>
              <p className="text-primary-foreground/70 text-lg max-w-md">
                Protect your data with scheduled backups, instant recovery, and comprehensive monitoring.
              </p>
            </div>

            {/* Feature list */}
            <div className="grid grid-cols-2 gap-4">
              {features.map((feature) => (
                <div key={feature.label} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-primary-foreground/10 flex items-center justify-center">
                    <feature.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-primary-foreground/80">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-primary-foreground/50">
            Self-hosted backup solution
          </div>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8 text-primary">
            <Logo size="lg" />
            <span className="text-2xl font-semibold tracking-tight">stashd</span>
          </div>

          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            {requiresTotp ? (
              <>
                <div className="flex items-center gap-2 justify-center lg:justify-start">
                  <KeyRound className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-bold tracking-tight">
                    Two-Factor Authentication
                  </h2>
                </div>
                <p className="text-muted-foreground">
                  Enter the 6-digit code from your authenticator app, or use a backup code.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold tracking-tight">
                  {isFirstUser ? 'Create Account' : 'Welcome back'}
                </h2>
                <p className="text-muted-foreground">
                  {isFirstUser
                    ? 'No users exist yet. Create the first account to get started.'
                    : 'Enter your credentials to access your account'}
                </p>
              </>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {requiresTotp ? (
              /* TOTP Code Input */
              <div className="space-y-2">
                <Label htmlFor="totpCode">Authentication Code</Label>
                <Input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[A-Za-z0-9]*"
                  placeholder="Enter 6-digit code or backup code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                  required
                  disabled={loading}
                  className="h-11 text-center text-lg tracking-widest"
                  autoFocus
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground">
                  Open your authenticator app to view your code
                </p>
              </div>
            ) : (
              /* Email and Password Inputs */
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11"
                  />
                  {isFirstUser && (
                    <p className="text-xs text-muted-foreground">
                      Password must be at least 12 characters and include uppercase, lowercase, number, and special character.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-3">
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {requiresTotp ? 'Verify' : isFirstUser ? 'Create Account' : 'Sign in'}
              </Button>

              {requiresTotp && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleBackToLogin}
                  disabled={loading}
                >
                  Back to login
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
