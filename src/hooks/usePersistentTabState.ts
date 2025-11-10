import { useState, useEffect, useCallback } from 'react';
import { useAppCache } from '@/contexts/AppCacheContext';

export interface UsePersistentTabStateOptions {
  /**
   * The page key to use for storing tab state
   */
  pageKey: string;
  
  /**
   * The default tab value if no saved state exists
   */
  defaultValue: string;
  
  /**
   * Whether to persist tab state across sessions
   * @default true
   */
  persist?: boolean;
  
  /**
   * Custom storage key (defaults to `${pageKey}_activeTab`)
   */
  storageKey?: string;
}

/**
 * Hook for persisting active tab state across page refreshes and tab switches.
 * 
 * Usage:
 * ```tsx
 * const { activeTab, setActiveTab } = usePersistentTabState({
 *   pageKey: 'orders',
 *   defaultValue: 'list'
 * });
 * ```
 */
export function usePersistentTabState(options: UsePersistentTabStateOptions) {
  const {
    pageKey,
    defaultValue,
    persist = true,
    storageKey
  } = options;

  const { savePageState, getPageState } = useAppCache();
  const tabStateKey = storageKey || `${pageKey}_activeTab`;

  // Initialize state from cache or use default
  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (!persist) return defaultValue;

    // Try to get from page state
    const pageState = getPageState(pageKey);
    if (pageState?.activeTab) {
      return pageState.activeTab;
    }

    // Try to get from localStorage as fallback
    try {
      const saved = localStorage.getItem(tabStateKey);
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Error reading tab state from localStorage:', error);
    }

    return defaultValue;
  });

  // Save tab state whenever it changes
  useEffect(() => {
    if (!persist) return;

    try {
      // Save to page state
      const currentPageState = getPageState(pageKey) || {};
      savePageState(pageKey, {
        ...currentPageState,
        activeTab
      });

      // Also save to localStorage as backup
      localStorage.setItem(tabStateKey, activeTab);
    } catch (error) {
      console.error('Error saving tab state:', error);
    }
  }, [activeTab, pageKey, tabStateKey, persist, savePageState, getPageState]);

  // Setter function that updates both state and cache
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
  }, []);

  return {
    activeTab,
    setActiveTab
  };
}

