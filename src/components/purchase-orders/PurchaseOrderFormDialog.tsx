import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProductImage } from '@/components/ui/OptimizedImage';

type BomRecord = {
  id: string;
  bom_number: string;
  product_name: string;
  product_image_url?: string | null;
  bom_record_items?: any[];
  remainingItems?: Array<{
    bom_item_id: string;
    category: string;
    item_id?: string;
    item_name: string;
    fabric_name?: string;
    fabric_color?: string;
    fabric_gsm?: string;
    required_qty: number;
    remaining_qty: number;
    unit_of_measure?: string;
  }>;
  order?: {
    order_number: string;
    customer?: {
      company_name: string;
    };
  };
};

type Supplier = {
  id: string;
  name: string;
  supplier_name?: string;
  supplier_code?: string;
};

type LineItem = {
  id?: string;
  item_type: 'fabric' | 'item';
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
  unit_of_measure?: string;
  remarks?: string;
  fabric_name?: string;
  fabric_color?: string;
  fabric_gsm?: string;
  bom_id?: string;
  bom_number?: string;
  order_number?: string;
};

type PurchaseOrder = {
  supplier_id: string;
  order_date: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  delivery_address?: string;
  expected_delivery_date?: string;
  terms_conditions?: string;
  notes?: string;
};

