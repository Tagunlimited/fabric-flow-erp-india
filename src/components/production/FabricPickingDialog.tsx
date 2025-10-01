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
  const [selectedZones, setSelectedZones] = useState<{[key: string]: string}>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load fabrics and storage zones when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadFabricData();
      loadStorageZones();
    }
  }, [isOpen, orderId]);

  const loadFabricData = async () => {
    try {
      const { data, error } = await supabase
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

      setFabrics(data || []);
      
      // Initialize picking quantities to 0
      const initialQuantities: {[key: string]: number} = {};
      (data || []).forEach(fabric => {
        initialQuantities[fabric.fabric_id] = 0;
      });
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

  const loadStorageZones = async () => {
    try {
      const { data, error } = await supabase
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

      setStorageZones(data || []);
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

    // Validate that all picked fabrics have selected storage zones
    for (const fabric of pickedFabrics) {
      if (!selectedZones[fabric.fabric_id]) {
        toast({
          title: "Storage Zone Required",
          description: `Please select a storage zone for ${fabric.fabric_name}`,
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();

      // Create picking records
      const pickingRecords = pickedFabrics.map(fabric => ({
        order_id: orderId,
        fabric_id: fabric.fabric_id,
        storage_zone_id: selectedZones[fabric.fabric_id],
        picked_quantity: pickingQuantities[fabric.fabric_id],
        unit: fabric.unit,
        picked_by_id: user?.id || null,
        picked_by_name: user?.user_metadata?.full_name || user?.email || 'System',
        notes: notes
      }));

      const { error } = await supabase
        .from('fabric_picking_records')
        .insert(pickingRecords);

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
                    <Card key={fabric.fabric_id} className="border border-gray-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-3">
                          {fabric.image && (
                            <img 
                              src={fabric.image} 
                              alt={fabric.fabric_name}
                              className="w-12 h-12 rounded object-cover border"
                            />
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
                            {typeof maxQty === 'number' ? maxQty.toFixed(2) : maxQty} {fabric.unit}
                          </div>
                          {fabric.total_reserved_quantity > 0 && (
                            <div className="text-xs text-orange-600 mt-1">
                              {fabric.total_reserved_quantity} {fabric.unit} reserved
                            </div>
                          )}
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
                              {storageZones.map((zone) => (
                                <SelectItem key={zone.id} value={zone.id}>
                                  <div className="flex items-center space-x-2">
                                    <MapPin className="w-3 h-3" />
                                    <span>{zone.zone_name}</span>
                                  </div>
                                </SelectItem>
                              ))}
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
