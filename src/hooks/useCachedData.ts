import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppCache } from './AppCacheContext';
import { useCallback, useEffect, useRef } from 'react';

// Enhanced query options with caching
interface CachedQueryOptions {
  queryKey: string[];
  queryFn: () => Promise<any>;
  staleTime?: number;
  cacheTime?: number;
  enabled?: boolean;
  cacheConfig?: {
    ttl?: number;
    persistToStorage?: boolean;
    storageKey?: string;
  };
}

// Enhanced mutation options with cache invalidation
interface CachedMutationOptions {
  mutationFn: (variables: any) => Promise<any>;
  onSuccess?: (data: any, variables: any) => void;
  onError?: (error: Error, variables: any) => void;
  invalidateQueries?: string[][];
  updateCache?: (oldData: any, newData: any) => any;
}

// Custom hook for cached queries
export function useCachedQuery<T = any>({
  queryKey,
  queryFn,
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 30 * 60 * 1000, // 30 minutes
  enabled = true,
  cacheConfig = {}
}: CachedQueryOptions) {
  const { setCache, getCache, persistData, getPersistedData } = useAppCache();
  const queryClient = useQueryClient();
  const lastFetchTime = useRef<number>(0);

  // Create cache key from query key
  const cacheKey = queryKey.join('_');
  const storageKey = cacheConfig.storageKey || `query_${cacheKey}`;

  // Enhanced query function that checks cache first
  const enhancedQueryFn = useCallback(async () => {
    // Check memory cache first
    const cachedData = getCache<T>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Check persistent storage if enabled
    if (cacheConfig.persistToStorage) {
      const persistedData = getPersistedData<T>(storageKey);
      if (persistedData) {
        // Cache it in memory for faster access
        setCache(cacheKey, persistedData, { ttl: cacheConfig.ttl });
        return persistedData;
      }
    }

    // Fetch from API
    const data = await queryFn();
    
    // Cache the result
    setCache(cacheKey, data, { ttl: cacheConfig.ttl });
    
    // Persist to storage if enabled
    if (cacheConfig.persistToStorage) {
      persistData(storageKey, data);
    }

    lastFetchTime.current = Date.now();
    return data;
  }, [queryKey, queryFn, cacheKey, storageKey, getCache, setCache, persistData, getPersistedData, cacheConfig]);

  const query = useQuery({
    queryKey,
    queryFn: enhancedQueryFn,
    staleTime,
    cacheTime,
    enabled,
    refetchOnWindowFocus: false, // Prevent refetch on tab focus
    refetchOnReconnect: false, // Prevent refetch on reconnect
  });

  // Auto-refresh logic
  useEffect(() => {
    if (!enabled || !query.data) return;

    const interval = setInterval(() => {
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      const shouldRefetch = timeSinceLastFetch > staleTime;

      if (shouldRefetch && document.visibilityState === 'visible') {
        query.refetch();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [enabled, query.data, staleTime, query.refetch]);

  return {
    ...query,
    // Additional cache management methods
    clearCache: () => {
      queryClient.removeQueries({ queryKey });
    },
    refreshCache: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  };
}

// Custom hook for cached mutations
export function useCachedMutation<TData = any, TVariables = any>({
  mutationFn,
  onSuccess,
  onError,
  invalidateQueries = [],
  updateCache
}: CachedMutationOptions) {
  const { removeCache, setCache } = useAppCache();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      // Invalidate related queries
      invalidateQueries.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });

      // Update cache if updateCache function provided
      if (updateCache) {
        queryClient.setQueriesData({ queryKey: invalidateQueries[0] }, (oldData: any) => {
          return updateCache(oldData, data);
        });
      }

      // Call user-defined onSuccess
      onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      onError?.(error, variables);
    }
  });

  return mutation;
}

