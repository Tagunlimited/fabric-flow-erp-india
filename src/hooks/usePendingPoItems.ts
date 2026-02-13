import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PendingItem {
  bom_item_id: string;
  bom_id: string;
  bom_number: string;
  bom_status: string | null;
  order_id?: string | null;
  order_number?: string | null;
  product_name: string | null;
  product_image_url: string | null;
  item_name: string;
  item_type: string | null;
  category: string | null;
  qty_total: number;
  total_ordered: number;
  total_allocated: number;
  remaining_quantity: number;
  unit: string | null;
  fabric_name: string | null;
  fabric_for_supplier: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
  image_url: string | null;
  notes: string | null;
  bom_created_at: string | null;
  item_id?: string | null;
  item_code?: string | null;
  fabric_id?: string | null;
  item_color?: string | null;
}

export interface PendingItemGroup {
  key: string;
  displayName: string;
  type: string;
  unit: string | null;
  imageUrl: string | null;
  totalRequired: number;
  totalOrdered: number;
  totalRemaining: number;
  bomBreakdowns: PendingItem[];
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/80x80?text=IMG';

const cacheKeyForItem = (item: PendingItem) => {
  return [
    (item.item_type || item.category || '').toLowerCase(),
    item.item_id || '',
    item.item_code || '',
    item.fabric_id || '',
    item.fabric_name || '',
    item.fabric_color || '',
    item.fabric_gsm || ''
  ].join('|');
};

const resolveImageForPendingItem = async (
  item: PendingItem,
  cache: Map<string, string | null>
): Promise<string | null> => {
  if (item.image_url) {
    return item.image_url;
  }

  const key = cacheKeyForItem(item);

  if (cache.has(key)) {
    return cache.get(key) || null;
  }

  let resolvedImage: string | null = null;
  const typeKey = (item.item_type || item.category || '').toLowerCase();

  try {
    if (typeKey === 'fabric') {
      if (item.fabric_id) {
        const { data, error } = await supabase
          .from('fabric_master')
          .select('image_url, image')
          .eq('id', item.fabric_id)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          resolvedImage = (data as any).image_url || (data as any).image || null;
        }
      }

      if (!resolvedImage && item.fabric_name) {
        let query = supabase
          .from('fabric_master')
          .select('image_url, image')
          .eq('fabric_name', item.fabric_name);

        if (item.fabric_color) {
          query = query.eq('color', item.fabric_color);
        }
        if (item.fabric_gsm) {
          query = query.eq('gsm', item.fabric_gsm);
        }

        const { data, error } = await query.limit(1).maybeSingle();
        if (!error && data) {
          resolvedImage = (data as any).image_url || (data as any).image || null;
        }

        if (!resolvedImage) {
          const { data: ilikeData, error: ilikeError } = await supabase
            .from('fabric_master')
            .select('image_url, image')
            .ilike('fabric_name', `%${item.fabric_name}%`)
            .limit(1)
            .maybeSingle();
          if (!ilikeError && ilikeData) {
            resolvedImage = (ilikeData as any).image_url || (ilikeData as any).image || null;
          }
        }
      }
    } else {
      if (item.item_id) {
        const { data, error } = await supabase
          .from('item_master')
          .select('image_url, image')
          .eq('id', item.item_id)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          resolvedImage = (data as any).image_url || (data as any).image || null;
        }
      }

      if (!resolvedImage && item.item_code) {
        const { data, error } = await supabase
          .from('item_master')
          .select('image_url, image')
          .eq('item_code', item.item_code)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          resolvedImage = (data as any).image_url || (data as any).image || null;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to resolve image for pending item', {
      bom_item_id: item.bom_item_id,
      bom_id: item.bom_id,
      err
    });
  }

  if (!resolvedImage) {
    resolvedImage = item.product_image_url || null;
  }

  cache.set(key, resolvedImage);
  return resolvedImage;
};

