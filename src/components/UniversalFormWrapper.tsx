import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppCache } from '@/contexts/AppCacheContext';

interface UniversalFormWrapperProps {
  children: React.ReactNode;
  formKey: string;
  pageKey?: string;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  preventRefresh?: boolean;
  onFormChange?: (hasChanges: boolean) => void;
  className?: string;
}

export function UniversalFormWrapper({
  children,
  formKey,
  pageKey,
  enableAutoSave = true,
  autoSaveInterval = 2000,
  preventRefresh = true,
  onFormChange,
  className = ''
}: UniversalFormWrapperProps) {
  const { savePageState, getPageState } = useAppCache();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const lastSaveTime = useRef<number>(0);
  const changeTimeoutRef = useRef<NodeJS.Timeout>();

  // Prevent page refresh when there are unsaved changes
  useEffect(() => {
    if (!preventRefresh) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
        // Save form state when tab becomes hidden
        saveFormState();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasUnsavedChanges, preventRefresh]);

  // Save form state
  const saveFormState = useCallback(() => {
    if (!formRef.current) return;

    try {
      const formData = extractFormData(formRef.current);
      const currentTime = Date.now();
      
      // Debounce saves to avoid too frequent saves
      if (currentTime - lastSaveTime.current < 1000) return;
      
      lastSaveTime.current = currentTime;
      
      // Save to page state
      const currentPageState = getPageState(pageKey || formKey) || {};
      savePageState(pageKey || formKey, {
        ...currentPageState,
        formData,
        formKey,
        lastSaved: currentTime,
        hasUnsavedChanges: false
      });
      
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
      onFormChange?.(false);
    } catch (error) {
      console.error('Error saving form state:', error);
    }
  }, [formKey, pageKey, getPageState, savePageState, onFormChange]);

  // Extract form data from DOM
  const extractFormData = useCallback((formElement: HTMLElement) => {
    const formData: any = {};
    
    // Get all form inputs
    const inputs = formElement.querySelectorAll('input, textarea, select');
    
    inputs.forEach((input) => {
      const element = input as HTMLInputElement;
      const name = element.name || element.id;
      
      if (name) {
        if (element.type === 'checkbox') {
          formData[name] = element.checked;
        } else if (element.type === 'radio') {
          if (element.checked) {
            formData[name] = element.value;
          }
        } else {
          formData[name] = element.value;
        }
      }
    });
    
    // Get scroll position
    formData._scrollPosition = window.scrollY;
    
    // Get active element
    if (document.activeElement) {
      formData._activeElement = document.activeElement.id || document.activeElement.className;
    }
    
    return formData;
  }, []);

  // Restore form data
  const restoreFormData = useCallback((formData: any) => {
    if (!formData || !formRef.current) return;

    try {
      // Restore form inputs
      Object.entries(formData).forEach(([key, value]) => {
        if (key.startsWith('_')) return; // Skip metadata
        
        const element = formRef.current?.querySelector(`[name="${key}"], #${key}`) as HTMLInputElement;
        if (element) {
          if (element.type === 'checkbox') {
            element.checked = Boolean(value);
          } else if (element.type === 'radio') {
            element.checked = element.value === value;
          } else {
            element.value = String(value);
          }
          
          // Trigger change event
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Restore scroll position
      if (formData._scrollPosition) {
        setTimeout(() => {
          window.scrollTo(0, formData._scrollPosition);
        }, 100);
      }
      
      // Restore active element
      if (formData._activeElement) {
        setTimeout(() => {
          const activeElement = document.querySelector(`#${formData._activeElement}`) || 
                               document.querySelector(`.${formData._activeElement}`);
          if (activeElement) {
            (activeElement as HTMLElement).focus();
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error restoring form data:', error);
    }
  }, []);

  // Load saved form data on mount
  useEffect(() => {
    const savedState = getPageState(pageKey || formKey);
    if (savedState?.formData) {
      restoreFormData(savedState.formData);
      setHasUnsavedChanges(savedState.hasUnsavedChanges || false);
      if (savedState.lastSaved) {
        setLastSaved(new Date(savedState.lastSaved));
      }
    }
  }, [formKey, pageKey, getPageState, restoreFormData]);

  // Auto-save effect
  useEffect(() => {
    if (!enableAutoSave) return;

    const interval = setInterval(() => {
      if (hasUnsavedChanges) {
        saveFormState();
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [enableAutoSave, autoSaveInterval, hasUnsavedChanges, saveFormState]);

  // Monitor form changes
  useEffect(() => {
    if (!formRef.current) return;

    const handleInputChange = () => {
      // Clear existing timeout
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
      
      // Set new timeout to debounce changes
      changeTimeoutRef.current = setTimeout(() => {
        setHasUnsavedChanges(true);
        onFormChange?.(true);
      }, 500);
    };

    const formElement = formRef.current;
    formElement.addEventListener('input', handleInputChange);
    formElement.addEventListener('change', handleInputChange);

    return () => {
      formElement.removeEventListener('input', handleInputChange);
      formElement.removeEventListener('change', handleInputChange);
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, [onFormChange]);

  // Handle form submission
  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    // Save form state before submission
    saveFormState();
  }, [saveFormState]);

  // Manual save function
  const manualSave = useCallback(() => {
    saveFormState();
  }, [saveFormState]);

  // Clear form data
  const clearFormData = useCallback(() => {
    try {
      const currentPageState = getPageState(pageKey || formKey) || {};
      delete currentPageState.formData;
      savePageState(pageKey || formKey, currentPageState);
      
      setHasUnsavedChanges(false);
      setLastSaved(null);
    } catch (error) {
      console.error('Error clearing form data:', error);
    }
  }, [formKey, pageKey, getPageState, savePageState]);

  return (
    <div 
      ref={formRef}
      className={`universal-form-wrapper ${className}`}
      onSubmit={handleFormSubmit}
    >
      {children}
      
      {/* Status indicator (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs z-50">
          <div>Form: {formKey}</div>
          <div>Page: {pageKey || formKey}</div>
          <div>Unsaved: {hasUnsavedChanges ? 'Yes' : 'No'}</div>
          <div>Auto-save: {enableAutoSave ? 'On' : 'Off'}</div>
          {lastSaved && (
            <div>Last saved: {lastSaved.toLocaleTimeString()}</div>
          )}
          <div className="mt-2 space-x-1">
            <button 
              onClick={manualSave}
              className="bg-blue-500 px-2 py-1 rounded text-xs"
            >
              Save Now
            </button>
            <button 
              onClick={clearFormData}
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

// Higher-order component for easy form wrapping
export function withUniversalFormPersistence<P extends object>(
  Component: React.ComponentType<P>,
  formKey: string,
  options?: Omit<UniversalFormWrapperProps, 'children' | 'formKey'>
) {
  return function UniversalFormPersistenceComponent(props: P) {
    return (
      <UniversalFormWrapper formKey={formKey} {...options}>
        <Component {...props} />
      </UniversalFormWrapper>
    );
  };
}

// Hook for form state management
export function useUniversalFormPersistence(formKey: string, pageKey?: string) {
  const { savePageState, getPageState } = useAppCache();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveState = useCallback((formData: any) => {
    try {
      const currentPageState = getPageState(pageKey || formKey) || {};
      savePageState(pageKey || formKey, {
        ...currentPageState,
        formData,
        formKey,
        lastSaved: Date.now(),
        hasUnsavedChanges: false
      });
      
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving form state:', error);
    }
  }, [formKey, pageKey, getPageState, savePageState]);

  const getState = useCallback(() => {
    const savedState = getPageState(pageKey || formKey);
    return savedState?.formData || null;
  }, [formKey, pageKey, getPageState]);

  const clearState = useCallback(() => {
    try {
      const currentPageState = getPageState(pageKey || formKey) || {};
      delete currentPageState.formData;
      savePageState(pageKey || formKey, currentPageState);
      
      setHasUnsavedChanges(false);
      setLastSaved(null);
    } catch (error) {
      console.error('Error clearing form state:', error);
    }
  }, [formKey, pageKey, getPageState, savePageState]);

  return {
    saveState,
    getState,
    clearState,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    lastSaved
  };
}
