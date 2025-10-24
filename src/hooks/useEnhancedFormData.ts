import { useState, useEffect, useCallback } from 'react';
import { useAppCache } from '@/contexts/AppCacheContext';

// Enhanced form persistence hook that integrates with the new caching system
export function useEnhancedFormData<T = any>(
  formKey: string, 
  initialData?: T,
  options: {
    autoSave?: boolean;
    saveInterval?: number;
    ttl?: number;
    persistToStorage?: boolean;
  } = {}
) {
  const { 
    setCache, 
    getCache, 
    persistData, 
    getPersistedData,
    savePageState,
    getPageState 
  } = useAppCache();
  
  const {
    autoSave = true,
    saveInterval = 2000, // 2 seconds
    ttl = 24 * 60 * 60 * 1000, // 24 hours
    persistToStorage = true
  } = options;

  const [data, setData] = useState<T>(() => {
    // Try to get from memory cache first
    const cachedData = getCache<T>(`form_${formKey}`);
    if (cachedData) return cachedData;

    // Try to get from page state
    const pageState = getPageState(formKey);
    if (pageState?.formData) return pageState.formData;

    // Try to get from persistent storage
    if (persistToStorage) {
      const persistedData = getPersistedData<T>(`form_${formKey}`);
      if (persistedData) return persistedData;
    }

    return initialData || ({} as T);
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Auto-save effect
  useEffect(() => {
    if (!autoSave || !isLoaded) return;

    const timeoutId = setTimeout(() => {
      saveFormData(data);
    }, saveInterval);

    return () => clearTimeout(timeoutId);
  }, [data, autoSave, saveInterval, isLoaded]);

  // Load form data on mount
  useEffect(() => {
    const loadFormData = async () => {
      try {
        // Try memory cache first
        let savedData = getCache<T>(`form_${formKey}`);
        
        if (!savedData) {
          // Try page state
          const pageState = getPageState(formKey);
          savedData = pageState?.formData;
        }
        
        if (!savedData && persistToStorage) {
          // Try persistent storage
          savedData = getPersistedData<T>(`form_${formKey}`);
        }
        
        if (savedData) {
          setData(savedData);
          setLastSaved(new Date());
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadFormData();
  }, [formKey, getCache, getPageState, getPersistedData, persistToStorage]);

  // Save form data function
  const saveFormData = useCallback((formData: T) => {
    try {
      // Save to memory cache
      setCache(`form_${formKey}`, formData, { ttl });
      
      // Save to page state
      const currentPageState = getPageState(formKey) || {};
      savePageState(formKey, {
        ...currentPageState,
        formData,
        lastSaved: Date.now()
      });
      
      // Save to persistent storage if enabled
      if (persistToStorage) {
        persistData(`form_${formKey}`, formData);
      }
      
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving form data:', error);
    }
  }, [formKey, setCache, getPageState, savePageState, persistData, persistToStorage, ttl]);

  // Update form data
  const updateData = useCallback((newData: T | ((prev: T) => T)) => {
    try {
      const updatedData = typeof newData === 'function' 
        ? (newData as Function)(data) 
        : newData;
      
      setData(updatedData);
      setHasUnsavedChanges(true);
      
      // Immediate save for critical changes
      if (typeof newData === 'object' && newData !== null) {
        const criticalFields = ['id', 'status', 'customer_id', 'order_id'];
        const hasCriticalChange = criticalFields.some(field => 
          (newData as any)[field] !== (data as any)[field]
        );
        
        if (hasCriticalChange) {
          saveFormData(updatedData);
        }
      }
    } catch (error) {
      console.error('Error updating form data:', error);
      // Fallback to basic state update
      setData(typeof newData === 'function' ? (newData as Function)(data) : newData);
    }
  }, [data, saveFormData]);

  // Reset form data
  const resetData = useCallback(() => {
    setData(initialData || ({} as T));
    setHasUnsavedChanges(false);
    setLastSaved(null);
    
    // Clear from all caches
    try {
      // Clear from memory cache
      // Note: You might want to add a removeCache method to AppCacheContext
      
      // Clear from page state
      const currentPageState = getPageState(formKey) || {};
      delete currentPageState.formData;
      savePageState(formKey, currentPageState);
      
      // Clear from persistent storage
      if (persistToStorage) {
        // Note: You might want to add a removePersistedData method to AppCacheContext
      }
    } catch (error) {
      console.error('Error clearing form data:', error);
    }
  }, [formKey, initialData, getPageState, savePageState, persistToStorage]);

  // Manual save
  const save = useCallback(() => {
    saveFormData(data);
  }, [data, saveFormData]);

  // Check if form has saved data
  const hasSavedData = useCallback(() => {
    return !!(
      getCache(`form_${formKey}`) ||
      getPageState(formKey)?.formData ||
      (persistToStorage && getPersistedData(`form_${formKey}`))
    );
  }, [formKey, getCache, getPageState, getPersistedData, persistToStorage]);

  return {
    data,
    updateData,
    resetData,
    save,
    isLoaded,
    hasUnsavedChanges,
    hasSavedData: hasSavedData(),
    lastSaved
  };
}

// Enhanced form wrapper component
export function EnhancedFormWrapper<T = any>({
  children,
  formKey,
  initialData,
  options = {}
}: {
  children: (formProps: {
    data: T;
    updateData: (newData: T | ((prev: T) => T)) => void;
    resetData: () => void;
    save: () => void;
    isLoaded: boolean;
    hasUnsavedChanges: boolean;
    hasSavedData: boolean;
    lastSaved: Date | null;
  }) => React.ReactNode;
  formKey: string;
  initialData?: T;
  options?: {
    autoSave?: boolean;
    saveInterval?: number;
    ttl?: number;
    persistToStorage?: boolean;
  };
}) {
  const formProps = useEnhancedFormData(formKey, initialData, options);
  
  return (
    <div className="enhanced-form-wrapper">
      {children(formProps)}
    </div>
  );
}

// Hook for form field persistence
export function useFormField<T = any>(
  formKey: string,
  fieldName: string,
  defaultValue?: T
) {
  const { data, updateData } = useEnhancedFormData(formKey);
  
  const fieldValue = (data as any)?.[fieldName] ?? defaultValue;
  
  const setFieldValue = useCallback((value: T) => {
    updateData((prev: any) => ({
      ...prev,
      [fieldName]: value
    }));
  }, [fieldName, updateData]);
  
  return [fieldValue, setFieldValue] as const;
}

// Hook for form validation state persistence
export function useFormValidation(formKey: string) {
  const { data, updateData } = useEnhancedFormData(formKey);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
  const setFieldError = useCallback((fieldName: string, error: string) => {
    setErrors(prev => ({
      ...prev,
      [fieldName]: error
    }));
  }, []);
  
  const setFieldTouched = useCallback((fieldName: string, isTouched: boolean = true) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: isTouched
    }));
  }, []);
  
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);
  
  const clearFieldError = useCallback((fieldName: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);
  
  const isValid = Object.keys(errors).length === 0;
  
  return {
    errors,
    touched,
    setFieldError,
    setFieldTouched,
    clearErrors,
    clearFieldError,
    isValid
  };
}
