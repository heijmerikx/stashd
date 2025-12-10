import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { useBackupJobDetail } from '@/hooks/useBackupJobDetail';
import { useFormKeyboardSubmit } from '@/hooks/useFormKeyboardSubmit';
import {
  JobHeader,
  SettingsTab,
  FilesTab,
  HistoryTab,
  AuditTab,
  ErrorLogDialog,
} from '@/components/backup-jobs';

export function BackupJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = parseInt(id || '0');

  const {
    job,
    destinations,
    notificationChannels,
    loading,
    error,

    form,
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
    runsPage,
    setRunsPage,
    runsLoading,
    runsTotalPages,
    expandedRuns,
    toggleRunExpand,
    hasRunningJob,
    runsTotal,

    activeTab,
    setActiveTab,
    refreshProgress,

    auditLog,
    auditPage,
    setAuditPage,
    auditLoading,
    auditTotalPages,
    auditTotal,

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

    scheduleDescription,
  } = useBackupJobDetail(jobId);

  useFormKeyboardSubmit({
    enabled: !loading && !saving && activeTab === 'settings',
    onSubmit: handleSave,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <div className="space-y-6">
      <JobHeader
        job={job}
        togglingJob={togglingJob}
        runningJob={runningJob}
        handleToggle={handleToggle}
        handleRunNow={handleRunNow}
      />

      <Tabs defaultValue="settings" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="history">
            History {runsTotal > 0 && `(${runsTotal})`}
          </TabsTrigger>
          <TabsTrigger value="audit">
            Audit Log {auditTotal > 0 && `(${auditTotal})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab
            form={form}
            updateForm={updateForm}
            error={error}
            saving={saving}
            handleSave={handleSave}
            handleDelete={handleDelete}
            deleting={deleting}
            destinations={destinations}
            notificationChannels={notificationChannels}
            destinationOptions={destinationOptions}
            handleDestinationChange={handleDestinationChange}
            toggleNotificationChannel={toggleNotificationChannel}
            isNotificationEnabled={isNotificationEnabled}
            checkAllNotifications={checkAllNotifications}
            uncheckAllNotifications={uncheckAllNotifications}
            allNotificationsChecked={allNotificationsChecked}
            scheduleDescription={scheduleDescription}
          />
        </TabsContent>

        <TabsContent value="files">
          <FilesTab
            selectedDestinationIds={form.selectedDestinationIds}
            destinations={destinations}
            destinationFiles={destinationFiles}
            currentPath={currentPath}
            filesLoading={filesLoading}
            expandedDestinations={expandedDestinations}
            loadDestinationFiles={loadDestinationFiles}
            navigateToFolder={navigateToFolder}
            navigateUp={navigateUp}
            navigateToRoot={navigateToRoot}
            getBreadcrumbs={getBreadcrumbs}
            toggleDestinationExpand={toggleDestinationExpand}
          />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab
            runs={runs}
            runsLoading={runsLoading}
            runsPage={runsPage}
            setRunsPage={setRunsPage}
            runsTotalPages={runsTotalPages}
            expandedRuns={expandedRuns}
            toggleRunExpand={toggleRunExpand}
            hasRunningJob={hasRunningJob}
            refreshProgress={refreshProgress}
            setSelectedError={setSelectedError}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab
            auditLog={auditLog}
            auditLoading={auditLoading}
            auditPage={auditPage}
            setAuditPage={setAuditPage}
            auditTotalPages={auditTotalPages}
            selectedAuditEntry={selectedAuditEntry}
            setSelectedAuditEntry={setSelectedAuditEntry}
          />
        </TabsContent>
      </Tabs>

      <ErrorLogDialog
        selectedError={selectedError}
        setSelectedError={setSelectedError}
      />
    </div>
  );
}
