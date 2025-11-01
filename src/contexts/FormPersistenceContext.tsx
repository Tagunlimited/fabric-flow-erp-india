import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

  // Load saved form data from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('formPersistence');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setFormData(parsedData);
      }
    } catch (error) {
      console.error('Error loading form data from localStorage:', error);
    }
  }, []);

  // Save form data to localStorage whenever it changes (debounced)
  useEffect(() => {
    if (isNavigating) return; // Don't save during navigation
    
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('formPersistence', JSON.stringify(formData));
      } catch (error) {
        console.error('Error saving form data to localStorage:', error);
      }
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(timeoutId);
  }, [formData, isNavigating]);

  const saveFormData = (formKey: string, data: any) => {
    setFormData(prev => ({
      ...prev,
      [formKey]: {
        data,
        timestamp: Date.now()
      }
    }));
  };

  const getFormData = (formKey: string) => {
    const savedData = formData[formKey];
    if (savedData && savedData.data) {
      // Check if data is not too old (24 hours)
      const isExpired = Date.now() - savedData.timestamp > 24 * 60 * 60 * 1000;
      if (isExpired) {
        clearFormData(formKey);
        return null;
      }
      return savedData.data;
    }
    return null;
  };

  const clearFormData = (formKey: string) => {
    setFormData(prev => {
      const newData = { ...prev };
      delete newData[formKey];
      return newData;
    });
  };

  const clearAllFormData = () => {
    setFormData({});
  };

  const hasFormData = (formKey: string) => {
    const savedData = formData[formKey];
    if (savedData && savedData.data) {
      const isExpired = Date.now() - savedData.timestamp > 24 * 60 * 60 * 1000;
      return !isExpired;
    }
    return false;
  };

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

  useEffect(() => {
    const savedData = getFormData(formKey);
    if (savedData) {
      setData(savedData);
    }
    setIsLoaded(true);
  }, [formKey, getFormData]);

  const updateData = (newData: T | ((prev: T) => T)) => {
    try {
      const updatedData = typeof newData === 'function' ? (newData as Function)(data) : newData;
      setData(updatedData);
      saveFormData(formKey, updatedData);
    } catch (error) {
      console.error('FormPersistence: Error updating data:', error);
      // Fallback to basic state update if persistence fails
      setData(typeof newData === 'function' ? (newData as Function)(data) : newData);
    }
  };

  const resetData = () => {
    setData(initialData || ({} as T));
    clearFormData(formKey);
  };

  return {
    data,
    updateData,
    resetData,
    isLoaded,
    hasSavedData: hasFormData(formKey)
  };
}
