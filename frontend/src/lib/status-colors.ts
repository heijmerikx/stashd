// Status color constants for consistent styling across the app

export const statusColors = {
  // Job/run completed successfully
  completed: 'bg-emerald-500',
  healthy: 'bg-emerald-500',

  // Job/run currently in progress
  running: 'bg-violet-500',
  runningPing: 'bg-violet-400',

  // Job/run failed - needs attention
  failed: 'bg-red-500',
  attention: 'bg-red-500',

  // Partial success
  partial: 'bg-amber-500',

  // Inactive states
  disabled: 'bg-muted-foreground/40',
  neverRun: 'bg-muted-foreground/60',
  inactive: 'bg-muted-foreground/50',
  unknown: 'bg-muted-foreground/40',
} as const;

export type StatusColorKey = keyof typeof statusColors;
