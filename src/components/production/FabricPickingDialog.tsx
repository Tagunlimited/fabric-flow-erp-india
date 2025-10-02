import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, Package, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FabricInfo {
  fabric_id: string;
  fabric_name: string;
  color: string;
  gsm: number;
  image?: string;
  total_available_quantity: number;
  total_reserved_quantity: number;
  net_available_quantity: number;
  unit: string;
}

interface StorageZone {
  id: string;
  zone_name: string;
  zone_code: string;
  location: string;
  available_quantity: number;
}

interface FabricPickingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
}

export const FabricPickingDialog: React.FC<FabricPickingDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orderId,
  orderNumber,
  customerName
}) => {
  const [fabrics, setFabrics] = useState<FabricInfo[]>([]);
  const [storageZones, setStorageZones] = useState<StorageZone[]>([]);
  const [pickingQuantities, setPickingQuantities] = useState<{[key: string]: number}>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load fabrics when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadFabricData();
    }
  }, [isOpen, orderId]);

  const loadFabricData = async () => {
    try {
      console.log('Loading fabric data for order:', orderId, 'Version: 4.0 - Fixed warehouse inventory query');
      // First, get order items to find fabric IDs
      const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select('fabric_id')
        .eq('order_id', orderId)
        .not('fabric_id', 'is', null);

      if (orderItemsError) {
        console.error('Error loading order items:', orderItemsError);
        toast({
          title: "Error",
          description: "Failed to load order items",
          variant: "destructive",
        });
        return;
      }

      if (!orderItems || orderItems.length === 0) {
        setFabrics([]);
        setStorageZones([]);
        return;
      }

      // Get unique fabric IDs
      const fabricIds = [...new Set(orderItems.map(item => item.fabric_id).filter(Boolean))];
      console.log('Fabric IDs found:', fabricIds);

      // Fetch fabric details from fabric_master table
      const { data: fabricData, error: fabricError } = await supabase
        .from('fabric_master')
        .select('id, fabric_name, color, gsm, image')
        .in('id', fabricIds);

      if (fabricError) {
        console.error('Error loading fabric data:', fabricError);
        toast({
          title: "Error",
          description: "Failed to load fabric information",
          variant: "destructive",
        });
        return;
      }

      // Create fabric info from fabric_master data
      const fabricsList = (fabricData || []).map(fabric => ({
        fabric_id: fabric.id,
        fabric_name: fabric.fabric_name,
        color: fabric.color,
        gsm: fabric.gsm,
        image: fabric.image,
        unit: 'Kgs' // Default unit
      }));

      setFabrics(fabricsList);

      // Load inventory data from warehouse_inventory - simplified query
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('warehouse_inventory')
        .select('item_id, item_name, quantity, unit, status, bin_id')
        .in('item_id', fabricIds)
        .eq('status', 'IN_STORAGE');

      if (inventoryError) {
        console.error('Error loading inventory data:', inventoryError);
        toast({
          title: "Error",
          description: "Failed to load inventory data",
          variant: "destructive",
        });
        return;
      }

      console.log('Inventory data loaded:', inventoryData);

      // Get unique bin IDs from inventory
      const binIds = [...new Set((inventoryData || []).map(item => item.bin_id).filter(Boolean))];
      console.log('Bin IDs found:', binIds);

      // Fetch bin details separately to avoid complex nested queries
      const { data: binData, error: binError } = await supabase
        .from('bins')
        .select(`
          id,
          bin_code,
          location_type,
          rack_id,
          rack:rack_id (
            id,
            rack_code,
            floor_id,
            floor:floor_id (
              id,
              floor_name,
              warehouse_id,
              warehouse:warehouse_id (
                id,
                warehouse_name
              )
            )
          )
        `)
        .in('id', binIds);

      if (binError) {
        console.error('Error loading bin data:', binError);
        toast({
          title: "Warning",
          description: "Could not load bin details, showing basic inventory",
          variant: "destructive",
        });
      }

      console.log('Bin details loaded:', binData);

      // Create a map of bin_id to bin details
      const binMap = new Map();
      (binData || []).forEach(bin => {
        binMap.set(bin.id, bin);
      });

      // Group inventory by location type (zones)
      const zoneInventory = new Map();
      
      (inventoryData || []).forEach(inv => {
        const bin = binMap.get(inv.bin_id);
        const locationType = bin?.location_type;
        
        if (locationType) {
          if (!zoneInventory.has(locationType)) {
            zoneInventory.set(locationType, {
              id: locationType,
              zone_name: locationType === 'RECEIVING_ZONE' ? 'Receiving Zone' : 
                       locationType === 'STORAGE_ZONE' ? 'Storage Zone' : 
                       locationType === 'DISPATCH_ZONE' ? 'Dispatch Zone' : 
                       locationType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
              zone_code: locationType,
              location: `${bin?.rack?.floor?.warehouse?.warehouse_name || 'Unknown'} - ${bin?.rack?.floor?.floor_name || 'Unknown'}`,
              available_quantity: 0,
              bin_details: bin
            });
          }
          
          const zone = zoneInventory.get(locationType);
          zone.available_quantity += parseFloat(inv.quantity) || 0;
        }
      });

      const zonesList = Array.from(zoneInventory.values());
      console.log('Zones with inventory:', zonesList);
      setStorageZones(zonesList);
      
      // Initialize picking quantities to 0
      const initialQuantities: {[key: string]: number} = {};
      setPickingQuantities(initialQuantities);
    } catch (error) {
      console.error('Error loading fabric data:', error);
      toast({
        title: "Error",
        description: "Failed to load fabric information",
        variant: "destructive",
      });
    }
  };


  const updatePickingQuantity = (fabricId: string, quantity: number) => {
    const fabric = fabrics.find(f => f.fabric_id === fabricId);
    if (!fabric) return;

    const maxQuantity = fabric.net_available_quantity;
    const newQuantity = Math.max(0, Math.min(quantity, maxQuantity));
    
    setPickingQuantities(prev => ({
      ...prev,
      [fabricId]: newQuantity
    }));
  };

  const incrementQuantity = (fabricId: string) => {
    const current = pickingQuantities[fabricId] || 0;
    updatePickingQuantity(fabricId, current + 1);
  };

  const decrementQuantity = (fabricId: string) => {
    const current = pickingQuantities[fabricId] || 0;
    updatePickingQuantity(fabricId, current - 1);
  };

  const getTotalPickedQuantity = () => {
    return Object.values(pickingQuantities).reduce((total, qty) => total + qty, 0);
  };

  // Zone-based quantity management functions
  const updateZonePickingQuantity = (fabricId: string, zoneId: string, quantity: number) => {
    const key = `${fabricId}_${zoneId}`;
    const zone = storageZones.find(z => z.id === zoneId);
    if (!zone) return;

    const maxQuantity = zone.available_quantity;
    const newQuantity = Math.max(0, Math.min(quantity, maxQuantity));
    
    setPickingQuantities(prev => ({
      ...prev,
      [key]: newQuantity
    }));
  };

  const incrementZoneQuantity = (fabricId: string, zoneId: string) => {
    const key = `${fabricId}_${zoneId}`;
    const current = pickingQuantities[key] || 0;
    updateZonePickingQuantity(fabricId, zoneId, current + 0.1);
  };

  const decrementZoneQuantity = (fabricId: string, zoneId: string) => {
    const key = `${fabricId}_${zoneId}`;
    const current = pickingQuantities[key] || 0;
    updateZonePickingQuantity(fabricId, zoneId, current - 0.1);
  };

  const handleSave = async () => {
    // Get all zone-based picking records
    const pickingRecords: any[] = [];
    
    fabrics.forEach(fabric => {
      storageZones.forEach(zone => {
        const key = `${fabric.fabric_id}_${zone.id}`;
        const quantity = pickingQuantities[key] || 0;
        
        if (quantity > 0) {
          pickingRecords.push({
            order_id: orderId,
            fabric_id: fabric.fabric_id,
            storage_zone_id: zone.id,
            picked_quantity: quantity,
            unit: fabric.unit,
            picked_by_id: null, // Will be set below
            picked_by_name: 'System', // Will be set below
            notes: notes
          });
        }
      });
    });
    
    if (pickingRecords.length === 0) {
      toast({
        title: "No Fabric Selected",
        description: "Please select at least one fabric to pick",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();

      // Update picking records with user info
      const finalPickingRecords = pickingRecords.map(record => ({
        ...record,
        picked_by_id: user?.id || null,
        picked_by_name: user?.user_metadata?.full_name || user?.email || 'System'
      }));

      const { error } = await supabase
        .from('fabric_picking_records')
        .insert(finalPickingRecords);

      if (error) {
        console.error('Error saving picking records:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: `Fabric picking recorded for order ${orderNumber}`,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving fabric picking:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save fabric picking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick Fabric for Cutting</DialogTitle>
          <DialogDescription>
            Select fabrics from storage zones for order {orderNumber} - {customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center space-x-4">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-900">Order: {orderNumber}</h3>
                <p className="text-blue-700">Customer: {customerName}</p>
              </div>
            </div>
          </div>

          {/* Fabric Selection */}
          <div className="space-y-4">
            <h4 className="font-medium text-lg">Available Fabrics</h4>
            {fabrics.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No fabrics found for this order.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fabrics.map((fabric) => {
                  const pickedQty = pickingQuantities[fabric.fabric_id] || 0;
                  const maxQty = fabric.net_available_quantity;
                  
                  return (
                    <Card key={fabric.fabric_id} className="border-2 border-gray-200 rounded-lg p-6">
                      <CardContent>
                      <div className="flex items-start space-x-4 mb-6">
                        <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200">
                          {fabric.image ? (
                            <img 
                              src={fabric.image} 
                              alt={fabric.fabric_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">{fabric.fabric_name}</h3>
                          <div className="flex items-center space-x-3">
                            <div 
                              className="w-4 h-4 rounded-full border-2 border-gray-300"
                              style={{ backgroundColor: fabric.color?.toLowerCase() || '#cccccc' }}
                            />
                            <span className="text-sm text-gray-600">{fabric.color} • {fabric.gsm} GSM</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Inventory Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-gray-600 mb-1">WH1 Warehouse</div>
                            <div className="text-sm font-bold text-gray-800">350 Kgs</div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-green-600 mb-1">Total Available</div>
                            <div className="text-sm font-bold text-green-800">
                              {typeof maxQty === 'number' ? maxQty.toFixed(2) : maxQty} {fabric.unit}
                            </div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-blue-600 mb-1">Storage Zone</div>
                            <div className="text-sm font-bold text-blue-800">
                              {storageZones.find(z => z.zone_code === 'STORAGE_ZONE')?.available_quantity?.toFixed(2) || '0.00'} {fabric.unit}
                            </div>
                          </div>
                          <div className="bg-yellow-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-yellow-600 mb-1">Dispatch Zone</div>
                            <div className="text-sm font-bold text-yellow-800">
                              {storageZones.find(z => z.zone_code === 'DISPATCH_ZONE')?.available_quantity?.toFixed(2) || '0.00'} {fabric.unit}
                            </div>
                          </div>
                        </div>

                        {/* Storage Zones Section */}
                        <div className="border-t pt-6">
                          <h5 className="text-lg font-medium text-gray-900 mb-4">Storage Zones</h5>
                          
                          {storageZones.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                              <p className="text-sm">No inventory found in storage zones</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {storageZones.map((zone) => {
                                const zonePickedQty = pickingQuantities[`${fabric.fabric_id}_${zone.id}`] || 0;
                                const zoneMaxQty = zone.available_quantity;
                                
                                return (
                                  <div key={zone.id} className="border-2 border-gray-200 rounded-lg p-4 bg-white hover:border-blue-300 transition-colors">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center space-x-3">
                                        <MapPin className="w-5 h-5 text-gray-500" />
                                        <span className="text-base font-medium text-gray-900">{zone.zone_name}</span>
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        Available: <span className="font-semibold">{typeof zoneMaxQty === 'number' ? zoneMaxQty.toFixed(2) : zoneMaxQty} {fabric.unit}</span>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center space-x-3">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => decrementZoneQuantity(fabric.fabric_id, zone.id)}
                                        disabled={zonePickedQty <= 0}
                                        className="w-12 h-12 p-0 text-xl font-bold"
                                      >
                                        <Minus className="w-4 h-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={zonePickedQty}
                                        onChange={(e) => updateZonePickingQuantity(fabric.fabric_id, zone.id, parseFloat(e.target.value) || 0)}
                                        className="w-24 h-12 text-center text-lg font-semibold border-2"
                                        min="0"
                                        max={zoneMaxQty}
                                        step="0.1"
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => incrementZoneQuantity(fabric.fabric_id, zone.id)}
                                        disabled={zoneMaxQty <= 0 || zonePickedQty >= zoneMaxQty}
                                        className="w-12 h-12 p-0 text-xl font-bold"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    
                                    {zonePickedQty > 0 && (
                                      <div className="mt-3 text-sm text-green-600 font-medium">
                                        ✓ Picked: {typeof zonePickedQty === 'number' ? zonePickedQty.toFixed(2) : zonePickedQty} {fabric.unit}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about the fabric picking..."
              rows={3}
            />
          </div>

          {/* Summary */}
          {getTotalPickedQuantity() > 0 && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <h4 className="font-medium text-green-800 mb-2">Picking Summary</h4>
              <div className="text-green-700">
                Total fabrics to pick: <span className="font-semibold">{getTotalPickedQuantity().toFixed(2)} units</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || getTotalPickedQuantity() === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Saving...' : `Pick ${getTotalPickedQuantity().toFixed(2)} Units`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
