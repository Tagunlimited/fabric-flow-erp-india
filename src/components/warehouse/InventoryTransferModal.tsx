import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Package, 
  Archive, 
  ArrowRight, 
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WarehouseInventory, InventoryTransferData, Bin } from '@/types/warehouse-inventory';
import { toast } from 'sonner';

interface InventoryTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: WarehouseInventory | null;
  onTransferComplete?: () => void;
}

export const InventoryTransferModal: React.FC<InventoryTransferModalProps> = ({
  open,
  onOpenChange,
  inventory,
  onTransferComplete
}) => {
  const [loading, setLoading] = useState(false);
  const [availableBins, setAvailableBins] = useState<Bin[]>([]);
  const [selectedBinId, setSelectedBinId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Load available storage bins
  const loadAvailableBins = async () => {
    try {
      const { data, error } = await supabase
        .from('bins' as any)
        .select(`
          id,
          bin_code,
          location_type,
          rack:rack_id (
            id,
            rack_code,
            floor:floor_id (
              id,
              floor_number,
              warehouse:warehouse_id (
                id,
                name,
                code
              )
            )
          )
        `)
        .eq('location_type', 'STORAGE' as any)
        .eq('is_active', true as any)
        .order('bin_code');

      if (error) throw error;
      setAvailableBins(((data as unknown) as Bin[]) || []);
    } catch (error) {
      console.error('Error loading bins:', error);
      toast.error('Failed to load available storage bins');
    }
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open && inventory) {
      setTransferQuantity(inventory.quantity);
      setSelectedBinId('');
      setReason('');
      setNotes('');
      loadAvailableBins();
    }
  }, [open, inventory]);

  // Handle transfer
  const handleTransfer = async () => {
    if (!inventory || !selectedBinId || transferQuantity <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (transferQuantity > inventory.quantity) {
      toast.error('Transfer quantity cannot exceed available quantity');
      return;
    }

    try {
      setLoading(true);

      // Start a transaction
      const { data: transferData, error: transferError } = await supabase
        .from('inventory_movements' as any)
        .insert({
          inventory_id: inventory.id,
          from_bin_id: inventory.bin_id,
          to_bin_id: selectedBinId,
          quantity: transferQuantity,
          movement_type: 'TRANSFER',
          reason: reason || 'Transfer to storage',
          notes: notes
        } as any)
        .select()
        .single();

      if (transferError) throw transferError;

      const remainingQty = Number(inventory.quantity) - Number(transferQuantity);
      const oldQuantity = Number(inventory.quantity);
      const fromBinId = inventory.bin_id;

      if (remainingQty > 0) {
        // Partial transfer: split into two rows
        // 1) Reduce quantity on the original (keep RECEIVED in receiving bin)
        const { error: reduceError } = await supabase
          .from('warehouse_inventory' as any)
          .update({
            quantity: remainingQty,
            status: 'RECEIVED',
            notes: notes || inventory.notes
          } as any)
          .eq('id', inventory.id as any);
        if (reduceError) throw reduceError;

        // 2) Insert a new row for the moved quantity in storage
        const { data: newInventoryRow, error: insertError } = await supabase
          .from('warehouse_inventory' as any)
          .insert({
            grn_id: inventory.grn_id,
            grn_item_id: inventory.grn_item_id,
            item_type: inventory.item_type as any,
            item_id: inventory.item_id,
            item_name: inventory.item_name,
            item_code: inventory.item_code,
            quantity: transferQuantity,
            unit: inventory.unit,
            bin_id: selectedBinId,
            status: 'IN_STORAGE',
            moved_to_storage_date: new Date().toISOString(),
            notes: notes || `Split from ${inventory.bin?.bin_code}`
          } as any)
          .select()
          .single();
        if (insertError) throw insertError;

        // Log the transfer for the new row
        try {
          const { logInventoryTransfer } = await import('@/utils/inventoryLogging');
          await logInventoryTransfer(
            newInventoryRow.id,
            {
              item_type: inventory.item_type,
              item_id: inventory.item_id || undefined,
              item_name: inventory.item_name,
              item_code: inventory.item_code,
              unit: inventory.unit,
            },
            transferQuantity,
            fromBinId,
            selectedBinId,
            'RECEIVED',
            'IN_STORAGE',
            {
              notes: notes || `Transferred ${transferQuantity} ${inventory.unit} from ${inventory.bin?.bin_code} to storage`
            }
          );
        } catch (logError) {
          console.error('Error logging inventory transfer:', logError);
        }
      } else {
        // Full transfer: move the existing row to storage
        const { error: updateError } = await supabase
          .from('warehouse_inventory' as any)
          .update({
            bin_id: selectedBinId,
            status: 'IN_STORAGE',
            moved_to_storage_date: new Date().toISOString(),
            notes: notes
          } as any)
          .eq('id', inventory.id as any);
        if (updateError) throw updateError;

        // Log the transfer
        try {
          const { logInventoryTransfer } = await import('@/utils/inventoryLogging');
          await logInventoryTransfer(
            inventory.id,
            {
              item_type: inventory.item_type,
              item_id: inventory.item_id || undefined,
              item_name: inventory.item_name,
              item_code: inventory.item_code,
              unit: inventory.unit,
            },
            transferQuantity,
            fromBinId,
            selectedBinId,
            inventory.status,
            'IN_STORAGE',
            {
              notes: notes || `Transferred ${transferQuantity} ${inventory.unit} from ${inventory.bin?.bin_code} to storage`
            }
          );
        } catch (logError) {
          console.error('Error logging inventory transfer:', logError);
        }
      }

      toast.success('Item transferred to storage successfully');

      // Notify other views to refresh
      try { window.dispatchEvent(new CustomEvent('warehouse-inventory-updated')); } catch {}

      onTransferComplete?.();
      onOpenChange(false);

    } catch (error) {
      console.error('Error transferring inventory:', error);
      toast.error('Failed to transfer item to storage');
    } finally {
      setLoading(false);
    }
  };

  if (!inventory) return null;

  const selectedBin = availableBins.find(bin => bin.id === selectedBinId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Transfer Item to Storage
          </DialogTitle>
          <DialogDescription>
            Move item from receiving zone to storage zone
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Item Details */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Item Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Item Name</Label>
                  <p className="font-medium">{inventory.item_name}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Item Code</Label>
                  <p className="font-medium">{inventory.item_code}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Type</Label>
                  <Badge variant="outline">{inventory.item_type}</Badge>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Available Quantity</Label>
                  <p className="font-medium">{inventory.quantity} {inventory.unit}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Current Location</Label>
                  <p className="font-medium">{inventory.bin?.bin_code}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Received Date</Label>
                  <p className="font-medium">
                    {new Date(inventory.received_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transfer Details */}
          <div className="space-y-4">
            <h3 className="font-semibold">Transfer Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Transfer Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.1"
                  max={inventory.quantity}
                  step="0.1"
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(parseFloat(e.target.value) || 0)}
                  placeholder="Enter quantity to transfer"
                />
                <p className="text-xs text-muted-foreground">
                  Available: {inventory.quantity} {inventory.unit}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="storage">Move to Storage</SelectItem>
                    <SelectItem value="organization">Better Organization</SelectItem>
                    <SelectItem value="space">Space Management</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">Destination Bin *</Label>
              <Select value={selectedBinId} onValueChange={setSelectedBinId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select storage bin" />
                </SelectTrigger>
                <SelectContent>
                  {availableBins.map((bin) => (
                    <SelectItem key={bin.id} value={bin.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{bin.bin_code}</span>
                        <span className="text-xs text-muted-foreground">
                          {bin.rack?.floor?.warehouse?.name} &gt; 
                          Floor {bin.rack?.floor?.floor_number} &gt; 
                          {bin.rack?.rack_code}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBin && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Selected Destination:</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    {selectedBin.bin_code} - {selectedBin.rack?.floor?.warehouse?.name} &gt; 
                    Floor {selectedBin.rack?.floor?.floor_number} &gt; {selectedBin.rack?.rack_code}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for this transfer..."
                rows={3}
              />
            </div>
          </div>

          {/* Transfer Summary */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Transfer Summary</span>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• Moving {transferQuantity} {inventory.unit} of {inventory.item_name}</p>
                <p>• From: {inventory.bin?.bin_code} (Receiving Zone)</p>
                <p>• To: {selectedBin?.bin_code || 'Select destination'} (Storage Zone)</p>
                <p>• Status will change to "In Storage"</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={loading || !selectedBinId || transferQuantity <= 0}
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Transferring...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Transfer to Storage
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
