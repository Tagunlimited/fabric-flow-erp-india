import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowRight, Package } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface BatchAssignment {
  id: string;
  batch_id: string;
  batch_name: string;
  batch_leader_name?: string;
  batch_leader_avatar_url?: string;
  total_quantity?: number;
  size_distributions?: Array<{
    size_name: string;
    quantity: number;
    picked_quantity: number;
    left_quantity: number;
  }>;
}

interface Batch {
  id: string;
  batch_name: string;
  batch_leader_name?: string;
  batch_leader_avatar_url?: string;
  tailor_type?: string;
  status?: string;
}

interface ReassignBatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orderId: string;
  orderNumber: string;
  batchAssignment: BatchAssignment | null;
  availableBatches: Batch[];
}

export const ReassignBatchDialog: React.FC<ReassignBatchDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orderId,
  orderNumber,
  batchAssignment,
  availableBatches
}) => {
  const [selectedNewBatchId, setSelectedNewBatchId] = useState<string | null>(null);
  const [reassignmentType, setReassignmentType] = useState<'all' | 'partial'>('all');
  const [reassignedQuantitiesBySize, setReassignedQuantitiesBySize] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen && batchAssignment) {
      setSelectedNewBatchId(null);
      setReassignmentType('all');
      setReassignedQuantitiesBySize({});
    }
  }, [isOpen, batchAssignment]);

  if (!batchAssignment) {
    return null;
  }

  const sizeDistributions = batchAssignment.size_distributions || [];
  const leftQuantitiesBySize: Record<string, number> = {};
  sizeDistributions.forEach(sd => {
    leftQuantitiesBySize[sd.size_name] = sd.left_quantity;
  });

  const totalLeftQty = Object.values(leftQuantitiesBySize).reduce((sum, qty) => sum + qty, 0);

  // Filter batches to exclude the current batch
  const filteredBatches = availableBatches.filter(b => b.id !== batchAssignment.batch_id && b.status === 'active');

  // Calculate reassigned quantity
  const reassignedQty = reassignmentType === 'all' 
    ? totalLeftQty 
    : Object.values(reassignedQuantitiesBySize).reduce((sum, qty) => sum + qty, 0);

  // Calculate size-wise reassigned quantities
  const reassignedQuantitiesBySizeFinal: Record<string, number> = {};
  if (reassignmentType === 'all') {
    Object.assign(reassignedQuantitiesBySizeFinal, leftQuantitiesBySize);
  } else {
    Object.assign(reassignedQuantitiesBySizeFinal, reassignedQuantitiesBySize);
  }

  // Calculate remaining quantities by size for old batch
  const remainingQuantitiesBySize: Record<string, number> = {};
  sizeDistributions.forEach(sd => {
    const reassigned = reassignedQuantitiesBySizeFinal[sd.size_name] || 0;
    remainingQuantitiesBySize[sd.size_name] = Math.max(0, sd.left_quantity - reassigned);
  });

  const handleReassign = async () => {
    if (!selectedNewBatchId || !batchAssignment) {
      toast.error('Please select a new batch');
      return;
    }

    if (reassignedQty <= 0) {
      toast.error('Reassigned quantity must be greater than 0');
      return;
    }

    // Validate partial reassignment
    if (reassignmentType === 'partial') {
      for (const [size, reassigned] of Object.entries(reassignedQuantitiesBySize)) {
        const left = leftQuantitiesBySize[size] || 0;
        if (reassigned > left) {
          toast.error(`Reassigned quantity for ${size} (${reassigned}) cannot exceed left quantity (${left})`);
          return;
        }
        if (reassigned < 0) {
          toast.error(`Reassigned quantity for ${size} cannot be negative`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let currentUserName = 'System User';
      if (user) {
        currentUserName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'System User';
      }

      const newBatch = availableBatches.find(b => b.id === selectedNewBatchId);
      const newBatchName = newBatch?.batch_name || 'Unknown';

      // Step 1: Update old batch's size distributions (reduce quantity, keep picked_quantity)
      for (const [size, reassignedQty] of Object.entries(reassignedQuantitiesBySizeFinal)) {
        if (reassignedQty <= 0) continue;

        const sizeDist = sizeDistributions.find(sd => sd.size_name === size);
        if (!sizeDist) continue;

        const currentQuantity = sizeDist.quantity;
        const currentPicked = sizeDist.picked_quantity;
        const newQuantity = Math.max(currentPicked, currentQuantity - reassignedQty); // Ensure quantity >= picked_quantity

        // Update size distribution
        const { error: updateError } = await supabase
          .from('order_batch_size_distributions')
          .update({
            quantity: newQuantity
          })
          .eq('order_batch_assignment_id', batchAssignment.id)
          .eq('size_name', size);

        if (updateError) {
          throw updateError;
        }
      }

      // Step 2: Update old batch's total_quantity
      const { data: updatedSizeDists } = await supabase
        .from('order_batch_size_distributions')
        .select('quantity')
        .eq('order_batch_assignment_id', batchAssignment.id);

      const newTotalQty = (updatedSizeDists || []).reduce((sum, sd) => sum + (Number(sd.quantity) || 0), 0);

      const existingNotes = batchAssignment.batch_name || '';
      const { error: updateOldBatchError } = await supabase
        .from('order_batch_assignments')
        .update({
          total_quantity: newTotalQty,
          notes: `${existingNotes}\nReassigned ${reassignedQty} qty to ${newBatchName} on ${new Date().toISOString().split('T')[0]}`.trim()
        })
        .eq('id', batchAssignment.id);

      if (updateOldBatchError) {
        throw updateOldBatchError;
      }

      // Step 3: Check if new batch already has an assignment for this order
      const { data: existingAssignment } = await supabase
        .from('order_batch_assignments')
        .select('id')
        .eq('order_id', orderId)
        .eq('batch_id', selectedNewBatchId)
        .maybeSingle();

      if (existingAssignment) {
        // Update existing assignment
        for (const [size, reassignedQty] of Object.entries(reassignedQuantitiesBySizeFinal)) {
          if (reassignedQty <= 0) continue;

          // Check if size distribution exists
          const { data: existingSizeDist } = await supabase
            .from('order_batch_size_distributions')
            .select('quantity, picked_quantity')
            .eq('order_batch_assignment_id', existingAssignment.id)
            .eq('size_name', size)
            .maybeSingle();

          if (existingSizeDist) {
            // Update existing
            const { error: updateError } = await supabase
              .from('order_batch_size_distributions')
              .update({
                quantity: (existingSizeDist.quantity || 0) + reassignedQty,
                picked_quantity: existingSizeDist.picked_quantity || 0 // Keep existing picked, new quantities are not picked
              })
              .eq('order_batch_assignment_id', existingAssignment.id)
              .eq('size_name', size);

            if (updateError) {
              throw updateError;
            }
          } else {
            // Insert new size distribution
            const { error: insertError } = await supabase
              .from('order_batch_size_distributions')
              .insert({
                order_batch_assignment_id: existingAssignment.id,
                size_name: size,
                quantity: reassignedQty,
                picked_quantity: 0 // New quantities are not picked yet
              });

            if (insertError) {
              throw insertError;
            }
          }
        }

        // Update total_quantity for new batch
        const { data: newBatchSizeDists } = await supabase
          .from('order_batch_size_distributions')
          .select('quantity')
          .eq('order_batch_assignment_id', existingAssignment.id);

        const newBatchTotalQty = (newBatchSizeDists || []).reduce((sum, sd) => sum + (Number(sd.quantity) || 0), 0);

        const { error: updateNewBatchError } = await supabase
          .from('order_batch_assignments')
          .update({
            total_quantity: newBatchTotalQty,
            notes: `${newBatchName} - Reassigned ${reassignedQty} qty from ${batchAssignment.batch_name} on ${new Date().toISOString().split('T')[0]}`
          })
          .eq('id', existingAssignment.id);

        if (updateNewBatchError) {
          throw updateNewBatchError;
        }
      } else {
        // Create new assignment
        // Note: batch_leader_avatar_url doesn't exist in order_batch_assignments table
        // The avatar is optional and stored in batches table, not in order_batch_assignments
        const { data: newAssignment, error: insertAssignmentError } = await supabase
          .from('order_batch_assignments')
          .insert({
            order_id: orderId,
            batch_id: selectedNewBatchId,
            batch_name: newBatchName,
            batch_leader_name: newBatch?.batch_leader_name || null,
            assigned_by_name: currentUserName,
            assignment_date: new Date().toISOString().split('T')[0],
            total_quantity: reassignedQty,
            notes: `Reassigned ${reassignedQty} qty from ${batchAssignment.batch_name} on ${new Date().toISOString().split('T')[0]}`
          })
          .select()
          .single();

        if (insertAssignmentError) {
          throw insertAssignmentError;
        }

        // Insert size distributions for new batch
        const sizeDistributionsToInsert = Object.entries(reassignedQuantitiesBySizeFinal)
          .filter(([_, qty]) => qty > 0)
          .map(([size_name, quantity]) => ({
            order_batch_assignment_id: newAssignment.id,
            size_name,
            quantity,
            picked_quantity: 0 // New quantities are not picked yet
          }));

        if (sizeDistributionsToInsert.length > 0) {
          const { error: insertSizeDistError } = await supabase
            .from('order_batch_size_distributions')
            .insert(sizeDistributionsToInsert);

          if (insertSizeDistError) {
            throw insertSizeDistError;
          }
        }
      }

      toast.success(`Successfully reassigned ${reassignedQty} quantity to ${newBatchName}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error reassigning batch:', error);
      toast.error(error?.message || 'Failed to reassign batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reassign Batch</DialogTitle>
          <DialogDescription>
            Reassign left quantities (not picked yet) from one batch to another for order {orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Batch Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Current Batch</Label>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={batchAssignment.batch_leader_avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {batchAssignment.batch_leader_name?.charAt(0) || batchAssignment.batch_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{batchAssignment.batch_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {batchAssignment.batch_leader_name}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {sizeDistributions.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Size-wise Quantities</Label>
                    <div className="space-y-2">
                      {sizeDistributions.map(sd => {
                        const assigned = sd.quantity || 0;
                        const picked = sd.picked_quantity || 0;
                        const left = sd.left_quantity || 0;
                        return (
                          <div key={sd.size_name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <span className="text-sm font-medium">{sd.size_name}</span>
                            <div className="text-xs text-muted-foreground">
                              Assigned: {assigned} | Picked: {picked} | Left: {left}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Select New Batch */}
          <div className="space-y-2">
            <Label htmlFor="new-batch">Select New Batch</Label>
            <Select value={selectedNewBatchId || ''} onValueChange={setSelectedNewBatchId}>
              <SelectTrigger id="new-batch">
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {filteredBatches.map(batch => (
                  <SelectItem key={batch.id} value={batch.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={batch.batch_leader_avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {batch.batch_leader_name?.charAt(0) || batch.batch_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{batch.batch_name}</span>
                      {batch.batch_leader_name && (
                        <span className="text-xs text-muted-foreground">• {batch.batch_leader_name}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reassignment Type */}
          <div className="space-y-2">
            <Label>Reassignment Type</Label>
            <RadioGroup value={reassignmentType} onValueChange={(value) => setReassignmentType(value as 'all' | 'partial')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="font-normal cursor-pointer">
                  Reassign All Left Quantity ({totalLeftQty} pcs)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="font-normal cursor-pointer">
                  Reassign Partial Quantity
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Size-wise Quantity Input (Partial) */}
          {reassignmentType === 'partial' && sizeDistributions.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <Label className="text-sm font-medium mb-4 block">Reassign Quantities by Size</Label>
                <div className="space-y-3">
                  {sizeDistributions.map(sd => {
                    const left = sd.left_quantity || 0;
                    const reassigned = reassignedQuantitiesBySize[sd.size_name] || 0;
                    return (
                      <div key={sd.size_name} className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <Label className="text-sm">{sd.size_name}</Label>
                          <div className="text-xs text-muted-foreground">Left: {left} pcs</div>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={left}
                          value={reassigned}
                          onChange={(e) => {
                            const value = Math.max(0, Math.min(left, parseInt(e.target.value) || 0));
                            setReassignedQuantitiesBySize(prev => ({
                              ...prev,
                              [sd.size_name]: value
                            }));
                          }}
                          className="w-24"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {selectedNewBatchId && reassignedQty > 0 && (
            <Card>
              <CardContent className="pt-6">
                <Label className="text-sm font-medium mb-4 block">Reassignment Summary</Label>
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="mb-2">
                      <div className="font-medium">Old Batch: {batchAssignment.batch_name}</div>
                      <div className="text-muted-foreground text-sm">
                        Total Left: {totalLeftQty} pcs → {totalLeftQty - reassignedQty} remaining ({reassignedQty} reassigned)
                      </div>
                    </div>
                    {Object.keys(reassignedQuantitiesBySizeFinal).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Reassigned by size:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(reassignedQuantitiesBySizeFinal)
                              .filter(([_, qty]) => qty > 0)
                              .map(([size, qty]) => (
                                <span key={size} className="bg-orange-200 text-orange-800 px-2 py-1 rounded text-xs">
                                  {size}: {qty}
                                </span>
                              ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Remaining by size:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(remainingQuantitiesBySize)
                              .filter(([_, qty]) => qty > 0)
                              .map(([size, qty]) => (
                                <span key={size} className="bg-gray-200 px-2 py-1 rounded text-xs">
                                  {size}: {qty}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-blue-50 rounded">
                    <div className="mb-2">
                      <div className="font-medium">New Batch: {availableBatches.find(b => b.id === selectedNewBatchId)?.batch_name}</div>
                      <div className="text-muted-foreground text-sm">0 assigned → {reassignedQty} assigned (0 picked, {reassignedQty} left)</div>
                    </div>
                    {Object.keys(reassignedQuantitiesBySizeFinal).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Left to pick by size:</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(reassignedQuantitiesBySizeFinal)
                            .filter(([_, qty]) => qty > 0)
                            .map(([size, qty]) => (
                              <span key={size} className="bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs">
                                {size}: {qty}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleReassign} disabled={loading || !selectedNewBatchId || reassignedQty <= 0}>
            {loading ? 'Reassigning...' : `Confirm Reassignment (${reassignedQty} pcs)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