export const buildPendingItemGroups = (rows: PendingItem[]): PendingItemGroup[] => {
  const groupsMap = new Map<string, PendingItemGroup>();

  rows.forEach(item => {
    const typeKey = (item.item_type || item.category || '-').toLowerCase();
    const isFabric = typeKey === 'fabric';
    const identity = isFabric
      ? [item.fabric_name?.toLowerCase() || '', item.fabric_color?.toLowerCase() || '', item.fabric_gsm || ''].join('|')
      : (item.item_id || item.item_code || item.item_name || '').toLowerCase();
    const key = `${typeKey}|${identity}`;

    const totalRequired = Number(item.qty_total || 0);
    const totalOrdered = Number(item.total_ordered || 0);
    const totalRemaining = Number(item.remaining_quantity || 0);

    const existing = groupsMap.get(key);
    if (existing) {
      existing.totalRequired += totalRequired;
      existing.totalOrdered += totalOrdered;
      existing.totalRemaining += totalRemaining;
      existing.bomBreakdowns.push(item);
    } else {
      // For fabric items, use fabric_for_supplier if available, otherwise use item_name
      const displayName = isFabric && item.fabric_for_supplier 
        ? item.fabric_for_supplier 
        : item.item_name;
      
      groupsMap.set(key, {
        key,
        displayName,
        type: item.item_type || item.category || '-',
        unit: item.unit || null,
        imageUrl: item.image_url || PLACEHOLDER_IMAGE,
        totalRequired,
        totalOrdered,
        totalRemaining,
        bomBreakdowns: [item]
      });
    }
  });

  return Array.from(groupsMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
};

export const usePendingPoItems = () => {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const imageCacheRef = useRef<Map<string, string | null>>(new Map());

  const fetchPendingItems = useCallback(async () => {
    const imageCache = imageCacheRef.current;
    try {
      setLoading(true);
      setError(null);

      let pendingData: PendingItem[] = [];

      const { data, error } = await supabase
        .from('pending_po_items_view')
        .select('*')
        .gt('remaining_quantity', 0)
        .order('bom_number', { ascending: true });

      if (error) {
        if ((error as any)?.code === 'PGRST205') {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('bom_record_items')
            .select(`
              id,
              bom_id,
              item_name,
              category,
              qty_total,
              unit_of_measure,
              to_order,
              stock,
              fabric_name,
              fabric_color,
              fabric_gsm,
              item_id,
              item_code,
              item_image_url,
              notes,
              bom_records (
                bom_number,
                status,
                order_id,
                product_name,
                product_image_url,
                created_at
              ),
              bom_po_items (ordered_quantity),
              inventory_allocations (quantity)
            `);

          if (fallbackError) throw fallbackError;

          pendingData = (fallbackData || []).map((row: any) => {
            const poItems = Array.isArray(row.bom_po_items) ? row.bom_po_items : [];
            const totalOrdered = poItems.reduce((sum: number, alloc: any) => sum + Number(alloc?.ordered_quantity || 0), 0);
            const remainingQuantity = Number(row.qty_total || 0) - totalOrdered;
            const inventoryAllocations = Array.isArray(row.inventory_allocations) ? row.inventory_allocations : [];
            const totalAllocated = inventoryAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc?.quantity || 0), 0);
            const hasInventory = Number(row.stock || 0) > 0;

            if (totalAllocated > 0 || hasInventory || remainingQuantity <= 0) {
              return null;
            }

            return {
              bom_item_id: row.id,
              bom_id: row.bom_id,
              bom_number: row.bom_records?.bom_number || 'Unknown',
              bom_status: row.bom_records?.status || null,
              order_id: row.bom_records?.order_id || null,
              order_number: row.bom_records?.order?.order_number || null,
              product_name: row.bom_records?.product_name || null,
              product_image_url: row.bom_records?.product_image_url || null,
              item_name: row.item_name,
              item_type: row.category,
              category: row.category,
              qty_total: row.qty_total,
              unit: row.unit_of_measure || null,
              total_ordered: totalOrdered,
              total_allocated: totalAllocated,
              remaining_quantity: remainingQuantity,
              fabric_name: row.fabric_name,
              fabric_for_supplier: null, // Will be fetched separately
              fabric_color: row.fabric_color,
              fabric_gsm: row.fabric_gsm,
              fabric_id: row.fabric_id,
              item_id: row.item_id,
              item_code: row.item_code,
              image_url: row.item_image_url,
              notes: row.notes,
              bom_created_at: row.bom_records?.created_at || null
            } as PendingItem;
          }).filter((row: PendingItem | null): row is PendingItem => row !== null);
          
          // Fetch fabric_for_supplier for fabric items in fallback data
          const fabricItems = pendingData.filter(item => 
            (item.item_type || item.category || '').toLowerCase() === 'fabric' && item.fabric_id
          );
          const fabricIds = fabricItems.map(item => item.fabric_id).filter(Boolean);
          
          if (fabricIds.length > 0) {
            try {
              const { data: fabricsData, error: fabricsError } = await supabase
                .from('fabric_master')
                .select('id, fabric_for_supplier')
                .in('id', fabricIds);
              
              if (!fabricsError && fabricsData) {
                const fabricForSupplierMap = new Map<string, string | null>();
                fabricsData.forEach((fabric: any) => {
                  fabricForSupplierMap.set(fabric.id, fabric.fabric_for_supplier || null);
                });
                
                // Update pending data with fabric_for_supplier
                pendingData = pendingData.map(item => {
                  if (item.fabric_id && fabricForSupplierMap.has(item.fabric_id)) {
                    return { ...item, fabric_for_supplier: fabricForSupplierMap.get(item.fabric_id) || null };
                  }
                  return item;
                });
              }
            } catch (error) {
              console.warn('Failed to fetch fabric_for_supplier in fallback:', error);
            }
          }
        } else {
          throw error;
        }
      } else {
        pendingData = (data || []) as PendingItem[];
      }

      const pendingWithImages: PendingItem[] = [];
      for (const item of pendingData) {
        const imageUrl = await resolveImageForPendingItem(item, imageCache);
        pendingWithImages.push({ ...item, image_url: imageUrl });
      }

      pendingWithImages.sort((a, b) => {
        const typeA = (a.item_type || '').toLowerCase();
        const typeB = (b.item_type || '').toLowerCase();
        if (typeA === typeB) {
          return a.item_name.localeCompare(b.item_name);
        }
        return typeA.localeCompare(typeB);
      });

      setPendingItems(pendingWithImages);
    } catch (err) {
      console.error('Failed to load pending BOM items', err);
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingItems().catch(() => {
      // Error already handled in fetchPendingItems; suppress unhandled rejection.
    });
  }, [fetchPendingItems]);

  const fabricPending = useMemo(
    () => pendingItems.filter(item => (item.item_type || item.category || '').toLowerCase() === 'fabric'),
    [pendingItems]
  );

  const itemPending = useMemo(
    () => pendingItems.filter(item => (item.item_type || item.category || '').toLowerCase() !== 'fabric'),
    [pendingItems]
  );

  const fabricGroups = useMemo(() => buildPendingItemGroups(fabricPending), [fabricPending]);
  const itemGroups = useMemo(() => buildPendingItemGroups(itemPending), [itemPending]);

  const refresh = useCallback(async () => {
    await fetchPendingItems();
  }, [fetchPendingItems]);

  return {
    pendingItems,
    fabricPending,
    itemPending,
    fabricGroups,
    itemGroups,
    loading,
    error,
    refresh
  };
};

export const getPendingItemPlaceholder = () => PLACEHOLDER_IMAGE;

