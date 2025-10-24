// Comprehensive Caching Configuration
export const CACHE_CONFIG = {
  // Default cache settings
  DEFAULT_TTL: 30 * 60 * 1000, // 30 minutes
  DEFAULT_MAX_SIZE: 1000,
  
  // Page-specific cache settings
  PAGES: {
    dashboard: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true,
      autoRefresh: true,
      refreshInterval: 2 * 60 * 1000 // 2 minutes
    },
    orders: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true,
      autoRefresh: true,
      refreshInterval: 3 * 60 * 1000 // 3 minutes
    },
    customers: {
      ttl: 10 * 60 * 1000, // 10 minutes
      persistToStorage: true,
      autoRefresh: false
    },
    inventory: {
      ttl: 15 * 60 * 1000, // 15 minutes
      persistToStorage: true,
      autoRefresh: true,
      refreshInterval: 5 * 60 * 1000 // 5 minutes
    },
    production: {
      ttl: 2 * 60 * 1000, // 2 minutes
      persistToStorage: true,
      autoRefresh: true,
      refreshInterval: 1 * 60 * 1000 // 1 minute
    },
    quality: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true,
      autoRefresh: true,
      refreshInterval: 2 * 60 * 1000 // 2 minutes
    },
    warehouse: {
      ttl: 10 * 60 * 1000, // 10 minutes
      persistToStorage: true,
      autoRefresh: false
    },
    procurement: {
      ttl: 15 * 60 * 1000, // 15 minutes
      persistToStorage: true,
      autoRefresh: false
    },
    analytics: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true,
      autoRefresh: false
    },
    settings: {
      ttl: 60 * 60 * 1000, // 1 hour
      persistToStorage: true,
      autoRefresh: false
    }
  },

  // Data-specific cache settings
  DATA_TYPES: {
    // User data
    user_profile: {
      ttl: 60 * 60 * 1000, // 1 hour
      persistToStorage: true
    },
    user_permissions: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    },
    company_settings: {
      ttl: 60 * 60 * 1000, // 1 hour
      persistToStorage: true
    },

    // Master data
    customers: {
      ttl: 15 * 60 * 1000, // 15 minutes
      persistToStorage: true
    },
    products: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    },
    employees: {
      ttl: 60 * 60 * 1000, // 1 hour
      persistToStorage: true
    },
    suppliers: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    },
    fabrics: {
      ttl: 20 * 60 * 1000, // 20 minutes
      persistToStorage: true
    },

    // Transactional data
    orders: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    },
    order_items: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    },
    purchase_orders: {
      ttl: 10 * 60 * 1000, // 10 minutes
      persistToStorage: true
    },
    invoices: {
      ttl: 15 * 60 * 1000, // 15 minutes
      persistToStorage: true
    },

    // Production data
    production_orders: {
      ttl: 2 * 60 * 1000, // 2 minutes
      persistToStorage: true
    },
    batches: {
      ttl: 3 * 60 * 1000, // 3 minutes
      persistToStorage: true
    },
    quality_checks: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    },

    // Inventory data
    inventory_items: {
      ttl: 10 * 60 * 1000, // 10 minutes
      persistToStorage: true
    },
    warehouse_inventory: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    },

    // Analytics data
    dashboard_metrics: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    },
    reports: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    }
  },

  // Form-specific cache settings
  FORMS: {
    order_form: {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      persistToStorage: true
    },
    customer_form: {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      persistToStorage: true
    },
    product_form: {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      persistToStorage: true
    },
    purchase_order_form: {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      persistToStorage: true
    },
    bom_form: {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      persistToStorage: true
    }
  },

  // Service Worker cache settings
  SERVICE_WORKER: {
    STATIC_CACHE_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    DYNAMIC_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
    API_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    MAX_CACHE_SIZE: 50 * 1024 * 1024, // 50MB
  },

  // IndexedDB settings
  INDEXED_DB: {
    DB_NAME: 'FabricFlowERP',
    VERSION: 1,
    STORES: {
      PENDING_ACTIONS: 'pendingActions',
      CACHED_DATA: 'cachedData',
      FORM_STATES: 'formStates',
      USER_PREFERENCES: 'userPreferences',
      OFFLINE_DATA: 'offlineData'
    }
  },

  // Auto-save settings
  AUTO_SAVE: {
    ENABLED: true,
    INTERVAL: 30 * 1000, // 30 seconds
    DEBOUNCE_DELAY: 1000, // 1 second
    MAX_RETRIES: 3
  },

  // Cleanup settings
  CLEANUP: {
    ENABLED: true,
    INTERVAL: 60 * 60 * 1000, // 1 hour
    MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
    MAX_ENTRIES: 10000
  }
};

