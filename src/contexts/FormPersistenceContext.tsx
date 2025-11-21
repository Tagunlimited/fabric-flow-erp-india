import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

interface FormData {
  [key: string]: any;
}

interface FormPersistenceContextType {
  saveFormData: (formKey: string, data: any) => void;
  getFormData: (formKey: string) => any;
  clearFormData: (formKey: string) => void;
  clearAllFormData: () => void;
  hasFormData: (formKey: string) => boolean;
  setIsNavigating: (navigating: boolean) => void;
}

const FormPersistenceContext = createContext<FormPersistenceContextType | undefined>(undefined);

interface FormPersistenceProviderProps {
  children: ReactNode;
}

export function FormPersistenceProvider({ children }: FormPersistenceProviderProps) {
  const [formData, setFormData] = useState<FormData>({});
  const [isNavigating, setIsNavigating] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load saved form data from localStorage on mount - run ONLY once
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('formPersistence');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setFormData(parsedData);
      }
    } catch (error) {
      console.error('Error loading form data from localStorage:', error);
    } finally {
      setIsInitialized(true); // Mark as initialized
    }
  }, []); // EMPTY dependency array - crucial!

  // Add storage event listener for tab synchronization
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'formPersistence' && event.newValue) {
        try {
          const newData = JSON.parse(event.newValue);
          setFormData(newData);
        } catch (error) {
          console.error('Error parsing storage event data:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save form data to localStorage whenever it changes (debounced)
  // Update the save effect to respect initialization
  useEffect(() => {
    if (!isInitialized || isNavigating) return; // Don't save during navigation or before initialization
    
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('formPersistence', JSON.stringify(formData));
      } catch (error) {
        console.error('Error saving form data to localStorage:', error);
      }
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timeoutId);
  }, [formData, isInitialized, isNavigating]);

  const saveFormData = useCallback((formKey: string, data: any) => {
    setFormData(prev => ({
      ...prev,
      [formKey]: {
        data,
        timestamp: Date.now()
      }
    }));
  }, []);

  const clearFormDataRef = useCallback((formKey: string) => {
    setFormData(prev => {
      const newData = { ...prev };
      delete newData[formKey];
      return newData;
    });
  }, []);

  const getFormData = useCallback((formKey: string) => {
    const savedData = formData[formKey];
    if (savedData && savedData.data) {
      // Check if data is not too old (24 hours)
      const isExpired = Date.now() - savedData.timestamp > 24 * 60 * 60 * 1000;
      if (isExpired) {
        clearFormDataRef(formKey);
        return null;
      }
      return savedData.data;
    }
    return null;
  }, [formData, clearFormDataRef]);

  const clearFormData = clearFormDataRef;

  const clearAllFormData = useCallback(() => {
    setFormData({});
  }, []);

  const hasFormData = useCallback((formKey: string) => {
    const savedData = formData[formKey];
    if (savedData && savedData.data) {
      const isExpired = Date.now() - savedData.timestamp > 24 * 60 * 60 * 1000;
      return !isExpired;
    }
    return false;
  }, [formData]);

  const value: FormPersistenceContextType = {
    saveFormData,
    getFormData,
    clearFormData,
    clearAllFormData,
    hasFormData,
    setIsNavigating
  };

  return (
    <FormPersistenceContext.Provider value={value}>
      {children}
    </FormPersistenceContext.Provider>
  );
}

export function useFormPersistence() {
  const context = useContext(FormPersistenceContext);
  if (context === undefined) {
    throw new Error('useFormPersistence must be used within a FormPersistenceProvider');
  }
  return context;
}

// Custom hook for specific form management
export function useFormData<T>(formKey: string, initialData?: T) {
  const { saveFormData, getFormData, clearFormData, hasFormData } = useFormPersistence();
  
  const [data, setData] = useState<T>(() => {
    const savedData = getFormData(formKey);
    return savedData || initialData || ({} as T);
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldSave, setShouldSave] = useState(false);
  const dataToSaveRef = useRef<T | null>(null);

  // Fix the initialization effect to prevent infinite loops
  useEffect(() => {
    const savedData = getFormData(formKey);
    if (savedData && !isLoaded) { // CRITICAL: Check isLoaded
      setData(savedData);
    }
    setIsLoaded(true);
  }, [formKey, getFormData, isLoaded]); // ADD isLoaded to dependencies

  // Save data in useEffect to avoid updating provider during render
  useEffect(() => {
    if (shouldSave && dataToSaveRef.current !== null) {
      try {
        saveFormData(formKey, dataToSaveRef.current);
      } catch (error) {
        console.error('FormPersistence: Error saving data:', error);
      }
      setShouldSave(false);
      dataToSaveRef.current = null;
    }
  }, [shouldSave, formKey, saveFormData]);

  // Wrap updateData in useCallback
  const updateData = useCallback((newData: T | ((prev: T) => T)) => {
    setData(prev => {
      const updatedData = typeof newData === 'function' 
        ? (newData as Function)(prev) 
        : newData;
      
      // Store data to save and trigger save in useEffect
      dataToSaveRef.current = updatedData;
      setShouldSave(true);
      
      return updatedData;
    });
  }, []);

  // Wrap resetData in useCallback
  const resetData = useCallback(() => {
    const resetValue = initialData || ({} as T);
    setData(resetValue);
    clearFormData(formKey);
  }, [formKey, clearFormData, initialData]);

  return {
    data,
    updateData,
    resetData,
    isLoaded,
    hasSavedData: hasFormData(formKey)
  };
}
