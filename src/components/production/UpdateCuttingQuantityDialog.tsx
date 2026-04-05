import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Minus, Plus, Package, Scissors, Droplets } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSizeTypes } from '@/hooks/useSizeTypes';
import { sortSizeDistributionsByMasterOrder } from '@/utils/sizeSorting';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import {
  normalizeToByOrderItem,
  buildStoredPayloadFromByOrderItem,
  sumAllCutsInStoredJson,
} from '@/utils/cutQuantitiesStorage';
import { sizesFromOrderItem } from '@/utils/sizesFromOrderItem';
import { getOrderItemLineQuantity } from '@/utils/orderItemLineQuantity';
import { resolveSwatchHex } from '@/lib/grnColorSwatch';
import { normalizeGsmVariants } from '@/components/purchase-orders/bomInventoryAllocation';
import '@/components/purchase-orders/BomLinePicker.css';

function normLower(s: string | null | undefined): string {
  return `${s ?? ''}`.trim().toLowerCase();
}

/**
 * Match warehouse `item_name` to a specific fabric_master variant (not just base name).
 */
function warehouseItemNameMatchesFabricVariant(
  itemName: string | undefined,
  fabric: { fabric_name?: string | null; color?: string | null; gsm?: string | number | null }
): boolean {
  const n = normLower(itemName);
  if (!n) return false;
  const fname = normLower(fabric.fabric_name);
  if (!fname) return false;
  const nameOk = n === fname || n.includes(fname) || fname.includes(n);
  if (!nameOk) return false;
  const color = normLower(fabric.color);
  if (color && !n.includes(color)) return false;
  const gsmVars = normalizeGsmVariants(`${fabric.gsm ?? ''}`);
  if (gsmVars.length > 0) {
    const gsmOk = gsmVars.some((g) => {
      const g2 = normLower(g);
      if (!g2) return false;
      return n.includes(g2) || n.includes(g2.replace(/\s/g, ''));
    });
    if (!gsmOk) return false;
  }
  return true;
}

function fabricSwatchCss(fabric: { color?: string | null; hex?: string | null } | null | undefined): string {
  if (!fabric) return '#e5e7eb';
  const label = String(fabric.color ?? '').trim();
  return resolveSwatchHex(label, fabric.hex ?? null) ?? '#e5e7eb';
}

interface OrderSize {
  size_name: string;
  total_quantity: number;
  cut_quantity?: number;
}

interface AvailableFabric {
  fabric_id: string;
  fabric_name: string;
  color: string;
  hex?: string | null;
  gsm: number;
  image?: string;
  available_quantity: number;
  unit: string;
}

interface FabricUsage {
  fabric_id: string;
  used_quantity: number;
  cutting_quantity: number;
}

interface UpdateCuttingQuantityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  jobId: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  orderItems: any[];
  currentCutQuantities?: { [size: string]: number };
}

