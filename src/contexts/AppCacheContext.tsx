import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

// Cache configuration
interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  storageType: 'localStorage' | 'sessionStorage' | 'memory';
}

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

interface AppCacheContextType {
  // Core cache operations
  setCache: <T>(key: string, data: T, config?: Partial<CacheConfig>) => void;
  getCache: <T>(key: string) => T | null;
  removeCache: (key: string) => void;
  clearCache: () => void;
  
  // Page state management
  savePageState: (pageKey: string, state: any) => void;
  getPageState: (pageKey: string) => any;
  clearPageState: (pageKey: string) => void;
  
  // Data persistence
  persistData: <T>(key: string, data: T) => void;
  getPersistedData: <T>(key: string) => T | null;
  
  // Cache management
  getCacheStats: () => { totalEntries: number; memoryUsage: number };
  cleanupExpiredEntries: () => void;
  
  // Navigation state
  saveNavigationState: (state: any) => void;
  getNavigationState: () => any;
}

const AppCacheContext = createContext<AppCacheContextType | undefined>(undefined);

// Default cache configuration
const defaultConfig: CacheConfig = {
  ttl: 30 * 60 * 1000, // 30 minutes
  maxSize: 1000,
  storageType: 'localStorage'
};

// Cache storage keys
const CACHE_KEYS = {
  PAGE_STATES: 'app_cache_page_states',
  NAVIGATION_STATE: 'app_cache_navigation_state',
  DATA_CACHE: 'app_cache_data',
  USER_PREFERENCES: 'app_cache_user_preferences'
};

