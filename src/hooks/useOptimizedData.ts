import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseOptimizedDataOptions {
  table: string;
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  enabled?: boolean;
  cacheKey?: string;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

// Simple in-memory cache
const cache = new Map<string, CacheEntry>();

export function useOptimizedData<T = any>({
  table,
  select = '*',
  orderBy,
  limit,
  enabled = true,
  cacheKey
}: UseOptimizedDataOptions) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    // Check cache first
    const key = cacheKey || `${table}-${select}-${JSON.stringify(orderBy)}-${limit}`;
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      setData(cached.data);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      let query = supabase.from(table).select(select);

      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data: result, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Cache the result
      cache.set(key, {
        data: result || [],
        timestamp: Date.now(),
        ttl: 5 * 60 * 1000 // 5 minutes
      });

      setData(result || []);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
        console.error(`Error fetching data from ${table}:`, err);
      }
    } finally {
      setLoading(false);
    }
  }, [table, select, orderBy, limit, enabled, cacheKey]);

  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  const refetch = useCallback(() => {
    // Clear cache for this key
    const key = cacheKey || `${table}-${select}-${JSON.stringify(orderBy)}-${limit}`;
    cache.delete(key);
    fetchData();
  }, [fetchData, table, select, orderBy, limit, cacheKey]);

  return {
    data,
    loading,
    error,
    refetch
  };
}

// Hook for paginated data
export function usePaginatedData<T = any>({
  table,
  select = '*',
  orderBy,
  pageSize = 20,
  enabled = true
}: Omit<UseOptimizedDataOptions, 'limit'> & { pageSize?: number }) {
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [allData, setAllData] = useState<T[]>([]);

  const { data, loading, error, refetch } = useOptimizedData({
    table,
    select,
    orderBy,
    limit: pageSize,
    enabled,
    cacheKey: `${table}-paginated-${page}`
  });

  useEffect(() => {
    if (data.length > 0) {
      if (page === 0) {
        setAllData(data);
      } else {
        setAllData(prev => [...prev, ...data]);
      }
      setHasMore(data.length === pageSize);
    } else if (page === 0) {
      setAllData([]);
      setHasMore(false);
    }
  }, [data, page, pageSize]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loading, hasMore]);

  const reset = useCallback(() => {
    setPage(0);
    setAllData([]);
    setHasMore(true);
  }, []);

  return {
    data: allData,
    loading,
    error,
    hasMore,
    loadMore,
    reset,
    refetch
  };
}

// Utility function to clear cache
export function clearCache(pattern?: string) {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}
