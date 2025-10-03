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
  image?: string; // mapped from fabric_image in view
  total_available_quantity: number;
  total_reserved_quantity: number;
  net_available_quantity: number;
  unit: string;
}

interface StorageZone {
  id: string;
  zone_name: string; // mapped from bins.bin_name or bin_code
  zone_code: string; // mapped from bins.bin_code
  location: string; // bins.location_type
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
  const [selectedZones, setSelectedZones] = useState<{[key: string]: string}>({});
  const [zoneAvailability, setZoneAvailability] = useState<Record<string, Record<string, { available: number; reserved: number; unit?: string }>>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load fabrics when dialog opens
  useEffect(() => {
    if (isOpen) {
      initInventoryIfNeeded().then(loadFabricData);
      loadStorageZones();
      loadZoneAvailability();
    }
  }, [isOpen, orderId]);
  const initInventoryIfNeeded = async () => {
    try {
      // If inventory has no rows for this order's fabrics, create baseline rows from order items
      await (supabase as any).rpc('ensure_fabric_inventory_for_order', { p_order_id: orderId, p_default_unit: 'meters' });
    } catch (e) {
      // ignore
    }
  };

  const loadFabricData = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('fabric_availability_by_order')
        .select('*')
        .eq('order_id', orderId);

      if (error) {
        console.error('Error loading fabric data:', error);
        toast({
          title: "Error",
          description: "Failed to load fabric information",
          variant: "destructive",
        });
        return;
      }

      const normalized: FabricInfo[] = (data || []).map((row: any) => ({
        fabric_id: row.fabric_id,
        fabric_name: row.fabric_name,
        color: row.color,
        gsm: row.gsm,
        image: row.fabric_image, // map
        total_available_quantity: Number(row.total_available_quantity || 0),
        total_reserved_quantity: Number(row.total_reserved_quantity || 0),
        net_available_quantity: Number(row.net_available_quantity || 0),
        unit: row.unit || 'meters'
      }));

      setFabrics(normalized);
      
      // Initialize picking quantities to 0
      const initialQuantities: {[key: string]: number} = {};
      normalized.forEach(fabric => { initialQuantities[fabric.fabric_id] = 0; });
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

  const loadZoneAvailability = async () => {
    try {
      // Join bins + warehouse_inventory to fetch bin stock by fabric
      const { data, error } = await (supabase as any)
        .from('warehouse_inventory')
        .select('*')
        .eq('item_type', 'FABRIC' as any)
        .in('status', ['IN_STORAGE', 'RECEIVED'] as any);
      if (error) {
        console.error('Error loading zone availability:', error);
        return;
      }
      const map: Record<string, Record<string, { available: number; reserved: number; unit?: string }>> = {};
      (data || []).forEach((r: any) => {
        const fid = r.item_id as string; const zid = r.bin_id as string; const qty = Number(r.quantity || 0);
        console.log('Processing warehouse item:', { item_id: fid, bin_id: zid, quantity: qty, item_name: r.item_name });
        if (!zid) {
          console.log('Skipping item - missing bin_id:', { zid });
          return;
        }
        
        // Try to match by item_id first, then by item_name if item_id is null
        let matchKey = fid;
        if (!fid) {
          console.log('=== MATCHING PROCESS ===');
          console.log('Warehouse item:', { item_name: r.item_name, quantity: qty });
          console.log('Available order fabrics:', fabrics.map(f => ({ fabric_id: f.fabric_id, fabric_name: f.fabric_name })));
          
          // Find matching fabric by name (exact match first, then partial)
          let matchingFabric = fabrics.find(f => f.fabric_name === r.item_name);
          console.log('Exact match result:', { warehouse_name: r.item_name, found: !!matchingFabric, match: matchingFabric?.fabric_name });
          
          if (!matchingFabric) {
            // Try partial match - extract fabric name from warehouse item_name
            const warehouseFabricName = r.item_name.split(' - ')[0]; // "Poly Blend" from "Poly Blend - White - 200 GSM"
            matchingFabric = fabrics.find(f => f.fabric_name === warehouseFabricName);
            console.log('Trying partial match:', { warehouse_item: r.item_name, extracted_name: warehouseFabricName, found: !!matchingFabric, match: matchingFabric?.fabric_name });
          }
          
          if (!matchingFabric) {
            // Try reverse match - check if warehouse name is contained in order fabric name
            const warehouseFabricName = r.item_name.split(' - ')[0];
            matchingFabric = fabrics.find(f => f.fabric_name.includes(warehouseFabricName));
            console.log('Trying reverse match:', { warehouse_name: warehouseFabricName, order_fabrics: fabrics.map(f => f.fabric_name), found: !!matchingFabric, match: matchingFabric?.fabric_name });
          }
          
          if (matchingFabric) {
            matchKey = matchingFabric.fabric_id;
            console.log('Matched by name:', { item_name: r.item_name, fabric_name: matchingFabric.fabric_name, fabric_id: matchKey });
          } else {
            console.log('No fabric match found for item_name:', r.item_name, 'Available fabrics:', fabrics.map(f => f.fabric_name));
            return;
          }
        }
        
        if (!map[matchKey]) map[matchKey] = {};
        const prev = map[matchKey][zid] || { available: 0, reserved: 0, unit: r.unit };
        map[matchKey][zid] = { available: prev.available + qty, reserved: prev.reserved, unit: r.unit };
      });
      setZoneAvailability(map);
      
      // Debug log
      console.log('Zone availability loaded:', map);
      console.log('Raw warehouse_inventory data:', data);
      console.log('Order fabrics:', fabrics.map(f => ({ fabric_id: f.fabric_id, fabric_name: f.fabric_name })));
      console.log('=== DEBUGGING MATCHING ===');
      console.log('Warehouse fabric names:', data?.map(r => r.item_name));
      console.log('Order fabric names:', fabrics.map(f => f.fabric_name));
      console.log('Final zone availability map:', map);
    } catch (e) { /* ignore */ }
  };