export function AppCacheProvider({ children }: { children: ReactNode }) {
  const [memoryCache, setMemoryCache] = useState<Map<string, CacheEntry>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize cache from storage
  useEffect(() => {
    const initializeCache = () => {
      try {
        // Load memory cache from localStorage
        const cachedData = localStorage.getItem(CACHE_KEYS.DATA_CACHE);
        if (cachedData) {
          const parsedCache = JSON.parse(cachedData);
          const cacheMap = new Map<string, CacheEntry>();
          
          Object.entries(parsedCache).forEach(([key, entry]) => {
            const cacheEntry = entry as CacheEntry;
            // Only load non-expired entries
            if (Date.now() - cacheEntry.timestamp < cacheEntry.ttl) {
              cacheMap.set(key, cacheEntry);
            }
          });
          
          setMemoryCache(cacheMap);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing cache:', error);
        setIsInitialized(true);
      }
    };

    initializeCache();
  }, []);

  // Save cache to storage periodically
  useEffect(() => {
    if (!isInitialized) return;

    const saveCacheToStorage = () => {
      try {
        const cacheObject: Record<string, CacheEntry> = {};
        memoryCache.forEach((value, key) => {
          cacheObject[key] = value;
        });
        
        localStorage.setItem(CACHE_KEYS.DATA_CACHE, JSON.stringify(cacheObject));
      } catch (error) {
        console.error('Error saving cache to storage:', error);
      }
    };

    // Save every 30 seconds
    const interval = setInterval(saveCacheToStorage, 30000);
    
    // Save on page unload
    const handleBeforeUnload = () => {
      saveCacheToStorage();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveCacheToStorage(); // Final save
    };
  }, [memoryCache, isInitialized]);

  // Core cache operations
  const setCache = useCallback(<T,>(key: string, data: T, config: Partial<CacheConfig> = {}) => {
    const finalConfig = { ...defaultConfig, ...config };
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: finalConfig.ttl,
      key
    };

    setMemoryCache(prev => {
      const newCache = new Map(prev);
      
      // Remove oldest entries if cache is full
      if (newCache.size >= finalConfig.maxSize) {
        const entries = Array.from(newCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Remove oldest 10% of entries
        const toRemove = Math.floor(finalConfig.maxSize * 0.1);
        for (let i = 0; i < toRemove; i++) {
          newCache.delete(entries[i][0]);
        }
      }
      
      newCache.set(key, entry);
      return newCache;
    });
  }, []);

  const getCache = useCallback(<T,>(key: string): T | null => {
    const entry = memoryCache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      setMemoryCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(key);
        return newCache;
      });
      return null;
    }
    
    return entry.data as T;
  }, [memoryCache]);

  const removeCache = useCallback((key: string) => {
    setMemoryCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(key);
      return newCache;
    });
  }, []);

  const clearCache = useCallback(() => {
    setMemoryCache(new Map());
    try {
      localStorage.removeItem(CACHE_KEYS.DATA_CACHE);
    } catch (error) {
      console.error('Error clearing cache from storage:', error);
    }
  }, []);

  // Page state management
  const savePageState = useCallback((pageKey: string, state: any) => {
    const stateKey = `${CACHE_KEYS.PAGE_STATES}_${pageKey}`;
    setCache(stateKey, {
      state,
      timestamp: Date.now(),
      pageKey
    }, { ttl: 24 * 60 * 60 * 1000 }); // 24 hours for page states
  }, [setCache]);

  const getPageState = useCallback((pageKey: string) => {
    const stateKey = `${CACHE_KEYS.PAGE_STATES}_${pageKey}`;
    const cached = getCache(stateKey);
    return cached?.state || null;
  }, [getCache]);

  const clearPageState = useCallback((pageKey: string) => {
    const stateKey = `${CACHE_KEYS.PAGE_STATES}_${pageKey}`;
    removeCache(stateKey);
  }, [removeCache]);

  // Data persistence
  const persistData = useCallback(<T,>(key: string, data: T) => {
    try {
      const persistKey = `persist_${key}`;
      localStorage.setItem(persistKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error persisting data:', error);
    }
  }, []);

  const getPersistedData = useCallback(<T,>(key: string): T | null => {
    try {
      const persistKey = `persist_${key}`;
      const stored = localStorage.getItem(persistKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.data as T;
      }
    } catch (error) {
      console.error('Error retrieving persisted data:', error);
    }
    return null;
  }, []);

  // Cache management
  const getCacheStats = useCallback(() => {
    const totalEntries = memoryCache.size;
    let memoryUsage = 0;
    
    memoryCache.forEach(entry => {
      memoryUsage += JSON.stringify(entry).length;
    });
    
    return { totalEntries, memoryUsage };
  }, [memoryCache]);

  const cleanupExpiredEntries = useCallback(() => {
    const now = Date.now();
    setMemoryCache(prev => {
      const newCache = new Map();
      prev.forEach((entry, key) => {
        if (now - entry.timestamp < entry.ttl) {
          newCache.set(key, entry);
        }
      });
      return newCache;
    });
  }, []);

  // Navigation state
  const saveNavigationState = useCallback((state: any) => {
    persistData(CACHE_KEYS.NAVIGATION_STATE, state);
  }, [persistData]);

  const getNavigationState = useCallback(() => {
    return getPersistedData(CACHE_KEYS.NAVIGATION_STATE);
  }, [getPersistedData]);

  const value: AppCacheContextType = {
    setCache,
    getCache,
    removeCache,
    clearCache,
    savePageState,
    getPageState,
    clearPageState,
    persistData,
    getPersistedData,
    getCacheStats,
    cleanupExpiredEntries,
    saveNavigationState,
    getNavigationState
  };

  return (
    <AppCacheContext.Provider value={value}>
      {children}
    </AppCacheContext.Provider>
  );
}

export function useAppCache() {
  const context = useContext(AppCacheContext);
  if (context === undefined) {
    throw new Error('useAppCache must be used within an AppCacheProvider');
  }
  return context;
}

// Custom hook for page state management
export function usePageState<T>(pageKey: string, initialState?: T) {
  const { savePageState, getPageState, clearPageState } = useAppCache();
  const [state, setState] = useState<T>(() => {
    const savedState = getPageState(pageKey);
    return savedState || initialState || ({} as T);
  });

  const updateState = useCallback((newState: T | ((prev: T) => T)) => {
    const updatedState = typeof newState === 'function' 
      ? (newState as Function)(state) 
      : newState;
    
    setState(updatedState);
    savePageState(pageKey, updatedState);
  }, [state, savePageState, pageKey]);

  const resetState = useCallback(() => {
    setState(initialState || ({} as T));
    clearPageState(pageKey);
  }, [initialState, clearPageState, pageKey]);

  return {
    state,
    updateState,
    resetState,
    hasSavedState: !!getPageState(pageKey)
  };
}

// Custom hook for cached data fetching
export function useCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  config?: Partial<CacheConfig>
) {
  const { setCache, getCache } = useAppCache();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    // Check cache first
    const cachedData = getCache<T>(key);
    if (cachedData) {
      setData(cachedData);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await fetchFn();
      setData(result);
      setCache(key, result, config);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [key, fetchFn, getCache, setCache, config]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
}
