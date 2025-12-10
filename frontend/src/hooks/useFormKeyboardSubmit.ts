import { useEffect, useCallback } from 'react';

interface UseFormKeyboardSubmitOptions {
  /** Whether the keyboard shortcut is enabled */
  enabled?: boolean;
  /** Callback to execute on Ctrl/Cmd+S */
  onSubmit: () => void;
}

/**
 * Hook that enables Ctrl+S / Cmd+S keyboard shortcut to submit a form.
 * Prevents the default browser save behavior.
 *
 * @example
 * ```tsx
 * useFormKeyboardSubmit({
 *   enabled: !saving,
 *   onSubmit: handleSubmit,
 * });
 * ```
 */
export function useFormKeyboardSubmit({
  enabled = true,
  onSubmit,
}: UseFormKeyboardSubmitOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

      if (isCtrlOrCmd && event.key === 's') {
        event.preventDefault();
        onSubmit();
      }
    },
    [enabled, onSubmit]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
