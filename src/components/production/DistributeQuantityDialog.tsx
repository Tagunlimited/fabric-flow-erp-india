import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Minus, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  buildBatchAssignmentDocumentData,
  type BatchAssignmentDocumentData,
} from '@/utils/batchAssignmentDocument';
import { buildLineRatesMapFromOrderItems } from '@/utils/orderItemCuttingRates';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { useSizeTypes } from '@/hooks/useSizeTypes';
import { sortSizeDistributionsByMasterOrder } from '@/utils/sizeSorting';
import { resolveSwatchHex } from '@/lib/grnColorSwatch';

function fabricSwatchCss(fabric: { color?: string | null; hex?: string | null } | null | undefined): string {
  if (!fabric) return '#e5e7eb';
  const label = String(fabric.color ?? '').trim();
  return resolveSwatchHex(label, fabric.hex ?? null) ?? '#e5e7eb';
}

interface Batch {
  id: string;
  batch_name: string;
  batch_code: string;
  tailor_type: string;
  max_capacity: number;
  current_capacity: number;
  status: string;
  batch_leader_name: string;
  batch_leader_avatar?: string;
  batch_leader_avatar_url?: string;
  available_capacity: number;
}

interface OrderSize {
  size_name: string;
  total_quantity: number;
}

interface BatchQuantity {
  [batchId: string]: {
    [size: string]: number;
  };
}

export type LineAssignmentSavePayload = {
  orderItemId: string | null;
  sessionOutcome:
    | 'advance_wizard'
    | 'wizard_complete'
    | 'single_exit'
    | 'legacy_per_line_pdf';
};

interface DistributeQuantityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after assignments are saved (e.g. refresh list). */
  onSuccess: () => void;
  /** Optional; when set, used after save instead of onSuccess for refresh-only side effects. */
  onAssignmentsSaved?: () => void;
  onAddMoreBatches: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  selectedBatchIds: string[];
  batches: Batch[];
  orderSizes: OrderSize[];
  orderItems: any[];
  /** When set, header and size-type sorting follow this order line (multi-product orders). */
  selectedOrderItemId?: string | null;
  /** After save, opens A5 job card preview from parent (single-line / legacy per-save PDF). */
  onJobCardDocumentReady?: (doc: BatchAssignmentDocumentData) => void;
  /** Multi-line wizard: after last line save, parent refreshes and builds full-order job card. */
  onRequestFullOrderJobCard?: (orderId: string) => void | Promise<void>;
  /**
   * Multi-product batch wizard: how this save should behave after distribute.
   * null = legacy (per-line job card PDF when onJobCardDocumentReady is set).
   */
  assignmentSessionMode?: 'continue_wizard' | 'this_line_only' | null;
  /** Notifies parent how the save fits the wizard / session. */
  onLineAssignmentSaved?: (payload: LineAssignmentSavePayload) => void;
}

