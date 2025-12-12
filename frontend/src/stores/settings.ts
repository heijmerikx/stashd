import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  recentBackupsLimit: number;
  setRecentBackupsLimit: (limit: number) => void;
  backupJobsPageSize: number;
  setBackupJobsPageSize: (size: number) => void;
  destinationsPageSize: number;
  setDestinationsPageSize: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      recentBackupsLimit: 10,
      setRecentBackupsLimit: (limit) => set({ recentBackupsLimit: limit }),
      backupJobsPageSize: 10,
      setBackupJobsPageSize: (size) => set({ backupJobsPageSize: size }),
      destinationsPageSize: 10,
      setDestinationsPageSize: (size) => set({ destinationsPageSize: size }),
    }),
    {
      name: 'stashd-settings',
    }
  )
);
