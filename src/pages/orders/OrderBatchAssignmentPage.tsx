import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Package, Users, Calendar, User, MapPin, Shirt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  status: string;
  notes: string;
  customer: {
    company_name: string;
    contact_person: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_category_id: string;
  product_description: string;
  fabric_id: string;
  color: string;
  gsm: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sizes_quantities: any;
  specifications: any;
  category_image_url?: string;
  reference_images?: string[];
  product_category: {
    category_name: string;
  };
  fabric: {
    fabric_name: string;
    color: string;
    gsm: string;
    image_url?: string;
  };
}

interface Batch {
  id: string;
  batch_name: string;
  batch_code: string;
  tailor_type: string;
  max_capacity: number;
  current_capacity: number;
  status: string;
  batch_leader_id: string;
  batch_leader: {
    full_name: string;
    tailor_code: string;
    avatar_url?: string;
  };
  available_capacity: number;
}

interface SizeDistribution {
  size_name: string;
  quantity: number;
}

const OrderBatchAssignmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [sizeDistributions, setSizeDistributions] = useState<SizeDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchBatches();
    }
  }, [id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(
            company_name,
            contact_person,
            email,
            phone,
            address,
            city,
            state,
            pincode
          )
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fetch order items with related data
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          product_category:product_categories(category_name),
          fabric:fabric_master(
            fabric_name,
            color,
            gsm,
            image_url
          )
        `)
        .eq('order_id', id);

      if (itemsError) throw itemsError;

      setOrder(orderData);
      setOrderItems(itemsData || []);

      // Calculate size distributions from order items
      const sizeMap = new Map<string, number>();
      (itemsData || []).forEach(item => {
        if (item.sizes_quantities) {
          Object.entries(item.sizes_quantities).forEach(([size, qty]) => {
            const quantity = typeof qty === 'number' ? qty : parseInt(qty as string) || 0;
            sizeMap.set(size, (sizeMap.get(size) || 0) + quantity);
          });
        }
      });

      const distributions: SizeDistribution[] = Array.from(sizeMap.entries())
        .map(([size_name, quantity]) => ({ size_name, quantity }))
        .sort((a, b) => a.size_name.localeCompare(b.size_name));

      setSizeDistributions(distributions);

    } catch (error) {
      console.error('Error fetching order details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch order details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select(`
          id,
          batch_name,
          batch_code,
          tailor_type,
          max_capacity,
          current_capacity,
          status,
          batch_leader_id,
          batch_leader:tailors!batches_batch_leader_id_fkey(
            full_name,
            tailor_code,
            avatar_url
          )
        `)
        .eq('status', 'active')
        .order('batch_name');

      if (error) throw error;

      const batchesWithCapacity = (data || []).map(batch => ({
        ...batch,
        available_capacity: batch.max_capacity - batch.current_capacity
      }));

      setBatches(batchesWithCapacity);
    } catch (error) {
      console.error('Error fetching batches:', error);
      toast({
        title: "Error",
        description: "Failed to fetch batches",
        variant: "destructive",
      });
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
    return sizeDistributions.reduce((total, size) => total + size.quantity, 0);
  };

  const handleDistributeQuantity = async () => {
    if (selectedBatches.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one batch",
        variant: "destructive",
      });
      return;
    }

    setAssigning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create batch assignments for each selected batch
      const assignments = Array.from(selectedBatches).map(batchId => ({
        order_id: id,
        batch_id: batchId,
        assigned_by_id: user?.id,
        assigned_by_name: user?.user_metadata?.full_name || 'System',
        assignment_date: new Date().toISOString().split('T')[0],
        notes: `Order ${order?.order_number} assigned to batch`
      }));

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('order_batch_assignments')
        .insert(assignments)
        .select();

      if (assignmentError) throw assignmentError;

      // Create size distributions for each assignment
      const sizeDistributions = [];
      for (const assignment of assignmentData) {
        for (const sizeDist of sizeDistributions) {
          sizeDistributions.push({
            order_batch_assignment_id: assignment.id,
            size_name: sizeDist.size_name,
            quantity: Math.floor(sizeDist.quantity / selectedBatches.size) // Distribute equally for now
          });
        }
      }

      if (sizeDistributions.length > 0) {
        const { error: sizeError } = await supabase
          .from('order_batch_size_distributions')
          .insert(sizeDistributions);

        if (sizeError) throw sizeError;
      }

      toast({
        title: "Success",
        description: `Order assigned to ${selectedBatches.size} batch(es) successfully`,
      });

      navigate(`/orders/${id}`);
    } catch (error) {
      console.error('Error assigning batches:', error);
      toast({
        title: "Error",
        description: "Failed to assign batches to order",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Order not found</p>
          <Button onClick={() => navigate('/orders')} className="mt-4">
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/orders/${id}`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Order
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Order ID: {order.order_number}</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Qty: {getTotalQuantity()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Product Details */}
          <div className="space-y-6">
            {/* Product Card */}
            <Card className="border border-gray-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex space-x-6">
                  {/* Product Image */}
                  <div className="w-32 h-32 bg-blue-100 rounded-lg overflow-hidden flex items-center justify-center">
                    {orderItems[0]?.category_image_url ? (
                      <img 
                        src={orderItems[0].category_image_url} 
                        alt={orderItems[0].product_category?.category_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Shirt className="w-16 h-16 text-blue-600" />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">Product Category: {orderItems[0]?.product_category?.category_name || 'Hoodies'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Product Description: {orderItems[0]?.product_description || 'Blue Color 300 Gsm Hoodie'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Fabric: {orderItems[0]?.fabric?.gsm || '300'} Gsm, {orderItems[0]?.fabric?.color || 'Turquoise Blue'}</p>
                    </div>
                  </div>
                </div>

                {/* Size Breakdown Table */}
                {orderItems[0]?.sizes_quantities && (
                  <div className="mt-6">
                    <h4 className="font-medium text-gray-900 mb-3">Size Breakdown</h4>
                    <div className="grid grid-cols-8 gap-2">
                      {Object.entries(orderItems[0].sizes_quantities).map(([size, qty]) => (
                        <div key={size} className="text-center p-2 bg-gray-50 rounded border">
                          <p className="text-xs text-gray-600">{size}</p>
                          <p className="font-semibold text-gray-900">{qty}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Batch Assignment */}
          <div className="space-y-6">
            {/* Quantity Summary */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Qty Available to Distribute: {getTotalQuantity()} Pcs</p>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Total Batches: {batches.length}</span>
                <span>Selected Batches: {selectedBatches.size}</span>
              </div>
            </div>

            {/* Batch Selection Table */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Tailor Batch List</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200">
                      <TableHead className="font-medium text-gray-900">Select Tailor Batch</TableHead>
                      <TableHead className="font-medium text-gray-900 text-center">Active Jobs</TableHead>
                      <TableHead className="font-medium text-gray-900 text-center">Select</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <TableCell className="py-4">
                          <div className="flex items-center space-x-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={batch.batch_leader?.avatar_url} alt={batch.batch_leader?.full_name} />
                              <AvatarFallback className="bg-gray-200 text-gray-700">
                                {batch.batch_leader?.full_name?.split(' ').map(n => n[0]).join('') || 'BL'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-gray-900">{batch.batch_name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-gray-900 font-medium">00</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            id={batch.id}
                            checked={selectedBatches.has(batch.id)}
                            onCheckedChange={(checked) => handleBatchSelection(batch.id, checked as boolean)}
                            className="data-[state=checked]:bg-gray-900 data-[state=checked]:border-gray-900"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Action Button */}
            <div className="flex justify-center">
              <Button 
                onClick={handleDistributeQuantity}
                disabled={assigning || selectedBatches.size === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg font-medium"
                size="lg"
              >
                {assigning ? 'Distributing...' : 'Distribute Qty'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderBatchAssignmentPage;
