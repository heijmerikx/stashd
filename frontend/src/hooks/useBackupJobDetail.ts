import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import cronstrue from 'cronstrue';
import {
  getBackupJob,
  updateBackupJob,
  runBackupJob,
  toggleBackupJob,
  deleteBackupJob,
  getBackupDestinations,
  getNotificationChannels,
  getBackupJobRuns,
  getBackupJobAuditLog,
  browseDestinationFiles,
  type BackupJob,
  type BackupDestination,
  type NotificationChannel,
  type BackupRun,
  type AuditLogEntry,
  type BrowseItem,
} from '@/lib/api';

export interface NotificationSetting {
  channelId: number;
  onSuccess: boolean;
  onFailure: boolean;
}

export type BackupType = 'postgres' | 'mongodb' | 'mysql' | 'redis' | 's3';

export interface BackupJobFormState {
  name: string;
  type: BackupType;
  schedule: string;
  retentionDays: string;
  retryCount: string;
  enabled: boolean;
  selectedDestinationIds: number[];
  // Database config
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  connectionString: string;
  mysqlSsl: boolean;
  // Redis config
  redisUsername: string;
  redisDatabase: string;
  redisTls: boolean;
  // S3 source config
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  // Notifications
  notificationSettings: NotificationSetting[];
}

export interface UseBackupJobDetailReturn {
  // Core data
  job: BackupJob | null;
  destinations: BackupDestination[];
  notificationChannels: NotificationChannel[];
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;

  // Form state
  form: BackupJobFormState;
  setForm: React.Dispatch<React.SetStateAction<BackupJobFormState>>;
  updateForm: <K extends keyof BackupJobFormState>(key: K, value: BackupJobFormState[K]) => void;

  // Actions
  saving: boolean;
  runningJob: boolean;
  togglingJob: boolean;
  deleting: boolean;
  handleSave: () => Promise<void>;
  handleRunNow: () => Promise<void>;
  handleToggle: () => Promise<void>;
  handleDelete: () => Promise<void>;

  // History/Runs
  runs: BackupRun[];
  runsTotal: number;
  runsPage: number;
  setRunsPage: (page: number) => void;
  runsLoading: boolean;
  runsTotalPages: number;
  expandedRuns: Set<string>;
  toggleRunExpand: (runId: string) => void;
  loadRuns: () => Promise<void>;
  hasRunningJob: boolean;

  // Auto-refresh
  activeTab: string;
  setActiveTab: (tab: string) => void;
  refreshProgress: number;

  // Audit log
  auditLog: AuditLogEntry[];
  auditTotal: number;
  auditPage: number;
  setAuditPage: (page: number) => void;
  auditLoading: boolean;
  auditTotalPages: number;
  loadAuditLog: () => Promise<void>;

  // Files
  destinationFiles: Map<number, BrowseItem[]>;
  currentPath: Map<number, string>;
  filesLoading: Set<number>;
  expandedDestinations: Set<number>;
  loadDestinationFiles: (destId: number, path?: string) => Promise<void>;
  navigateToFolder: (destId: number, folderPath: string) => void;
  navigateUp: (destId: number) => void;
  navigateToRoot: (destId: number) => void;
  getBreadcrumbs: (destId: number) => { name: string; path: string }[];
  toggleDestinationExpand: (destId: number) => void;

  // Notifications helpers
  toggleNotificationChannel: (channelId: number, field: 'onSuccess' | 'onFailure') => void;
  isNotificationEnabled: (channelId: number, field: 'onSuccess' | 'onFailure') => boolean;
  checkAllNotifications: () => void;
  uncheckAllNotifications: () => void;
  allNotificationsChecked: boolean;

  // Destinations helper
  handleDestinationChange: (ids: (string | number)[]) => void;
  destinationOptions: { value: number; label: string; type: string }[];

  // Dialogs
  selectedError: { date: string; message: string; log?: string | null } | null;
  setSelectedError: (error: { date: string; message: string; log?: string | null } | null) => void;
  selectedAuditEntry: AuditLogEntry | null;
  setSelectedAuditEntry: (entry: AuditLogEntry | null) => void;

  // Formatting helpers
  formatCronExpression: (cron: string) => string;
  scheduleDescription: string;
}

const DEFAULT_FILES_LIMIT = 100;
const RUNS_LIMIT = 10;
const AUDIT_LIMIT = 10;