// Hook for managing page-specific data caching
export function usePageDataCache<T = any>(
  pageKey: string,
  dataKey: string,
  fetchFn: () => Promise<T>,
  options: {
    ttl?: number;
    autoRefresh?: boolean;
    refreshInterval?: number;
  } = {}
) {
  const { setCache, getCache, savePageState, getPageState } = useAppCache();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchTime = useRef<number>(0);

  const cacheKey = `${pageKey}_${dataKey}`;
  const pageStateKey = `${pageKey}_state`;

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Check if we should skip fetch
    if (!forceRefresh) {
      const cachedData = getCache<T>(cacheKey);
      if (cachedData) {
        setData(cachedData);
        return;
      }

      // Check page state
      const pageState = getPageState(pageKey);
      if (pageState && pageState[dataKey]) {
        setData(pageState[dataKey]);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const result = await fetchFn();
      setData(result);

      // Cache the result
      setCache(cacheKey, result, { ttl: options.ttl });

      // Save to page state
      const currentPageState = getPageState(pageKey) || {};
      savePageState(pageKey, {
        ...currentPageState,
        [dataKey]: result,
        lastUpdated: Date.now()
      });

      lastFetchTime.current = Date.now();
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, dataKey, pageKey, fetchFn, getCache, setCache, getPageState, savePageState, options.ttl]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (!options.autoRefresh || !data) return;

    const interval = setInterval(() => {
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      const shouldRefresh = timeSinceLastFetch > (options.refreshInterval || 5 * 60 * 1000);

      if (shouldRefresh && document.visibilityState === 'visible') {
        fetchData(true);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [options.autoRefresh, options.refreshInterval, data, fetchData]);

  // Save data when it changes
  useEffect(() => {
    if (data) {
      const currentPageState = getPageState(pageKey) || {};
      savePageState(pageKey, {
        ...currentPageState,
        [dataKey]: data,
        lastUpdated: Date.now()
      });
    }
  }, [data, dataKey, pageKey, getPageState, savePageState]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(true),
    refresh: () => fetchData(true)
  };
}

// Hook for form state persistence with caching
export function useCachedFormState<T = any>(
  formKey: string,
  initialData?: T
) {
  const { savePageState, getPageState, persistData, getPersistedData } = useAppCache();
  const [formData, setFormData] = useState<T>(() => {
    // Try to get from page state first
    const pageState = getPageState(formKey);
    if (pageState?.formData) {
      return pageState.formData;
    }

    // Try to get from persistent storage
    const persistedData = getPersistedData<T>(`form_${formKey}`);
    if (persistedData) {
      return persistedData;
    }

    return initialData || ({} as T);
  });

  const updateFormData = useCallback((newData: T | ((prev: T) => T)) => {
    const updatedData = typeof newData === 'function' 
      ? (newData as Function)(formData) 
      : newData;
    
    setFormData(updatedData);

    // Save to page state
    const currentPageState = getPageState(formKey) || {};
    savePageState(formKey, {
      ...currentPageState,
      formData: updatedData,
      lastUpdated: Date.now()
    });

    // Persist to storage
    persistData(`form_${formKey}`, updatedData);
  }, [formData, formKey, getPageState, savePageState, persistData]);

  const resetFormData = useCallback(() => {
    setFormData(initialData || ({} as T));
    
    // Clear from page state
    const currentPageState = getPageState(formKey) || {};
    delete currentPageState.formData;
    savePageState(formKey, currentPageState);
  }, [formKey, initialData, getPageState, savePageState]);

  return {
    formData,
    updateFormData,
    resetFormData,
    hasUnsavedChanges: JSON.stringify(formData) !== JSON.stringify(initialData)
  };
}

// Hook for managing component visibility and data loading
export function useVisibilityAwareData<T = any>(
  fetchFn: () => Promise<T>,
  options: {
    enabled?: boolean;
    refetchOnVisible?: boolean;
    staleTime?: number;
  } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchTime = useRef<number>(0);
  const isVisible = useRef<boolean>(true);

  const fetchData = useCallback(async () => {
    if (!options.enabled) return;

    try {
      setLoading(true);
      setError(null);
      
      const result = await fetchFn();
      setData(result);
      lastFetchTime.current = Date.now();
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, options.enabled]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      const wasVisible = isVisible.current;
      isVisible.current = document.visibilityState === 'visible';

      // If becoming visible and data is stale, refetch
      if (!wasVisible && isVisible.current && options.refetchOnVisible) {
        const timeSinceLastFetch = Date.now() - lastFetchTime.current;
        if (timeSinceLastFetch > (options.staleTime || 5 * 60 * 1000)) {
          fetchData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData, options.refetchOnVisible, options.staleTime]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    isVisible: isVisible.current
  };
}
