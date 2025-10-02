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
      const { data, error } = await (supabase as any)
        .from('fabric_inventory')
        .select('fabric_id, storage_zone_id, available_quantity, reserved_quantity, unit');
      if (error) {
        console.error('Error loading zone availability:', error);
        return;
      }
      const map: Record<string, Record<string, { available: number; reserved: number; unit?: string }>> = {};
      (data || []).forEach((r: any) => {
        const fid = r.fabric_id as string; const zid = r.storage_zone_id as string;
        if (!map[fid]) map[fid] = {};
        map[fid][zid] = { available: Number(r.available_quantity || 0), reserved: Number(r.reserved_quantity || 0), unit: r.unit };
      });
      setZoneAvailability(map);
    } catch (e) { /* ignore */ }
  };

  const loadStorageZones = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('fabric_storage_zones')
        .select('*')
        .eq('is_active', true)
        .order('zone_name');

      if (error) {
        console.error('Error loading storage zones:', error);
        toast({
          title: "Error",
          description: "Failed to load storage zones",
          variant: "destructive",
        });
        return;
      }

      setStorageZones((data as any) || []);
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

      // Update picking records with user info
      const finalPickingRecords = pickingRecords.map(record => ({
        ...record,
        picked_by_id: user?.id || null,
        picked_by_name: user?.user_metadata?.full_name || user?.email || 'System'
      }));

      const { error } = await (supabase as any)
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
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Availability Info */}
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-600 mb-1">Available in Storage:</div>
                          <div className="text-sm font-medium">
                            {(() => {
                              const toShow = selectedZoneId ? (zoneNet || 0) : (globalNet || 0);
                              return (typeof toShow === 'number' ? toShow.toFixed(2) : toShow) + ' ' + (fabric.unit || 'units');
                            })()}
                          </div>
                          <div className="bg-yellow-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-yellow-600 mb-1">Dispatch Zone</div>
                            <div className="text-sm font-bold text-yellow-800">
                              {storageZones.find(z => z.zone_code === 'DISPATCH_ZONE')?.available_quantity?.toFixed(2) || '0.00'} {fabric.unit}
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
                              {storageZones.map((zone) => {
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