const initialFormState: BackupJobFormState = {
  name: '',
  type: 'postgres',
  schedule: '',
  retentionDays: '30',
  retryCount: '3',
  enabled: true,
  selectedDestinationIds: [],
  host: '',
  port: '5432',
  database: '',
  username: '',
  password: '',
  connectionString: '',
  mysqlSsl: true,
  redisUsername: '',
  redisDatabase: '0',
  redisTls: false,
  s3Endpoint: '',
  s3Region: '',
  s3Bucket: '',
  s3Prefix: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  notificationSettings: [],
};

export function useBackupJobDetail(jobId: number): UseBackupJobDetailReturn {
  const navigate = useNavigate();

  // Core state
  const [job, setJob] = useState<BackupJob | null>(null);
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<BackupJobFormState>(initialFormState);

  // Action states
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState(false);
  const [togglingJob, setTogglingJob] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // History state
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(0);
  const [runsLoading, setRunsLoading] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Audit log state
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  // Files state
  const [destinationFiles, setDestinationFiles] = useState<Map<number, BrowseItem[]>>(new Map());
  const [currentPath, setCurrentPath] = useState<Map<number, string>>(new Map());
  const [filesLoading, setFilesLoading] = useState<Set<number>>(new Set());
  const [expandedDestinations, setExpandedDestinations] = useState<Set<number>>(new Set());

  // Dialog state
  const [selectedError, setSelectedError] = useState<{ date: string; message: string; log?: string | null } | null>(null);
  const [selectedAuditEntry, setSelectedAuditEntry] = useState<AuditLogEntry | null>(null);

  // Auto-refresh state
  const [activeTab, setActiveTab] = useState('settings');
  const [refreshProgress, setRefreshProgress] = useState(0);

  // Form helper
  const updateForm = useCallback(<K extends keyof BackupJobFormState>(key: K, value: BackupJobFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // Populate form from job data
  const populateForm = useCallback((jobData: BackupJob) => {
    const config = jobData.config as Record<string, unknown>;

    const newForm: BackupJobFormState = {
      ...initialFormState,
      name: jobData.name,
      type: jobData.type as BackupType,
      schedule: jobData.schedule || '',
      retentionDays: String(jobData.retention_days),
      retryCount: String(jobData.retry_count ?? 3),
      enabled: jobData.enabled,
      selectedDestinationIds: jobData.destination_ids || [],
    };

    if (jobData.type === 'postgres' || jobData.type === 'mysql') {
      newForm.host = (config.host as string) || '';
      newForm.port = String(config.port || (jobData.type === 'mysql' ? 3306 : 5432));
      newForm.database = (config.database as string) || '';
      newForm.username = (config.username as string) || '';
      newForm.password = (config.password as string) || '';
      if (jobData.type === 'mysql') {
        newForm.mysqlSsl = config.ssl !== false;
      }
    } else if (jobData.type === 'mongodb') {
      newForm.connectionString = (config.connection_string as string) || '';
    } else if (jobData.type === 'redis') {
      newForm.host = (config.host as string) || '';
      newForm.port = String(config.port || 6379);
      newForm.redisUsername = (config.username as string) || '';
      newForm.password = (config.password as string) || '';
      newForm.redisDatabase = String(config.database ?? 0);
      newForm.redisTls = config.tls === true;
    } else if (jobData.type === 's3') {
      newForm.s3Endpoint = (config.endpoint as string) || '';
      newForm.s3Region = (config.region as string) || '';
      newForm.s3Bucket = (config.bucket as string) || '';
      newForm.s3Prefix = (config.prefix as string) || '';
      newForm.s3AccessKeyId = (config.access_key_id as string) || '';
      newForm.s3SecretAccessKey = (config.secret_access_key as string) || '';
    }

    // Notification settings
    if (jobData.notification_channels) {
      newForm.notificationSettings = jobData.notification_channels.map(nc => ({
        channelId: nc.id,
        onSuccess: nc.on_success,
        onFailure: nc.on_failure,
      }));
    }

    setForm(newForm);
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [jobData, destinationsData, channelsData] = await Promise.all([
        getBackupJob(jobId),
        getBackupDestinations(),
        getNotificationChannels(),
      ]);
      setJob(jobData);
      setDestinations(destinationsData);
      setNotificationChannels(channelsData);
      populateForm(jobData);
    } catch (err) {
      console.error('Failed to load data:', err);
      navigate('/backup-jobs');
    } finally {
      setLoading(false);
    }
  }, [jobId, navigate, populateForm]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await getBackupJobRuns(jobId, runsPage, RUNS_LIMIT);
      setRuns(data.runs);
      setRunsTotal(data.total);
    } catch (err) {
      console.error('Failed to load runs:', err);
    } finally {
      setRunsLoading(false);
    }
  }, [jobId, runsPage]);

  const loadAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await getBackupJobAuditLog(jobId, auditPage, AUDIT_LIMIT);
      setAuditLog(data.entries);
      setAuditTotal(data.total);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [jobId, auditPage]);

  const loadDestinationFiles = useCallback(async (destId: number, path?: string) => {
    setFilesLoading(prev => new Set(prev).add(destId));
    try {
      const response = await browseDestinationFiles(destId, path, DEFAULT_FILES_LIMIT);
      setDestinationFiles(prev => new Map(prev).set(destId, response.items));
      setCurrentPath(prev => new Map(prev).set(destId, response.currentPath));
    } catch (err) {
      console.error(`Failed to load files for destination ${destId}:`, err);
      setDestinationFiles(prev => new Map(prev).set(destId, []));
    } finally {
      setFilesLoading(prev => {
        const next = new Set(prev);
        next.delete(destId);
        return next;
      });
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Visibility change handler
  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && jobId) {
        try {
          const [jobData, destinationsData, channelsData] = await Promise.all([
            getBackupJob(jobId),
            getBackupDestinations(),
            getNotificationChannels(),
          ]);
          setJob(jobData);
          setDestinations(destinationsData);
          setNotificationChannels(channelsData);
          populateForm(jobData);

          const runsData = await getBackupJobRuns(jobId, runsPage, RUNS_LIMIT);
          setRuns(runsData.runs);
          setRunsTotal(runsData.total);

          const auditData = await getBackupJobAuditLog(jobId, auditPage, AUDIT_LIMIT);
          setAuditLog(auditData.entries);
          setAuditTotal(auditData.total);
        } catch (err) {
          console.error('Failed to refresh data on tab visibility:', err);
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [jobId, runsPage, auditPage, populateForm]);

  // Load runs on page change or when switching to history tab
  useEffect(() => {
    if (jobId && activeTab === 'history') {
      loadRuns();
    }
  }, [jobId, activeTab, runsPage, loadRuns]);

  // Check if any run is currently running
  const hasRunningJob = runs.some(run => run.status === 'running');

  // Auto-refresh history tab
  useEffect(() => {
    if (activeTab !== 'history' || !jobId || !hasRunningJob) {
      setRefreshProgress(0);
      return;
    }

    setRefreshProgress(0);
    const refreshInterval = 10000;
    const progressInterval = 50;
    const progressIncrement = (progressInterval / refreshInterval) * 100;

    const progressTimer = setInterval(() => {
      setRefreshProgress(prev => {
        if (prev >= 100) {
          loadRuns();
          return 0;
        }
        return prev + progressIncrement;
      });
    }, progressInterval);

    return () => {
      clearInterval(progressTimer);
      setRefreshProgress(0);
    };
  }, [activeTab, jobId, hasRunningJob, loadRuns]);

  // Load audit log on page change
  useEffect(() => {
    if (jobId) {
      loadAuditLog();
    }
  }, [jobId, loadAuditLog]);

  // Toggle run expand
  const toggleRunExpand = useCallback((runId: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }, []);

  // File navigation
  const navigateToFolder = useCallback((destId: number, folderPath: string) => {
    loadDestinationFiles(destId, folderPath);
  }, [loadDestinationFiles]);

  const navigateUp = useCallback((destId: number) => {
    const current = currentPath.get(destId) || '';
    if (!current) return;
    const cleanPath = current.replace(/\/$/, '');
    const lastSlash = cleanPath.lastIndexOf('/');
    const parentPath = lastSlash > 0 ? cleanPath.substring(0, lastSlash) : '';
    loadDestinationFiles(destId, parentPath || undefined);
  }, [currentPath, loadDestinationFiles]);

  const navigateToRoot = useCallback((destId: number) => {
    loadDestinationFiles(destId, undefined);
  }, [loadDestinationFiles]);

  const getBreadcrumbs = useCallback((destId: number): { name: string; path: string }[] => {
    const path = currentPath.get(destId) || '';
    if (!path) return [];

    const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
    const breadcrumbs: { name: string; path: string }[] = [];
    let accumulated = '';

    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      breadcrumbs.push({ name: part, path: accumulated });
    }

    return breadcrumbs;
  }, [currentPath]);

  const toggleDestinationExpand = useCallback((destId: number) => {
    setExpandedDestinations(prev => {
      const next = new Set(prev);
      if (next.has(destId)) {
        next.delete(destId);
      } else {
        next.add(destId);
        if (!destinationFiles.has(destId)) {
          loadDestinationFiles(destId);
        }
      }
      return next;
    });
  }, [destinationFiles, loadDestinationFiles]);

  // Destination handling
  const handleDestinationChange = useCallback((ids: (string | number)[]) => {
    const newIds = ids.map(id => Number(id));
    setForm(prev => ({
      ...prev,
      selectedDestinationIds: newIds,
      enabled: newIds.length === 0 ? false : prev.enabled,
    }));
  }, []);

  // S3 Copy jobs can only use S3 destinations
  const destinationOptions = useMemo(() => {
    return destinations
      .filter(d => d.enabled)
      .filter(d => form.type !== 's3' || d.type === 's3') // S3 Copy jobs only allow S3 destinations
      .map(dest => ({
        value: dest.id,
        label: dest.name,
        type: dest.type,
      }));
  }, [destinations, form.type]);

  // When job type changes to S3 Copy, remove any selected local destinations
  useEffect(() => {
    if (form.type === 's3') {
      setForm(prev => {
        const filteredIds = prev.selectedDestinationIds.filter(id => {
          const dest = destinations.find(d => d.id === id);
          return dest?.type === 's3';
        });
        if (filteredIds.length !== prev.selectedDestinationIds.length) {
          return {
            ...prev,
            selectedDestinationIds: filteredIds,
            enabled: filteredIds.length === 0 ? false : prev.enabled,
          };
        }
        return prev;
      });
    }
  }, [form.type, destinations]);

  // Notification handling
  const toggleNotificationChannel = useCallback((channelId: number, field: 'onSuccess' | 'onFailure') => {
    setForm(prev => {
      const existing = prev.notificationSettings.find(n => n.channelId === channelId);
      let newSettings: NotificationSetting[];

      if (existing) {
        const updated = { ...existing, [field]: !existing[field] };
        if (!updated.onSuccess && !updated.onFailure) {
          newSettings = prev.notificationSettings.filter(n => n.channelId !== channelId);
        } else {
          newSettings = prev.notificationSettings.map(n => n.channelId === channelId ? updated : n);
        }
      } else {
        newSettings = [...prev.notificationSettings, { channelId, onSuccess: field === 'onSuccess', onFailure: field === 'onFailure' }];
      }

      return { ...prev, notificationSettings: newSettings };
    });
  }, []);

  const isNotificationEnabled = useCallback((channelId: number, field: 'onSuccess' | 'onFailure'): boolean => {
    const setting = form.notificationSettings.find(n => n.channelId === channelId);
    return setting ? setting[field] : false;
  }, [form.notificationSettings]);

  const checkAllNotifications = useCallback(() => {
    const enabledChannels = notificationChannels.filter(ch => ch.enabled);
    setForm(prev => ({
      ...prev,
      notificationSettings: enabledChannels.map(ch => ({
        channelId: ch.id,
        onSuccess: true,
        onFailure: true,
      })),
    }));
  }, [notificationChannels]);

  const uncheckAllNotifications = useCallback(() => {
    setForm(prev => ({ ...prev, notificationSettings: [] }));
  }, []);

  const allNotificationsChecked = useMemo(() => {
    const enabledChannels = notificationChannels.filter(ch => ch.enabled);
    return enabledChannels.every(ch => {
      const setting = form.notificationSettings.find(n => n.channelId === ch.id);
      return setting?.onSuccess && setting?.onFailure;
    }) && enabledChannels.length > 0;
  }, [notificationChannels, form.notificationSettings]);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    if (form.enabled && form.selectedDestinationIds.length === 0) {
      setError('At least one destination is required to enable a backup job');
      setSaving(false);
      return;
    }

    try {
      let config: Record<string, unknown> = {};

      if (form.type === 'postgres') {
        config = {
          host: form.host,
          port: parseInt(form.port),
          database: form.database,
          username: form.username,
          password: form.password || undefined,
        };
      } else if (form.type === 'mysql') {
        config = {
          host: form.host,
          port: parseInt(form.port),
          database: form.database,
          username: form.username,
          password: form.password || undefined,
          ssl: form.mysqlSsl,
        };
      } else if (form.type === 'mongodb') {
        config = { connection_string: form.connectionString };
      } else if (form.type === 'redis') {
        config = {
          host: form.host,
          port: parseInt(form.port),
          username: form.redisUsername || undefined,
          password: form.password || undefined,
          database: parseInt(form.redisDatabase) || 0,
          tls: form.redisTls,
        };
      } else if (form.type === 's3') {
        config = {
          endpoint: form.s3Endpoint || undefined,
          region: form.s3Region,
          bucket: form.s3Bucket,
          prefix: form.s3Prefix || undefined,
          access_key_id: form.s3AccessKeyId,
          secret_access_key: form.s3SecretAccessKey,
        };
      }

      await updateBackupJob(jobId, {
        name: form.name,
        type: form.type,
        config,
        schedule: form.schedule || null,
        destination_ids: form.selectedDestinationIds,
        retention_days: parseInt(form.retentionDays),
        retry_count: parseInt(form.retryCount),
        enabled: form.enabled,
        notifications: form.notificationSettings,
      });

      const updatedJob = await getBackupJob(jobId);
      setJob(updatedJob);
      populateForm(updatedJob);
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  }, [jobId, form, populateForm, loadAuditLog]);

  // Run now handler
  const handleRunNow = useCallback(async () => {
    setRunningJob(true);
    setError(null);
    try {
      await runBackupJob(jobId);
      setTimeout(() => {
        loadRuns();
        loadAuditLog();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run job');
    } finally {
      setRunningJob(false);
    }
  }, [jobId, loadRuns, loadAuditLog]);

  // Toggle handler
  const handleToggle = useCallback(async () => {
    if (!job) return;
    setTogglingJob(true);
    setError(null);
    try {
      const updatedJob = await toggleBackupJob(jobId);
      setJob(prev => prev ? { ...prev, enabled: updatedJob.enabled } : null);
      setForm(prev => ({ ...prev, enabled: updatedJob.enabled }));
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle job');
    } finally {
      setTogglingJob(false);
    }
  }, [job, jobId, loadAuditLog]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteBackupJob(jobId);
      navigate('/backup-jobs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
      setDeleting(false);
    }
  }, [jobId, navigate]);

  // Formatting helpers
  const formatCronExpression = useCallback((cron: string): string => {
    try {
      return cronstrue.toString(cron, { verbose: false });
    } catch {
      return cron;
    }
  }, []);

  const scheduleDescription = useMemo(() => {
    if (!form.schedule) return '';
    return formatCronExpression(form.schedule);
  }, [form.schedule, formatCronExpression]);

  // Computed values
  const runsTotalPages = Math.ceil(runsTotal / RUNS_LIMIT);
  const auditTotalPages = Math.ceil(auditTotal / AUDIT_LIMIT);

  return {
    job,
    destinations,
    notificationChannels,
    loading,
    error,
    setError,

    form,
    setForm,
    updateForm,

    saving,
    runningJob,
    togglingJob,
    deleting,
    handleSave,
    handleRunNow,
    handleToggle,
    handleDelete,

    runs,
    runsTotal,
    runsPage,
    setRunsPage,
    runsLoading,
    runsTotalPages,
    expandedRuns,
    toggleRunExpand,
    loadRuns,
    hasRunningJob,

    activeTab,
    setActiveTab,
    refreshProgress,

    auditLog,
    auditTotal,
    auditPage,
    setAuditPage,
    auditLoading,
    auditTotalPages,
    loadAuditLog,

    destinationFiles,
    currentPath,
    filesLoading,
    expandedDestinations,
    loadDestinationFiles,
    navigateToFolder,
    navigateUp,
    navigateToRoot,
    getBreadcrumbs,
    toggleDestinationExpand,

    toggleNotificationChannel,
    isNotificationEnabled,
    checkAllNotifications,
    uncheckAllNotifications,
    allNotificationsChecked,

    handleDestinationChange,
    destinationOptions,

    selectedError,
    setSelectedError,
    selectedAuditEntry,
    setSelectedAuditEntry,

    formatCronExpression,
    scheduleDescription,
  };
}
