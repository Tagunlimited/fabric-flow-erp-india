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

  // Filter order sizes to show only sizes with quantities > 0
  useEffect(() => {
    if (isOpen && orderSizes.length > 0) {
      // Filter out sizes with zero quantities - only show sizes that have quantities
      const filtered = orderSizes.filter(size => size.total_quantity > 0);
      const sorted = sortSizes(filtered);
      setFilteredOrderSizes(sorted);
    }
  }, [isOpen, orderSizes]);

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


  const sortSizes = (sizes: OrderSize[]) => {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    return sizes.sort((a, b) => {
      const indexA = sizeOrder.indexOf(a.size_name);
      const indexB = sizeOrder.indexOf(b.size_name);
      
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // For sizes not in the predefined order, sort alphabetically
      return a.size_name.localeCompare(b.size_name);
    });
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
        .from('order_assignments')
        .select('cutting_price_single_needle, cutting_price_overlock_flatlock')
        .eq('order_id', orderId)
        .single();

      if (priceError) {
        console.error('❌ Error fetching pricing data:', priceError);
        return;
      }
      console.log('✅ Pricing data fetched:', priceData);

      // Fetch order details with customizations
      console.log('📋 Fetching order details...');
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            mockup_images,
            specifications,
            category_image_url,
            product_categories (
              category_name,
              category_image_url
            ),
            fabrics (
              name,
              description,
              image_url
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) {
        console.error('❌ Error fetching order data:', orderError);
        return;
      }
      console.log('✅ Order data fetched:', orderData);

      // Fetch company settings
      console.log('🏢 Fetching company settings...');
      const { data: companySettings, error: settingsError } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (settingsError) {
        console.error('❌ Error fetching company settings:', settingsError);
        return;
      }
      console.log('✅ Company settings fetched:', companySettings);

      // Prepare batch assignment data
      console.log('🔧 Preparing batch assignment data...');
      const batchAssignments = selectedBatchIds.map(batchId => {
        const batch = batches.find(b => b.id === batchId);
        const batchQty = batchQuantities[batchId];
        const sizeDistributions = Object.entries(batchQty)
          .filter(([_, qty]) => qty > 0)
          .map(([size, qty]) => ({ size, quantity: qty }));

        // Determine price per piece based on tailor type
        const pricePerPiece = batch?.tailor_type === 'single_needle' 
          ? (priceData?.cutting_price_single_needle || 0)
          : (priceData?.cutting_price_overlock_flatlock || 0);

        return {
          batchName: batch?.batch_name || '',
          batchLeaderName: batch?.batch_leader_name || '',
          tailorType: batch?.tailor_type as 'single_needle' | 'overlock_flatlock' || 'single_needle',
          sizeDistributions,
          pricePerPiece
        };
      });
      console.log('✅ Batch assignments prepared:', batchAssignments);

      // Prepare customizations (simplified since branding_items and order_item_addons don't exist)
      const customizations = {
        branding: null, // These relationships don't exist in current schema
        addons: null,   // These relationships don't exist in current schema
        special_instructions: orderData.special_instructions || orderData.notes
      };
      console.log('✅ Customizations prepared:', customizations);

      // Generate PDF
      console.log('📄 Calling PDF generation function...');
      await generateBatchAssignmentPDF({
        orderNumber,
        customerName,
        orderItems: orderData.order_items || [],
        batchAssignments,
        companySettings,
        stitchingPrices: {
          single_needle: priceData?.cutting_price_single_needle || 0,
          overlock_flatlock: priceData?.cutting_price_overlock_flatlock || 0
        },
        customizations,
        dueDate: orderData.expected_delivery_date
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
