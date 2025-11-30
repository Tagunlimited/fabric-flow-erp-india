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
import { generateBatchAssignmentPDF } from '@/utils/batchAssignmentPDF';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { useSizeTypes } from '@/hooks/useSizeTypes';
import { sortSizeDistributionsByMasterOrder } from '@/utils/sizeSorting';

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

interface DistributeQuantityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onAddMoreBatches: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  selectedBatchIds: string[];
  batches: Batch[];
  orderSizes: OrderSize[];
  orderItems: any[];
}

export const DistributeQuantityDialog: React.FC<DistributeQuantityDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onAddMoreBatches,
  orderId,
  orderNumber,
  customerName,
  selectedBatchIds,
  batches,
  orderSizes,
  orderItems
}) => {
  const [batchQuantities, setBatchQuantities] = useState<BatchQuantity>({});
  const [loading, setLoading] = useState(false);
  const [filteredOrderSizes, setFilteredOrderSizes] = useState<OrderSize[]>([]);
  const { toast } = useToast();
  const { sizeTypes } = useSizeTypes();

  // Filter order sizes to show only sizes with quantities > 0
  useEffect(() => {
    if (isOpen && orderSizes.length > 0) {
      // Filter out sizes with zero quantities - only show sizes that have quantities
      const filtered = orderSizes.filter(size => size.total_quantity > 0);
      
      // Get size_type_id from orderItems if available
      let sizeTypeId: string | null = null;
      if (orderItems && orderItems.length > 0) {
        const firstItem = orderItems[0];
        sizeTypeId = firstItem.size_type_id || (firstItem.specifications && typeof firstItem.specifications === 'object' && firstItem.specifications.size_type_id) || null;
      }
      
      // Sort using master order
      const sorted = sortSizeDistributionsByMasterOrder(filtered, sizeTypeId, sizeTypes);
      setFilteredOrderSizes(sorted);
    }
  }, [isOpen, orderSizes, orderItems, sizeTypes]);

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
    for (const size of filteredOrderSizes) {
      const remaining = getRemainingQuantity(size.size_name);
      if (remaining > 0) {
        toast({
          title: "Validation Error",
          description: `Size ${size.size_name} has ${remaining} remaining quantity to be assigned`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const generateBatchAssignmentPDFAfterSave = async () => {
    console.log('🚀 Starting PDF generation process...');
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

      // Prepare batch assignment data with proper structure
      console.log('🔧 Preparing batch assignment data...');
      const batchAssignments = selectedBatchIds.map(batchId => {
        const batch = batches.find(b => b.id === batchId);
        const batchQty = batchQuantities[batchId];
        const sizeDistributions = Object.entries(batchQty)
          .filter(([_, qty]) => typeof qty === 'number' && qty > 0)
          .map(([size, qty]) => ({ size, quantity: qty as number }));

        const assignedQuantity = sizeDistributions.reduce((sum, sd) => sum + sd.quantity, 0);
        const snRate = (priceData && !priceError && !('error' in (priceData as any))) 
          ? ((priceData as any).cutting_price_single_needle || 0)
          : 0;
        const ofRate = (priceData && !priceError && !('error' in (priceData as any)))
          ? ((priceData as any).cutting_price_overlock_flatlock || 0)
          : 0;
        // Total earning = (SN + OF) × assigned quantity
        const totalEarning = (snRate + ofRate) * assignedQuantity;

        // Fetch batch leader avatar if available
        let batchLeaderAvatarUrl: string | undefined = undefined;
        if (batch?.batch_leader_avatar_url) {
          batchLeaderAvatarUrl = batch.batch_leader_avatar_url;
        } else if (batch?.batch_leader_avatar) {
          batchLeaderAvatarUrl = batch.batch_leader_avatar;
        }

        return {
          batchName: batch?.batch_name || '',
          batchLeaderName: batch?.batch_leader_name || '',
          batchLeaderAvatarUrl: batchLeaderAvatarUrl,
          tailorType: batch?.tailor_type as 'single_needle' | 'overlock_flatlock' || 'single_needle',
          sizeDistributions,
          snRate,
          ofRate,
          totalEarning,
          assignedQuantity
        };
      });
      console.log('✅ Batch assignments prepared:', batchAssignments);

      // Collect all customizations from all order items
      const allCustomizations: any[] = [];
      enrichedOrderItems.forEach((item: any) => {
        if (item.customizations && Array.isArray(item.customizations)) {
          item.customizations.forEach((cust: any) => {
            allCustomizations.push(cust);
          });
        }
      });
      console.log('✅ Customizations prepared:', allCustomizations);

      // Generate PDF
      console.log('📄 Calling PDF generation function...');
      await generateBatchAssignmentPDF({
        orderNumber,
        customerName,
        orderItems: enrichedOrderItems,
        batchAssignments,
        companySettings: companySettings as any,
        salesManager,
        customizations: allCustomizations,
        dueDate: (orderData as any).expected_delivery_date
      });
      console.log('🎉 PDF generation completed successfully!');

    } catch (error) {
      console.error('❌ Error in PDF generation:', error);
      throw error;
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

      // Delete existing assignments for this order
      console.log('Deleting existing assignments for order:', orderId);
      const { error: deleteError } = await supabase
        .from('order_batch_assignments')
        .delete()
        .eq('order_id', orderId as any);

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
          notes: `Order ${orderNumber} assigned to ${batch.batch_name}`
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
            quantity
          }));

        if (sizeDistributions.length > 0) {
          console.log('Inserting size distributions:', sizeDistributions);
          const { error: sizeError } = await supabase
            .from('order_batch_size_distributions')
            .insert(sizeDistributions as any);

          if (sizeError) {
            console.error('Size distribution error:', sizeError);
            throw sizeError;
          }
          console.log('Size distributions inserted successfully');
        }

        // Update the batch assignment with calculated total from size distributions
        const calculatedTotal = sizeDistributions.reduce((sum, dist) => sum + dist.quantity, 0);
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
        title: "Success",
        description: `Batch assignments saved for order ${orderNumber}`,
      });

      // Generate PDF after successful save
      console.log('📄 Starting PDF generation after successful save...');
      try {
        await generateBatchAssignmentPDFAfterSave();
        console.log('✅ PDF generation completed successfully');
        toast({
          title: "Success",
          description: `Batch assignments saved and PDF generated for order ${orderNumber}`,
        });
      } catch (pdfError) {
        console.error('❌ PDF generation failed:', pdfError);
        toast({
          title: "Warning",
          description: "Batch assignments saved, but PDF generation failed. Check console for details.",
          variant: "destructive",
        });
      }

      onSuccess();
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
