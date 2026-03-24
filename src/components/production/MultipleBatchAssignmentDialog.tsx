import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Clock, User, Plus, Trash2, Calculator, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DistributeQuantityDialog } from './DistributeQuantityDialog';
import type { BatchAssignmentDocumentData } from '@/utils/batchAssignmentDocument';
import { useSizeTypes } from '@/hooks/useSizeTypes';
import { sortSizeDistributionsByMasterOrder } from '@/utils/sizeSorting';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { sizesFromOrderItem } from '@/utils/sizesFromOrderItem';
import { resolveSwatchHex } from '@/lib/grnColorSwatch';
import '@/components/purchase-orders/BomLinePicker.css';

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
  available_capacity: number;
}

interface OrderSize {
  size_name: string;
  total_quantity: number;
}

interface BatchAssignment {
  batch_id: string;
  batch_name: string;
  batch_code: string;
  size_distributions: { [size: string]: number };
  notes: string;
}

interface MultipleBatchAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  onSuccess: () => void;
  existingAssignments?: BatchAssignment[];
  orderItems?: any[];
  onJobCardDocumentReady?: (doc: BatchAssignmentDocumentData) => void;
}

export const MultipleBatchAssignmentDialog: React.FC<MultipleBatchAssignmentDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  customerName,
  onSuccess,
  existingAssignments = [],
  orderItems = [],
  onJobCardDocumentReady,
}) => {
  const { sizeTypes } = useSizeTypes();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orderSizes, setOrderSizes] = useState<OrderSize[]>([]);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [showDistributeDialog, setShowDistributeDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const { toast } = useToast();

  const selectedLine =
    orderItems.find((i: any) => i.id === selectedOrderItemId) || orderItems[0] || null;

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedBatches(new Set());
      setShowDistributeDialog(false);
      fetchData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !orderItems?.length) return;
    setSelectedOrderItemId((prev) => {
      if (prev && orderItems.some((i: any) => i.id === prev)) return prev;
      return orderItems[0]?.id ?? null;
    });
  }, [isOpen, orderItems]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // First try to fetch batches without relationships
      const { data: batchesData, error: batchesError } = await supabase
        .from('batches')
        .select('*')
        .eq('status', 'active')
        .order('batch_name');

      console.log('Batches query result:', { batchesData, batchesError });

      // Fetch all tailors to find batch leaders (same approach as TailorManagementPage)
      const { data: tailorsData, error: tailorsError } = await supabase
        .from('tailors')
        .select('id, full_name, avatar_url, batch_id, is_batch_leader')
        .eq('is_batch_leader', true);

      console.log('Batch leaders query result:', { tailorsData, tailorsError });

      if (batchesError) throw batchesError;

      // Create a map of batch leaders by batch_id (same approach as TailorManagementPage)
      const batchLeadersMap = new Map();
      (tailorsData || []).forEach(tailor => {
        if (tailor.batch_id) {
          batchLeadersMap.set(tailor.batch_id, tailor);
        }
      });

      const batchesWithLeader = (batchesData || []).map(batch => {
        const batchLeader = batchLeadersMap.get(batch.id);
        const processedBatch = {
        id: batch.id,
        batch_name: batch.batch_name,
        batch_code: batch.batch_code,
        tailor_type: batch.tailor_type,
        max_capacity: batch.max_capacity,
        current_capacity: batch.current_capacity,
        status: batch.status,
          batch_leader_name: batchLeader?.full_name || 'No Leader Assigned',
          batch_leader_avatar: batchLeader?.avatar_url || null,
        available_capacity: batch.max_capacity - batch.current_capacity
        };
        
        // Debug: Log batch processing
        if (batchLeader) {
          console.log('Batch with leader:', {
            batchId: batch.id,
            batchName: batch.batch_name,
            batchLeader: batchLeader.full_name,
            batchLeaderAvatar: batchLeader.avatar_url
          });
        } else {
          console.log('Batch without leader:', {
            batchId: batch.id,
            batchName: batch.batch_name
          });
        }
        
        return processedBatch;
      }).filter(batch => batch.available_capacity > 0);
      setBatches(batchesWithLeader);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setFetchingData(false);
    }
  };

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    const newSelection = new Set(selectedBatches);
    if (checked) {
      newSelection.add(batchId);
    } else {
      newSelection.delete(batchId);
    }
    setSelectedBatches(newSelection);
  };

  const getTotalQuantity = () => {
    return orderSizes.reduce((total, size) => total + size.total_quantity, 0);
  };

  const sortSizes = (sizes: OrderSize[], sizeTypeId?: string | null) => {
    if (!sizes || sizes.length === 0) return sizes;

    let typeId = sizeTypeId;
    if (!typeId && orderItems && orderItems.length > 0) {
      const line =
        (selectedOrderItemId && orderItems.find((i: any) => i.id === selectedOrderItemId)) ||
        orderItems[0];
      typeId =
        line?.size_type_id ||
        (line?.specifications &&
        typeof line.specifications === 'object' &&
        line.specifications.size_type_id) ||
        null;
    }

    return sortSizeDistributionsByMasterOrder(sizes, typeId || null, sizeTypes);
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadOrderSizes = async () => {
      try {
        let sizesData: OrderSize[] = [];

        if (orderItems && orderItems.length > 0) {
          const lineId =
            selectedOrderItemId && orderItems.some((i: any) => i.id === selectedOrderItemId)
              ? selectedOrderItemId
              : orderItems[0]?.id ?? null;
          if (!lineId) {
            if (!cancelled) setOrderSizes([]);
            return;
          }

          const item = orderItems.find((i: any) => i.id === lineId);
          if (!item) {
            if (!cancelled) setOrderSizes([]);
            return;
          }

          sizesData = sizesFromOrderItem(item).map((s) => ({
            size_name: s.size_name,
            total_quantity: s.total_quantity,
          }));

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

          if (sizesData.length === 0 && orderItems.length === 1) {
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_order_sizes', {
              order_id_param: orderId,
            });
            if (!cancelled && !rpcError && rpcData && Array.isArray(rpcData)) {
              sizesData = rpcData
                .filter((s: any) => Number(s.total_quantity) > 0)
                .map((s: any) => ({
                  size_name: String(s.size_name),
                  total_quantity: Number(s.total_quantity),
                }));
            }
          }

          const withQty = sizesData.filter((s) => Number(s.total_quantity) > 0);
          if (!cancelled) setOrderSizes(sortSizes(withQty, sizeTypeId || null));
          return;
        }

        if (orderId) {
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_order_sizes', {
              order_id_param: orderId,
            });
            if (!cancelled && !rpcError && rpcData && Array.isArray(rpcData)) {
              const mapped = (rpcData as any[])
                .filter((s) => Number(s.total_quantity) > 0)
                .map((s) => ({
                  size_name: String(s.size_name),
                  total_quantity: Number(s.total_quantity),
                }));
              sizesData = sortSizes(mapped);
            } else if (rpcError) {
              console.warn('get_order_sizes failed:', rpcError);
              const { data: itemsData, error: itemsError } = await supabase
                .from('order_items')
                .select('sizes_quantities')
                .eq('order_id', orderId);

              if (!cancelled && !itemsError && itemsData) {
                const sizeMap = new Map<string, number>();
                (itemsData || []).forEach((row: any) => {
                  if (row.sizes_quantities) {
                    Object.entries(row.sizes_quantities).forEach(([size, qty]) => {
                      const quantity = typeof qty === 'number' ? qty : parseInt(String(qty), 10) || 0;
                      sizeMap.set(size, (sizeMap.get(size) || 0) + quantity);
                    });
                  }
                });
                sizesData = sortSizes(
                  Array.from(sizeMap.entries())
                    .map(([size_name, total_quantity]) => ({ size_name, total_quantity }))
                    .filter((s) => Number(s.total_quantity) > 0)
                );
              }
            }
          } catch (fallbackError) {
            console.error('Order sizes fallback failed:', fallbackError);
            sizesData = [];
          }
        }

        if (!cancelled) {
          setOrderSizes(
            sizesData.filter((s) => Number(s.total_quantity) > 0)
          );
        }
      } catch (e) {
        console.error('loadOrderSizes:', e);
        if (!cancelled) setOrderSizes([]);
      }
    };

    void loadOrderSizes();
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, orderItems, selectedOrderItemId, sizeTypes]);

  const handleDistributeClick = () => {
    if (selectedBatches.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one batch",
        variant: "destructive",
      });
      return;
    }
    setShowDistributeDialog(true);
  };

  const handleDistributeDialogClose = () => {
    setShowDistributeDialog(false);
  };

  const handleDistributeDialogSuccess = () => {
    setShowDistributeDialog(false);
    onSuccess();
    onClose();
  };

  const handleAddMoreBatches = () => {
    setShowDistributeDialog(false);
    // Keep the current selected batches and go back to batch selection
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Multiple Batches to Order</DialogTitle>
          <DialogDescription>
            Select batches and distribute quantities for order {orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
            {/* Order Details Section */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Order Details</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex space-x-6">
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
                        <Package className="w-10 h-10 text-blue-600" />
                      );
                    })()}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">Order:</span> {orderNumber}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Customer:</span> {customerName}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Product:</span>{' '}
                      {selectedLine?.product_description ||
                        selectedLine?.product_category?.category_name ||
                        'Product'}
                    </p>
                    {selectedLine?.fabric && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Fabric:</span>
                        <div className="flex items-center gap-2">
                          {selectedLine.fabric.image && (
                            <img
                              src={selectedLine.fabric.image}
                              alt="Fabric"
                              className="rounded object-cover border border-gray-200 w-12 h-12"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div
                            className="w-5 h-5 shrink-0 rounded-full border border-gray-300"
                            style={{
                              backgroundColor: fabricSwatchCss({
                                color: selectedLine.fabric.color,
                                hex: selectedLine.fabric.hex ?? null,
                              }),
                            }}
                            title={selectedLine.fabric.color || 'Fabric color'}
                          />
                          <span className="text-sm">
                            {selectedLine.fabric.fabric_name} - {selectedLine.fabric.gsm} GSM,{' '}
                            {selectedLine.fabric.color}
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="text-sm">
                      <span className="font-medium">Line quantity:</span> {getTotalQuantity()} pcs
                      {orderItems.length > 1 && (
                        <span className="text-muted-foreground text-xs ml-1">(selected line only)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {orderItems.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Product line</Label>
                <p className="text-xs text-muted-foreground">
                  Choose which product to assign batches for. Sizes below match this line only.
                </p>
                <div className="bom-line-radio-inputs" role="radiogroup" aria-label="Product line">
                  {orderItems.map((it: any) => (
                    <label key={it.id} className="cursor-pointer">
                      <input
                        type="radio"
                        name="batch-assignment-product-line"
                        className="bom-line-radio-input"
                        checked={selectedOrderItemId === it.id}
                        onChange={() => setSelectedOrderItemId(it.id)}
                      />
                      <span className="bom-line-radio-tile">
                        <span className="bom-line-radio-label">
                          {it.product_description || it.product_category?.category_name || 'Product'}
                          <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                            {it.quantity ?? 0} pcs
                          </span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Order Sizes & Quantities Section */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Order Sizes & Quantities</h4>
              {orderItems.length > 1 && (
                <p className="text-xs text-muted-foreground">Sizes and counts for the selected product line only.</p>
              )}
              <div className="bg-gray-50 p-4 rounded-lg">
                {orderSizes.filter((s) => Number(s.total_quantity) > 0).length > 0 ? (
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                    {orderSizes
                      .filter((s) => Number(s.total_quantity) > 0)
                      .map((size) => (
                        <div key={size.size_name} className="text-center p-2 border rounded bg-white">
                          <div className="text-xs text-gray-600">{size.size_name}</div>
                          <div className="text-lg font-bold text-gray-900">{size.total_quantity}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No size data available</p>
                )}
              </div>
            </div>

            {/* Batch Selection Section */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Select Batches</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                {batches.length === 0 ? (
                  <p className="text-sm text-gray-500">No batches available</p>
                ) : (
                  <div className="space-y-3">
                                {batches.map((batch) => (
                      <div key={batch.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-100">
                        <Checkbox
                          id={batch.id}
                          checked={selectedBatches.has(batch.id)}
                          onCheckedChange={(checked) => handleBatchSelection(batch.id, checked as boolean)}
                        />
                        <div className="flex items-center space-x-3 flex-1">
                          <Avatar className="w-8 h-8">
                            <AvatarImage 
                              src={batch.batch_leader_avatar} 
                              alt={batch.batch_leader_name}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-medium">
                              {(() => {
                                const label =
                                  batch.batch_leader_name === 'No Leader Assigned'
                                    ? batch.batch_name
                                    : batch.batch_leader_name || batch.batch_name;
                                const c = String(label || '').trim().charAt(0).toUpperCase();
                                return c || '?';
                              })()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{batch.batch_name}</p>
                            <p className="text-sm text-gray-500">{batch.batch_leader_name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Active Jobs</p>
                          <p className="font-semibold">00</p>
                            </div>
                          </div>
                    ))}
                          </div>
                        )}
                      </div>
                </div>
        </div>

          <DialogFooter className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
              onClick={handleDistributeClick} 
              disabled={loading || selectedBatches.size === 0 || fetchingData}
              className="bg-purple-600 hover:bg-purple-700"
          >
              Distribute Qty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Distribute Dialog */}
      {showDistributeDialog && (
        <DistributeQuantityDialog
          isOpen={showDistributeDialog}
          onClose={handleDistributeDialogClose}
          onSuccess={handleDistributeDialogSuccess}
          onAssignmentsSaved={onSuccess}
          onAddMoreBatches={handleAddMoreBatches}
          orderId={orderId}
          orderNumber={orderNumber}
          customerName={customerName}
          selectedBatchIds={Array.from(selectedBatches)}
          batches={batches}
          orderSizes={orderSizes}
          orderItems={orderItems}
          selectedOrderItemId={selectedOrderItemId}
          onJobCardDocumentReady={onJobCardDocumentReady}
        />
      )}
    </>
  );
};
