import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CompanyConfig {
  id?: string;
  company_name: string;
  logo_url: string;
  sidebar_logo_url?: string;
  header_logo_url?: string;
  favicon_url?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
  bank_details: {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch: string;
  };
  created_at?: string;
  updated_at?: string;
}

const defaultConfig: CompanyConfig = {
  company_name: '',
  logo_url: '/placeholder.svg',
  sidebar_logo_url: '/placeholder.svg',
  header_logo_url: '/placeholder.svg',
  favicon_url: '/favicon.ico',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  contact_phone: '',
  contact_email: '',
  bank_details: {
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch: ''
  }
};

interface CompanySettingsContextType {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  loading: boolean;
  saveConfig: (config: CompanyConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<CompanyConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  // Load config from database on app startup
  useEffect(() => {
    loadCompanyConfig();
  }, []);

  const loadCompanyConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading company config:', error);
        toast.error('Failed to load company configuration');
        return;
      }

      if (data) {
        setConfig(data);
      } else {
        // If no config exists, create a default one
        const { data: newConfig, error: createError } = await supabase
          .from('company_settings')
          .insert([defaultConfig])
          .select()
          .single();

        if (createError) {
          console.error('Error creating default company config:', createError);
          toast.error('Failed to create default company configuration');
          return;
        }

        if (newConfig) {
          setConfig(newConfig);
        }
      }
    } catch (error) {
      console.error('Error in loadCompanyConfig:', error);
      toast.error('Failed to load company configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (newConfig: CompanyConfig) => {
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert([newConfig], { onConflict: 'id' });

      if (error) {
        console.error('Error saving company config:', error);
        toast.error('Failed to save company configuration');
        throw error;
      }

      setConfig(newConfig);
      toast.success('Company configuration saved successfully');
    } catch (error) {
      console.error('Error in saveConfig:', error);
      throw error;
    }
  };

  const refreshConfig = async () => {
    await loadCompanyConfig();
  };

  return (
    <CompanySettingsContext.Provider value={{ 
      config, 
      setConfig, 
      loading, 
      saveConfig, 
      refreshConfig 
    }}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export function useCompanySettings() {
  const ctx = useContext(CompanySettingsContext);
  if (!ctx) throw new Error('useCompanySettings must be used within CompanySettingsProvider');
  return ctx;
} 