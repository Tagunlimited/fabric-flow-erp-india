import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SizeType } from '@/utils/sizeSorting';

/**
 * Hook to fetch and cache all size types
 * Provides helper functions to get size order for any size_type_id
 */
export function useSizeTypes() {
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSizeTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('size_types')
        .select('*')
        .order('size_name', { ascending: true });

      if (fetchError) throw fetchError;
      
      // Ensure size_order is properly typed
      const typedData = (data || []).map((st: any) => ({
        ...st,
        size_order: st.size_order || {},
        available_sizes: st.available_sizes || [],
      })) as SizeType[];
      
      setSizeTypes(typedData);
    } catch (err) {
      console.error('Error fetching size types:', err);
      setError(err as Error);
      setSizeTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSizeTypes();
  }, [fetchSizeTypes]);

  /**
   * Get a specific size type by ID
   */
  const getSizeTypeById = useCallback((id: string | null | undefined): SizeType | null => {
    if (!id) return null;
    return sizeTypes.find(st => st.id === id) || null;
  }, [sizeTypes]);

  /**
   * Get size order mapping for a specific size type
   */
  const getSizeOrderForType = useCallback((sizeTypeId: string | null | undefined): Record<string, number> | null => {
    const sizeType = getSizeTypeById(sizeTypeId);
    if (!sizeType || !sizeType.size_order || Object.keys(sizeType.size_order).length === 0) {
      return null;
    }
    return sizeType.size_order;
  }, [getSizeTypeById]);

  /**
   * Detect size type from a list of sizes by matching against available_sizes
   */
  const detectSizeType = useCallback((sizes: string[]): SizeType | null => {
    if (!sizes || sizes.length === 0) return null;
    
    // Normalize sizes for comparison
    const normalizedSizes = sizes.map(s => s.trim().toUpperCase());
    
    // Find size type that has all or most of these sizes
    let bestMatch: SizeType | null = null;
    let bestMatchCount = 0;
    
    for (const sizeType of sizeTypes) {
      if (!sizeType.available_sizes || sizeType.available_sizes.length === 0) continue;
      
      const normalizedAvailable = sizeType.available_sizes.map(s => s.trim().toUpperCase());
      const matchCount = normalizedSizes.filter(s => normalizedAvailable.includes(s)).length;
      
      // If this size type contains all the sizes, it's a perfect match
      if (matchCount === normalizedSizes.length && matchCount > bestMatchCount) {
        bestMatch = sizeType;
        bestMatchCount = matchCount;
      } else if (matchCount > bestMatchCount && matchCount >= normalizedSizes.length * 0.7) {
        // 70% match threshold for partial matches
        bestMatch = sizeType;
        bestMatchCount = matchCount;
      }
    }
    
    return bestMatch;
  }, [sizeTypes]);

  /**
   * Get all size types
   */
  const getAllSizeTypes = useCallback((): SizeType[] => {
    return sizeTypes;
  }, [sizeTypes]);

  return {
    sizeTypes,
    loading,
    error,
    refetch: fetchSizeTypes,
    getSizeTypeById,
    getSizeOrderForType,
    detectSizeType,
    getAllSizeTypes,
  };
}