export const UpdateCuttingQuantityDialog: React.FC<UpdateCuttingQuantityDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  jobId,
  orderNumber,
  customerName,
  productName,
  orderItems,
  currentCutQuantities: _currentCutQuantities = {},
}) => {
  const { sizeTypes } = useSizeTypes();
  const [additionalCutQuantities, setAdditionalCutQuantities] = useState<{ [size: string]: number }>({});
  const [existingCutQuantities, setExistingCutQuantities] = useState<{ [size: string]: number }>({});
  const [orderSizes, setOrderSizes] = useState<OrderSize[]>([]);
  const [availableFabrics, setAvailableFabrics] = useState<AvailableFabric[]>([]);
  const [fullCutRaw, setFullCutRaw] = useState<unknown>({});
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
  const [fabricUsage, setFabricUsage] = useState<FabricUsage>({
    fabric_id: '',
    used_quantity: 0,
    cutting_quantity: 0,
  });
  const [loading, setLoading] = useState(false);
  /** Bumped after fabric is deducted so we re-fetch availability while the dialog stays open (multi-line cutting). */
  const [fabricAvailabilityTick, setFabricAvailabilityTick] = useState(0);

  const sortSizes = (sizes: OrderSize[], sizeTypeId?: string | null) => {
    if (!sizes || sizes.length === 0) return sizes;
    
    // Get size_type_id from orderItems if not provided
    let typeId = sizeTypeId;
    if (!typeId && orderItems && orderItems.length > 0) {
      const firstItem = orderItems[0];
      typeId = firstItem.size_type_id || (firstItem.specifications && typeof firstItem.specifications === 'object' && firstItem.specifications.size_type_id) || null;
    }
    
    // Use master-based sorting
    return sortSizeDistributionsByMasterOrder(sizes, typeId || null, sizeTypes);
  };

  useEffect(() => {
    if (!isOpen || !jobId) return;
    let cancelled = false;

    const run = async () => {
      try {
        const { data: existingData, error: existingError } = await supabase
          .from('order_assignments')
          .select('cut_quantities_by_size')
          .eq('order_id', jobId)
          .maybeSingle();

        if (existingError && (existingError as any).code !== 'PGRST116') {
          console.warn('order_assignments fetch:', existingError);
        }
        if (!cancelled) {
          setFullCutRaw(existingData?.cut_quantities_by_size ?? {});
        }

        if (!orderItems?.length) {
          if (!cancelled) setAvailableFabrics([]);
          return;
        }

        const fabricIds = Array.from(
          new Set(orderItems.map((item: any) => item.fabric_id).filter(Boolean))
        );

        if (fabricIds.length === 0) {
          if (!cancelled) setAvailableFabrics([]);
          return;
        }

        const { data: fabricData, error: fabricError } = await supabase
          .from('fabric_master')
          .select('id, fabric_name, color, gsm, image, inventory, uom, hex')
          .in('id', fabricIds);

        if (fabricError || !fabricData) {
          if (!cancelled) setAvailableFabrics([]);
          return;
        }

        const { data: warehouseInventory, error: warehouseError } = await supabase
          .from('warehouse_inventory')
          .select('item_id, item_name, quantity, unit')
          .eq('item_type', 'FABRIC')
          .in('status', ['IN_STORAGE', 'RECEIVED']);

        const fabricIdSet = new Set(fabricIds);
        const warehouseInventoryMap: Record<string, { quantity: number; unit: string }> = {};
        if (!warehouseError && warehouseInventory) {
          warehouseInventory.forEach((invRow: any) => {
            const fabricId = invRow.item_id as string | undefined;
            const fabricName = invRow.item_name as string | undefined;

            let matchKey: string | null = null;
            if (fabricId && fabricIdSet.has(fabricId)) {
              matchKey = fabricId;
            } else {
              const candidates = (fabricData as any[]).filter(
                (f: any) =>
                  fabricIdSet.has(f.id) && warehouseItemNameMatchesFabricVariant(fabricName, f)
              );
              if (candidates.length === 1) {
                matchKey = candidates[0].id;
              }
            }

            if (matchKey) {
              const current = warehouseInventoryMap[matchKey] || {
                quantity: 0,
                unit: invRow.unit || 'kgs',
              };
              warehouseInventoryMap[matchKey] = {
                quantity: current.quantity + Number(invRow.quantity || 0),
                unit: invRow.unit || current.unit || 'kgs',
              };
            }
          });
        }

        const fabrics: AvailableFabric[] = fabricData.map((fabric: any) => {
          const warehouseInv = warehouseInventoryMap[fabric.id];
          const masterQty = Number(fabric.inventory || 0);
          const whQty = warehouseInv ? Number(warehouseInv.quantity || 0) : null;
          // Prefer the tighter figure when warehouse totals and fabric_master diverge (e.g. after deduction).
          let inventoryQty: number;
          if (whQty != null && whQty > 0) {
            inventoryQty = masterQty > 0 ? Math.min(masterQty, whQty) : whQty;
          } else {
            inventoryQty = masterQty;
          }
          const inventoryUnit = fabric.uom || warehouseInv?.unit || 'kgs';

          return {
            fabric_id: fabric.id,
            fabric_name: fabric.fabric_name,
            color: fabric.color || '',
            hex: fabric.hex ?? null,
            gsm: fabric.gsm || 0,
            image: fabric.image,
            available_quantity: inventoryQty,
            unit: inventoryUnit,
          };
        });

        if (!cancelled) {
          setAvailableFabrics(fabrics);
        }
      } catch (error) {
        console.error('Error fetching cutting dialog data:', error);
        if (!cancelled) toast.error('Failed to fetch order data');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId, orderItems, fabricAvailabilityTick]);

  useEffect(() => {
    if (!isOpen || !orderItems?.length) return;
    setSelectedOrderItemId(prev => {
      if (prev && orderItems.some((i: any) => i.id === prev)) return prev;
      return orderItems[0]?.id ?? null;
    });
  }, [isOpen, orderItems]);

  useEffect(() => {
    if (!isOpen || !jobId || !selectedOrderItemId || !orderItems?.length) return;

    const item = orderItems.find((i: any) => i.id === selectedOrderItemId);
    if (!item) return;

    let cancelled = false;

    const run = async () => {
      let sizes = sizesFromOrderItem(item);

      if (sizes.length === 0 && orderItems.length === 1) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_order_sizes', {
          order_id_param: jobId,
        });
        if (!cancelled && !rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
          sizes = rpcData
            .filter((s: any) => Number(s.total_quantity) > 0)
            .map((s: any) => ({
              size_name: String(s.size_name),
              total_quantity: Number(s.total_quantity),
            }));
        }
      }

      let specs = item.specifications;
      if (typeof specs === 'string') {
        try {
          specs = JSON.parse(specs);
        } catch {
          specs = null;
        }
      }
      const sizeTypeId =
        item.size_type_id ||
        (specs && typeof specs === 'object' ? (specs as { size_type_id?: string }).size_type_id : null);

      const sorted = sortSizes(sizes, sizeTypeId || null);
      const itemIds = orderItems.map((i: any) => i.id).filter(Boolean) as string[];
      const byItem = normalizeToByOrderItem(fullCutRaw, itemIds);
      const existing = { ...(byItem[selectedOrderItemId] || {}) };

      if (!cancelled) {
        setOrderSizes(sorted);
        setExistingCutQuantities(existing);
        const init: Record<string, number> = {};
        sorted.forEach(s => {
          init[s.size_name] = 0;
        });
        setAdditionalCutQuantities(init);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId, selectedOrderItemId, fullCutRaw, orderItems, sizeTypes]);

  useEffect(() => {
    if (!selectedOrderItemId || !availableFabrics.length || !orderItems?.length) return;
    const line = orderItems.find((i: any) => i.id === selectedOrderItemId);
    const fid = line?.fabric_id ? String(line.fabric_id) : '';
    const filtered = fid ? availableFabrics.filter(f => f.fabric_id === fid) : availableFabrics;
    const pick = filtered[0]?.fabric_id || availableFabrics[0]?.fabric_id || '';
    if (pick) {
      setFabricUsage(prev => ({ ...prev, fabric_id: pick }));
    }
  }, [selectedOrderItemId, availableFabrics, orderItems]);

  const updateAdditionalQuantity = (size: string, quantity: number) => {
    const orderSize = orderSizes.find(s => s.size_name === size);
    const totalQty = orderSize?.total_quantity || 0;
    const existingCutQty = existingCutQuantities[size] || 0;
    const maxAdditional = totalQty - existingCutQty;
    
    const newQuantity = Math.max(0, Math.min(quantity, maxAdditional));
    
    setAdditionalCutQuantities(prev => ({
      ...prev,
      [size]: newQuantity
    }));
  };

  const incrementAdditionalQuantity = (size: string) => {
    const current = additionalCutQuantities[size] || 0;
    updateAdditionalQuantity(size, current + 1);
  };

  const decrementAdditionalQuantity = (size: string) => {
    const current = additionalCutQuantities[size] || 0;
    updateAdditionalQuantity(size, current - 1);
  };

  const getTotalAdditionalCutQuantity = () => {
    return Object.values(additionalCutQuantities).reduce((total, qty) => total + qty, 0);
  };

  const getTotalExistingCutQuantity = () => {
    return Object.values(existingCutQuantities).reduce((total, qty) => total + qty, 0);
  };

  const getTotalOrderQuantity = () => {
    return orderSizes.reduce((total, size) => total + size.total_quantity, 0);
  };

  const getRemainingQuantity = (size: string) => {
    const orderSize = orderSizes.find(s => s.size_name === size);
    const totalQty = orderSize?.total_quantity || 0;
    const existingCutQty = existingCutQuantities[size] || 0;
    return totalQty - existingCutQty;
  };

  const getTotalCutQuantityAfterUpdate = () => {
    return getTotalExistingCutQuantity() + getTotalAdditionalCutQuantity();
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Validate fabric usage - now mandatory when adding cut quantities
      const totalAdditionalCutQty = getTotalAdditionalCutQuantity();
      if (totalAdditionalCutQty > 0) {
        if (!fabricUsage.fabric_id || fabricUsage.used_quantity <= 0) {
          toast.error('Please select fabric and enter used quantity for this cutting operation');
          setLoading(false);
          return;
        }

        // Validate fabric availability
        const selectedFabric = availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id);
        if (!selectedFabric) {
          toast.error('Selected fabric not found');
          setLoading(false);
          return;
        }

        if (fabricUsage.used_quantity > selectedFabric.available_quantity) {
          toast.error(`Insufficient fabric inventory. Available: ${selectedFabric.available_quantity.toFixed(2)} ${selectedFabric.unit}`);
          setLoading(false);
          return;
        }
      }

      if (!selectedOrderItemId) {
        toast.error('Select a product line before saving');
        setLoading(false);
        return;
      }

      const lineMerged: Record<string, number> = {};
      orderSizes.forEach(size => {
        const existing = existingCutQuantities[size.size_name] || 0;
        const additional = additionalCutQuantities[size.size_name] || 0;
        lineMerged[size.size_name] = existing + additional;
      });

      const itemIds = orderItems.map((i: any) => i.id).filter(Boolean) as string[];
      const { data: freshRow } = await supabase
        .from('order_assignments')
        .select('cut_quantities_by_size')
        .eq('order_id', jobId)
        .maybeSingle();

      const norm = normalizeToByOrderItem(freshRow?.cut_quantities_by_size ?? fullCutRaw, itemIds);
      norm[selectedOrderItemId] = lineMerged;
      const storedPayload = buildStoredPayloadFromByOrderItem(norm);
      const totalCutAllLines = sumAllCutsInStoredJson(storedPayload);

      console.log('Saving cutting quantities:', {
        jobId,
        selectedOrderItemId,
        lineMerged,
        storedPayload,
        totalCutAllLines,
        fabricUsage,
      });

      const { error } = await supabase
        .from('order_assignments')
        .upsert(
          {
            order_id: jobId,
            cut_quantity: totalCutAllLines,
            cut_quantities_by_size: storedPayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'order_id' }
        );

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      // Record fabric usage and deduct from inventory if fabric is selected
      if (fabricUsage.fabric_id && fabricUsage.used_quantity > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const selectedFabric = availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id);
        const fabricUnit = selectedFabric?.unit || 'kgs';
        
        // Verify fabric exists in fabric_master before inserting
        const { data: fabricCheck, error: fabricCheckError } = await supabase
          .from('fabric_master')
          .select('id')
          .eq('id', fabricUsage.fabric_id)
          .single();

        if (fabricCheckError || !fabricCheck) {
          console.warn('Fabric not found in fabric_master, skipping fabric_usage_records insert:', fabricUsage.fabric_id);
          toast.error('Fabric validation failed. Cutting quantities saved but fabric usage not recorded.');
        } else {
          // Record fabric usage - try different column names based on schema variations
          const usageRecord: any = {
            order_id: jobId,
            fabric_id: fabricUsage.fabric_id,
            used_quantity: fabricUsage.used_quantity,
            unit: fabricUnit,
            used_for_cutting_date: new Date().toISOString(),
            used_by_id: user?.id || null,
            used_by_name: user?.user_metadata?.full_name || user?.email || 'System',
            cutting_quantity: getTotalAdditionalCutQuantity(),
            notes: `Cutting operation for ${getTotalAdditionalCutQuantity()} pieces`
          };

          // Try insert with used_quantity first
          let { error: fabricUsageError } = await supabase
            .from('fabric_usage_records')
            .insert(usageRecord);

          // If that fails, try with actual_quantity instead (some schemas use different column names)
          if (fabricUsageError && fabricUsageError.message?.includes('column')) {
            const altUsageRecord = {
              order_id: jobId,
              fabric_id: fabricUsage.fabric_id,
              actual_quantity: fabricUsage.used_quantity,
              unit: fabricUnit,
              used_at: new Date().toISOString(),
              used_by: user?.id || null,
              notes: `Cutting operation for ${getTotalAdditionalCutQuantity()} pieces`
            };

            const { error: altError } = await supabase
              .from('fabric_usage_records')
              .insert(altUsageRecord);

            if (altError) {
              console.error('Fabric usage error (both attempts failed):', fabricUsageError, altError);
              // Don't throw - just log and continue, since cutting quantities are saved
              toast.error('Cutting quantities saved, but fabric usage record failed. Check console for details.');
            }
          } else if (fabricUsageError) {
            console.error('Fabric usage error:', fabricUsageError);
            // Check if it's a foreign key constraint error
            if (fabricUsageError.message?.includes('foreign key') || fabricUsageError.message?.includes('fkey')) {
              console.error('Foreign key constraint violation. fabric_id might not exist in referenced table.');
              toast.error('Fabric ID validation failed. Cutting quantities saved but fabric usage not recorded.');
            } else {
              // For other errors, still log but don't block the save
              toast.error('Cutting quantities saved, but fabric usage record had an error.');
            }
          }
        }

        // Deduct from fabric_master inventory
        const { data: currentFabricData, error: fetchError } = await supabase
          .from('fabric_master')
          .select('inventory')
          .eq('id', fabricUsage.fabric_id)
          .single();

        if (!fetchError && currentFabricData) {
          const currentInventory = Number((currentFabricData as any).inventory || 0);
          const newInventory = Math.max(0, currentInventory - fabricUsage.used_quantity);

          const { error: inventoryUpdateError } = await supabase
            .from('fabric_master')
            .update({
              inventory: newInventory
            } as any)
            .eq('id', fabricUsage.fabric_id);

          if (inventoryUpdateError) {
            console.error('Error updating fabric_master inventory:', inventoryUpdateError);
            // Don't throw - just log the error
          } else {
            console.log(`Updated fabric_master inventory: ${fabricUsage.fabric_id} - ${currentInventory} - ${fabricUsage.used_quantity} = ${newInventory}`);
          }
        }

        // Also deduct from warehouse_inventory if records exist
        try {
          const { data: warehouseInventory, error: warehouseError } = await supabase
            .from('warehouse_inventory')
            .select('id, quantity, item_id, item_name')
            .eq('item_type', 'FABRIC')
            .or(`item_id.eq.${fabricUsage.fabric_id},item_name.eq.${selectedFabric?.fabric_name || ''}`);

          if (!warehouseError && warehouseInventory && warehouseInventory.length > 0) {
            // Update the first matching record (or you could update all matching records)
            const bestMatch = warehouseInventory
              .filter(r => Number(r.quantity || 0) > 0)
              .sort((a: any, b: any) => Number(b.quantity || 0) - Number(a.quantity || 0))[0] 
              || warehouseInventory[0];

            if (bestMatch) {
              const currentQty = Number(bestMatch.quantity || 0);
              const newQty = Math.max(0, currentQty - fabricUsage.used_quantity);

              const { error: warehouseUpdateError } = await supabase
                .from('warehouse_inventory')
                .update({
                  quantity: newQty,
                  updated_at: new Date().toISOString()
                })
                .eq('id', bestMatch.id);

              if (warehouseUpdateError) {
                console.error('Error updating warehouse_inventory:', warehouseUpdateError);
              } else {
                console.log(`Updated warehouse_inventory: ${bestMatch.id} - ${currentQty} - ${fabricUsage.used_quantity} = ${newQty}`);
                
                // Log the inventory removal for cutting
                try {
                  const { logInventoryRemoval } = await import('@/utils/inventoryLogging');
                  await logInventoryRemoval(
                    bestMatch.id,
                    {
                      item_type: bestMatch.item_type || 'FABRIC',
                      item_id: bestMatch.item_id || undefined,
                      item_name: bestMatch.item_name || fabricUsage.fabric_name || 'Unknown',
                      item_code: bestMatch.item_code || bestMatch.item_name || 'Unknown',
                      unit: bestMatch.unit || 'kgs',
                    },
                    fabricUsage.used_quantity,
                    currentQty,
                    newQty,
                    {
                      bin_id: bestMatch.bin_id || undefined,
                      status: bestMatch.status || 'RECEIVED',
                      color: bestMatch.fabric_color || bestMatch.item_color || undefined,
                      reference_type: 'CUTTING',
                      reference_id: jobId || undefined,
                      reference_number: orderNumber || undefined,
                      notes: `Fabric used in cutting - Job: ${jobId || 'N/A'}, Order: ${orderNumber || 'N/A'}`
                    }
                  );
                } catch (logError) {
                  console.error('Error logging inventory removal:', logError);
                }
              }
            }
          }
        } catch (warehouseError) {
          console.error('Error processing warehouse inventory update:', warehouseError);
          // Don't throw - just log the error
        }

        setFabricAvailabilityTick((t) => t + 1);
      }

      const addedPieces = getTotalAdditionalCutQuantity();
      const lineIndex = orderItems.findIndex((i: any) => i.id === selectedOrderItemId);
      const hasAnotherLine =
        orderItems.length > 1 &&
        lineIndex >= 0 &&
        lineIndex < orderItems.length - 1;

      if (hasAnotherLine) {
        setFullCutRaw(storedPayload);
        setFabricUsage({ fabric_id: '', used_quantity: 0, cutting_quantity: 0 });
        setSelectedOrderItemId(orderItems[lineIndex + 1].id);
        onSuccess();
        toast.success(`Added ${addedPieces} pieces. Continue with the next product line.`);
      } else {
        toast.success(`Cutting quantities updated successfully! Added ${addedPieces} pieces.`);
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving cutting quantities:', error);
      toast.error(error.message || 'Failed to save cutting quantities');
    } finally {
      setLoading(false);
    }
  };

  const selectedLine =
    orderItems.find((i: any) => i.id === selectedOrderItemId) || orderItems[0] || null;
  const fabricsForPicker =
    selectedLine?.fabric_id &&
    availableFabrics.some(f => f.fabric_id === selectedLine.fabric_id)
      ? availableFabrics.filter(f => f.fabric_id === selectedLine.fabric_id)
      : availableFabrics;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Scissors className="w-5 h-5 text-blue-600" />
            <span>Add Cutting Quantity - Size Wise</span>
          </DialogTitle>
          <DialogDescription>
            Add additional cutting quantities for each size for order {orderNumber}. These will be added to existing cut quantities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex space-x-6">
              <div className="w-20 h-20 bg-blue-100 rounded-lg overflow-hidden flex items-center justify-center">
                {(() => {
                  const displayImage = selectedLine ? getOrderItemDisplayImage(selectedLine) : null;
                  return displayImage ? (
                  <img 
                      src={displayImage} 
                      alt={selectedLine?.product_category?.category_name || 'Product'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-10 h-10 text-blue-600" />
                  );
                })()}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm"><span className="font-medium">Order:</span> {orderNumber}</p>
                <p className="text-sm"><span className="font-medium">Customer:</span> {customerName}</p>
                <p className="text-sm">
                  <span className="font-medium">Product:</span>{' '}
                  {selectedLine?.product_description || productName}
                </p>
                {selectedLine?.fabric && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium">Fabric:</span>
                    <div className="flex items-center space-x-2">
                      {selectedLine.fabric.image && (
                        <img 
                          src={selectedLine.fabric.image} 
                          alt="Fabric"
                          className="rounded object-cover border border-gray-200"
                          style={{ width: '48px', height: '48px' }}
                        />
                      )}
                      <div
                        className="w-5 h-5 shrink-0 rounded-full border border-gray-300"
                        style={{
                          backgroundColor: fabricSwatchCss({
                            color: selectedLine.fabric.color,
                            hex:
                              selectedLine.fabric.hex ??
                              availableFabrics.find((f) => f.fabric_id === selectedLine.fabric_id)?.hex ??
                              null,
                          }),
                        }}
                        title={selectedLine.fabric.color || 'Fabric color'}
                      />
                      <span className="text-sm">{selectedLine.fabric.fabric_name} - {selectedLine.fabric.gsm} GSM, {selectedLine.fabric.color}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {orderItems.length > 1 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Product line</Label>
              <p className="text-xs text-muted-foreground">
                Select which product you are cutting. Only sizes for that line appear below.
              </p>
              <div className="bom-line-radio-inputs" role="radiogroup" aria-label="Product line">
                {orderItems.map((it: any) => (
                  <label key={it.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="cutting-product-line"
                      className="bom-line-radio-input"
                      checked={selectedOrderItemId === it.id}
                      onChange={() => setSelectedOrderItemId(it.id)}
                    />
                    <span className="bom-line-radio-tile">
                      <span className="bom-line-radio-label">
                        {it.product_description || 'Product'}
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          {getOrderItemLineQuantity(it)} pcs
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Progress Summary */}
          <div className="grid grid-cols-4 gap-4">
            <p className="col-span-4 text-xs text-muted-foreground -mb-2">
              Figures below are for the selected product line only.
            </p>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Line order qty</div>
                <div className="text-2xl font-bold text-blue-600">{getTotalOrderQuantity()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Already Cut</div>
                <div className="text-2xl font-bold text-green-600">{getTotalExistingCutQuantity()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Adding Now</div>
                <div className="text-2xl font-bold text-purple-600">{getTotalAdditionalCutQuantity()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">After Update</div>
                <div className="text-2xl font-bold text-orange-600">{getTotalCutQuantityAfterUpdate()}</div>
              </CardContent>
            </Card>
          </div>

          {/* Fabric Usage Tracking - Now mandatory when adding cut quantities */}
          {fabricsForPicker.length > 0 && (
            <div>
              <h4 className="font-medium mb-4 flex items-center">
                <Droplets className="w-5 h-5 mr-2 text-blue-600" />
                Fabric Usage for This Cutting {getTotalAdditionalCutQuantity() > 0 && <span className="text-red-500 ml-2">*</span>}
              </h4>
              <Card className="border-blue-200 bg-blue-50/30">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Fabric Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="fabric-select">
                        Select Fabric Used: {getTotalAdditionalCutQuantity() > 0 && <span className="text-red-500">*</span>}
                      </Label>
                      <Select 
                        value={fabricUsage.fabric_id} 
                        onValueChange={(value) => setFabricUsage(prev => ({
                          ...prev,
                          fabric_id: value
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose fabric used for cutting" />
                        </SelectTrigger>
                        <SelectContent>
                          {fabricsForPicker.map((fabric) => (
                            <SelectItem key={fabric.fabric_id} value={fabric.fabric_id}>
                              <div className="flex items-center space-x-3">
                                {fabric.image && (
                                  <img 
                                    src={fabric.image} 
                                    alt={fabric.fabric_name}
                                    className="w-6 h-6 rounded object-cover border"
                                  />
                                )}
                                <div
                                  className={`shrink-0 rounded-full border border-gray-300 ${fabric.image ? 'w-4 h-4' : 'w-6 h-6'}`}
                                  style={{ backgroundColor: fabricSwatchCss(fabric) }}
                                  title={fabric.color || 'Color'}
                                />
                                <div>
                                  <div className="font-medium">{fabric.fabric_name}</div>
                                  <div className="text-xs text-gray-500">
                                    {fabric.color} • {fabric.gsm} GSM • Available: {fabric.available_quantity.toFixed(2)} {fabric.unit}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Fabric Quantity Used */}
                    <div className="space-y-2">
                      <Label htmlFor="fabric-quantity">
                        Fabric Quantity Used: {getTotalAdditionalCutQuantity() > 0 && <span className="text-red-500">*</span>}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="fabric-quantity"
                          type="number"
                          value={fabricUsage.used_quantity}
                          onChange={(e) => setFabricUsage(prev => ({
                            ...prev,
                            used_quantity: parseFloat(e.target.value) || 0
                          }))}
                          className="flex-1"
                          min="0"
                          step="0.1"
                          placeholder="Enter fabric quantity used"
                        />
                        <span className="text-sm text-gray-500">
                          {availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id)?.unit || 'kgs'}
                        </span>
                      </div>
                      {fabricUsage.fabric_id && (
                        <div className="text-xs text-gray-600">
                          Available: {(() => {
                            const fabric = availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id);
                            return fabric ? fabric.available_quantity.toFixed(2) : '0';
                          })()} {availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id)?.unit || 'kgs'}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {fabricUsage.fabric_id && fabricUsage.used_quantity > 0 && (
                    <div className="mt-3 p-3 bg-green-100 border border-green-200 rounded">
                      <div className="text-sm text-green-800">
                        ✓ Will record usage of {fabricUsage.used_quantity.toFixed(2)} {availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id)?.unit || 'kgs'} 
                        of {availableFabrics.find(f => f.fabric_id === fabricUsage.fabric_id)?.fabric_name || 'fabric'} 
                        for {getTotalAdditionalCutQuantity()} pieces and deduct from inventory
                      </div>
                    </div>
                  )}
                  {getTotalAdditionalCutQuantity() > 0 && (!fabricUsage.fabric_id || fabricUsage.used_quantity <= 0) && (
                    <div className="mt-3 p-3 bg-yellow-100 border border-yellow-200 rounded">
                      <div className="text-sm text-yellow-800">
                        ⚠️ Fabric usage is required when adding cut quantities
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Size-wise Cutting Quantities */}
          <div>
            <h4 className="font-medium mb-4">Add Additional Cutting Quantities by Size</h4>
            {orderSizes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No sizes with quantities found for this order.</p>
              </div>
            ) : (
              <div className={`grid gap-4 ${
                orderSizes.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                orderSizes.length <= 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
                'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              }`}>
                {orderSizes.map((size) => {
                const existingCutQty = existingCutQuantities[size.size_name] || 0;
                const additionalCutQty = additionalCutQuantities[size.size_name] || 0;
                const totalCutAfter = existingCutQty + additionalCutQty;
                const remaining = getRemainingQuantity(size.size_name);
                const progress = (totalCutAfter / size.total_quantity) * 100;
                
                return (
                  <Card key={size.size_name} className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-lg">{size.size_name}</div>
                          <div className="text-sm text-gray-500">
                            Order: {size.total_quantity} pcs
                          </div>
                        </div>
                        <div className="text-right text-xs space-y-1">
                          <div className="text-green-600">Already Cut: {existingCutQty}</div>
                          <div className="text-purple-600">Adding: {additionalCutQty}</div>
                          <div className="text-orange-600">Remaining: {remaining - additionalCutQty}</div>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            progress < 30 ? 'bg-red-500' :
                            progress < 70 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Additional Quantity Controls */}
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600 text-center">Add More Pieces:</div>
                        <div className="flex items-center justify-center space-x-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decrementAdditionalQuantity(size.size_name)}
                            disabled={additionalCutQty <= 0}
                            className="w-10 h-10 p-0"
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <Input
                            type="number"
                            value={additionalCutQty}
                            onChange={(e) => updateAdditionalQuantity(size.size_name, parseInt(e.target.value) || 0)}
                            className="w-24 h-10 text-center text-lg font-medium"
                            min="0"
                            max={remaining}
                            placeholder="0"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => incrementAdditionalQuantity(size.size_name)}
                            disabled={remaining <= 0}
                            className="w-10 h-10 p-0"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || orderSizes.length === 0 || getTotalAdditionalCutQuantity() === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Saving...' : `Add ${getTotalAdditionalCutQuantity()} Pieces`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
