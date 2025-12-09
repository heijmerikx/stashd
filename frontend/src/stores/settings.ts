import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  recentBackupsLimit: number;
  setRecentBackupsLimit: (limit: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      recentBackupsLimit: 10,
      setRecentBackupsLimit: (limit) => set({ recentBackupsLimit: limit }),
    }),
    {
      name: 'stashd-settings',
    }
  )
);