// Cache key generators
export const CACHE_KEYS = {
  // Page state keys
  PAGE_STATE: (pageKey: string) => `page_state_${pageKey}`,
  
  // Data keys
  DATA: (table: string, params?: any) => {
    const baseKey = `data_${table}`;
    if (params) {
      const paramString = JSON.stringify(params);
      return `${baseKey}_${btoa(paramString)}`;
    }
    return baseKey;
  },
  
  // Query keys
  QUERY: (queryKey: string[]) => `query_${queryKey.join('_')}`,
  
  // Form keys
  FORM: (formKey: string) => `form_${formKey}`,
  
  // User-specific keys
  USER_DATA: (userId: string, dataType: string) => `user_${userId}_${dataType}`,
  
  // Company-specific keys
  COMPANY_DATA: (companyId: string, dataType: string) => `company_${companyId}_${dataType}`,
  
  // Session keys
  SESSION: (sessionId: string) => `session_${sessionId}`,
  
  // Navigation keys
  NAVIGATION: 'navigation_state',
  
  // Preferences keys
  PREFERENCES: (userId: string) => `preferences_${userId}`
};

// Cache validation helpers
export const CACHE_VALIDATORS = {
  // Check if cache entry is valid
  isValid: (entry: any, ttl: number) => {
    if (!entry || !entry.timestamp) return false;
    return Date.now() - entry.timestamp < ttl;
  },
  
  // Check if data is stale
  isStale: (entry: any, staleTime: number) => {
    if (!entry || !entry.timestamp) return true;
    return Date.now() - entry.timestamp > staleTime;
  },
  
  // Get cache age
  getAge: (entry: any) => {
    if (!entry || !entry.timestamp) return Infinity;
    return Date.now() - entry.timestamp;
  }
};

// Cache size helpers
export const CACHE_SIZE_HELPERS = {
  // Estimate size of an object
  estimateSize: (obj: any): number => {
    return JSON.stringify(obj).length * 2; // Rough estimate
  },
  
  // Format bytes
  formatBytes: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  // Check if size exceeds limit
  exceedsLimit: (size: number, limit: number): boolean => {
    return size > limit;
  }
};

// Cache priority helpers
export const CACHE_PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  
  // Get priority for data type
  getPriority: (dataType: string): number => {
    const priorityMap: { [key: string]: number } = {
      // Critical data
      'user_profile': CACHE_PRIORITY.CRITICAL,
      'user_permissions': CACHE_PRIORITY.CRITICAL,
      'company_settings': CACHE_PRIORITY.CRITICAL,
      
      // High priority data
      'orders': CACHE_PRIORITY.HIGH,
      'production_orders': CACHE_PRIORITY.HIGH,
      'batches': CACHE_PRIORITY.HIGH,
      'quality_checks': CACHE_PRIORITY.HIGH,
      
      // Medium priority data
      'customers': CACHE_PRIORITY.MEDIUM,
      'products': CACHE_PRIORITY.MEDIUM,
      'inventory_items': CACHE_PRIORITY.MEDIUM,
      'purchase_orders': CACHE_PRIORITY.MEDIUM,
      
      // Low priority data
      'analytics': CACHE_PRIORITY.LOW,
      'reports': CACHE_PRIORITY.LOW,
      'dashboard_metrics': CACHE_PRIORITY.LOW
    };
    
    return priorityMap[dataType] || CACHE_PRIORITY.MEDIUM;
  }
};

// Export default configuration
export default CACHE_CONFIG;
