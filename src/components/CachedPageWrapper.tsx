import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppCache } from '@/contexts/AppCacheContext';
import { useServiceWorker } from '@/utils/serviceWorker';

interface CachedPageWrapperProps {
  children: React.ReactNode;
  pageKey?: string;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  cacheConfig?: {
    ttl?: number;
    persistToStorage?: boolean;
  };
}

export function CachedPageWrapper({
  children,
  pageKey,
  enableAutoSave = true,
  autoSaveInterval = 30000, // 30 seconds
  cacheConfig = {}
}: CachedPageWrapperProps) {
  const location = useLocation();
  const { savePageState, getPageState, setCache, getCache } = useAppCache();
  const { isOnline, swManager } = useServiceWorker();
  
  const currentPageKey = pageKey || location.pathname;
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const [lastSavedState, setLastSavedState] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Save page state periodically
  useEffect(() => {
    if (!enableAutoSave) return;

    const saveState = () => {
      if (isSaving) return;

      setIsSaving(true);
      
      // Get current page state from DOM or component state
      const currentState = getCurrentPageState();
      
      if (currentState && JSON.stringify(currentState) !== JSON.stringify(lastSavedState)) {
        try {
          // Save to cache
          setCache(`page_state_${currentPageKey}`, currentState, cacheConfig);
          
          // Save to page state
          savePageState(currentPageKey, currentState);
          
          // Save to service worker cache if online
          if (isOnline) {
            swManager.cacheData(`/api/page-state/${currentPageKey}`, currentState);
          }
          
          setLastSavedState(currentState);
        } catch (error) {
          console.error('Error saving page state:', error);
        }
      }
      
      setIsSaving(false);
    };

    // Initial save
    saveState();

    // Set up auto-save interval
    autoSaveTimeoutRef.current = setInterval(saveState, autoSaveInterval);

    // Save on page unload
    const handleBeforeUnload = () => {
      saveState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearInterval(autoSaveTimeoutRef.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveState(); // Final save
    };
  }, [
    currentPageKey,
    enableAutoSave,
    autoSaveInterval,
    cacheConfig,
    isOnline,
    lastSavedState,
    isSaving,
    setCache,
    savePageState,
    swManager
  ]);

  // Restore page state on mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        // Try to get from cache first
        let savedState = getCache(`page_state_${currentPageKey}`);
        
        if (!savedState) {
          // Try to get from page state
          savedState = getPageState(currentPageKey);
        }
        
        if (savedState) {
          restorePageState(savedState);
          setLastSavedState(savedState);
        }
      } catch (error) {
        console.error('Error restoring page state:', error);
      }
    };

    restoreState();
  }, [currentPageKey, getCache, getPageState]);

  // Handle online/offline state changes
  useEffect(() => {
    if (isOnline && lastSavedState) {
      // Sync any pending changes when coming back online
      try {
        swManager.cacheData(`/api/page-state/${currentPageKey}`, lastSavedState);
      } catch (error) {
        console.error('Error syncing state on reconnect:', error);
      }
    }
  }, [isOnline, lastSavedState, currentPageKey, swManager]);

  // Get current page state from DOM
  const getCurrentPageState = () => {
    try {
      // This is a generic implementation - you can customize this
      // based on your specific page needs
      const state: any = {
        scrollPosition: window.scrollY,
        timestamp: Date.now(),
        url: location.pathname + location.search
      };

      // Try to get form data
      const forms = document.querySelectorAll('form');
      if (forms.length > 0) {
        state.formData = {};
        forms.forEach((form, index) => {
          const formData = new FormData(form);
          const formObject: any = {};
          for (const [key, value] of formData.entries()) {
            formObject[key] = value;
          }
          state.formData[`form_${index}`] = formObject;
        });
      }

      // Try to get input values
      const inputs = document.querySelectorAll('input, textarea, select');
      if (inputs.length > 0) {
        state.inputData = {};
        inputs.forEach((input) => {
          const element = input as HTMLInputElement;
          if (element.name || element.id) {
            const key = element.name || element.id;
            state.inputData[key] = element.value;
          }
        });
      }

      return state;
    } catch (error) {
      console.error('Error getting current page state:', error);
      return null;
    }
  };

  // Restore page state
  const restorePageState = (state: any) => {
    try {
      // Restore scroll position
      if (state.scrollPosition) {
        setTimeout(() => {
          window.scrollTo(0, state.scrollPosition);
        }, 100);
      }

      // Restore form data
      if (state.formData) {
        Object.entries(state.formData).forEach(([formKey, formData]: [string, any]) => {
          const formIndex = parseInt(formKey.replace('form_', ''));
          const form = document.querySelectorAll('form')[formIndex];
          if (form) {
            Object.entries(formData).forEach(([key, value]) => {
              const input = form.querySelector(`[name="${key}"]`) as HTMLInputElement;
              if (input) {
                input.value = value as string;
                // Trigger change event
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
          }
        });
      }

      // Restore input data
      if (state.inputData) {
        Object.entries(state.inputData).forEach(([key, value]) => {
          const input = document.querySelector(`[name="${key}"], #${key}`) as HTMLInputElement;
          if (input) {
            input.value = value as string;
            // Trigger change event
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    } catch (error) {
      console.error('Error restoring page state:', error);
    }
  };

  // Manual save function
  const saveCurrentState = () => {
    const currentState = getCurrentPageState();
    if (currentState) {
      setCache(`page_state_${currentPageKey}`, currentState, cacheConfig);
      savePageState(currentPageKey, currentState);
      setLastSavedState(currentState);
    }
  };

  // Manual restore function
  const restoreCurrentState = () => {
    const savedState = getCache(`page_state_${currentPageKey}`) || getPageState(currentPageKey);
    if (savedState) {
      restorePageState(savedState);
      setLastSavedState(savedState);
    }
  };

  // Clear saved state
  const clearSavedState = () => {
    setLastSavedState(null);
    // Clear from cache
    // Note: You might want to add a clearPageState method to AppCacheContext
  };

  return (
    <div className="cached-page-wrapper">
      {children}
      
      {/* Debug panel (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Page: {currentPageKey}</div>
          <div>Status: {isOnline ? 'Online' : 'Offline'}</div>
          <div>Saving: {isSaving ? 'Yes' : 'No'}</div>
          <div>Last Saved: {lastSavedState ? 'Yes' : 'No'}</div>
          <div className="mt-2 space-x-1">
            <button 
              onClick={saveCurrentState}
              className="bg-blue-500 px-2 py-1 rounded text-xs"
            >
              Save
            </button>
            <button 
              onClick={restoreCurrentState}
              className="bg-green-500 px-2 py-1 rounded text-xs"
            >
              Restore
            </button>
            <button 
              onClick={clearSavedState}
              className="bg-red-500 px-2 py-1 rounded text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Higher-order component for easy page wrapping
export function withPageCaching<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<CachedPageWrapperProps, 'children'>
) {
  return function CachedComponent(props: P) {
    return (
      <CachedPageWrapper {...options}>
        <Component {...props} />
      </CachedPageWrapper>
    );
  };
}

// Hook for page-specific caching
export function usePageCaching(pageKey?: string) {
  const location = useLocation();
  const currentPageKey = pageKey || location.pathname;
  const { savePageState, getPageState, setCache, getCache } = useAppCache();
  const [isSaving, setIsSaving] = useState(false);

  const saveState = async (state: any) => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      setCache(`page_state_${currentPageKey}`, state);
      savePageState(currentPageKey, state);
    } catch (error) {
      console.error('Error saving state:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getState = () => {
    return getCache(`page_state_${currentPageKey}`) || getPageState(currentPageKey);
  };

  const clearState = () => {
    // Clear from cache
    // Note: You might want to add a clearPageState method to AppCacheContext
  };

  return {
    saveState,
    getState,
    clearState,
    isSaving,
    pageKey: currentPageKey
  };
}
