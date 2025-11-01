import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/AuthProvider';

export interface CompanyConfig {
  id?: string;
  company_name: string;
  logo_url: string;
  sidebar_logo_url?: string;
  header_logo_url?: string;
  favicon_url?: string;
  authorized_signatory_url?: string;
  logo_sizes?: {
    sidebar_logo_height: string;
    sidebar_logo_width: string;
    header_logo_height: string;
    header_logo_width: string;
    company_logo_height: string;
    company_logo_width: string;
    favicon_size: string;
  };
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
  favicon_url: undefined,
  authorized_signatory_url: undefined,
  logo_sizes: {
    sidebar_logo_height: '32px',
    sidebar_logo_width: 'auto',
    header_logo_height: '32px',
    header_logo_width: 'auto',
    company_logo_height: '48px',
    company_logo_width: 'auto',
    favicon_size: '16px'
  },
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
  const { user, loading: authLoading } = useAuth();

  // Load config from database only when user is authenticated
  useEffect(() => {
    if (!authLoading && user) {
      loadCompanyConfig();
    } else if (!authLoading && !user) {
      // If not authenticated, just use default config
      setLoading(false);
    }
  }, [user, authLoading]);

  const loadCompanyConfig = async () => {
    try {
      setLoading(true);
      
      // Check if user is authenticated before making any database calls
      if (!user) {
        console.log('User not authenticated, using default config');
        setConfig(defaultConfig);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading company config:', error);
        // Don't show toast error for RLS policy violations during initial load
        if (error.code !== '42501') {
          toast.error('Failed to load company configuration');
        }
        setConfig(defaultConfig);
        return;
      }

      if (data) {
        setConfig(data);
      } else {
        // If no config exists, create a default one only if user is authenticated
        if (user) {
          const { data: newConfig, error: createError } = await supabase
            .from('company_settings')
            .insert([defaultConfig])
            .select()
            .single();

          if (createError) {
            console.error('Error creating default company config:', createError);
            // Don't show toast error for RLS policy violations during initial load
            if (createError.code !== '42501') {
              toast.error('Failed to create default company configuration');
            }
            setConfig(defaultConfig);
            return;
          }

          if (newConfig) {
            setConfig(newConfig);
          }
        } else {
          setConfig(defaultConfig);
        }
      }
    } catch (error) {
      console.error('Error in loadCompanyConfig:', error);
      setConfig(defaultConfig);
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