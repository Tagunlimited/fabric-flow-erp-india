import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Search, Eye, Edit, Plus, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react';
import { BomDisplayCard } from './BomDisplayCard';
import { BomToPOWizardDialog } from './BomToPOWizardDialog';
import { getBomCompletionStatus } from '@/services/bomPOTracking';
import { toast } from 'sonner';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface BomRecord {
  id: string;
  bom_number: string;
  product_name: string;
  product_image_url?: string;
  total_order_qty: number;
  created_at: string;
  order?: {
    order_number: string;
    customer?: {
      company_name: string;
    };
  };
  bom_items?: any[];
  bom_record_items?: any[];
  has_purchase_order?: boolean; // Track if PO already exists
  completionStatus?: {
    totalItems: number;
    orderedItems: number;
    completionPercentage: number;
    status: 'not_started' | 'in_progress' | 'completed';
  };
}

interface BomListProps {
  refreshTrigger?: number;
}

export function BomList({ refreshTrigger }: BomListProps) {
  const navigate = useNavigate();
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBom, setSelectedBom] = useState<BomRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [wizardDialogOpen, setWizardDialogOpen] = useState(false);
  const [processedBomItems, setProcessedBomItems] = useState<any[]>([]);
  const [recentlyCreatedPOs, setRecentlyCreatedPOs] = useState<Set<string>>(new Set());
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [allocationTargetItem, setAllocationTargetItem] = useState<any | null>(null);
  const [allocationSourceId, setAllocationSourceId] = useState<string>('');
  const [allocationQuantity, setAllocationQuantity] = useState<string>('0');
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  useEffect(() => {
    fetchBoms();
  }, []);

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger) {
      fetchBoms();
    }
  }, [refreshTrigger]);

  const fetchBoms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bom_records')
        .select(`
          *,
          order:orders(
            order_number,
            customer:customers(company_name)
          ),
          bom_record_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching BOMs:', error);
        toast.error('Failed to fetch BOMs');
        return;
      }

      console.log('=== BOM FETCH DEBUG ===');
      console.log('Raw data from Supabase:', data);
      console.log('Number of BOMs fetched:', data?.length || 0);
      console.log('Data type:', typeof data);
      console.log('Is array:', Array.isArray(data));
      console.log('First BOM data structure:', data?.[0]);
      console.log('All BOM IDs:', (data as any)?.map((bom: any) => bom.id));
      console.log('All BOM Numbers:', (data as any)?.map((bom: any) => bom.bom_number));
      console.log('========================');

      // Check which BOMs already have purchase orders
      const bomIds = ((data as any) || []).map((bom: any) => bom.id);
      console.log('Checking for POs for BOM IDs:', bomIds);
      console.log('BOM details being checked:', ((data as any) || []).map((bom: any) => ({
        id: bom.id,
        bom_number: bom.bom_number,
        product_name: bom.product_name,
        order_id: bom.order_id,
        order_number: (bom as any).order?.order_number,
        order_data: (bom as any).order
      })));
      
      // Log the full order relationship for debugging
      if (data && data.length > 0) {
        console.log('Full order relationship data:', (data[0] as any).order);
      }
      
      const { data: existingPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('bom_id, po_number, created_at')
        .in('bom_id', bomIds)
        .not('bom_id', 'is', null);

      if (poError) {
        console.error('Error fetching purchase orders:', poError);
      }

      console.log('Existing POs found:', existingPOs);
      console.log('Number of POs found:', existingPOs?.length || 0);
      
      // Log detailed PO information
      if (existingPOs && existingPOs.length > 0) {
        console.log('Detailed PO information:');
        existingPOs.forEach((po: any, index: number) => {
          console.log(`PO ${index + 1}:`, {
            id: po.id,
            bom_id: po.bom_id,
            po_number: po.po_number,
            created_at: po.created_at
          });
        });
        
        // Check if these POs actually belong to this BOM
        console.log('=== BOM-PO RELATIONSHIP CHECK ===');
        console.log('Current BOM ID:', bomIds[0]);
        console.log('POs found for this BOM:');
        existingPOs.forEach((po: any) => {
          const belongsToThisBom = po.bom_id === bomIds[0];
          console.log(`PO ${po.po_number}: bom_id=${po.bom_id}, belongs_to_this_bom=${belongsToThisBom}`);
        });
        console.log('================================');
      }

      // Allow multiple POs per BOM - don't disable button based on existing POs
      // This allows users to create multiple purchase orders for the same BOM
      const validPOs = (existingPOs || []).filter((po: any) => bomIds.includes(po.bom_id));
      const bomIdsWithPO = new Set(); // Empty set - don't disable any buttons
      
      console.log('Valid POs for current BOMs:', validPOs.length);
      console.log('BOM IDs with valid POs:', Array.from(bomIdsWithPO));
      console.log('Allowing multiple POs per BOM - buttons will remain enabled');

      // Mark BOMs that already have purchase orders and load completion status
      const bomsWithPOStatus = await Promise.all((data || []).map(async (bom) => {
        const completionStatus = await getBomCompletionStatus(bom.id);
        return {
          ...bom,
          has_purchase_order: bomIdsWithPO.has(bom.id),
          completionStatus
        };
      }));

      console.log('Final BOMs with PO status:', bomsWithPOStatus.map((bom: any) => ({
        bom_number: bom.bom_number,
        has_purchase_order: bom.has_purchase_order
      })));

      setBoms(bomsWithPOStatus as any);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to fetch BOMs');
    } finally {
      setLoading(false);
    }
  };

  const fetchBomItemsForBom = async (bomId: string) => {
    const tableAttempts = [
      { table: 'bom_record_items', label: 'bom_record_items' },
      { table: 'bom_items', label: 'bom_items' },
      { table: 'bill_of_materials_items', label: 'bill_of_materials_items' }
    ];

    let lastSuccessfulData: any[] | null = null;

    for (const attempt of tableAttempts) {
      try {
        const { data, error } = await supabase
          .from(attempt.table as any)
          .select('*')
          .eq('bom_id', bomId);

        if (error) {
          console.warn(`Failed to fetch BOM items from ${attempt.label}`, error);
          continue;
        }

        console.log(`Fetched ${data?.length || 0} BOM items from ${attempt.label}`);

        if (data) {
          lastSuccessfulData = data;
          if (data.length > 0) {
            return data;
          }
        }
      } catch (err) {
        console.error(`Unexpected error while fetching BOM items from ${attempt.label}`, err);
      }
    }

    return lastSuccessfulData || [];
  };

  const processBomItemsWithImages = async (bomItems: any[], currentBomId?: string) => {
    if (!bomItems || bomItems.length === 0) {
      setProcessedBomItems([]);
      return;
    }

    const fetchStockForBomItem = async (item: any) => {
      const category = (item?.category || '').toLowerCase();
      const itemTypeFilter = category === 'fabric' ? 'FABRIC' : 'ITEM';
      let resolvedUnit = item?.unit_of_measure || item?.required_unit || '';
      const fabricName = item?.fabric_name?.trim() || item?.item_name?.split(' - ')[0]?.trim();
      const normalizedItemName = item?.item_name?.trim();

      const normalize = (value: string | number | null | undefined) =>
        `${value ?? ''}`.trim().toLowerCase();

      const matchesInventoryRow = (row: any) => {
        if (!row) return false;
        if (item?.item_id && row.item_id && row.item_id === item.item_id) {
          return true;
        }

        const targetCode = normalize((item as any)?.item_code);
        const rowCode = normalize(row.item_code);
        if (targetCode && rowCode && targetCode === rowCode) {
          return true;
        }

        const rowName = normalize(row.item_name);
        if (category === 'fabric') {
          const targetFabricName = normalize(fabricName);
          if (targetFabricName && rowName === targetFabricName) {
            return true;
          }
        } else {
          const targetItemName = normalize(normalizedItemName);
          if (targetItemName && rowName === targetItemName) {
            return true;
          }
        }

        return false;
      };

      const fetchWarehouseInventory = async (
        configureQuery?: (query: any) => any
      ): Promise<any[] | null> => {
        try {
          let query = supabase
            .from('warehouse_inventory' as any)
            .select('id, quantity, unit, item_name, item_code, item_id')
            .eq('status', 'IN_STORAGE')
            .eq('item_type', itemTypeFilter);

          if (configureQuery) {
            query = configureQuery(query);
          }

          const { data, error } = await query;

          if (error) {
            console.warn('Failed to fetch warehouse inventory for BOM item', {
              itemId: item?.id,
              category,
              error
            });
            return null;
          }

          if (data && data.length > 0) {
            const filtered = (data as any[]).filter(matchesInventoryRow);
            if (filtered.length > 0) {
              return filtered;
            }
          }
        } catch (err) {
          console.error('Unexpected error while fetching warehouse inventory for BOM item', {
            itemId: item?.id,
            err
          });
        }

        return null;
      };

      const warehouseInventoryStrategies: ((query: any) => any)[] = [];

      if (item?.item_id) {
        warehouseInventoryStrategies.push((query) => query.eq('item_id', item.item_id));
      }

      if (item?.item_code) {
        warehouseInventoryStrategies.push((query) => query.eq('item_code', item.item_code));
      }

      if (category === 'fabric') {
        if (fabricName) {
          warehouseInventoryStrategies.push((query) => query.eq('item_name', fabricName));
          warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${fabricName}%`));
        }
      } else if (normalizedItemName) {
        warehouseInventoryStrategies.push((query) => query.eq('item_name', normalizedItemName));
        warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${normalizedItemName}%`));
      }

      let inventoryRows: any[] | null = null;

      for (const strategy of warehouseInventoryStrategies) {
        inventoryRows = await fetchWarehouseInventory(strategy);
        if (inventoryRows && inventoryRows.length > 0) {
          break;
        }
      }

      if (!inventoryRows) {
        inventoryRows = await fetchWarehouseInventory();
      }

      let totalQuantity = 0;
      let inventoryAllocationsMap: Record<string, number> = {};

      if (inventoryRows && inventoryRows.length > 0) {
        totalQuantity = inventoryRows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0);

        const unitFromRow = inventoryRows.find((row) => row?.unit)?.unit;
        if (unitFromRow) {
          resolvedUnit = unitFromRow;
        }

        try {
          const inventoryIds = inventoryRows.map((row) => row.id);
          if (inventoryIds.length > 0) {
            const { data: allocationRows, error: allocationError } = await supabase
              .from('inventory_allocations' as any)
              .select('warehouse_inventory_id, quantity')
              .in('warehouse_inventory_id', inventoryIds);

            if (allocationError) {
              console.warn('Failed to fetch allocation summary for inventory rows', allocationError);
            } else if (allocationRows) {
              inventoryAllocationsMap = allocationRows.reduce((acc: Record<string, number>, row: any) => {
                const key = row.warehouse_inventory_id;
                const qty = Number(row.quantity || 0);
                acc[key] = (acc[key] || 0) + qty;
                return acc;
              }, {} as Record<string, number>);
            }
          }
        } catch (err) {
          console.error('Unexpected error while fetching inventory allocations summary', err);
        }
      } else if (category === 'fabric') {
        try {
          if (fabricName) {
            let fabricQuery = supabase
              .from('fabric_stock_summary' as any)
              .select('total_available, total_quantity, unit, color, gsm')
              .eq('fabric_name', fabricName);

            const fabricColor = item?.fabric_color?.trim();
            const fabricGsm = item?.fabric_gsm?.trim();

            if (fabricColor) {
              fabricQuery = fabricQuery.eq('color', fabricColor);
            }

            if (fabricGsm) {
              fabricQuery = fabricQuery.eq('gsm', fabricGsm);
            }

            const { data: fabricStockRows, error: fabricStockError } = await fabricQuery.limit(1);

            if (fabricStockError) {
              console.warn('Failed to fetch fabric stock summary for BOM item', {
                itemId: item?.id,
                fabricName,
                fabricColor,
                fabricGsm,
                error: fabricStockError
              });
            } else if (fabricStockRows && fabricStockRows.length > 0) {
              const fabricStock = fabricStockRows[0] as any;
              const available = Number(
                fabricStock?.total_available ?? fabricStock?.total_quantity ?? 0
              );
              if (!Number.isNaN(available)) {
                totalQuantity = available;
              }
              if (fabricStock?.unit) {
                resolvedUnit = fabricStock.unit;
              }
            }
          }
        } catch (error) {
          console.error('Unexpected error while resolving fabric stock summary for BOM item', {
            itemId: item?.id,
            error
          });
        }
      }

      let totalAllocatedToThisItem = 0;
      try {
        const { data: bomAllocations, error: bomAllocationError } = await supabase
          .from('inventory_allocations' as any)
          .select('quantity')
          .eq('bom_item_id', item.id);

        if (bomAllocationError) {
          console.warn('Failed to fetch allocations for BOM item', bomAllocationError);
        } else if (bomAllocations) {
          totalAllocatedToThisItem = bomAllocations.reduce((sum: number, row: any) => {
            return sum + Number(row.quantity || 0);
          }, 0);
        }
      } catch (err) {
        console.error('Unexpected error while fetching BOM item allocations', err);
      }

      const inventorySources = (inventoryRows || []).map((row) => {
        const allocated = Number(inventoryAllocationsMap[row.id] || 0);
        const quantity = Number(row.quantity || 0);
        return {
          id: row.id,
          quantity,
          allocated,
          available: Math.max(quantity - allocated, 0),
          unit: row.unit
        };
      });

      const totalAllocatedFromInventory = inventorySources.reduce(
        (sum, source) => sum + source.allocated,
        0
      );

      const totalAvailable = inventorySources.reduce(
        (sum, source) => sum + source.available,
        0
      );

      return {
        unit: resolvedUnit,
        totalQuantity,
        totalAvailable,
        inventorySources,
        totalAllocatedToThisItem,
        totalAllocatedFromInventory
      };
    };

    const processedItems = await Promise.all(
      bomItems.map(async (item, index) => {
        if (!item || (!item.item_name && !item.fabric_name)) {
          console.log('Skipping invalid BOM item payload:', item);
          return null;
        }

        console.log('Processing BOM item for display:', item);

        // Fetch image for the item
        let imageUrl =
          item.item_image_url ||
          item.image_url ||
          item.item?.image_url ||
          item.item?.image ||
          null;
        const fabricCode =
          item.fabric_code ||
          item.item?.fabric_code ||
          item.item?.item_code ||
          item.item_code ||
          null;
        const stockInfo = await fetchStockForBomItem(item);
        const safeStockInfo = {
          unit:
            stockInfo?.unit ||
            item.unit_of_measure ||
            item.required_unit ||
            item.unit ||
            '',
          totalQuantity: Number(stockInfo?.totalQuantity ?? item.stock ?? 0),
          totalAvailable: Number(stockInfo?.totalAvailable ?? item.stock ?? 0),
          inventorySources: stockInfo?.inventorySources || [],
          totalAllocatedToThisItem: Number(stockInfo?.totalAllocatedToThisItem ?? item.total_allocated ?? 0),
          totalAllocatedFromInventory: Number(stockInfo?.totalAllocatedFromInventory ?? 0)
        };
        
        if (!imageUrl && item.category === 'Fabric') {
          // Fetch fabric image
          try {
            const fabricName = item.fabric_name || item.item_name?.split(' - ')[0] || '';
            const fabricColor = item.fabric_color || '';
            const fabricGsm = item.fabric_gsm || '';
            
            console.log('Fetching fabric image for:', { fabricName, fabricColor, fabricGsm });
            
            const attemptFetchFabric = async (
              configureQuery: (query: any) => any
            ) => {
              try {
                let query = supabase
                  .from('fabric_master')
                  .select('image, image_url, color, gsm, fabric_code');

                query = configureQuery(query);

                const { data, error } = await query.limit(1);
                if (error) {
                  console.warn('Fabric image lookup error', error);
                  return null;
                }
                return data && data.length > 0 ? data[0] : null;
              } catch (err) {
                console.warn('Unexpected fabric image lookup error', err);
                return null;
              }
            };

            let fabricRecord: any = null;

            if (fabricCode) {
              fabricRecord = await attemptFetchFabric((query) => query.eq('fabric_code', fabricCode));
            }

            if (!fabricRecord && fabricName) {
              fabricRecord = await attemptFetchFabric((query) => {
                let next = query.eq('fabric_name', fabricName);
                if (fabricColor) {
                  next = next.eq('color', fabricColor);
                }
                if (fabricGsm) {
                  next = next.eq('gsm', fabricGsm);
                }
                return next;
              });

              if (!fabricRecord) {
                fabricRecord = await attemptFetchFabric((query) => {
                  let next = query.ilike('fabric_name', fabricName);
                  if (fabricColor) {
                    next = next.ilike('color', fabricColor);
                  }
                  return next;
                });
              }

              if (!fabricRecord) {
                fabricRecord = await attemptFetchFabric((query) =>
                  query.ilike('fabric_name', `%${fabricName}%`)
                );
              }
            }

            if (fabricRecord) {
              imageUrl = fabricRecord.image_url || fabricRecord.image || null;
              if (imageUrl) {
                console.log('Found fabric image:', imageUrl);
              }
            } else {
              console.log('No fabric image found for fabric:', fabricName);
            }
          } catch (error) {
            console.log('Error fetching fabric image:', error);
          }
        } else if (!imageUrl && item.item_id) {
          // Fetch item image
          try {
            console.log('Fetching item image for item_id:', item.item_id);
            
            const itemResult = await supabase
              .from('item_master')
              .select('image, image_url')
              .eq('id', item.item_id)
              .single();
            
            if (!itemResult.error && ((itemResult.data as any)?.image || (itemResult.data as any)?.image_url)) {
              imageUrl = (itemResult.data as any).image || (itemResult.data as any).image_url;
              console.log('Found item image:', imageUrl);
            } else {
              console.log('No item image found:', itemResult.error);
            }
          } catch (error) {
            console.log('Error fetching item image:', error);
          }
        }
        const resolvedCategoryRaw =
          item.category ||
          item.item_category ||
          item.selected_item_type ||
          item.item_type ||
          (item.fabric_name ? 'Fabric' : 'Item');
        const resolvedCategory =
          resolvedCategoryRaw?.toLowerCase() === 'fabric'
            ? 'Fabric'
            : resolvedCategoryRaw || 'Item';

        const resolvedName =
          item.item_name ||
          (resolvedCategory === 'Fabric' ? item.fabric_name : null) ||
          item.item_code ||
          'Unnamed Item';

        const requiredQty = Number(
          item.qty_total ??
            item.required_qty ??
            item.quantity ??
            item.qty_required ??
            0
        );

        const requiredUnit =
          item.unit_of_measure || item.required_unit || item.unit || safeStockInfo.unit || '';

        const bomItemId =
          (typeof item.id === 'string' && item.id.trim().length > 0)
            ? item.id
            : null;

        return {
          id: bomItemId,
          bom_id: item.bom_id || currentBomId || selectedBom?.id || item.bomId || null,
          item_name: resolvedName,
          category: resolvedCategory,
          required_qty: requiredQty,
          required_unit: requiredUnit,
          in_stock: safeStockInfo.totalAvailable,
          stock_unit: safeStockInfo.unit,
          fabric_code: fabricCode,
          image_url: imageUrl,
          allocation: {
            totalAllocated: safeStockInfo.totalAllocatedToThisItem,
            totalAvailable: safeStockInfo.totalAvailable,
            inventorySources: safeStockInfo.inventorySources
          }
        };
      })
    );

    setProcessedBomItems(processedItems.filter(Boolean));
  };

  const viewBomDetails = async (bom: BomRecord) => {
    console.log('Opening BOM Details for:', bom);
    console.log('BOM Items:', bom.bom_items);
    console.log('BOM Items Length:', bom.bom_record_items?.length || 0);
    console.log('BOM ID:', bom.id);
    console.log('BOM Product Name:', bom.product_name);
    
    if (bom.bom_record_items && bom.bom_record_items.length > 0) {
      console.log('First BOM item:', bom.bom_record_items[0]);
      console.log('All BOM items:', bom.bom_record_items.map(item => ({
        id: item.id,
        item_name: item.item_name,
        category: item.category,
        qty_total: item.qty_total
      })));
    } else {
      console.warn('No BOM items found for this BOM');
    }
    
    setSelectedBom(bom);
    setDetailDialogOpen(true);
    setProcessedBomItems([]);

    let itemsToProcess = bom.bom_record_items && bom.bom_record_items.length > 0
      ? bom.bom_record_items
      : null;

    if (!itemsToProcess || itemsToProcess.length === 0) {
      itemsToProcess = await fetchBomItemsForBom(bom.id);
    }

    console.log('BOM items resolved for processing:', itemsToProcess?.length || 0);

    await processBomItemsWithImages(itemsToProcess || [], bom.id);
  };

  useEffect(() => {
    if (!selectedBom || !detailDialogOpen) return;

    const channel = supabase
      .channel(`inventory-allocations-bom-${selectedBom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_allocations'
        },
        () => {
          if (selectedBom?.bom_record_items) {
      processBomItemsWithImages(selectedBom.bom_record_items, selectedBom.id);
            processBomItemsWithImages(selectedBom.bom_record_items, selectedBom.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBom, detailDialogOpen]);

  const resetAllocationDialog = () => {
    setAllocationTargetItem(null);
    setAllocationSourceId('');
    setAllocationQuantity('0');
    setAllocationError(null);
  };

  const openAllocationDialog = (item: any) => {
    setAllocationTargetItem(item);
    const firstAvailableSource = item?.allocation?.inventorySources?.find((src: any) => src.available > 0);
    setAllocationSourceId(firstAvailableSource?.id || '');
    const requiredRemaining = Math.max(item.required_qty - (item.allocation?.totalAllocated || 0), 0);
    const defaultQuantity = Math.min(requiredRemaining, firstAvailableSource?.available || item.in_stock || 0);
    setAllocationQuantity(defaultQuantity > 0 ? String(Number(defaultQuantity.toFixed(3))) : '0');
    setAllocationDialogOpen(true);
  };

  const openAllocateAllDialog = () => {
    if (!processedBomItems.length) return;
    const aggregateAvailable = processedBomItems.flatMap((item: any) => item.allocation?.inventorySources || []);
    const firstAvailableSource = aggregateAvailable.find((src: any) => src.available > 0);
    setAllocationTargetItem({
      id: null,
      isBulk: true,
      items: processedBomItems,
      stock_unit: firstAvailableSource?.unit,
      required_unit: processedBomItems[0]?.required_unit || '',
      allocation: {
        inventorySources: aggregateAvailable,
        totalAvailable: aggregateAvailable.reduce((sum: number, src: any) => sum + (src.available || 0), 0)
      }
    });
    setAllocationSourceId(firstAvailableSource?.id || '');
    setAllocationQuantity('0');
    setAllocationDialogOpen(true);
  };

  const handleAllocateStock = async () => {
    if (!allocationTargetItem || !selectedBom) {
      return;
    }

    const parsedQuantity = Number(allocationQuantity);
    const selectedSource = allocationTargetItem.allocation?.inventorySources?.find((src: any) => src.id === allocationSourceId);
    if (!allocationSourceId || !selectedSource) {
      setAllocationError('Please choose a stock source to allocate from.');
      return;
    }

    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setAllocationError('Please enter a valid allocation quantity greater than zero.');
      return;
    }

    if (parsedQuantity > selectedSource.available) {
      setAllocationError(`Cannot allocate more than ${selectedSource.available} ${selectedSource.unit || allocationTargetItem.stock_unit || ''} from the selected source.`);
      return;
    }

    if (!allocationTargetItem.isBulk) {
      const remainingRequired = Math.max(allocationTargetItem.required_qty - (allocationTargetItem.allocation?.totalAllocated || 0), 0);
      if (parsedQuantity > remainingRequired) {
        setAllocationError(`Allocation exceeds remaining required quantity (${remainingRequired}).`);
        return;
      }
    }

    try {
      setAllocationLoading(true);
      setAllocationError(null);

      if (allocationTargetItem.isBulk) {
        const remainingItems = allocationTargetItem.items.filter((item: any) => {
          const remaining = Math.max(item.required_qty - (item.allocation?.totalAllocated || 0), 0);
          return remaining > 0 && item.allocation?.totalAvailable > 0;
        });

        if (!remainingItems.length) {
          setAllocationError('All items are already fully allocated.');
          return;
        }

        const allocationBatch = remainingItems.map((item: any) => {
          const remaining = Math.max(item.required_qty - (item.allocation?.totalAllocated || 0), 0);
          const allocatable = Math.min(
            remaining,
            item.allocation?.totalAvailable || 0,
            selectedSource.available
          );
          selectedSource.available -= allocatable;
          return {
            warehouse_inventory_id: allocationSourceId,
            bom_id: selectedBom.id,
            bom_item_id: item.id,
            quantity: allocatable,
            unit: item.stock_unit || selectedSource.unit || item.required_unit
          };
        }).filter((entry) => entry.quantity > 0);

        if (!allocationBatch.length) {
          setAllocationError('No allocatable quantity found for the selected source.');
          return;
        }

        const { error } = await supabase
          .from('inventory_allocations' as any)
          .insert(allocationBatch);

        if (error) {
          console.error('Failed to allocate stock', error);
          setAllocationError('Failed to allocate stock. Please try again.');
          return;
        }
      } else {
        const { error } = await supabase
          .from('inventory_allocations' as any)
          .insert({
            warehouse_inventory_id: allocationSourceId,
            bom_id: selectedBom.id,
            bom_item_id: allocationTargetItem.id,
            quantity: parsedQuantity,
            unit: allocationTargetItem.stock_unit || selectedSource.unit || allocationTargetItem.required_unit
          });

        if (error) {
          console.error('Failed to allocate stock', error);
          setAllocationError('Failed to allocate stock. Please try again.');
          return;
        }
      }


      toast.success('Stock allocated successfully');

      if (selectedBom?.bom_record_items && selectedBom?.id) {
        await processBomItemsWithImages(selectedBom.bom_record_items, selectedBom.id);
      }

      resetAllocationDialog();
      setAllocationDialogOpen(false);
    } catch (err) {
      console.error('Unexpected error during stock allocation', err);
      setAllocationError('An unexpected error occurred while allocating stock.');
    } finally {
      setAllocationLoading(false);
    }
  };

  const editBom = (bom: BomRecord) => {
    navigate(`/bom/${bom.id}/edit`);
  };

  const createPurchaseOrderFromBom = async (bom: BomRecord) => {
    console.log('Creating PO from BOM:', bom);
    console.log('BOM items to process:', bom.bom_record_items);
    console.log('BOM has_purchase_order status:', bom.has_purchase_order);
    
    // Double-check if this specific BOM actually has a PO
    const { data: specificPOs, error: specificPOError } = await supabase
      .from('purchase_orders')
      .select('id, po_number, created_at')
        .eq('bom_id', bom.id as any);
    
    console.log('Specific POs for this BOM:', specificPOs);
    console.log('Specific PO count:', specificPOs?.length || 0);
    
    if (specificPOs && specificPOs.length > 0) {
      console.warn('This BOM already has POs, but allowing creation of additional POs');
      console.log('Existing POs:', specificPOs);
      console.log('Creating additional PO for same BOM - this is allowed');
      // Don't return - allow creation of additional POs
    }
    
    // Process BOM items with images for PO creation
    const bomItems = bom.bom_record_items || [];
    console.log('Raw BOM items:', bomItems);
    console.log('BOM items detailed:', bomItems.map((item: any) => ({
      id: item.id,
      item_id: item.item_id,
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category,
      qty_total: item.qty_total,
      to_order: item.to_order,
      stock: item.stock,
      fabric_name: item.fabric_name,
      fabric_color: item.fabric_color,
      fabric_gsm: item.fabric_gsm
    })));
    
    if (bomItems.length === 0) {
      console.warn('No BOM items found for this BOM');
      toast.error('No BOM items found to create purchase order');
      return;
    }

    const filteredItems = bomItems.filter(item => {
      console.log('Filtering BOM item:', {
        item_id: item.item_id,
        item_name: item.item_name,
        qty_total: item.qty_total,
        to_order: item.to_order,
        category: item.category,
        fabric_name: item.fabric_name,
        has_item_id: !!item.item_id,
        has_item_name: !!item.item_name,
        has_fabric_name: !!item.fabric_name,
        has_quantity: !!(item.qty_total > 0 || item.to_order > 0)
      });
      
      // For fabric items, check fabric_name instead of item_id
      const isFabric = item.category === 'Fabric';
      const hasValidIdentifier = isFabric ? !!item.fabric_name : !!item.item_id;
      const hasValidName = isFabric ? !!item.fabric_name : !!item.item_name;
      
      return hasValidIdentifier && hasValidName && (item.qty_total != null || item.to_order != null);
    });
    
    console.log('Filtered items count:', filteredItems.length);
    console.log('Filtered items:', filteredItems.map((item: any) => ({
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category
    })));
    
    const processedItems = await Promise.all(
      filteredItems.map(async (item: any) => {
        let imageUrl = null;
        
        // Try to get image from BOM item first
        if (item.image_url) {
          imageUrl = item.image_url;
        } else if (item.item?.image_url) {
          imageUrl = item.item.image_url;
        } else if (item.item?.image) {
          imageUrl = item.item.image;
        } else {
          // Fetch image from fabric_master or item_master
          try {
            if (item.category === 'Fabric') {
              // For fabric items, use fabric_name, fabric_color, fabric_gsm to find the fabric
              const { data: fabricData } = await supabase
                .from('fabric_master')
                .select('image')
                .eq('fabric_name', item.fabric_name || item.item_name)
                .eq('color', item.fabric_color || '')
                .eq('gsm', item.fabric_gsm || '')
                .single();
              imageUrl = (fabricData as any)?.image || null;
              
              // If not found with exact match, try just fabric name
              if (!imageUrl && item.fabric_name) {
                const { data: fabricData2 } = await supabase
                  .from('fabric_master')
                  .select('image')
                  .eq('fabric_name', item.fabric_name)
                  .single();
                imageUrl = (fabricData2 as any)?.image || null;
              }
            } else {
              const { data: itemData } = await supabase
                .from('item_master')
                .select('image_url, image')
                .eq('id', item.item_id)
                .single();
              imageUrl = (itemData as any)?.image_url || (itemData as any)?.image || null;
            }
          } catch (error) {
            console.warn('Failed to fetch image for item:', item.item_name || item.fabric_name, error);
          }
        }

        return {
          ...item,
          image_url: imageUrl
        };
      })
    );

    console.log('Processed items for PO:', processedItems);

    const bomPayload = {
      id: bom.id,
      bom_number: bom.bom_number,
      product_name: bom.product_name,
      order_number: bom.order?.order_number,
      items: processedItems
    } as any;

    console.log('BOM payload for PO:', bomPayload);

    const encoded = encodeURIComponent(JSON.stringify(bomPayload));
    console.log('Navigating to PO form with BOM data');
    
    // Mark this BOM as having a PO created in this session
    setRecentlyCreatedPOs(prev => new Set([...prev, bom.id]));
    
    navigate(`/procurement/po/new?bom=${encoded}`);
  };

  const openMultiSupplierWizard = (bom: BomRecord) => {
    setSelectedBom(bom);
    setWizardDialogOpen(true);
  };

  const handleWizardComplete = (createdPOs: string[]) => {
    setWizardDialogOpen(false);
    setSelectedBom(null);
    // Refresh the BOM list to show updated status
    fetchBoms();
    toast.success(`Successfully created ${createdPOs.length} purchase order${createdPOs.length !== 1 ? 's' : ''}`);
  };

  const getStatusBadge = (bom: BomRecord) => {
    if (!bom.completionStatus) return null;
    
    const { status, completionPercentage } = bom.completionStatus;
    
    if (status === 'completed') {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Complete
        </Badge>
      );
    } else if (status === 'in_progress') {
      return (
        <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-300">
          <Clock className="w-3 h-3 mr-1" />
          {completionPercentage}% Complete
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="text-gray-600 border-gray-300">
          <AlertCircle className="w-3 h-3 mr-1" />
          Not Started
        </Badge>
      );
    }
  };

  const filteredBoms = boms.filter(bom => {
    const term = searchTerm.toLowerCase();
    return (
      bom.bom_number?.toLowerCase().includes(term) ||
      bom.product_name?.toLowerCase().includes(term) ||
      bom.order?.order_number?.toLowerCase().includes(term) ||
      bom.order?.customer?.company_name?.toLowerCase().includes(term)
    );
  });

  console.log('=== BOM FILTERING DEBUG ===');
  console.log('Total BOMs in state:', boms.length);
  console.log('Search term:', searchTerm);
  console.log('Filtered BOMs count:', filteredBoms.length);
  console.log('Filtered BOM IDs:', filteredBoms.map(bom => bom.id));
  console.log('===========================');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading BOMs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">BOM Management</h1>
          <p className="text-muted-foreground">Manage your Bills of Materials</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/procurement/po')} variant="outline">
            <FileText className="w-4 h-4 mr-2" />
            Create PO
          </Button>
          <Button onClick={() => navigate('/bom/create')}>
            <Plus className="w-4 h-4 mr-2" />
            Create BOM
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search BOMs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by BOM number, product name, order number, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* BOM List */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Records ({filteredBoms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredBoms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No BOMs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM Number</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoms.map((bom, index) => {
                    console.log(`Rendering BOM ${index + 1}:`, bom.id, bom.bom_number);
                    return (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">
                        {bom.bom_number || `BOM-${bom.id?.slice(-8) || 'N/A'}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          {bom.product_image_url && (
                            <img 
                              src={bom.product_image_url} 
                              alt={bom.product_name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{bom.product_name}</div>
                            <Badge variant="secondary" className="text-xs">
                              {bom.bom_record_items?.length || 0} items
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{bom.order?.order_number || 'N/A'}</TableCell>
                      <TableCell>{bom.order?.customer?.company_name || 'N/A'}</TableCell>
                      <TableCell>{bom.total_order_qty}</TableCell>
                      <TableCell>
                        {getStatusBadge(bom)}
                      </TableCell>
                      <TableCell>
                        {new Date(bom.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => viewBomDetails(bom)}
                            variant="outline"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => editBom(bom)}
                            variant="outline"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BOM Details Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BOM Details</DialogTitle>
          </DialogHeader>
          {selectedBom && (
            <BomDisplayCard
              orderId={selectedBom.order?.order_number || ''}
              productId={`${selectedBom.order?.order_number}/1`}
              productName={selectedBom.product_name}
              productImageUrl={selectedBom.product_image_url}
              totalOrderQty={selectedBom.total_order_qty}
              bomItems={processedBomItems}
              onAllocateClick={openAllocationDialog}
              onAllocateAllClick={openAllocateAllDialog}
              onViewClick={() => {
                setDetailDialogOpen(false);
                createPurchaseOrderFromBom(selectedBom);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={allocationDialogOpen} onOpenChange={(open) => {
        setAllocationDialogOpen(open);
        if (!open) {
          resetAllocationDialog();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Allocate Stock</DialogTitle>
          </DialogHeader>
          {allocationTargetItem && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Item</div>
                <div className="text-base font-semibold">{allocationTargetItem.item_name}</div>
                <div className="text-xs text-muted-foreground">Required: {allocationTargetItem.required_qty} {allocationTargetItem.required_unit}</div>
                <div className="text-xs text-muted-foreground">Allocated: {allocationTargetItem.allocation?.totalAllocated || 0} {allocationTargetItem.stock_unit}</div>
                <div className="text-xs text-muted-foreground">Available to allocate: {allocationTargetItem.allocation?.totalAvailable || 0} {allocationTargetItem.stock_unit}</div>
              </div>

              <div className="space-y-2">
                <Label>Stock Source</Label>
                <Select value={allocationSourceId} onValueChange={setAllocationSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {(allocationTargetItem.allocation?.inventorySources || [])
                      .filter((src: any) => src.available > 0)
                      .map((src: any) => (
                        <SelectItem key={src.id} value={src.id}>
                          Bin Stock • Available {src.available} {src.unit || allocationTargetItem.stock_unit}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity to Allocate</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={allocationQuantity}
                  onChange={(e) => setAllocationQuantity(e.target.value)}
                />
                {allocationError && (
                  <div className="text-sm text-red-500">{allocationError}</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAllocationDialogOpen(false);
              resetAllocationDialog();
            }} disabled={allocationLoading}>
              Cancel
            </Button>
            <Button onClick={handleAllocateStock} disabled={allocationLoading}>
              {allocationLoading ? 'Allocating...' : 'Allocate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-Supplier Wizard Dialog */}
      {selectedBom && (
        <BomToPOWizardDialog
          open={wizardDialogOpen}
          onOpenChange={setWizardDialogOpen}
          bomId={selectedBom.id}
          bomNumber={selectedBom.bom_number}
          onComplete={handleWizardComplete}
        />
      )}
    </div>
  );
}
