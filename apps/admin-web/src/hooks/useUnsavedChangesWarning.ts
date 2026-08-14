import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export interface UseUnsavedChangesWarningOptions {
  /** Whether the form currently has unsaved changes */
  isDirty: boolean;
  /** Whether form submission is in progress (bypasses blocker to allow redirection) */
  isSubmitting?: boolean;
}

export interface UseUnsavedChangesWarningReturn {
  /** Whether navigation is currently blocked by unsaved changes */
  isBlocked: boolean;
  /** Proceed with the blocked navigation */
  proceed: () => void;
  /** Cancel the blocked navigation and stay on the current page */
  reset: () => void;
}

export function useUnsavedChangesWarning({
  isDirty,
  isSubmitting = false,
}: UseUnsavedChangesWarningOptions): UseUnsavedChangesWarningReturn {
  const shouldBlock = isDirty && !isSubmitting;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock &&
      currentLocation.pathname + currentLocation.search !==
        nextLocation.pathname + nextLocation.search,
  );

  useEffect(() => {
    if (!shouldBlock) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlock]);

  return {
    isBlocked: blocker.state === 'blocked',
    proceed: () => {
      if (blocker.state === 'blocked') {
        blocker.proceed();
      }
    },
    reset: () => {
      if (blocker.state === 'blocked') {
        blocker.reset();
      }
    },
  };
}
