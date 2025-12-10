// Runtime configuration helper
// In production (Docker), config is injected at container startup via /config.js
// In development, falls back to Vite's import.meta.env

interface AppConfig {
  API_URL: string;
}

declare global {
  interface Window {
    APP_CONFIG?: Partial<AppConfig>;
  }
}

const defaults: AppConfig = {
  API_URL: 'http://localhost:8080/api',
};

export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  // 1. Check runtime config (Docker)
  if (typeof window !== 'undefined' && window.APP_CONFIG?.[key]) {
    return window.APP_CONFIG[key] as AppConfig[K];
  }

  // 2. Check Vite env vars (development)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envKey = `VITE_${key}`;
    const envValue = import.meta.env[envKey];
    if (envValue) {
      return envValue as AppConfig[K];
    }
  }

  // 3. Return default
  return defaults[key];
}

// Convenience export for API URL
export const API_URL = getConfig('API_URL');
