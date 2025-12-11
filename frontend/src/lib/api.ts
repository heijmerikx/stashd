import { getConfig } from './config';

const API_BASE = getConfig('API_URL');

interface LoginResponse {
  token: string;
  user: { id: number; email: string; name?: string };
  message?: string;
  isFirstUser?: boolean;
}

interface ErrorResponse {
  error: string;
  details?: string[];
  isFirstUser?: boolean;
}

interface FirstUserCheckResponse {
  isFirstUser: boolean;
}

// In-memory token storage (not accessible to XSS)
let accessToken: string | null = null;

// Auth functions
export async function checkFirstUser(): Promise<boolean> {
  const response = await fetch(`${API_BASE}/auth/check-first-user`);
  const data: FirstUserCheckResponse = await response.json();
  return data.isFirstUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new Error(error.details ? error.details.join(', ') : error.error);
  }

  // Store access token in memory
  accessToken = data.token;

  return data as LoginResponse;
}

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string): void {
  accessToken = token;
}

export function clearAuth(): void {
  accessToken = null;
  localStorage.removeItem('user');
}

// Event to notify app of session expiry
export const AUTH_EXPIRED_EVENT = 'auth:expired';

export function dispatchAuthExpired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

export function setUser(user: { id: number; email: string; name?: string }): void {
  localStorage.setItem('user', JSON.stringify(user));
}

export function getUser(): { id: number; email: string; name?: string } | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function updateStoredUser(updates: Partial<{ name: string }>): void {
  const user = getUser();
  if (user) {
    setUser({ ...user, ...updates });
  }
}

export function isAuthenticated(): boolean {
  return !!getToken() && !!getUser();
}

// Logout - clears cookie on server and memory
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore errors, still clear local state
  }
  clearAuth();
}

// Refresh token logic - now uses httpOnly cookie
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Send httpOnly cookie
    });

    if (!response.ok) {
      clearAuth();
      return null;
    }

    const data = await response.json();
    accessToken = data.token;
    return data.token;
  } catch {
    clearAuth();
    return null;
  }
}

// Try to restore session on page load
export async function tryRestoreSession(): Promise<boolean> {
  try {
    const token = await refreshAccessToken();
    return !!token;
  } catch {
    return false;
  }
}