export const DistributeQuantityDialog: React.FC<DistributeQuantityDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onAssignmentsSaved,
  onAddMoreBatches,
  orderId,
  orderNumber,
  customerName,
  selectedBatchIds,
  batches,
  orderSizes,
  orderItems,
  selectedOrderItemId = null,
  onJobCardDocumentReady,
  onRequestFullOrderJobCard,
  assignmentSessionMode = null,
  onLineAssignmentSaved,
}) => {
  const selectedLine =
    (selectedOrderItemId && orderItems?.find((i: any) => i.id === selectedOrderItemId)) ||
    orderItems?.[0] ||
    null;
  const [batchQuantities, setBatchQuantities] = useState<BatchQuantity>({});
  const [loading, setLoading] = useState(false);
  const [filteredOrderSizes, setFilteredOrderSizes] = useState<OrderSize[]>([]);
  const { toast } = useToast();
  const { sizeTypes } = useSizeTypes();

  // Filter order sizes to show only sizes with quantities > 0
  useEffect(() => {
    if (!isOpen || orderSizes.length === 0) {
      setFilteredOrderSizes([]);
      return;
    }

    const filtered = orderSizes.filter((size) => Number(size.total_quantity) > 0);

    let sizeTypeId: string | null = null;
    if (selectedLine) {
      let specs = selectedLine.specifications;
      if (typeof specs === 'string') {
        try {
          specs = JSON.parse(specs);
        } catch {
          specs = null;
        }
      }
      sizeTypeId =
        selectedLine.size_type_id ||
        (specs && typeof specs === 'object' ? (specs as { size_type_id?: string }).size_type_id : null) ||
        null;
    }

    const sorted = sortSizeDistributionsByMasterOrder(filtered, sizeTypeId, sizeTypes);
    setFilteredOrderSizes(sorted);
  }, [isOpen, orderSizes, selectedLine, sizeTypes]);

  // Initialize batch quantities when dialog opens
  useEffect(() => {
    if (isOpen && filteredOrderSizes.length > 0) {
      const initialQuantities: BatchQuantity = {};
      selectedBatchIds.forEach(batchId => {
        initialQuantities[batchId] = {};
        filteredOrderSizes.forEach(size => {
          initialQuantities[batchId][size.size_name] = 0;
        });
      });
      setBatchQuantities(initialQuantities);
    }
  }, [isOpen, selectedBatchIds, filteredOrderSizes]);

  const getRemainingQuantity = (size: string) => {
    const totalAssigned = Object.values(batchQuantities).reduce((total, batchQty) => {
      return total + (batchQty[size] || 0);
    }, 0);
    const orderSize = filteredOrderSizes.find(s => s.size_name === size);
    return (orderSize?.total_quantity || 0) - totalAssigned;
  };

  const updateQuantity = (batchId: string, size: string, quantity: number) => {
    const remaining = getRemainingQuantity(size) + (batchQuantities[batchId]?.[size] || 0);
    const newQuantity = Math.max(0, Math.min(quantity, remaining));
    
    setBatchQuantities(prev => ({
      ...prev,
      [batchId]: {
        ...prev[batchId],
        [size]: newQuantity
      }
    }));
  };

  const incrementQuantity = (batchId: string, size: string) => {
    const current = batchQuantities[batchId]?.[size] || 0;
    updateQuantity(batchId, size, current + 1);
  };

  const decrementQuantity = (batchId: string, size: string) => {
    const current = batchQuantities[batchId]?.[size] || 0;
    updateQuantity(batchId, size, current - 1);
  };

  const getTotalQuantityForBatch = (batchId: string) => {
    return Object.values(batchQuantities[batchId] || {}).reduce((total, qty) => total + qty, 0);
  };



  const validateDistribution = () => {
    let hasAssignedAny = false;
    for (const size of filteredOrderSizes) {
      const totalAssigned = Object.values(batchQuantities).reduce((sum, perBatch) => {
        return sum + (Number(perBatch?.[size.size_name]) || 0);
      }, 0);
      const available = Number(size.total_quantity) || 0;
      if (totalAssigned > available) {
        toast({
          title: "Validation Error",
          description: `Size ${size.size_name} exceeds available quantity (${totalAssigned}/${available})`,
          variant: "destructive",
        });
        return false;
      }
      if (totalAssigned > 0) hasAssignedAny = true;
    }
    if (!hasAssignedAny) {
      toast({
        title: "Validation Error",
        description: "Assign at least one piece before saving",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const buildJobCardDocumentAfterSave = async (): Promise<BatchAssignmentDocumentData | null> => {
    console.log('🚀 Building stitching job card document...');
    try {
      // Fetch stitching prices from order_assignments
      console.log('📊 Fetching stitching prices...');
      const { data: priceData, error: priceError } = await supabase
        .from('order_assignments' as any)
        .select('cutting_price_single_needle, cutting_price_overlock_flatlock')
        .eq('order_id', orderId as any)
        .single();

      if (priceError) {
        console.error('❌ Error fetching pricing data:', priceError);
        return;
      }
      console.log('✅ Pricing data fetched:', priceData);

      const orderDefaults = {
        cutting_price_single_needle: (priceData as any)?.cutting_price_single_needle,
        cutting_price_overlock_flatlock: (priceData as any)?.cutting_price_overlock_flatlock,
      };

      // Fetch order details - fetch order_items separately to avoid relationship issues
      console.log('📋 Fetching order details...');
      const { data: orderData, error: orderError } = await supabase
        .from('orders' as any)
        .select('*')
        .eq('id', orderId as any)
        .single();

      if (orderError) {
        console.error('❌ Error fetching order data:', orderError);
        return;
      }
      console.log('✅ Order data fetched:', orderData);

      // Fetch order items separately
      const { data: orderItemsData, error: itemsError } = await supabase
        .from('order_items' as any)
        .select('*')
        .eq('order_id', orderId as any);

      if (itemsError) {
        console.error('❌ Error fetching order items:', itemsError);
        return;
      }

      // Fetch product categories and fabric details separately
      const categoryIds = Array.from(new Set((orderItemsData || []).map((item: any) => item.product_category_id).filter(Boolean)));
      const fabricIds = Array.from(new Set((orderItemsData || []).map((item: any) => item.fabric_id).filter(Boolean)));

      let categoriesMap: Record<string, any> = {};
      if (categoryIds.length > 0) {
        const { data: categories } = await supabase
          .from('product_categories' as any)
          .select('id, category_name, category_image_url')
          .in('id', categoryIds);
        (categories || []).forEach((cat: any) => {
          categoriesMap[cat.id] = cat;
        });
      }

      let fabricMap: Record<string, any> = {};
      if (fabricIds.length > 0) {
        const { data: fabrics } = await supabase
          .from('fabric_master' as any)
          .select('id, fabric_name, color, gsm, image')
          .in('id', fabricIds);
        (fabrics || []).forEach((fabric: any) => {
          fabricMap[fabric.id] = fabric;
        });
      }

      // Enrich order items with related data
      const enrichedOrderItems = (orderItemsData || []).map((item: any) => {
        // Parse customizations from specifications
        let customizations: any[] = [];
        try {
          const specs = typeof item.specifications === 'string' 
            ? JSON.parse(item.specifications || '{}') 
            : (item.specifications || {});
          customizations = specs.customizations || [];
        } catch (e) {
          console.error('Error parsing customizations:', e);
        }

        return {
          ...item,
          product_categories: categoriesMap[item.product_category_id],
          fabric: fabricMap[item.fabric_id],
          customizations: customizations
        };
      });

      // Fetch sales manager information
      let salesManager: { name: string; avatarUrl?: string } | undefined;
      if (orderData && !orderError && (orderData as any).sales_manager) {
        try {
          const { data: salesManagerData } = await supabase
            .from('employees' as any)
            .select('id, full_name, avatar_url')
            .eq('id', (orderData as any).sales_manager as any)
            .single();
          if (salesManagerData && !('error' in salesManagerData)) {
            salesManager = {
              name: (salesManagerData as any).full_name,
              avatarUrl: (salesManagerData as any).avatar_url || undefined
            };
          }
        } catch (e) {
          console.error('Error fetching sales manager:', e);
        }
      }

      // Fetch company settings
      console.log('🏢 Fetching company settings...');
      const { data: companySettings, error: settingsError } = await supabase
        .from('company_settings' as any)
        .select('*')
        .single();

      if (settingsError || !companySettings || 'error' in (companySettings as any)) {
        console.error('❌ Error fetching company settings:', settingsError);
        return;
      }
      console.log('✅ Company settings fetched:', companySettings);

      console.log('🔧 Preparing batch assignment data...');
      const lineRatesByOrderItemId = buildLineRatesMapFromOrderItems(
        enrichedOrderItems as any[],
        orderDefaults
      );

      const rawBatches = selectedBatchIds.map((batchId) => {
        const batch = batches.find((b) => b.id === batchId);
        const batchQty = batchQuantities[batchId];
        const sizeDistributions = Object.entries(batchQty)
          .filter(([_, qty]) => typeof qty === 'number' && qty > 0)
          .map(([size, qty]) => ({ size, quantity: qty as number }));

        const assignedQuantity = sizeDistributions.reduce((sum, sd) => sum + sd.quantity, 0);
        const snRate = Math.max(0, Number(orderDefaults.cutting_price_single_needle) || 0);
        const ofRate = Math.max(0, Number(orderDefaults.cutting_price_overlock_flatlock) || 0);

        let batchLeaderAvatarUrl: string | undefined;
        if (batch?.batch_leader_avatar_url) batchLeaderAvatarUrl = batch.batch_leader_avatar_url;
        else if (batch?.batch_leader_avatar) batchLeaderAvatarUrl = batch.batch_leader_avatar;

        const sortedSizes = [...sizeDistributions].sort((a, b) => a.size.localeCompare(b.size));
        return {
          batchName: batch?.batch_name || '',
          batchLeaderName: batch?.batch_leader_name || '',
          batchLeaderAvatarUrl,
          tailorType: batch?.tailor_type || 'single_needle',
          sizeDistributions: sortedSizes,
          snRate,
          ofRate,
          assignedQuantity,
          orderItemIds: selectedOrderItemId ? [selectedOrderItemId] : undefined,
          assignedQuantities:
            selectedOrderItemId ? { [selectedOrderItemId]: assignedQuantity } : undefined,
          productSizeBreakdown:
            selectedOrderItemId && sortedSizes.length > 0
              ? [{ orderItemId: selectedOrderItemId, sizes: sortedSizes }]
              : undefined,
          ...(Object.keys(lineRatesByOrderItemId).length > 0 ? { lineRatesByOrderItemId } : {}),
        };
      }).filter((b) => b.assignedQuantity > 0);

      const itemsForDoc = selectedLine ? [selectedLine] : enrichedOrderItems;
      const customizationsForDoc = itemsForDoc.flatMap((item: any) =>
        item.customizations && Array.isArray(item.customizations) ? item.customizations : []
      );

      const documentData = buildBatchAssignmentDocumentData({
        orderNumber,
        customerName,
        orderItems: itemsForDoc,
        rawBatches,
        companySettings: companySettings as any,
        salesManager,
        customizations: customizationsForDoc,
        dueDate: (orderData as any).expected_delivery_date,
        orderDate: (orderData as any).order_date,
        orderNotes: (orderData as any).notes ? String((orderData as any).notes) : undefined,
      });

      console.log('✅ Job card document prepared');
      return documentData;
    } catch (error) {
      console.error('❌ Error building job card document:', error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!validateDistribution()) return;

    setLoading(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);

      // Check if tables exist by trying to query them
      console.log('Checking if order_batch_assignments table exists...');
      const { data: tableCheck, error: tableError } = await supabase
        .from('order_batch_assignments')
        .select('id')
        .limit(1);

      if (tableError) {
        console.error('Table check error:', tableError);
        if (tableError.code === 'PGRST116' || tableError.message.includes('relation "order_batch_assignments" does not exist')) {
          toast({
            title: "Database Setup Required",
            description: "Please run the database setup script to create the required tables. Check the create_order_batch_assignments.sql file.",
            variant: "destructive",
          });
          return;
        }
        throw tableError;
      }

      // For multi-line orders, replace assignments only for the current line.
      // We persist line context in notes as: [line:<order_item_id>]
      const lineTag = selectedOrderItemId ? `[line:${selectedOrderItemId}]` : null;
      console.log('Deleting existing assignments for order/line:', { orderId, lineTag });
      let deleteError: any = null;
      if (lineTag) {
        const { data: existingLineAssignments, error: fetchExistingError } = await supabase
          .from('order_batch_assignments')
          .select('id')
          .eq('order_id', orderId as any)
          .like('notes', `%${lineTag}%`);
        if (fetchExistingError) throw fetchExistingError;
        const lineAssignmentIds = (existingLineAssignments || []).map((r: any) => r.id).filter(Boolean);
        if (lineAssignmentIds.length > 0) {
          const { error: deleteSizeError } = await supabase
            .from('order_batch_size_distributions')
            .delete()
            .in('order_batch_assignment_id', lineAssignmentIds as any);
          if (deleteSizeError) throw deleteSizeError;

          const { error: deleteLineAssignmentsError } = await supabase
            .from('order_batch_assignments')
            .delete()
            .in('id', lineAssignmentIds as any);
          deleteError = deleteLineAssignmentsError;
        }
      } else {
        // Legacy/single-line behavior
        const { error } = await supabase
          .from('order_batch_assignments')
          .delete()
          .eq('order_id', orderId as any);
        deleteError = error;
      }

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }
      console.log('Existing assignments deleted successfully');

      // Insert new assignments
      for (const batchId of selectedBatchIds) {
        const batch = batches.find(b => b.id === batchId);
        if (!batch) continue;

        const batchQty = batchQuantities[batchId];
        const totalQty = getTotalQuantityForBatch(batchId);
        
        if (totalQty === 0) continue; // Skip batches with no quantity

        // Insert batch assignment
        const assignmentData = {
          order_id: orderId,
          batch_id: batchId,
          assigned_by_id: user?.id || null, // Reference auth.users table
          assigned_by_name: user?.user_metadata?.full_name || user?.email || 'System',
          assignment_date: new Date().toISOString().split('T')[0],
          total_quantity: totalQty,
          notes: `${lineTag ? `${lineTag} ` : ''}Order ${orderNumber} assigned to ${batch.batch_name}`
        };
        
        console.log('Inserting assignment:', assignmentData);
        const { data: assignmentResult, error: assignmentError } = await supabase
          .from('order_batch_assignments')
          .insert(assignmentData as any)
          .select()
          .single();

        if (assignmentError) {
          console.error('Assignment error:', assignmentError);
          throw assignmentError;
        }
        console.log('Assignment inserted successfully:', assignmentResult);

        // Insert size distributions
        const sizeDistributions = Object.entries(batchQty)
          .filter(([_, quantity]) => quantity > 0)
          .map(([size_name, quantity]) => ({
            order_batch_assignment_id: (assignmentResult as any)?.id,
            size_name,
            assigned_quantity: quantity
          }));

        if (sizeDistributions.length > 0) {
          console.log('Inserting size distributions:', sizeDistributions);
          let sizeError: any = null;
          ({ error: sizeError } = await supabase
            .from('order_batch_size_distributions')
            .insert(sizeDistributions as any));
          if (sizeError && /assigned_quantity/i.test(String(sizeError.message || ''))) {
            const quantityCompatRows = sizeDistributions.map(({ assigned_quantity, ...rest }) => ({
              ...rest,
              quantity: assigned_quantity,
            }));
            ({ error: sizeError } = await supabase
              .from('order_batch_size_distributions')
              .insert(quantityCompatRows as any));
          }

          if (sizeError) {
            console.error('Size distribution error:', sizeError);
            throw sizeError;
          }
          console.log('Size distributions inserted successfully');
        }

        // Update the batch assignment with calculated total from size distributions
        const calculatedTotal = sizeDistributions.reduce((sum, dist) => sum + dist.assigned_quantity, 0);
        if (calculatedTotal > 0) {
          await supabase
            .from('order_batch_assignments')
            .update({ 
              total_quantity: calculatedTotal,
              updated_at: new Date().toISOString()
            })
            .eq('id', (assignmentResult as any)?.id);
        }
      }

      toast({
        title: 'Success',
        description: `Batch assignments saved for order ${orderNumber}`,
      });

      const persistCb = onAssignmentsSaved ?? onSuccess;
      const orderItemIds = (orderItems || []).map((i: any) => i.id).filter(Boolean) as string[];
      const idx = selectedOrderItemId ? orderItemIds.indexOf(selectedOrderItemId) : -1;
      const isLastLine = idx < 0 || idx === orderItemIds.length - 1;
      const isMulti = orderItemIds.length > 1;

      const notify = (sessionOutcome: LineAssignmentSavePayload['sessionOutcome']) => {
        onLineAssignmentSaved?.({
          orderItemId: selectedOrderItemId ?? null,
          sessionOutcome,
        });
      };

      // Assign this product only & close — no automatic job card (user uses row PDF later).
      if (assignmentSessionMode === 'this_line_only') {
        notify('single_exit');
        persistCb();
        onClose();
        return;
      }

      // Multi-line wizard: defer PDF until last line; then full-order job card from parent.
      if (isMulti && assignmentSessionMode === 'continue_wizard') {
        if (!isLastLine) {
          notify('advance_wizard');
          persistCb();
          onClose();
          return;
        }
        notify('wizard_complete');
        persistCb();
        void Promise.resolve(onRequestFullOrderJobCard?.(orderId)).then(() => {
          toast({
            title: 'Job card ready',
            description: 'Review the preview for all assigned lines — print or export A5 landscape PDF.',
          });
        });
        onClose();
        return;
      }

      // Legacy: single-line order (or no session mode) — per-save job card from current distribution.
      console.log('📄 Building stitching job card preview...');
      const doc = await buildJobCardDocumentAfterSave();
      notify('legacy_per_line_pdf');

      if (doc && doc.batchAssignments.length > 0 && onJobCardDocumentReady) {
        onJobCardDocumentReady(doc);
        persistCb();
        toast({
          title: 'Job card ready',
          description: 'Review the preview to print or export A5 landscape PDF.',
        });
        onClose();
      } else if (doc && doc.batchAssignments.length > 0) {
        toast({
          title: 'Job card ready',
          description: 'Assignments saved.',
        });
        persistCb();
        onClose();
      } else {
        toast({
          title: 'Warning',
          description:
            'Assignments saved, but the job card could not be prepared. Check console for details.',
          variant: 'destructive',
        });
        persistCb();
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving batch assignments:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      toast({
        title: "Error",
        description: error.message || "Failed to save batch assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedBatches = batches.filter(batch => selectedBatchIds.includes(batch.id));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribute Quantity to Batches</DialogTitle>
          <DialogDescription>
            Assign size-wise quantities to selected batches for order {orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex space-x-6">
              {/* Product Image */}
              <div className="w-24 h-24 bg-blue-100 rounded-lg overflow-hidden flex items-center justify-center">
                {(() => {
                  const displayImage = selectedLine ? getOrderItemDisplayImage(selectedLine) : null;
                  return displayImage ? (
                    <img 
                      src={displayImage} 
                      alt={selectedLine?.product_category?.category_name || 'Product'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-blue-200 rounded flex items-center justify-center">
                      <span className="text-blue-600 text-xs">IMG</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm"><span className="font-medium">Order:</span> {orderNumber}</p>
                <p className="text-sm"><span className="font-medium">Customer:</span> {customerName}</p>
                <p className="text-sm"><span className="font-medium">Product:</span> {selectedLine?.product_description || selectedLine?.product_category?.category_name || 'Product'}</p>
                {selectedLine?.fabric && (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium shrink-0">Fabric:</span>
                  <div className="flex items-center space-x-3 flex-wrap justify-end">
                    {selectedLine.fabric.image && (
                      <img 
                        src={selectedLine.fabric.image} 
                        alt="Fabric"
                        className="rounded object-cover border border-gray-200"
                        style={{ width: '64px', height: '64px' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div 
                      className="w-6 h-6 shrink-0 rounded-full border border-gray-300"
                      style={{ 
                        backgroundColor: fabricSwatchCss({
                          color: selectedLine.fabric.color,
                          hex: selectedLine.fabric.hex ?? null,
                        }),
                      }}
                      title={selectedLine.fabric.color || 'Fabric color'}
                    />
                    <span className="text-sm">{selectedLine.fabric.fabric_name || 'N/A'} - {selectedLine.fabric.gsm || 'N/A'} GSM, {selectedLine.fabric.color || 'N/A'}</span>
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* Remaining Quantity */}
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <h4 className="font-medium text-red-800 mb-3">Remaining Pcs to Distribute</h4>
            {filteredOrderSizes.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <p>No sizes with quantities found for this order.</p>
              </div>
            ) : (
              <div className={`grid gap-2 ${
                filteredOrderSizes.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
                filteredOrderSizes.length <= 6 ? 'grid-cols-3 md:grid-cols-6' :
                'grid-cols-4 md:grid-cols-8'
              }`}>
                {filteredOrderSizes.map((size) => {
                  const remaining = getRemainingQuantity(size.size_name);
                  return (
                    <div key={size.size_name} className="text-center p-2 border rounded bg-white">
                      <div className="text-xs text-gray-600">{size.size_name}</div>
                      <div className="font-semibold text-gray-900">{remaining}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Batch Assignment Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedBatches.map((batch) => (
              <Card key={batch.id} className="border border-gray-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={batch.batch_leader_avatar} alt={batch.batch_leader_name} />
                      <AvatarFallback className="bg-gray-200 text-gray-700">
                        {batch.batch_leader_name?.charAt(0) || batch.batch_name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-sm">{batch.batch_name}</CardTitle>
                      <p className="text-xs text-gray-500">{batch.batch_leader_name}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {filteredOrderSizes.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-sm">No sizes with quantities</p>
                    </div>
                  ) : (
                    filteredOrderSizes.map((size) => {
                      const quantity = batchQuantities[batch.id]?.[size.size_name] || 0;
                      const remaining = getRemainingQuantity(size.size_name) + quantity;
                      return (
                        <div key={size.size_name} className="flex items-center justify-between">
                          <Label className="text-sm font-medium">{size.size_name}</Label>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => decrementQuantity(batch.id, size.size_name)}
                              disabled={quantity <= 0}
                              className="w-8 h-8 p-0"
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <Input
                              type="number"
                              value={quantity}
                              onChange={(e) => updateQuantity(batch.id, size.size_name, parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-sm text-center"
                              min="0"
                              max={remaining}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => incrementQuantity(batch.id, size.size_name)}
                              disabled={remaining <= 0}
                              className="w-8 h-8 p-0"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="pt-2 border-t">
                    <div className="text-xs text-center text-gray-600">
                      Total: <span className="font-semibold">{getTotalQuantityForBatch(batch.id)}</span> pieces
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add More Batches Button */}
          <div className="flex justify-center">
            <Button 
              variant="outline" 
              className="flex items-center space-x-2"
              onClick={onAddMoreBatches}
            >
              <Plus className="w-4 h-4" />
              <span>Add more Batches</span>
            </Button>
          </div>
        </div>

        <DialogFooter className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || filteredOrderSizes.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Saving...' : 'Save Assignments'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
