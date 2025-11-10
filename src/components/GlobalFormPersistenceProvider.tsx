import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppCache } from '@/contexts/AppCacheContext';
import { usePageVisibility } from '@/hooks/usePageVisibility';

interface GlobalFormPersistenceProviderProps {
  children: React.ReactNode;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  preventRefresh?: boolean;
}

export function GlobalFormPersistenceProvider({
  children,
  enableAutoSave = true,
  autoSaveInterval = 3000,
  preventRefresh = true
}: GlobalFormPersistenceProviderProps) {
  const { savePageState, getPageState } = useAppCache();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeForms, setActiveForms] = useState<Set<string>>(new Set());
  const lastSaveTime = useRef<number>(0);
  const changeTimeoutRef = useRef<NodeJS.Timeout>();

  // Use centralized visibility manager - only save on hidden, never refresh on visible
  usePageVisibility({
    enabled: preventRefresh,
    preventAutoRefresh: true, // Prevent any auto-refresh behavior
    callbacks: {
      onHidden: () => {
        // Only save when tab becomes hidden, never trigger refresh
        if (hasUnsavedChanges) {
          saveAllFormStates();
        }
      },
      onBeforeUnload: (e: BeforeUnloadEvent) => {
        if (hasUnsavedChanges) {
          e.preventDefault();
          e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
          return e.returnValue;
        }
      }
    }
  });

  // Save all form states
  const saveAllFormStates = useCallback(() => {
    try {
      const currentTime = Date.now();
      
      // Debounce saves to avoid too frequent saves
      if (currentTime - lastSaveTime.current < 1000) return;
      
      lastSaveTime.current = currentTime;
      
      // Find all forms on the page
      const forms = document.querySelectorAll('form, [data-form-key]');
      
      forms.forEach((form) => {
        const formKey = form.getAttribute('data-form-key') || 'global-form';
        const formData = extractFormData(form as HTMLElement);
        
        if (Object.keys(formData).length > 0) {
          // Save to page state
          const currentPageState = getPageState(formKey) || {};
          savePageState(formKey, {
            ...currentPageState,
            formData,
            formKey,
            lastSaved: currentTime,
            hasUnsavedChanges: false
          });
        }
      });
      
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving form states:', error);
    }
  }, [getPageState, savePageState]);

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
    
    return formData;
  }, []);

  // Restore form data
  const restoreFormData = useCallback((formKey: string, formData: any) => {
    try {
      // Find the form by data-form-key or use the first form
      const form = document.querySelector(`[data-form-key="${formKey}"]`) || 
                   document.querySelector('form');
      
      if (!form || !formData) return;

      // Restore form inputs
      Object.entries(formData).forEach(([key, value]) => {
        if (key.startsWith('_')) return; // Skip metadata
        
        const element = form.querySelector(`[name="${key}"], #${key}`) as HTMLInputElement;
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
    } catch (error) {
      console.error('Error restoring form data:', error);
    }
  }, []);

  // Auto-save effect
  useEffect(() => {
    if (!enableAutoSave) return;

    const interval = setInterval(() => {
      if (hasUnsavedChanges) {
        saveAllFormStates();
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [enableAutoSave, autoSaveInterval, hasUnsavedChanges, saveAllFormStates]);

  // Monitor form changes globally
  useEffect(() => {
    const handleInputChange = () => {
      // Clear existing timeout
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
      
      // Set new timeout to debounce changes
      changeTimeoutRef.current = setTimeout(() => {
        setHasUnsavedChanges(true);
      }, 500);
    };

    // Add event listeners to all forms
    const forms = document.querySelectorAll('form, [data-form-key]');
    forms.forEach((form) => {
      form.addEventListener('input', handleInputChange);
      form.addEventListener('change', handleInputChange);
    });

    return () => {
      forms.forEach((form) => {
        form.removeEventListener('input', handleInputChange);
        form.removeEventListener('change', handleInputChange);
      });
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  // Restore all form states on mount
  useEffect(() => {
    const restoreAllFormStates = () => {
      // Find all forms and restore their data
      const forms = document.querySelectorAll('form, [data-form-key]');
      
      forms.forEach((form) => {
        const formKey = form.getAttribute('data-form-key') || 'global-form';
        const savedState = getPageState(formKey);
        
        if (savedState?.formData) {
          restoreFormData(formKey, savedState.formData);
        }
      });
    };

    // Restore after a short delay to ensure forms are rendered
    const timeoutId = setTimeout(restoreAllFormStates, 100);
    
    return () => clearTimeout(timeoutId);
  }, [getPageState, restoreFormData]);

  return (
    <div className="global-form-persistence-provider">
      {children}
      
    </div>
  );
}

// Hook for global form persistence
export function useGlobalFormPersistence() {
  const { savePageState, getPageState } = useAppCache();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveAllForms = useCallback(() => {
    try {
      const forms = document.querySelectorAll('form, [data-form-key]');
      
      forms.forEach((form) => {
        const formKey = form.getAttribute('data-form-key') || 'global-form';
        const formData = extractFormData(form as HTMLElement);
        
        if (Object.keys(formData).length > 0) {
          const currentPageState = getPageState(formKey) || {};
          savePageState(formKey, {
            ...currentPageState,
            formData,
            formKey,
            lastSaved: Date.now(),
            hasUnsavedChanges: false
          });
        }
      });
      
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving all forms:', error);
    }
  }, [getPageState, savePageState]);

  const extractFormData = useCallback((formElement: HTMLElement) => {
    const formData: any = {};
    
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
    
    return formData;
  }, []);

  const clearAllForms = useCallback(() => {
    try {
      const forms = document.querySelectorAll('form, [data-form-key]');
      
      forms.forEach((form) => {
        const formKey = form.getAttribute('data-form-key') || 'global-form';
        const currentPageState = getPageState(formKey) || {};
        delete currentPageState.formData;
        savePageState(formKey, currentPageState);
      });
      
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error clearing all forms:', error);
    }
  }, [getPageState, savePageState]);

  return {
    saveAllForms,
    clearAllForms,
    hasUnsavedChanges,
    setHasUnsavedChanges
  };
}
