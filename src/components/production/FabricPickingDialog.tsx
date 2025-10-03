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
  fabric_id?: string;
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
      console.log('Loading fabric data for order:', orderId, 'Version: 5.0 - Fixed warehouse inventory query with all statuses');
      // First, get order items to find fabric IDs
      const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select('fabric_id')
        .eq('order_id', orderId as any)
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
      const fabricIds = [...new Set((orderItems || []).map((item: any) => item.fabric_id).filter(Boolean))];
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
      const fabricsList = (fabricData || []).map((fabric: any) => ({
        fabric_id: fabric.id,
        fabric_name: fabric.fabric_name,
        color: fabric.color,
        gsm: fabric.gsm,
        image: fabric.image,
        unit: 'Kgs', // Default unit
        total_available_quantity: 0,
        total_reserved_quantity: 0,
        net_available_quantity: 0
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

      // Load inventory data from warehouse_inventory - include all available statuses
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('warehouse_inventory')
        .select('item_id, item_name, quantity, unit, status, bin_id')
        .in('item_id', fabricIds)
        .in('status', ['RECEIVED', 'IN_STORAGE', 'READY_TO_DISPATCH'] as any);

      if (inventoryError) {
        console.error('Error loading inventory data:', inventoryError);
        toast({
          title: "Error",
          description: "Failed to load inventory data",
          variant: "destructive",
        });
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

      console.log('Inventory data loaded:', inventoryData);
      console.log('Number of inventory records found:', inventoryData?.length || 0);
      console.log('Fabric IDs being searched:', fabricIds);
      
      let finalInventoryData = inventoryData;

      // If no inventory found, let's check what's in the warehouse_inventory table
      if (!inventoryData || inventoryData.length === 0) {
        console.log('No inventory found for the specified fabric IDs. Checking all warehouse inventory...');
        console.warn('⚠️ DATA MISMATCH: Order fabric IDs do not match warehouse inventory item_ids. This suggests a data synchronization issue.');
        const { data: allInventory, error: allInventoryError } = await supabase
          .from('warehouse_inventory')
          .select('item_id, item_name, quantity, unit, status, bin_id')
          .limit(10);
        
        if (!allInventoryError && allInventory) {
          console.log('Sample warehouse inventory data:', allInventory);
          console.log('Available item_ids in warehouse_inventory:', allInventory.map((item: any) => item.item_id));
          console.log('Requested fabric_ids:', fabricIds);
          
          // Check if any warehouse inventory items match the fabric names
          const fabricNames = fabricsList.map(f => f.fabric_name);
          console.log('Fabric names in order:', fabricNames);
          
          const matchingByName = allInventory.filter((item: any) => 
            fabricNames.some(name => item.item_name && item.item_name.toLowerCase().includes(name.toLowerCase()))
          );
          if (matchingByName.length > 0) {
            console.log('Found potential matches by name:', matchingByName);
          }
        }
        
        // Also check if there are any inventory records for these fabrics with different statuses
        const { data: allStatusInventory, error: allStatusError } = await supabase
          .from('warehouse_inventory')
          .select('item_id, item_name, quantity, unit, status, bin_id')
          .in('item_id', fabricIds);
        
        if (!allStatusError && allStatusInventory) {
          console.log('All inventory for these fabrics (any status):', allStatusInventory);
        }
        
        // If still no inventory found by ID, try to find by fabric name as fallback
        if (fabricIds.length > 0 && (!inventoryData || inventoryData.length === 0)) {
          console.log('Attempting fallback search by fabric name...');
          const fabricNames = fabricsList.map(f => f.fabric_name);
          
          // Try to find inventory by item_name matching fabric names
          const { data: nameBasedInventory, error: nameBasedError } = await supabase
            .from('warehouse_inventory')
            .select('item_id, item_name, quantity, unit, status, bin_id')
            .or(fabricNames.map(name => `item_name.ilike.%${name}%`).join(','))
            .in('status', ['RECEIVED', 'IN_STORAGE', 'READY_TO_DISPATCH'] as any);
          
          if (!nameBasedError && nameBasedInventory && nameBasedInventory.length > 0) {
            console.log('Found inventory by fabric name:', nameBasedInventory);
            // Use the name-based inventory data instead
            finalInventoryData = nameBasedInventory as any[];
          }
        }
      }

      // Calculate total quantities for each fabric from warehouse inventory
      const fabricQuantityMap = new Map();
      (finalInventoryData || []).forEach((inv: any) => {
        console.log('Processing inventory item:', inv);
        const fabricId = inv.item_id;
        if (!fabricQuantityMap.has(fabricId)) {
          fabricQuantityMap.set(fabricId, {
            total_available: 0,
            total_reserved: 0,
            unit: inv.unit || 'Kgs'
          });
        }
        const fabricQty = fabricQuantityMap.get(fabricId);
        fabricQty.total_available += parseFloat(inv.quantity) || 0;
        console.log(`Added ${inv.quantity} ${inv.unit} for fabric ${fabricId}, total now: ${fabricQty.total_available}`);
        // Note: reserved quantity would come from fabric_picking_records if needed
      });

      // Update fabric quantities with actual warehouse inventory data
      const updatedFabricsList = fabricsList.map(fabric => {
        const qtyData = fabricQuantityMap.get(fabric.fabric_id) || { total_available: 0, total_reserved: 0, unit: 'Kgs' };
        const updatedFabric = {
          ...fabric,
          total_available_quantity: qtyData.total_available,
          total_reserved_quantity: qtyData.total_reserved,
          net_available_quantity: qtyData.total_available - qtyData.total_reserved,
          unit: qtyData.unit
        };
        console.log(`Final quantities for fabric ${fabric.fabric_name} (${fabric.fabric_id}):`, {
          total_available: updatedFabric.total_available_quantity,
          net_available: updatedFabric.net_available_quantity,
          unit: updatedFabric.unit
        });
        return updatedFabric;
      });

      setFabrics(updatedFabricsList);

      // Get unique bin IDs from inventory
      const binIds = [...new Set((finalInventoryData || []).map((item: any) => item.bin_id).filter(Boolean))];
      console.log('Bin IDs found:', binIds);

      // Fetch bin details separately - simplified query to avoid complex nested relationships
      const { data: binData, error: binError } = await supabase
        .from('bins')
        .select('id, bin_code, location_type, rack_id')
        .in('id', binIds);

      if (binError) {
        console.error('Error loading bin data:', binError);
        console.log('Bin IDs that failed to load:', binIds);
        
        // Try to check if bins table exists and has any data
        const { data: allBins, error: allBinsError } = await supabase
          .from('bins')
          .select('id, bin_code, location_type')
          .limit(5);
        
        if (allBinsError) {
          console.error('Bins table error:', allBinsError);
        } else {
          console.log('Sample bins data:', allBins);
        }
        
        toast({
          title: "Error",
          description: "Failed to load storage zones",
          variant: "destructive",
        });
      } else {
        console.log('Bin data loaded successfully:', binData);
      }

      console.log('Bin details loaded:', binData);

      // Create a map of bin_id to bin details
      const binMap = new Map();
      (binData || []).forEach((bin: any) => {
        binMap.set(bin.id, bin);
      });

      // Group inventory by location type (zones) for each fabric
      const fabricZoneInventory = new Map();
      
      (finalInventoryData || []).forEach((inv: any) => {
        const bin = binMap.get(inv.bin_id);
        const locationType = bin?.location_type || 'UNKNOWN_ZONE';
        const fabricId = inv.item_id;
        
        if (fabricId) {
          const fabricZoneKey = `${fabricId}_${locationType}`;
          
          if (!fabricZoneInventory.has(fabricZoneKey)) {
            fabricZoneInventory.set(fabricZoneKey, {
              fabric_id: fabricId,
              id: locationType,
              zone_name: locationType === 'RECEIVING_ZONE' ? 'Receiving Zone' : 
                       locationType === 'STORAGE' ? 'Storage Zone' : 
                       locationType === 'DISPATCH_ZONE' ? 'Dispatch Zone' : 
                       locationType === 'UNKNOWN_ZONE' ? 'Warehouse Inventory' :
                       locationType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
              zone_code: locationType,
              location: bin ? `${bin.bin_code}` : `Bin ID: ${inv.bin_id}`,
              available_quantity: 0,
              bin_details: bin
            });
          }
          
          const zone = fabricZoneInventory.get(fabricZoneKey);
          zone.available_quantity += parseFloat(inv.quantity) || 0;
        }
      });

      const zonesList = Array.from(fabricZoneInventory.values());
      console.log('Zones with inventory:', zonesList);
      setStorageZones(zonesList);
      
      // Initialize picking quantities to 0
      const initialQuantities: {[key: string]: number} = {};
      setPickingQuantities(initialQuantities);
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
                      
                      {/* Inventory Summary Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-gray-600 mb-1">Total Warehouse</div>
                            <div className="text-sm font-bold text-gray-800">
                              {fabric.total_available_quantity.toFixed(2)} {fabric.unit}
                            </div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-green-600 mb-1">Net Available</div>
                            <div className="text-sm font-bold text-green-800">
                              {fabric.net_available_quantity.toFixed(2)} {fabric.unit}
                            </div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-blue-600 mb-1">Storage Zone</div>
                            <div className="text-sm font-bold text-blue-800">
                              {storageZones.find(z => z.zone_code === 'STORAGE')?.available_quantity?.toFixed(2) || '0.00'} {fabric.unit}
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

                        {/* Storage Zones Section */}
                        <div className="border-t pt-6">
                          <h5 className="text-lg font-medium text-gray-900 mb-4">Storage Zones</h5>
                          
                          {(() => {
                            const fabricZones = storageZones.filter(zone => zone.fabric_id === fabric.fabric_id);
                            return fabricZones.length === 0 ? (
                              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                                <p className="text-sm">No inventory found in storage zones for this fabric</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {fabricZones.map((zone) => {
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
                            );
                          })()}
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
