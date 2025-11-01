import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OrderData {
  id: string;
  order_number: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  order_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    product: {
      name: string;
      image_url?: string;
    };
    fabric_id?: string;
    fabric?: {
      id: string;
      name: string;
      image_url?: string;
    };
  }>;
}

interface BomItem {
  id?: string;
  item_type: 'fabric' | 'item';
  item_id: string;
  item_name: string;
  category: string;
  unit_of_measure: string;
  qty_per_product: number;
  qty_total: number;
  stock: number;
  to_order: number;
  image_url?: string;
}

export function BomCreator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BomItem[]>([]);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [selectedOrderItem, setSelectedOrderItem] = useState<string>('');

  useEffect(() => {
    if (orderId) {
      fetchOrderData();
      fetchAvailableItems();
    }
  }, [orderId]);

  const fetchOrderData = async () => {
    if (!orderId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_id,
          customer:customers(company_name),
          order_items(
            id,
            product_id,
            quantity,
            fabric_id,
            product:products(name, image_url),
            fabric:fabric_master(id, fabric_name, fabric_code, image, type, color, gsm, rate, uom)
          )
        `)
        .eq('id', orderId as any)
        .single();

      if (error) throw error;
      setOrderData(data as any);
      
      // Auto-populate fabric from order if available
      if ((data as any)?.order_items?.[0]?.fabric_id) {
        const orderItem = (data as any).order_items[0];
        const fabric = orderItem.fabric;
        if (fabric) {
          const fabricItem: BomItem = {
            item_type: 'fabric',
            item_id: fabric.id,
            item_name: fabric.fabric_name,
            category: 'Fabric',
            unit_of_measure: fabric.uom || 'meters',
            qty_per_product: 0.1, // Default fabric consumption per product - user can modify
            qty_total: 0.1 * orderItem.quantity,
            stock: 0, // User needs to enter current stock
            to_order: 0.1 * orderItem.quantity, // Initially all needs to be ordered
            image_url: fabric.image
          };
          setItems([fabricItem]);
        }
      }
    } catch (error) {
      console.error('Error fetching order data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch order data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableItems = async () => {
    try {
      const { data, error } = await supabase
        .from('item_master')
        .select('*')
        .eq('status', 'active' as any)
        .order('item_name');

      if (error) throw error;
      setAvailableItems(data || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const addItem = () => {
    const newItem: BomItem = {
      item_type: 'item',
      item_id: '',
      item_name: '',
      category: '',
      unit_of_measure: 'pcs',
      qty_per_product: 0,
      qty_total: 0,
      stock: 0,
      to_order: 0
    };
    setItems([...items, newItem]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Helper function to calculate qty_total based on item type
  const calculateQtyTotal = (item: BomItem, totalOrderQty: number): number => {
    if (item.item_type === 'fabric') {
      // For fabric: division calculation (total_order_qty ÷ pcs_in_1_unit)
      if (!item.qty_per_product || item.qty_per_product <= 0) {
        return 0;
      }
      return totalOrderQty / item.qty_per_product;
    } else {
      // For non-fabric: multiplication calculation (qty_per_product × total_order_qty)
      return (item.qty_per_product || 0) * totalOrderQty;
    }
  };

  // Helper function to get label text based on item type
  const getQtyLabel = (item: BomItem): string => {
    if (item.item_type === 'fabric') {
      const uom = item.unit_of_measure?.toLowerCase() || 'kg';
      return `Pcs in 1 ${uom}`;
    }
    return 'Qty per Product';
  };

  const updateItem = (index: number, field: keyof BomItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Auto-calculate qty_total when qty_per_product changes
    if (field === 'qty_per_product' && orderData?.order_items?.[0]) {
      const totalOrderQty = orderData.order_items[0].quantity;
      updatedItems[index].qty_total = calculateQtyTotal(updatedItems[index], totalOrderQty);
    }
    
    // Auto-calculate to_order when stock changes
    if (field === 'stock') {
      updatedItems[index].to_order = Math.max(0, updatedItems[index].qty_total - value);
    }
    
    setItems(updatedItems);
  };

  const handleItemSelect = (index: number, itemId: string) => {
    const selectedItem = availableItems.find(item => item.id === itemId);
    if (selectedItem) {
      updateItem(index, 'item_id', selectedItem.id);
      updateItem(index, 'item_name', selectedItem.item_name);
      updateItem(index, 'category', selectedItem.category);
      updateItem(index, 'unit_of_measure', selectedItem.unit_of_measure || 'pcs');
      updateItem(index, 'image_url', selectedItem.image_url);
    }
  };

  const saveBom = async () => {
    if (!orderData || items.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add at least one item to the BOM',
        variant: 'destructive'
      });
      return;
    }

    // Validate fabric items have qty_per_product > 0
    const invalidFabricItems = items.filter(
      item => item.item_type === 'fabric' && (!item.qty_per_product || item.qty_per_product <= 0)
    );
    if (invalidFabricItems.length > 0) {
      const uom = invalidFabricItems[0].unit_of_measure?.toLowerCase() || 'kg';
      toast({
        title: 'Error',
        description: `Fabric items require "Pcs in 1 ${uom}" to be greater than 0`,
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      
      // Create BOM record
      const { data: bomRecord, error: bomError } = await supabase
        .from('bom_records')
        .insert({
          order_id: orderData.id,
          order_item_id: orderData.order_items[0]?.id,
          product_name: orderData.order_items[0]?.product?.name,
          product_image_url: orderData.order_items[0]?.product?.image_url,
          total_order_qty: orderData.order_items[0]?.quantity
        } as any)
        .select()
        .single();

      if (bomError) throw bomError;

      // Create BOM items
      const bomItems = items.map(item => ({
        bom_id: (bomRecord as any).id,
        item_id: item.item_id,
        item_name: item.item_name,
        category: item.category,
        unit_of_measure: item.unit_of_measure,
        qty_per_product: item.qty_per_product,
        qty_total: item.qty_total,
        stock: item.stock,
        to_order: item.to_order
      }));

      const { error: itemsError } = await supabase
        .from('bom_record_items')
        .insert(bomItems as any);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: 'BOM created successfully'
      });

      navigate('/bom');
    } catch (error) {
      console.error('Error saving BOM:', error);
      toast({
        title: 'Error',
        description: 'Failed to save BOM',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">Loading order data...</div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">No Order Found</h3>
          <p className="text-gray-600">Please select a valid order to create BOM</p>
        </div>
      </div>
    );
  }

  const totalOrderQty = orderData.order_items[0]?.quantity || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Bill of Materials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Order Number</Label>
              <Input value={orderData.order_number} disabled />
            </div>
            <div>
              <Label>Customer</Label>
              <Input value={orderData.customer?.company_name} disabled />
            </div>
            <div>
              <Label>Product</Label>
              <Input value={orderData.order_items[0]?.product?.name} disabled />
            </div>
            <div>
              <Label>Total Order Quantity</Label>
              <Input value={`${totalOrderQty} Pcs`} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>BOM Items</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            The fabric from your order has been pre-filled. You just need to adjust the quantities and add any additional items.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className={`border rounded-lg p-4 ${
                index === 0 && item.item_type === 'fabric' 
                  ? 'border-blue-200 bg-blue-50' 
                  : 'border-gray-200'
              }`}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                  <div>
                    <Label>Item Type</Label>
                    <Select 
                      value={item.item_type} 
                      onValueChange={(value) => updateItem(index, 'item_type', value)}
                      disabled={index === 0 && item.item_type === 'fabric'} // Disable type change for pre-filled fabric
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fabric">Fabric</SelectItem>
                        <SelectItem value="item">Item</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Item</Label>
                    <Select 
                      value={item.item_id} 
                      onValueChange={(value) => handleItemSelect(index, value)}
                      disabled={index === 0 && item.item_type === 'fabric'} // Disable item selection for pre-filled fabric
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableItems.map((availableItem) => (
                          <SelectItem key={availableItem.id} value={availableItem.id}>
                            {availableItem.item_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {index === 0 && item.item_type === 'fabric' && (
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Fabric pre-selected from order
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>{getQtyLabel(item)}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.qty_per_product}
                      onChange={(e) => updateItem(index, 'qty_per_product', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <Label>Total Qty</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.qty_total}
                      disabled
                    />
                  </div>

                  <div>
                    <Label>Stock</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.stock}
                      onChange={(e) => updateItem(index, 'stock', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeItem(index)}
                      disabled={index === 0 && item.item_type === 'fabric'} // Prevent deleting pre-filled fabric
                      title={index === 0 && item.item_type === 'fabric' ? 'Cannot delete pre-filled fabric from order' : 'Remove item'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2">
                  <Badge variant="outline">
                    To Order: {item.to_order} {item.unit_of_measure}
                  </Badge>
                </div>
              </div>
            ))}

            <Button onClick={addItem} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <Button variant="outline" onClick={() => navigate('/bom')}>
              Cancel
            </Button>
            <Button onClick={saveBom} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save BOM'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