// API helper with auth and automatic token refresh
async function apiFetch<T>(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Always include cookies
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Handle 401 - try to refresh token
  if (response.status === 401 && retryCount === 0) {
    // Prevent multiple simultaneous refresh requests
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }

    const newToken = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (newToken) {
      // Retry the request with the new token
      return apiFetch<T>(endpoint, options, retryCount + 1);
    } else {
      // Refresh failed, notify app to handle logout
      dispatchAuthExpired();
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Dashboard
export interface DashboardStats {
  total_jobs: number;
  total_backups: number;
  successful_backups: number;
  failed_backups: number;
  total_size: number;
  last_24h_backups: number;
  last_24h_failures: number;
}

export interface RecentRunStatus {
  status: 'running' | 'completed' | 'partial' | 'failed';
  destinations: Array<{ status: string }>;
  started_at: string | null;
  duration_seconds: number | null;
}

export interface JobStats {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run: string | null;
  last_success: string | null;
  avg_duration_seconds: number;
  recent_runs?: RecentRunStatus[];
}

export interface JobOverview {
  id: number;
  name: string;
  type: string;
  schedule: string | null;
  enabled: boolean;
  stats: JobStats;
}

export interface BackupHistoryEntry {
  id: number;
  backup_job_id: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  file_size: number | null;
  file_path: string | null;
  error_message: string | null;
  job_name: string | null;
  job_type: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch('/dashboard/stats');
}

export async function getJobsOverview(): Promise<JobOverview[]> {
  return apiFetch('/dashboard/jobs-overview');
}

export async function getRecentBackups(limit = 10): Promise<BackupHistoryEntry[]> {
  return apiFetch(`/dashboard/recent-backups?limit=${limit}`);
}

// Notification Channels
export interface NotificationChannel {
  id: number;
  name: string;
  type: 'email' | 'discord';
  config: EmailConfig | DiscordConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_email: string;
  to_emails: string[];
}

export interface DiscordConfig {
  webhook_url: string;
}

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
  return apiFetch('/notification-channels');
}

export async function getNotificationChannel(id: number): Promise<NotificationChannel> {
  return apiFetch(`/notification-channels/${id}`);
}

export async function createNotificationChannel(
  data: Omit<NotificationChannel, 'id' | 'created_at' | 'updated_at'>
): Promise<NotificationChannel> {
  return apiFetch('/notification-channels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNotificationChannel(
  id: number,
  data: Omit<NotificationChannel, 'id' | 'created_at' | 'updated_at'>
): Promise<NotificationChannel> {
  return apiFetch(`/notification-channels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNotificationChannel(id: number): Promise<void> {
  return apiFetch(`/notification-channels/${id}`, {
    method: 'DELETE',
  });
}

export async function testNotificationChannel(id: number): Promise<{ message: string }> {
  return apiFetch(`/notification-channels/${id}/test`, {
    method: 'POST',
  });
}

// Backup Destinations
// Local config - path inside the container
export interface LocalDestinationConfig {
  path: string;
}

// S3 config - credentials come from credential_provider_id
export interface S3DestinationConfig {
  bucket: string;
  prefix?: string;
}

export type DestinationConfig = LocalDestinationConfig | S3DestinationConfig;

export interface BackupDestination {
  id: number;
  name: string;
  type: 'local' | 's3';
  config: DestinationConfig;
  credential_provider_id: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  stats?: {
    total_backups: number;
    successful_backups: number;
    total_size: number;
    last_backup: string | null;
  };
  credential_provider?: {
    id: number;
    name: string;
    type: string;
    config: object;
  } | null;
}

export async function getBackupDestinations(): Promise<BackupDestination[]> {
  return apiFetch('/backup-destinations');
}

export async function getBackupDestination(id: number): Promise<BackupDestination> {
  return apiFetch(`/backup-destinations/${id}`);
}

export async function createBackupDestination(
  data: Omit<BackupDestination, 'id' | 'created_at' | 'updated_at' | 'stats'>
): Promise<BackupDestination> {
  return apiFetch('/backup-destinations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBackupDestination(
  id: number,
  data: Omit<BackupDestination, 'id' | 'created_at' | 'updated_at' | 'stats'>
): Promise<BackupDestination> {
  return apiFetch(`/backup-destinations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBackupDestination(id: number): Promise<void> {
  return apiFetch(`/backup-destinations/${id}`, {
    method: 'DELETE',
  });
}

export async function testBackupDestination(id: number): Promise<{ message: string }> {
  return apiFetch(`/backup-destinations/${id}/test`, {
    method: 'POST',
  });
}

export async function duplicateBackupDestination(id: number): Promise<BackupDestination> {
  return apiFetch(`/backup-destinations/${id}/duplicate`, {
    method: 'POST',
  });
}

export interface DestinationFile {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

// Browse destination files with folder-like navigation
export interface BrowseItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  lastModified: string;
}

export interface BrowseResult {
  items: BrowseItem[];
  currentPath: string;
}

export async function browseDestinationFiles(
  id: number,
  path?: string,
  limit: number = 100
): Promise<BrowseResult> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  params.set('limit', limit.toString());
  return apiFetch<BrowseResult>(`/backup-destinations/${id}/browse?${params.toString()}`);
}

// Backup Jobs
export interface BackupJob {
  id: number;
  name: string;
  type: 'postgres' | 'mongodb' | 'mysql' | 'files' | 's3' | 'redis';
  config: PostgresConfig | MongoDBConfig | S3SourceConfig | object;
  schedule: string | null;
  destination_ids: number[];
  retention_days: number;
  retry_count: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  stats?: JobStats;
  notification_channels?: {
    id: number;
    name: string;
    on_success: boolean;
    on_failure: boolean;
  }[];
  destinations?: BackupDestination[];
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
}

export interface MongoDBConfig {
  connection_string?: string;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
}

export interface S3SourceConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  access_key_id: string;
  secret_access_key: string;
}

// Get backup jobs (fast, without stats)
export async function getBackupJobs(): Promise<BackupJob[]> {
  return apiFetch('/backup-jobs');
}

// Get backup jobs with stats included (slower, for backwards compatibility)
export async function getBackupJobsWithStats(): Promise<BackupJob[]> {
  return apiFetch('/backup-jobs?includeStats=true');
}

// Get stats for specific job IDs (for batch loading)
export async function getBackupJobStats(jobIds: number[]): Promise<Record<number, JobStats>> {
  if (jobIds.length === 0) return {};
  return apiFetch(`/backup-jobs/stats?ids=${jobIds.join(',')}`);
}

// Get stats for a single job (for per-row loading)
export async function getSingleJobStats(jobId: number): Promise<JobStats> {
  return apiFetch(`/backup-jobs/${jobId}/stats`);
}

export async function getBackupJob(id: number): Promise<BackupJob> {
  return apiFetch(`/backup-jobs/${id}`);
}

export interface BackupJobInput {
  name: string;
  type: 'postgres' | 'mongodb' | 'mysql' | 'files' | 's3' | 'redis';
  config: PostgresConfig | MongoDBConfig | S3SourceConfig | object;
  schedule: string | null;
  destination_ids: number[];
  retention_days: number;
  retry_count?: number;
  enabled: boolean;
  notifications?: {
    channelId: number;
    onSuccess: boolean;
    onFailure: boolean;
  }[];
}

export async function createBackupJob(data: BackupJobInput): Promise<BackupJob> {
  return apiFetch('/backup-jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBackupJob(
  id: number,
  data: BackupJobInput
): Promise<BackupJob> {
  return apiFetch(`/backup-jobs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBackupJob(id: number): Promise<void> {
  return apiFetch(`/backup-jobs/${id}`, {
    method: 'DELETE',
  });
}

export async function runBackupJob(id: number): Promise<{ message: string; queueJobId: string }> {
  return apiFetch(`/backup-jobs/${id}/run`, {
    method: 'POST',
  });
}

export async function toggleBackupJob(id: number): Promise<BackupJob> {
  return apiFetch(`/backup-jobs/${id}/toggle`, {
    method: 'PATCH',
  });
}

export async function duplicateBackupJob(id: number): Promise<BackupJob> {
  return apiFetch(`/backup-jobs/${id}/duplicate`, {
    method: 'POST',
  });
}

export async function getBackupJobHistory(id: number, limit = 50): Promise<BackupHistoryEntry[]> {
  return apiFetch(`/backup-jobs/${id}/history?limit=${limit}`);
}

export interface PaginatedBackupHistory {
  entries: BackupHistoryEntry[];
  total: number;
}

export async function getBackupJobHistoryPaginated(
  id: number,
  page = 0,
  limit = 10
): Promise<PaginatedBackupHistory> {
  return apiFetch(`/backup-jobs/${id}/history?page=${page}&limit=${limit}`);
}

// Backup Runs (grouped by run_id with destination breakdown)
export interface BackupRunDestination {
  id: number;
  destination_id: number | null;
  destination_name: string | null;
  destination_type: string | null;
  status: string;
  file_size: number | null;
  file_path: string | null;
  error_message: string | null;
  execution_log: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface BackupRun {
  run_id: string;
  backup_job_id: number | null;
  job_name: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'partial' | 'failed';
  total_destinations: number;
  successful_destinations: number;
  failed_destinations: number;
  total_size: number;
  destinations: BackupRunDestination[];
}

export interface PaginatedBackupRuns {
  runs: BackupRun[];
  total: number;
}

export async function getBackupJobRuns(
  id: number,
  page = 0,
  limit = 10
): Promise<PaginatedBackupRuns> {
  return apiFetch(`/backup-jobs/${id}/runs?page=${page}&limit=${limit}`);
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  entity_type: string;
  entity_id: number;
  entity_name: string | null;
  action: 'create' | 'update' | 'delete' | 'run';
  changes: object | null;
  created_at: string;
}

export interface PaginatedAuditLog {
  entries: AuditLogEntry[];
  total: number;
}

export async function getBackupJobAuditLog(
  id: number,
  page = 0,
  limit = 20
): Promise<PaginatedAuditLog> {
  return apiFetch(`/backup-jobs/${id}/audit-log?page=${page}&limit=${limit}`);
}

export async function getAllAuditLog(
  page = 0,
  limit = 50
): Promise<PaginatedAuditLog> {
  return apiFetch(`/audit-log?page=${page}&limit=${limit}`);
}

// Queue Management
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface QueueJob {
  id: string | undefined;
  name: string;
  data: {
    jobId?: number;
    name?: string;
    type: string;
  };
  status: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  progress: unknown;
  queue: 'backup' | 'system';
}

export interface ScheduledJob {
  key: string;
  pattern: string;
  next: string;
}

export interface RepeatableJob {
  key: string;
  name: string;
  pattern: string;
  next: number;
  endDate?: number;
}

export interface ScheduledJobsResponse {
  scheduled: ScheduledJob[];
  repeatable: RepeatableJob[];
}

export interface QueueWorker {
  id: string;
  name: string;
  addr: string;
  age: number;
  idle: number;
}

export async function getQueueStats(): Promise<QueueStats> {
  return apiFetch('/queue/stats');
}

export async function getQueueWorkers(): Promise<QueueWorker[]> {
  return apiFetch('/queue/workers');
}

export async function getQueueJobs(status = 'all', limit = 50): Promise<QueueJob[]> {
  return apiFetch(`/queue/jobs?status=${status}&limit=${limit}`);
}

export async function getScheduledJobs(): Promise<ScheduledJobsResponse> {
  return apiFetch('/queue/scheduled');
}

export async function pauseQueue(): Promise<{ message: string }> {
  return apiFetch('/queue/pause', { method: 'POST' });
}

export async function resumeQueue(): Promise<{ message: string }> {
  return apiFetch('/queue/resume', { method: 'POST' });
}

export async function clearCompletedJobs(): Promise<{ message: string }> {
  return apiFetch('/queue/completed', { method: 'DELETE' });
}

export async function clearFailedJobs(): Promise<{ message: string }> {
  return apiFetch('/queue/failed', { method: 'DELETE' });
}

export async function retryFailedJobs(): Promise<{ message: string }> {
  return apiFetch('/queue/retry-failed', { method: 'POST' });
}

export async function removeQueueJob(jobId: string): Promise<{ message: string }> {
  return apiFetch(`/queue/jobs/${jobId}`, { method: 'DELETE' });
}

export async function drainQueue(): Promise<{ message: string }> {
  return apiFetch('/queue/drain', { method: 'POST' });
}

// License
export type LicenseTier = 'personal' | 'tier_1' | 'tier_2';

export interface LicenseStatus {
  registered: boolean;
  valid: boolean;
  company: string | null;
  email: string | null;
  issued_at: string | null;
  expires_at: string | null;
  expired: boolean;
  error: string | null;
  tier: LicenseTier | null;
  tier_name: string | null;
  seats: number | null;
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return apiFetch('/license/status');
}

export async function updateLicense(licenseKey: string): Promise<LicenseStatus & { message: string }> {
  return apiFetch('/license', {
    method: 'PUT',
    body: JSON.stringify({ license_key: licenseKey }),
  });
}

export async function removeLicense(): Promise<{ message: string }> {
  return apiFetch('/license', { method: 'DELETE' });
}

// Credential Providers
export const S3_PROVIDER_PRESETS = ['aws', 'hetzner', 'cloudflare', 'railway', 'custom'] as const;
export type S3ProviderPreset = typeof S3_PROVIDER_PRESETS[number];

export interface S3CredentialConfig {
  endpoint?: string;
  region?: string;
  access_key_id: string;
  secret_access_key: string;
}

export type CredentialConfig = S3CredentialConfig;

export interface CredentialProvider {
  id: number;
  name: string;
  type: 's3';
  provider_preset: S3ProviderPreset;
  config: CredentialConfig;
  created_at: string;
  updated_at: string;
}

export async function getCredentialProviders(): Promise<CredentialProvider[]> {
  return apiFetch('/credential-providers');
}

export async function getCredentialProvider(id: number): Promise<CredentialProvider> {
  return apiFetch(`/credential-providers/${id}`);
}

export async function createCredentialProvider(
  data: Omit<CredentialProvider, 'id' | 'created_at' | 'updated_at'>
): Promise<CredentialProvider> {
  return apiFetch('/credential-providers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCredentialProvider(
  id: number,
  data: Omit<CredentialProvider, 'id' | 'created_at' | 'updated_at'>
): Promise<CredentialProvider> {
  return apiFetch(`/credential-providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCredentialProvider(id: number): Promise<void> {
  return apiFetch(`/credential-providers/${id}`, {
    method: 'DELETE',
  });
}

export async function testCredentialProvider(id: number): Promise<{ message: string }> {
  return apiFetch(`/credential-providers/${id}/test`, {
    method: 'POST',
  });
}

// User Profile
export interface UserProfile {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export async function getProfile(): Promise<UserProfile> {
  return apiFetch('/profile');
}

export async function updateProfile(data: { name: string }): Promise<UserProfile> {
  return apiFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
  return apiFetch('/profile/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// User Management (Enterprise only)
export interface TeamUser {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export interface UsersListResponse {
  users: TeamUser[];
  total: number;
  seats: number;
  seats_available: number | 'unlimited';
}

export async function getUsers(): Promise<UsersListResponse> {
  return apiFetch('/users');
}

export async function createTeamUser(data: { email: string; password: string; name?: string }): Promise<{ message: string; user: TeamUser }> {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTeamUser(id: number, data: { name?: string; password?: string }): Promise<{ message: string; user: TeamUser }> {
  return apiFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTeamUser(id: number): Promise<{ message: string }> {
  return apiFetch(`/users/${id}`, {
    method: 'DELETE',
  });
}