  const loadStorageZones = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('bins')
        .select('id, bin_code, location_type')
        .in('location_type', ['RECEIVING_ZONE', 'STORAGE', 'DISPATCH_ZONE'] as any)
        .order('location_type, bin_code');

      if (error) {
        console.error('Error loading storage zones:', error);
        toast({
          title: "Error",
          description: "Failed to load storage zones",
          variant: "destructive",
        });
        return;
      }

      const mapped: StorageZone[] = (data || []).map((b: any) => ({
        id: b.id,
        zone_name: b.bin_code,
        zone_code: b.bin_code,
        location: b.location_type,
        available_quantity: 0
      }));
      setStorageZones(mapped);
    } catch (error) {
      console.error('Error loading storage zones:', error);
      toast({
        title: "Error",
        description: "Failed to load storage zones",
        variant: "destructive",
      });
    }
  };

  const updatePickingQuantity = (fabricId: string, quantity: number) => {
    const fabric = fabrics.find(f => f.fabric_id === fabricId); if (!fabric) return;
    const selectedZoneId = selectedZones[fabricId];
    const zoneAvail = selectedZoneId && zoneAvailability[fabricId]?.[selectedZoneId]
      ? Math.max(0, (zoneAvailability[fabricId][selectedZoneId].available || 0) - (zoneAvailability[fabricId][selectedZoneId].reserved || 0))
      : fabric.net_available_quantity;
    const maxQuantity = zoneAvail;
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

  const getGlobalNetForFabric = (fabricId: string): number => {
    const zones = zoneAvailability[fabricId] || {};
    return Object.values(zones).reduce((sum, z) => sum + Math.max(0, (z.available || 0) - (z.reserved || 0)), 0);
  };

  const handleSave = async () => {
    const pickedFabrics = fabrics.filter(fabric => (pickingQuantities[fabric.fabric_id] || 0) > 0);
    
    if (pickedFabrics.length === 0) {
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

      // Map bin IDs to fabric_storage_zone IDs
      const binToZoneMap: Record<string, string> = {};
      for (const binId of Object.values(selectedZones)) {
        if (!binToZoneMap[binId]) {
          // Find or create a fabric_storage_zone for this bin
          const { data: existingZone } = await (supabase as any)
            .from('fabric_storage_zones')
            .select('id')
            .eq('zone_code', binId)
            .single();
          
          if (existingZone) {
            binToZoneMap[binId] = existingZone.id;
          } else {
            // Create a new fabric_storage_zone for this bin
            const { data: binData } = await (supabase as any)
              .from('bins')
              .select('bin_code, location_type')
              .eq('id', binId)
              .single();
            
            const { data: newZone } = await (supabase as any)
              .from('fabric_storage_zones')
              .insert({
                zone_name: binData?.bin_code || 'Warehouse Bin',
                zone_code: binId,
                location: binData?.location_type || 'STORAGE',
                description: 'Auto-created from warehouse bin',
                is_active: true
              })
              .select('id')
              .single();
            
            binToZoneMap[binId] = newZone.id;
          }
        }
      }

      // Build picking records - use mapped storage_zone_id
      const finalPickingRecords = pickedFabrics.map(fabric => ({
        order_id: orderId,
        fabric_id: fabric.fabric_id,
        storage_zone_id: binToZoneMap[selectedZones[fabric.fabric_id]], // Use mapped zone ID
        picked_quantity: pickingQuantities[fabric.fabric_id],
        unit: fabric.unit,
        picked_by_id: user?.id || null,
        picked_by_name: user?.user_metadata?.full_name || user?.email || 'System',
        notes: notes
      }));

      const { error } = await (supabase as any)
        .from('fabric_picking_records')
        .insert(finalPickingRecords);

      if (error) {
        console.error('Error saving picking records:', error);
        throw error;
      }

      // Update warehouse inventory - reduce quantities for picked fabrics
      for (const fabric of pickedFabrics) {
        const pickedQty = pickingQuantities[fabric.fabric_id];
        const binId = selectedZones[fabric.fabric_id];
        
        // Find warehouse inventory records for this fabric in this bin
        const { data: inventoryRecords } = await (supabase as any)
          .from('warehouse_inventory')
          .select('id, quantity')
          .eq('item_type', 'FABRIC')
          .eq('bin_id', binId)
          .or(`item_id.eq.${fabric.fabric_id},item_name.eq.${fabric.fabric_name}`);

        if (inventoryRecords && inventoryRecords.length > 0) {
          // Reduce quantity from the first matching record
          const record = inventoryRecords[0];
          const newQuantity = Math.max(0, record.quantity - pickedQty);
          
          await (supabase as any)
            .from('warehouse_inventory')
            .update({ quantity: newQuantity })
            .eq('id', record.id);
          
          console.log(`Updated warehouse inventory: ${fabric.fabric_name} in bin ${binId}, reduced by ${pickedQty}`);
        }
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
                  const selectedZoneId = selectedZones[fabric.fabric_id];
                  const zoneNet = selectedZoneId && zoneAvailability[fabric.fabric_id]?.[selectedZoneId]
                    ? Math.max(0, (zoneAvailability[fabric.fabric_id][selectedZoneId].available || 0) - (zoneAvailability[fabric.fabric_id][selectedZoneId].reserved || 0))
                    : null;
                  const globalNet = getGlobalNetForFabric(fabric.fabric_id);
                  const maxQty = zoneNet != null ? zoneNet : (typeof fabric.net_available_quantity === 'number' && fabric.net_available_quantity > 0 ? fabric.net_available_quantity : globalNet);
                  
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
                        <CardTitle className="text-sm">{fabric.fabric_name}</CardTitle>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <div 
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: fabric.color?.toLowerCase() || '#cccccc' }}
                          />
                          <span>{fabric.color} • {fabric.gsm} GSM</span>
                        </div>
                      </div>
                        </div>
                      </CardContent>
                      <CardContent className="space-y-3">
                        {/* Zone-wise Availability Cards */}
                        <div className="space-y-3">
                          <div className="text-xs text-gray-600 font-medium">Available by Zone Type:</div>
                          
                          {/* Receiving Zone Card */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span className="text-sm font-medium text-blue-800">Receiving Zone</span>
                              </div>
                              <span className="text-lg font-bold text-blue-900">
                                {(() => {
                                  const receivingZones = storageZones.filter(z => z.location === 'RECEIVING_ZONE');
                                  const totalReceiving = receivingZones.reduce((sum, zone) => {
                                    const zoneData = zoneAvailability[fabric.fabric_id]?.[zone.id];
                                    return sum + (zoneData ? Math.max(0, (zoneData.available || 0) - (zoneData.reserved || 0)) : 0);
                                  }, 0);
                                  return totalReceiving.toFixed(2) + ' ' + (fabric.unit || 'units');
                                })()}
                              </span>
                            </div>
                          </div>

                          {/* Storage Zone Card */}
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-sm font-medium text-green-800">Storage Zone</span>
                              </div>
                              <span className="text-lg font-bold text-green-900">
                                {(() => {
                                  const storageZoneBins = storageZones.filter(z => z.location === 'STORAGE');
                                  const totalStorage = storageZoneBins.reduce((sum, zone) => {
                                    const zoneData = zoneAvailability[fabric.fabric_id]?.[zone.id];
                                    return sum + (zoneData ? Math.max(0, (zoneData.available || 0) - (zoneData.reserved || 0)) : 0);
                                  }, 0);
                                  return totalStorage.toFixed(2) + ' ' + (fabric.unit || 'units');
                                })()}
                              </span>
                            </div>
                          </div>

                          {/* Dispatch Zone Card */}
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                <span className="text-sm font-medium text-orange-800">Dispatch Zone</span>
                              </div>
                              <span className="text-lg font-bold text-orange-900">
                                {(() => {
                                  const dispatchZones = storageZones.filter(z => z.location === 'DISPATCH_ZONE');
                                  const totalDispatch = dispatchZones.reduce((sum, zone) => {
                                    const zoneData = zoneAvailability[fabric.fabric_id]?.[zone.id];
                                    return sum + (zoneData ? Math.max(0, (zoneData.available || 0) - (zoneData.reserved || 0)) : 0);
                                  }, 0);
                                  return totalDispatch.toFixed(2) + ' ' + (fabric.unit || 'units');
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Storage Zone Selection */}
                        <div className="space-y-2">
                          <Label className="text-xs">Pick from Storage Zone:</Label>
                          <Select 
                            value={selectedZones[fabric.fabric_id] || ''} 
                            onValueChange={(value) => setSelectedZones(prev => ({
                              ...prev,
                              [fabric.fabric_id]: value
                            }))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select zone" />
                            </SelectTrigger>
                            <SelectContent>
                              {storageZones
                                .filter((zone) => {
                                  const za = zoneAvailability[fabric.fabric_id]?.[zone.id];
                                  const net = za ? Math.max(0, (za.available || 0) - (za.reserved || 0)) : 0;
                                  return net > 0; // Only show zones with available quantity
                                })
                                .map((zone) => {
                                  const za = zoneAvailability[fabric.fabric_id]?.[zone.id];
                                  const net = za ? Math.max(0, (za.available || 0) - (za.reserved || 0)) : 0;
                                  return (
                                    <SelectItem key={zone.id} value={zone.id}>
                                      <div className="flex items-center space-x-2">
                                        <MapPin className="w-3 h-3" />
                                        <span>{zone.zone_name}</span>
                                        <span className="text-xs text-muted-foreground">({net.toFixed(2)} {za?.unit || fabric.unit})</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Quantity Selection */}
                        <div className="space-y-2">
                          <Label className="text-xs">Quantity to Pick:</Label>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => decrementQuantity(fabric.fabric_id)}
                              disabled={pickedQty <= 0}
                              className="w-8 h-8 p-0"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              value={pickedQty}
                              onChange={(e) => updatePickingQuantity(fabric.fabric_id, parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-center text-sm"
                              min="0"
                              max={maxQty}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => incrementQuantity(fabric.fabric_id)}
                              disabled={maxQty <= 0 || pickedQty >= maxQty}
                              className="w-8 h-8 p-0"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="text-xs text-gray-500">
                            Max: {typeof maxQty === 'number' ? maxQty.toFixed(2) : maxQty} {fabric.unit}
                          </div>
                        </div>

                        {/* Picked Summary */}
                        {pickedQty > 0 && (
                          <div className="bg-green-50 p-2 rounded">
                            <div className="text-xs text-green-700">
                              ✓ Picked: {typeof pickedQty === 'number' ? pickedQty.toFixed(2) : pickedQty} {fabric.unit}
                            </div>
                          </div>
                        )}
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
