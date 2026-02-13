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
import { Users, Clock, User, Plus, Trash2, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DistributeQuantityDialog } from './DistributeQuantityDialog';
import { useSizeTypes } from '@/hooks/useSizeTypes';
import { sortSizeDistributionsByMasterOrder } from '@/utils/sizeSorting';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';

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
}

export const MultipleBatchAssignmentDialog: React.FC<MultipleBatchAssignmentDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  customerName,
  onSuccess,
  existingAssignments = [],
  orderItems = []
}) => {
  const { sizeTypes } = useSizeTypes();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orderSizes, setOrderSizes] = useState<OrderSize[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [showDistributeDialog, setShowDistributeDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const { toast } = useToast();

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedBatches(new Set());
      setShowDistributeDialog(false);
      fetchData();
    }
  }, [isOpen]);

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

      // Process order sizes from orderItems prop or fetch from database
      let sizesData = [];
      if (orderItems && orderItems.length > 0) {
        // Use orderItems prop if available
        const sizeMap = new Map<string, number>();
        orderItems.forEach(item => {
          if (item.sizes_quantities) {
            Object.entries(item.sizes_quantities).forEach(([size, qty]) => {
              const quantity = typeof qty === 'number' ? qty : parseInt(qty as string) || 0;
              sizeMap.set(size, (sizeMap.get(size) || 0) + quantity);
            });
          }
        });
        sizesData = sortSizes(Array.from(sizeMap.entries())
          .map(([size_name, total_quantity]) => ({ size_name, total_quantity })));
      } else {
        // Fallback: fetch from database
        try {
          const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_order_sizes', { order_uuid: orderId });

          if (rpcError) {
            console.warn('RPC function failed, trying direct query:', rpcError);
            const { data: itemsData, error: itemsError } = await supabase
              .from('order_items')
              .select('sizes_quantities')
              .eq('order_id', orderId);
            
            if (itemsError) throw itemsError;
            
            const sizeMap = new Map<string, number>();
            (itemsData || []).forEach(item => {
              if (item.sizes_quantities) {
                Object.entries(item.sizes_quantities).forEach(([size, qty]) => {
                  const quantity = typeof qty === 'number' ? qty : parseInt(qty as string) || 0;
                  sizeMap.set(size, (sizeMap.get(size) || 0) + quantity);
                });
              }
            });
            
            sizesData = sortSizes(Array.from(sizeMap.entries())
              .map(([size_name, total_quantity]) => ({ size_name, total_quantity })));
          } else {
            sizesData = sortSizes(rpcData || []);
          }
        } catch (fallbackError) {
          console.error('Both RPC and fallback failed:', fallbackError);
          sizesData = [];
        }
      }
      
      setOrderSizes(sizesData);

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
    
    // Get size_type_id from orderItems if not provided
    let typeId = sizeTypeId;
    if (!typeId && orderItems && orderItems.length > 0) {
      const firstItem = orderItems[0];
      typeId = firstItem.size_type_id || (firstItem.specifications && typeof firstItem.specifications === 'object' && firstItem.specifications.size_type_id) || null;
    }
    
    // Use master-based sorting
    return sortSizeDistributionsByMasterOrder(sizes, typeId || null, sizeTypes);
  };

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
                    {/* Product Image */}
                    <div className="w-24 h-24 bg-blue-100 rounded-lg overflow-hidden flex items-center justify-center">
                      {(() => {
                        const displayImage = orderItems[0] ? getOrderItemDisplayImage(orderItems[0]) : null;
                        return displayImage ? (
                          <img 
                            src={displayImage} 
                            alt={orderItems[0]?.product_category?.category_name || 'Product'}
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
                      <p className="text-sm"><span className="font-medium">Product:</span> {orderItems[0]?.product_category?.category_name || orderItems[0]?.product_description || 'Product'}</p>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Fabric:</span>
                        <div className="flex items-center space-x-3">
                          {/* Fabric image */}
                          {orderItems[0]?.fabric?.image && (
                            <img 
                              src={orderItems[0].fabric.image} 
                              alt="Fabric"
                              className="rounded object-cover border border-gray-200"
                              style={{ width: '64px', height: '64px' }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {/* Fabric color circle */}
                          <div 
                            className="w-6 h-6 rounded-full border border-gray-300"
                            style={{ 
                              backgroundColor: orderItems[0]?.fabric?.color?.toLowerCase() || orderItems[0]?.color?.toLowerCase() || '#cccccc'
                            }}
                            title={orderItems[0]?.fabric?.color || orderItems[0]?.color || 'Unknown color'}
                          />
                          <span className="text-sm">{orderItems[0]?.fabric?.fabric_name || 'N/A'} - {orderItems[0]?.fabric?.gsm || orderItems[0]?.gsm || 'N/A'} GSM, {orderItems[0]?.fabric?.color || orderItems[0]?.color || 'N/A'}</span>
                        </div>
                      </div>
                      <p className="text-sm"><span className="font-medium">Total Quantity:</span> {getTotalQuantity()}</p>
                    </div>
                </div>
              </div>
            </div>

            {/* Order Sizes & Quantities Section */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Order Sizes & Quantities</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                {orderSizes.length > 0 ? (
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {orderSizes.map((size) => (
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
                            <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">
                              {batch.batch_leader_name === 'No Leader Assigned' ? '?' : (batch.batch_leader_name?.charAt(0) || batch.batch_name.charAt(0))}
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
          onAddMoreBatches={handleAddMoreBatches}
          orderId={orderId}
          orderNumber={orderNumber}
          customerName={customerName}
          selectedBatchIds={Array.from(selectedBatches)}
          batches={batches}
          orderSizes={orderSizes}
          orderItems={orderItems}
        />
      )}
    </>
  );
};
