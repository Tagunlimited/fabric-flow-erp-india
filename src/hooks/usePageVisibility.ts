import React, { useEffect, useRef, useCallback, useState } from 'react';

export interface VisibilityCallbacks {
  onVisible?: () => void;
  onHidden?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onBeforeUnload?: (e: BeforeUnloadEvent) => void;
}

export interface UsePageVisibilityOptions {
  /**
   * Enable/disable the visibility manager
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Throttle interval for visibility change events (ms)
   * @default 100
   */
  throttleMs?: number;
  
  /**
   * Whether to prevent data refetching on visibility change
   * @default true
   */
  preventAutoRefresh?: boolean;
  
  /**
   * Callbacks for visibility events
   */
  callbacks?: VisibilityCallbacks;
}

/**
 * Centralized page visibility manager that handles all visibility, focus, and beforeunload events
 * with throttling and prevents unwanted auto-refreshes.
 * 
 * Components should use this hook instead of directly adding event listeners.
 */
export function usePageVisibility(options: UsePageVisibilityOptions = {}) {
  const {
    enabled = true,
    throttleMs = 100,
    preventAutoRefresh = true,
    callbacks = {}
  } = options;

  const lastVisibilityChange = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(document.visibilityState === 'visible');
  const hasFocusRef = useRef<boolean>(document.hasFocus());

  // Throttled visibility change handler
  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastVisibilityChange.current < throttleMs) {
      return; // Throttle
    }
    lastVisibilityChange.current = now;

    const wasVisible = isVisibleRef.current;
    const isVisible = document.visibilityState === 'visible';
    isVisibleRef.current = isVisible;

    // Only trigger callbacks if state actually changed
    if (wasVisible !== isVisible) {
      if (isVisible && callbacks.onVisible) {
        // Only call onVisible if preventAutoRefresh is false
        // This prevents unwanted data refreshes when tab becomes visible
        if (!preventAutoRefresh) {
          callbacks.onVisible();
        }
      } else if (!isVisible && callbacks.onHidden) {
        callbacks.onHidden();
      }
    }
  }, [enabled, throttleMs, preventAutoRefresh, callbacks]);

  // Focus handler
  const handleFocus = useCallback(() => {
    if (!enabled) return;

    const hadFocus = hasFocusRef.current;
    hasFocusRef.current = true;

    // Only trigger if we didn't have focus before
    if (!hadFocus && callbacks.onFocus) {
      // Only call onFocus if preventAutoRefresh is false
      // This prevents unwanted data refreshes when window regains focus
      if (!preventAutoRefresh) {
        callbacks.onFocus();
      }
    }
  }, [enabled, preventAutoRefresh, callbacks]);

  // Blur handler
  const handleBlur = useCallback(() => {
    if (!enabled) return;

    hasFocusRef.current = false;
    if (callbacks.onBlur) {
      callbacks.onBlur();
    }
  }, [enabled, callbacks]);

  // Before unload handler
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!enabled) return;

    if (callbacks.onBeforeUnload) {
      callbacks.onBeforeUnload(e);
    }
  }, [enabled, callbacks]);

  // Set up event listeners
  useEffect(() => {
    if (!enabled) return;

    // Initialize refs
    isVisibleRef.current = document.visibilityState === 'visible';
    hasFocusRef.current = document.hasFocus();

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, handleVisibilityChange, handleFocus, handleBlur, handleBeforeUnload]);

  return {
    isVisible: isVisibleRef.current,
    hasFocus: hasFocusRef.current,
    visibilityState: document.visibilityState
  };
}

/**
 * Hook for components that only need to know visibility state without callbacks
 */
export function useVisibilityState() {
  const [isVisible, setIsVisible] = useState(() => 
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );
  const [hasFocus, setHasFocus] = useState(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    const handleFocus = () => setHasFocus(true);
    const handleBlur = () => setHasFocus(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return { isVisible, hasFocus };
}

