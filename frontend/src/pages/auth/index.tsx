import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { checkFirstUser, login, setUser } from '@/lib/api';
import { AlertCircle, Loader2, Database, Cloud, Shield, Clock } from 'lucide-react';
import { Logo } from '@/components/logo';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null);
  const [checkingFirstUser, setCheckingFirstUser] = useState(true);

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
      const response = await login(email, password);
      // Access token is stored in memory by login()
      // Refresh token is stored in httpOnly cookie by server
      setUser(response.user);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
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
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <Logo size="lg" inverted />
            <span className="text-2xl font-semibold tracking-tight">stashd</span>
          </div>

          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight">
              {isFirstUser ? 'Create Account' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground">
              {isFirstUser
                ? 'No users exist yet. Create the first account to get started.'
                : 'Enter your credentials to access your account'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isFirstUser ? 'Create Account' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
