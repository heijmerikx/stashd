// Runtime configuration helper
// In production (Docker), config is injected at container startup via /config.js
// In development, falls back to defaults

interface AppConfig {
  API_URL: string;
}

declare global {
  interface Window {
    APP_CONFIG?: Partial<AppConfig>;
  }
}

const defaults: AppConfig = {
  API_URL: 'http://localhost:8080/api', // Development default
};

export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  // Check runtime config (Docker/production)
  if (typeof window !== 'undefined' && window.APP_CONFIG?.[key]) {
    return window.APP_CONFIG[key] as AppConfig[K];
  }

  // Return default (development)
  return defaults[key];
}
