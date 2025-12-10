import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginPage } from '@/pages/auth';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { DashboardPage } from '@/pages/dashboard';
import { BackupJobsPage } from '@/pages/backup-jobs';
import { BackupJobDetailPage } from '@/pages/backup-jobs/detail';
import { DestinationsPage } from '@/pages/destinations';
import { NotificationChannelsPage } from '@/pages/notifications';
import { SettingsPage } from '@/pages/settings';
import { HelpPage } from '@/pages/help';
import { LicensePage } from '@/pages/license';
import { ProfilePage } from '@/pages/profile';
import { AuditLogPage } from '@/pages/audit-log';
import { CredentialProvidersPage } from '@/pages/credential-providers';
import { TeamPage } from '@/pages/team';
import { getUser, getProfile, updateStoredUser, AUTH_EXPIRED_EVENT, tryRestoreSession } from '@/lib/api';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUserState] = useState(getUser());
  const [isRestoring, setIsRestoring] = useState(true);

  // Try to restore session from httpOnly cookie on page load
  useEffect(() => {
    const restoreSession = async () => {
      const storedUser = getUser();
      if (storedUser) {
        // We have a stored user, try to restore the session
        const restored = await tryRestoreSession();
        if (restored) {
          setAuthenticated(true);
          setUserState(storedUser);
        }
      }
      setIsRestoring(false);
    };

    restoreSession();
  }, []);

  // Listen for auth expiry events (e.g., when token refresh fails)
  useEffect(() => {
    const handleAuthExpired = () => {
      setAuthenticated(false);
      setUserState(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  // Fetch profile to get the user's name
  useEffect(() => {
    if (authenticated) {
      getProfile()
        .then((profile) => {
          if (profile.name) {
            updateStoredUser({ name: profile.name });
            setUserState(getUser());
          }
        })
        .catch(() => {
          // Silently fail - name is optional
        });
    }
  }, [authenticated]);

  const handleLoginSuccess = () => {
    setAuthenticated(true);
    setUserState(getUser());
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setUserState(null);
  };

  const ProtectedLayout = () => {
    if (!authenticated || !user) {
      return <Navigate to="/login" replace />;
    }
    return <DashboardLayout user={user} onLogout={handleLogout} />;
  };

  // Show loading while restoring session
  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
        <Route
          path="/login"
          element={
            authenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/backup-jobs" element={<BackupJobsPage />} />
          <Route path="/backup-jobs/:id" element={<BackupJobDetailPage />} />
          <Route path="/destinations" element={<DestinationsPage />} />
          <Route path="/credential-providers" element={<CredentialProvidersPage />} />
          <Route path="/notifications" element={<NotificationChannelsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/license" element={<LicensePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
        <Route
          path="/"
          element={<Navigate to={authenticated ? "/dashboard" : "/login"} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={authenticated ? "/dashboard" : "/login"} replace />}
        />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