interface PurchaseOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boms: BomRecord[];
  onPOCreated: () => void;
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  boms,
  onPOCreated
}: PurchaseOrderFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [po, setPo] = useState<PurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    delivery_address: '',
    expected_delivery_date: '',
  });
  const [items, setItems] = useState<LineItem[]>([]);
  const [fabricOptions, setFabricOptions] = useState<any[]>([]);
  const [itemOptions, setItemOptions] = useState<any[]>([]);
  const [fabricsTableData, setFabricsTableData] = useState<any[]>([]);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  // Fetch suppliers and options
  useEffect(() => {
    if (open) {
      fetchSuppliers();
      fetchOptions();
    }
  }, [open]);

  // Load BOMs data into items when dialog opens and options are loaded
  useEffect(() => {
    if (open && boms.length > 0 && (fabricOptions.length > 0 || itemOptions.length > 0)) {
      loadBomsData();
    }
  }, [open, boms, fabricOptions.length, itemOptions.length]);

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_master')
        .select('*')
        .order('supplier_name');
      
      if (error) throw error;
      const mappedSuppliers = ((data || []) as any[]).map((supplier: any) => ({
        id: supplier.id,
        name: supplier.supplier_name,
        supplier_name: supplier.supplier_name,
        supplier_code: supplier.supplier_code,
      }));
      
      setSuppliers(mappedSuppliers);
    } catch (e) {
      console.error('Failed to fetch suppliers', e);
      toast.error('Failed to load suppliers');
    }
  };

  const fetchOptions = async () => {
    try {
      // Fetch fabrics from fabric_master for display/matching
      const { data: fabrics, error: fabricError } = await supabase
        .from('fabric_master')
        .select('*')
        .order('fabric_name');
      
      if (fabricError) throw fabricError;
      
      // Also fetch from fabrics table for foreign key matching
      // Note: The fabrics table structure may vary - try to fetch what's available
      let fabricsTable: any[] = [];
      try {
        // Try fetching from fabrics table with basic columns first
        const { data: fabricsData, error: fabricsError } = await supabase
          .from('fabrics')
          .select('id, name, image_url')
          .order('name');
        
        if (!fabricsError && fabricsData) {
          // If fabric_variants table exists, we might need to join it
          // For now, just use the basic fabrics data
          fabricsTable = fabricsData || [];
        }
      } catch (e) {
        console.warn('Could not fetch from fabrics table:', e);
        // Continue without fabrics table data - we'll use fabric_master instead
      }
      
      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from('item_master')
        .select('*')
        .order('item_name');
      
      if (itemsError) throw itemsError;
      
      setFabricOptions(fabrics || []);
      setItemOptions(itemsData || []);
      setFabricsTableData(fabricsTable || []);
    } catch (e) {
      console.error('Failed to fetch options', e);
    }
  };

  const loadBomsData = async () => {
    try {
      // Use the BOMs passed as props, but only show items with remaining quantities
      const processedItems: LineItem[] = [];
      
      boms.forEach((bom) => {
        // Use remainingItems if available (from updated BOM structure), otherwise fall back to bom_record_items
        const usingRemainingItems = bom.remainingItems && bom.remainingItems.length > 0;
        const itemsToProcess = usingRemainingItems ? bom.remainingItems : (bom.bom_record_items || []);
        
        itemsToProcess.forEach((item: any) => {
          const isFabric = item.category === 'Fabric';
          
          // Get the original BOM item if using remainingItems (for getting full details)
          let originalBomItem = item;
          if (usingRemainingItems && bom.bom_record_items) {
            originalBomItem = bom.bom_record_items.find((bi: any) => {
              if (isFabric) {
                return bi.fabric_name === item.fabric_name &&
                       bi.fabric_color === item.fabric_color &&
                       bi.fabric_gsm === item.fabric_gsm;
              } else {
                return bi.item_id === item.item_id;
              }
            }) || item;
          }
          
          // Find matching fabric or item from options
          let itemOption = null;
          let imageUrl = null;
          if (isFabric) {
            itemOption = fabricOptions.find(f => 
              f.fabric_name === item.fabric_name &&
              f.color === item.fabric_color &&
              f.gsm === item.fabric_gsm
            );
            // Get image from fabric_master or from item's image_url
            imageUrl = itemOption?.image || itemOption?.image_url || originalBomItem.item_image_url || null;
          } else {
            itemOption = itemOptions.find(i => i.id === item.item_id);
            // Get image from item_master or from item's image_url
            imageUrl = itemOption?.image_url || itemOption?.image || originalBomItem.item_image_url || null;
          }
          
          // Use remaining quantity if using remainingItems, otherwise use original quantity
          const quantity = usingRemainingItems 
            ? item.remaining_qty 
            : Number(originalBomItem.qty_total || originalBomItem.to_order || 0);
          
          processedItems.push({
            item_type: isFabric ? 'fabric' : 'item',
            item_id: item.item_id || itemOption?.id || '',
            item_name: isFabric ? (item.fabric_name || item.item_name) : (item.item_name || ''),
            item_image_url: imageUrl,
            quantity: quantity,
            unit_of_measure: item.unit_of_measure || originalBomItem.unit_of_measure || (isFabric ? 'Kgs' : 'pcs'),
            fabric_name: item.fabric_name || '',
            fabric_color: item.fabric_color || '',
            fabric_gsm: item.fabric_gsm || '',
            bom_id: bom.id, // Keep for internal tracking but don't display
            bom_number: bom.bom_number || '', // Keep for internal tracking but don't display
            order_number: bom.order?.order_number || '',
          });
        });
      });
      
      setItems(processedItems);
    } catch (e) {
      console.error('Failed to load BOM data', e);
      toast.error('Failed to load BOM data');
    }
  };

  // Get all fabrics and items separately (not grouped by BOM)
  const allFabrics = useMemo(() => {
    return items.filter(item => item.item_type === 'fabric');
  }, [items]);

  const allItems = useMemo(() => {
    return items.filter(item => item.item_type === 'item');
  }, [items]);

  // Get unique order numbers from BOMs
  const orderNumbers = useMemo(() => {
    const orders = new Set<string>();
    boms.forEach(bom => {
      if (bom.order?.order_number) {
        orders.add(bom.order.order_number);
      }
    });
    return Array.from(orders);
  }, [boms]);

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems(prev => prev.map((item, idx) => idx === index ? { ...item, ...updates } : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const generatePONumber = async () => {
    try {
      const { data: latestPO, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .like('po_number', 'TUC/PO/%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (!latestPO || latestPO.length === 0) {
        return 'TUC/PO/0001';
      }

      const latestNumber = (latestPO[0] as any)?.po_number;
      const match = latestNumber.match(/TUC\/PO\/(\d+)/);
      
      if (match) {
        const currentNumber = parseInt(match[1], 10);
        const nextNumber = currentNumber + 1;
        return `TUC/PO/${nextNumber.toString().padStart(4, '0')}`;
      } else {
        return 'TUC/PO/0001';
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
      return 'TUC/PO/0001';
    }
  };

  const save = async () => {
    if (!po.supplier_id) {
      toast.error('Please select a supplier');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    try {
      setLoading(true);

      const poNumber = await generatePONumber();
      
      // Create PO - sanitize date fields (convert empty strings to null)
      const poData: any = {
        supplier_id: po.supplier_id,
        status: po.status,
        po_number: poNumber,
        bom_id: boms[0]?.id || null, // Link to first BOM if available
        order_date: po.order_date && po.order_date.trim() !== '' ? po.order_date : null,
        expected_delivery_date: po.expected_delivery_date && po.expected_delivery_date.trim() !== '' ? po.expected_delivery_date : null,
        delivery_address: po.delivery_address && po.delivery_address.trim() !== '' ? po.delivery_address : null,
        terms_conditions: po.terms_conditions && po.terms_conditions.trim() !== '' ? po.terms_conditions : null,
        notes: po.notes && po.notes.trim() !== '' ? po.notes : null,
      };

      const { data: newPo, error: createError } = await supabase
        .from('purchase_orders')
        .insert(poData)
        .select()
        .single() as { data: any; error: any };

      if (createError) throw createError;

      const poId = (newPo as any)?.id;
      if (!poId) {
        throw new Error('Failed to create purchase order');
      }

      // Create PO items - match the pattern from PurchaseOrderForm
      const itemsToInsert = items.map(item => {
        const baseItem: any = {
          po_id: poId,
          item_type: item.item_type,
          item_id: item.item_id || null,
          item_name: item.item_name,
          item_image_url: item.item_image_url,
          quantity: item.quantity,
          unit_of_measure: item.unit_of_measure || 'pcs',
          remarks: item.remarks || null,
          // Store BOM ID for each item to track which BOM it belongs to
          // This enables proper tracking when a single PO covers multiple BOMs
          bom_id: item.bom_id || null,
        };

        // Add fabric-specific fields for fabric items
        if (item.item_type === 'fabric') {
          baseItem.fabric_name = item.fabric_name || null;
          baseItem.fabric_color = item.fabric_color || null;
          baseItem.fabric_gsm = item.fabric_gsm || null;
          
          // Try to find matching fabric in fabrics table (for FK constraint)
          // Note: The fabrics table structure may not have color/gsm columns directly
          // If fabric_id is required by FK constraint, try to match by name only
          // Otherwise, we'll skip fabric_id to avoid FK violation
          if (fabricsTableData && fabricsTableData.length > 0) {
            // Try to match by fabric name only (since color/gsm might be in fabric_variants table)
            const matchingFabricInFabricsTable = fabricsTableData.find((f: any) => 
              f.name === item.fabric_name || f.fabric_name === item.fabric_name
            );
            
            // Only set fabric_id if we found a valid match in fabrics table
            if (matchingFabricInFabricsTable?.id) {
              baseItem.fabric_id = matchingFabricInFabricsTable.id;
            }
          }
          // If no match found or fabrics table is empty, don't include fabric_id to avoid FK violation
        }

        return baseItem;
      });

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Get supplier name
      const selectedSupplier = suppliers.find(s => s.id === po.supplier_id);
      const supplierName = selectedSupplier?.supplier_name || selectedSupplier?.name || 'Supplier';

      // Format confirmation message
      const messageLines: string[] = [];
      messageLines.push(`Hi - ${supplierName}`);

      // Add fabrics
      const fabrics = items.filter(item => item.item_type === 'fabric');
      fabrics.forEach(fabric => {
        const fabricName = fabric.fabric_name || fabric.item_name || 'N/A';
        const gsm = fabric.fabric_gsm || 'N/A';
        const color = fabric.fabric_color || 'N/A';
        const quantity = fabric.quantity || 0;
        const unit = fabric.unit_of_measure || 'Kgs';
        messageLines.push(`${fabricName} - ${gsm} - ${color} - ${quantity} - ${unit}`);
      });

      // Add items
      const nonFabricItems = items.filter(item => item.item_type === 'item');
      nonFabricItems.forEach(item => {
        // Get color from item_master if available
        const itemOption = itemOptions.find(i => i.id === item.item_id);
        const color = itemOption?.color || 'N/A';
        const itemName = item.item_name || 'N/A';
        const quantity = item.quantity || 0;
        const unit = item.unit_of_measure || 'pcs';
        messageLines.push(`${itemName} - ${color} - ${quantity} - ${unit}`);
      });

      const formattedMessage = messageLines.join('\n');
      setConfirmationMessage(formattedMessage);
      setShowConfirmationDialog(true);

      toast.success('Purchase Order created successfully');
      // Don't call onPOCreated yet - wait for user to close confirmation dialog
    } catch (e: any) {
      console.error('Failed to save purchase order', e);
      toast.error(e.message || 'Failed to save purchase order');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseConfirmation = () => {
    setShowConfirmationDialog(false);
    setConfirmationMessage('');
    onPOCreated(); // Now close the main dialog and refresh
  };

  // Handle closing confirmation dialog via X button or outside click
  const handleConfirmationDialogChange = (open: boolean) => {
    if (!open && showConfirmationDialog) {
      // User closed the dialog (via X or outside click)
      handleCloseConfirmation();
    } else {
      setShowConfirmationDialog(open);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* PO Details */}
          <Card>
            <CardHeader>
              <CardTitle>Purchase Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supplier">Supplier *</Label>
                  <Select 
                    value={po.supplier_id} 
                    onValueChange={(value) => setPo(prev => ({ ...prev, supplier_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="order_date">Order Date</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={po.order_date}
                    onChange={(e) => setPo(prev => ({ ...prev, order_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="delivery_address">Delivery Address</Label>
                  <Textarea
                    id="delivery_address"
                    value={po.delivery_address || ''}
                    onChange={(e) => setPo(prev => ({ ...prev, delivery_address: e.target.value }))}
                    placeholder="Enter delivery address..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="expected_delivery_date">Expected Delivery Date</Label>
                  <Input
                    id="expected_delivery_date"
                    type="date"
                    value={po.expected_delivery_date || ''}
                    onChange={(e) => setPo(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Number Display */}
          {orderNumbers.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Order Number(s):</Label>
                  <div className="flex gap-2 flex-wrap">
                    {orderNumbers.map((orderNum, idx) => (
                      <Badge key={idx} variant="outline" className="text-sm">
                        {orderNum}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fabrics Section - All fabrics together */}
          {allFabrics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Fabrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allFabrics.map((item, idx) => {
                    // Find item by unique combination of properties (excluding quantity since it may change)
                    const itemIndex = items.findIndex((i) => {
                      // Match by type and fabric-specific properties
                      return i.item_type === 'fabric' && 
                        i.item_name === item.item_name &&
                        i.fabric_name === item.fabric_name &&
                        i.fabric_color === item.fabric_color &&
                        i.fabric_gsm === item.fabric_gsm;
                    });
                    
                    return (
                      <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                        <ProductImage 
                          src={item.item_image_url} 
                          alt={item.item_name}
                          className="w-20 h-20 object-cover rounded"
                          fallbackText="FAB"
                        />
                        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-2">
                            <Label className="text-sm font-medium">Fabric</Label>
                            <div className="text-sm font-medium">
                              {item.fabric_name || item.item_name || 'N/A'}
                            </div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Color</Label>
                            <div className="text-sm">{item.fabric_color || 'N/A'}</div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">GSM</Label>
                            <div className="text-sm">{item.fabric_gsm ? `${item.fabric_gsm} GSM` : 'N/A'}</div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Order Number</Label>
                            <div className="text-sm">{item.order_number || 'N/A'}</div>
                          </div>
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Qty</Label>
                            <Input
                              type="number"
                              value={item.quantity} 
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateItem(itemIndex, { quantity: qty });
                              }}
                              className="w-full text-right" 
                              placeholder="Qty"
                            />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">UOM</Label>
                            <Input 
                              value={item.unit_of_measure || ''} 
                              onChange={(e) => {
                                updateItem(itemIndex, { unit_of_measure: e.target.value });
                              }} 
                              className="w-full" 
                              placeholder="UOM"
                            />
                          </div>
                          <div className="col-span-5">
                            <Label className="text-sm font-medium">Remarks</Label>
                            <Input 
                              value={item.remarks || ''} 
                              onChange={(e) => updateItem(itemIndex, { remarks: e.target.value })}
                              className="w-full" 
                              placeholder="Enter remarks"
                            />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeItem(itemIndex)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Items Section - All items together */}
          {allItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {allItems.map((item, idx) => {
                    // Find item by unique combination of properties (excluding quantity since it may change)
                    const itemIndex = items.findIndex((i) => {
                      // Match by type and item ID/name
                      return i.item_type === 'item' && 
                        (i.item_id === item.item_id || (i.item_id && item.item_id && i.item_id === item.item_id)) &&
                        i.item_name === item.item_name;
                    });
                    
                    return (
                      <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                        <ProductImage 
                          src={item.item_image_url} 
                          alt={item.item_name}
                          className="w-20 h-20 object-cover rounded"
                          fallbackText="ITEM"
                        />
                        <div className="flex-1 grid grid-cols-8 gap-4 items-center">
                          <div>
                            <Label className="text-sm font-medium">Item Name</Label>
                            <div className="text-sm font-medium">
                              {item.item_name || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Qty</Label>
                            <Input 
                              type="number" 
                              value={item.quantity} 
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateItem(itemIndex, { quantity: qty });
                              }}
                              className="w-full text-right" 
                              placeholder="Qty"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-medium">UOM</Label>
                            <Input 
                              value={item.unit_of_measure || ''} 
                              onChange={(e) => {
                                updateItem(itemIndex, { unit_of_measure: e.target.value });
                              }} 
                              className="w-full" 
                              placeholder="UOM"
                            />
                          </div>
                          <div className="col-span-5">
                            <Label className="text-sm font-medium">Remarks</Label>
                            <Input 
                              value={item.remarks || ''} 
                              onChange={(e) => updateItem(itemIndex, { remarks: e.target.value })}
                              className="w-full" 
                              placeholder="Enter remarks"
                            />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeItem(itemIndex)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading ? 'Saving...' : 'Save Purchase Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog */}
    <Dialog open={showConfirmationDialog} onOpenChange={handleConfirmationDialogChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Purchase Order Created</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {confirmationMessage}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCloseConfirmation}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

