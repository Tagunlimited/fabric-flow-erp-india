import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Search, Eye, Edit, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react';
import { BomDisplayCard } from './BomDisplayCard';
import { BomToPOWizardDialog } from './BomToPOWizardDialog';
import { getBomCompletionStatus, getBomItemOrderStatus } from '@/services/bomPOTracking';
import { remainingQtyForNewPurchaseOrderLine } from './bomOrderLineUtils';
import { fetchStockForBomRecordItem } from './bomInventoryAllocation';
import { toast } from 'sonner';
import './BomListCreatePoButton.css';

interface BomRecord {
  id: string;
  bom_number: string;
  product_name: string;
  product_image_url?: string;
  total_order_qty: number;
  created_at: string;
  order_item_id?: string | null;
  order_item?: {
    id: string;
    product_description?: string | null;
    quantity?: number | null;
    category_image_url?: string | null;
  } | null;
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
          order_item:order_items(
            id,
            product_description,
            quantity,
            category_image_url
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


    const processedItems = await Promise.all(
      bomItems.map(async (item, index) => {
        if (!item || (!item.item_name && !item.fabric_name)) {
          console.log('Skipping invalid BOM item payload:', item);
          return null;
        }

        console.log('Processing BOM item for display:', item);

        // ALWAYS fetch fresh image from master tables - ignore stored image_url (may be mockup)
        let imageUrl = null;
        const fabricCode =
          item.fabric_code ||
          item.item?.fabric_code ||
          item.item?.item_code ||
          item.item_code ||
          null;
        const stockInfo = await fetchStockForBomRecordItem(supabase, item);
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
        
        // Always fetch fresh image from master tables
        if (item.category === 'Fabric') {
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
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBom, detailDialogOpen]);

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

    const { data: allocRows, error: allocFetchError } = await supabase
      .from('inventory_allocations' as any)
      .select('bom_item_id, quantity')
      .eq('bom_id', bom.id);

    if (allocFetchError) {
      console.warn('Failed to load inventory allocations for PO from BOM', allocFetchError);
    }

    const allocByItem = new Map<string, number>();
    for (const row of allocRows || []) {
      const bid = row.bom_item_id != null ? String(row.bom_item_id) : '';
      if (!bid) continue;
      allocByItem.set(bid, (allocByItem.get(bid) || 0) + Number((row as { quantity?: number }).quantity || 0));
    }

    let poOrderedByItem = new Map<string, number>();
    try {
      const orderStatus = await getBomItemOrderStatus(bom.id);
      poOrderedByItem = new Map(
        orderStatus.map((s) => [s.bom_item_id, Number(s.total_ordered || 0)])
      );
    } catch (e) {
      console.warn('Failed to load BOM purchase order status', e);
    }

    const remainingForPoLine = (item: any): number => {
      const bid = item.id != null && String(item.id).trim() !== '' ? String(item.id) : '';
      const qtyTotal = Number(item.qty_total ?? item.quantity ?? 0);
      if (!bid) {
        return remainingQtyForNewPurchaseOrderLine({
          qtyTotal,
          inventoryAllocated: 0,
          totalOrderedOnPurchaseOrders: 0,
        });
      }
      return remainingQtyForNewPurchaseOrderLine({
        qtyTotal,
        inventoryAllocated: allocByItem.get(bid) ?? 0,
        totalOrderedOnPurchaseOrders: poOrderedByItem.get(bid) ?? 0,
      });
    };

    const filteredItems = bomItems.filter((item) => {
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
        has_quantity: !!(item.qty_total > 0 || item.to_order > 0),
        remaining_for_po: remainingForPoLine(item),
      });

      const isFabric = item.category === 'Fabric';
      const hasValidIdentifier = isFabric ? !!item.fabric_name : !!item.item_id;
      const hasValidName = isFabric ? !!item.fabric_name : !!item.item_name;

      return (
        hasValidIdentifier &&
        hasValidName &&
        (item.qty_total != null || item.to_order != null) &&
        remainingForPoLine(item) > 0
      );
    });

    if (filteredItems.length === 0) {
      toast.error(
        'Nothing left to purchase for this BOM — lines are fully covered by allocated stock and existing purchase orders.'
      );
      return;
    }
    
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
          image_url: imageUrl,
          to_order: remainingForPoLine(item),
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
    const lineLabel = bom.order_item?.product_description || '';
    return (
      bom.bom_number?.toLowerCase().includes(term) ||
      bom.product_name?.toLowerCase().includes(term) ||
      bom.order?.order_number?.toLowerCase().includes(term) ||
      bom.order?.customer?.company_name?.toLowerCase().includes(term) ||
      (lineLabel && lineLabel.toLowerCase().includes(term))
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
          <button
            type="button"
            className="bom-list-boton-elegante"
            onClick={() => navigate('/procurement/po/new')}
          >
            <span className="bom-list-boton-elegante__inner">
              <FileText className="w-5 h-5 shrink-0" aria-hidden />
              Create PO
            </span>
          </button>
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
                            {bom.order_item && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Order line:{' '}
                                {bom.order_item.product_description || '—'}
                                {bom.order_item.quantity != null && (
                                  <span> · Line qty {bom.order_item.quantity}</span>
                                )}
                              </div>
                            )}
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
              onViewClick={() => {
                setDetailDialogOpen(false);
                createPurchaseOrderFromBom(selectedBom);
              }}
            />
          )}
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
