import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowRight, User, Package } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface OrderAssignment {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  cuttingMasters?: Array<{
    id: string;
    cuttingMasterId: string;
    name: string;
    avatarUrl?: string;
    assignedDate: string;
    assignedBy?: string;
    assignedQuantity?: number | null;
    completedQuantity?: number;
    cutQuantitiesBySize?: Record<string, number>;
    leftQuantity?: number;
    leftQuantitiesBySize?: Record<string, number>;
    status?: string;
    bomTotalQuantity?: number;
  }>;
}

interface Worker {
  id: string;
  name: string;
  designation?: string;
  avatar_url?: string;
}

interface ReassignCuttingMasterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assignment: OrderAssignment | null;
  workers: Worker[];
}

export const ReassignCuttingMasterDialog: React.FC<ReassignCuttingMasterDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  assignment,
  workers
}) => {
  const [selectedOldMasterId, setSelectedOldMasterId] = useState<string | null>(null);
  const [selectedNewMasterId, setSelectedNewMasterId] = useState<string | null>(null);
  const [reassignmentType, setReassignmentType] = useState<'all' | 'partial'>('all');
  const [partialQuantity, setPartialQuantity] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens/closes or assignment changes
  useEffect(() => {
    if (isOpen && assignment) {
      // Auto-select first cutting master if only one exists
      // Note: selectedOldMasterId is the assignment ID from order_cutting_assignments, not the cutting master ID
      if (assignment.cuttingMasters && assignment.cuttingMasters.length === 1) {
        setSelectedOldMasterId(assignment.cuttingMasters[0].id); // This is the assignment ID
      } else {
        setSelectedOldMasterId(null);
      }
      setSelectedNewMasterId(null);
      setReassignmentType('all');
      setPartialQuantity(0);
    }
  }, [isOpen, assignment]);

  if (!assignment || !assignment.cuttingMasters || assignment.cuttingMasters.length === 0) {
    return null;
  }

  const selectedOldMaster = assignment.cuttingMasters.find(m => m.id === selectedOldMasterId);
  const bomTotalQty = selectedOldMaster?.bomTotalQuantity ?? assignment.quantity;
  const assignedQty = selectedOldMaster?.assignedQuantity ?? null;
  const completedQty = selectedOldMaster?.completedQuantity ?? 0;
  const effectiveAssignedQty = assignedQty ?? bomTotalQty;
  
  // Calculate left quantity - allow reassignment if there's any assigned quantity not fully cut
  // Always calculate left quantity from assigned - completed to ensure accuracy
  // This ensures reassignment works even if cutting hasn't started (completedQty = 0)
  const calculatedLeftQty = Math.max(0, effectiveAssignedQty - completedQty);
  const leftQtyFromMaster = selectedOldMaster?.leftQuantity ?? 0;
  
  // Use the maximum of calculated value and provided value to ensure we don't miss anything
  // If provided leftQuantity is 0 but there's assigned quantity, use calculated value
  let leftQty = Math.max(leftQtyFromMaster, calculatedLeftQty);
  
  // Ensure leftQty is at least calculated value if assigned quantity exists
  if (effectiveAssignedQty > 0 && leftQty === 0) {
    leftQty = calculatedLeftQty;
  }
  
  const leftQuantitiesBySize = selectedOldMaster?.leftQuantitiesBySize || {};

  // Filter workers to show only cutting masters/managers, excluding the old master
  const availableWorkers = workers.filter(w => {
    const designation = (w as any).designation?.toLowerCase() || '';
    const isCuttingMaster = designation.includes('cutting master') || designation.includes('cutting manager');
    // Exclude the old cutting master by comparing cutting_master_id
    const isNotOldMaster = selectedOldMaster ? w.id !== selectedOldMaster.cuttingMasterId : true;
    return isCuttingMaster && isNotOldMaster;
  });

  // Calculate reassigned quantity
  const reassignedQty = reassignmentType === 'all' ? leftQty : partialQuantity;
  const remainingWithOldMaster = Math.max(0, effectiveAssignedQty - reassignedQty);
  
  // Calculate size-wise reassigned quantities (proportional distribution)
  const reassignedQuantitiesBySize: Record<string, number> = {};
  
  if (reassignmentType === 'all') {
    // Reassign all left quantities by size
    Object.assign(reassignedQuantitiesBySize, leftQuantitiesBySize);
  } else {
    // For partial, distribute proportionally across sizes
    const totalLeft = Object.values(leftQuantitiesBySize).reduce((sum, qty) => sum + qty, 0);
    if (totalLeft > 0) {
      Object.entries(leftQuantitiesBySize).forEach(([size, sizeLeftQty]) => {
        const proportion = sizeLeftQty / totalLeft;
        reassignedQuantitiesBySize[size] = Math.round(proportion * reassignedQty);
      });
    }
  }
  
  // Calculate remaining quantities by size for old master
  const remainingQuantitiesBySize: Record<string, number> = {};
  Object.entries(leftQuantitiesBySize).forEach(([size, sizeLeftQty]) => {
    const reassigned = reassignedQuantitiesBySize[size] || 0;
    remainingQuantitiesBySize[size] = Math.max(0, sizeLeftQty - reassigned);
  });

  const handleReassign = async () => {
    if (!selectedOldMasterId || !selectedNewMasterId || !selectedOldMaster) {
      toast.error('Please select both old and new cutting masters');
      return;
    }

    // Validate reassigned quantity - ensure it doesn't exceed what's available to reassign
    const maxReassignableQty = Math.max(leftQty, effectiveAssignedQty - completedQty);
    
    if (reassignmentType === 'partial' && (partialQuantity <= 0 || partialQuantity > maxReassignableQty)) {
      toast.error(`Partial quantity must be between 1 and ${maxReassignableQty}`);
      return;
    }

    if (reassignedQty <= 0) {
      toast.error('Reassigned quantity must be greater than 0');
      return;
    }
    
    // Ensure we don't reassign more than what's available
    if (reassignedQty > maxReassignableQty) {
      toast.error(`Cannot reassign more than ${maxReassignableQty} quantity`);
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Get current user for assigned_by fields
      const { data: { user } } = await supabase.auth.getUser();
      
      // Try to get user name from user metadata or email
      let currentUserName = 'System User';
      if (user) {
        currentUserName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'System User';
      }
      const newMaster = workers.find(w => w.id === selectedNewMasterId);
      const newMasterName = newMaster?.name || 'Unknown';

      // Step 1: Update old cutting master's record
      // Reduce assigned_quantity so they can't cut the reassigned quantities
      // Their cut_quantities_by_size remains unchanged (what they've already cut)
      const { error: updateOldError } = await supabase
        .from('order_cutting_assignments')
        .update({
          assigned_quantity: remainingWithOldMaster,
          notes: `${selectedOldMaster.notes || ''}\nReassigned ${reassignedQty} qty to ${newMasterName} on ${new Date().toISOString().split('T')[0]}`.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedOldMasterId);

      if (updateOldError) {
        throw updateOldError;
      }

      // Step 2: Check if new master already has an assignment for this order
      const { data: existingAssignment } = await supabase
        .from('order_cutting_assignments')
        .select('id, assigned_quantity')
        .eq('order_id', assignment.id)
        .eq('cutting_master_id', selectedNewMasterId)
        .maybeSingle();

      if (existingAssignment) {
        // Update existing assignment
        // Merge size-wise quantities if they exist
        const existingCutQuantities = existingAssignment.cut_quantities_by_size || {};
        const mergedCutQuantities = { ...existingCutQuantities };
        // Note: New master's cut_quantities_by_size remains unchanged (they haven't cut the reassigned quantities yet)
        
        const { error: updateNewError } = await supabase
          .from('order_cutting_assignments')
          .update({
            assigned_quantity: (existingAssignment.assigned_quantity || 0) + reassignedQty,
            cut_quantities_by_size: mergedCutQuantities, // Keep existing cuts, new quantities are not cut yet
            notes: `${existingAssignment.notes || ''}\nReassigned ${reassignedQty} qty from ${selectedOldMaster.name} on ${new Date().toISOString().split('T')[0]}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAssignment.id);

        if (updateNewError) {
          throw updateNewError;
        }
      } else {
        // Create new assignment
        // New master starts with assigned_quantity = reassignedQty and empty cut_quantities_by_size
        const { error: insertError } = await supabase
          .from('order_cutting_assignments')
          .insert({
            order_id: assignment.id,
            cutting_master_id: selectedNewMasterId,
            cutting_master_name: newMasterName,
            cutting_master_avatar_url: newMaster?.avatar_url || null,
            assigned_quantity: reassignedQty,
            completed_quantity: 0,
            cut_quantities_by_size: {}, // New master starts with no cuts
            assigned_date: new Date().toISOString().split('T')[0],
            assigned_by_name: currentUserName,
            status: 'assigned',
            notes: `Reassigned ${reassignedQty} qty from ${selectedOldMaster.name} on ${new Date().toISOString().split('T')[0]}`
          });

        if (insertError) {
          throw insertError;
        }
      }

      toast.success(`Successfully reassigned ${reassignedQty} quantity to ${newMasterName}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error reassigning cutting master:', error);
      toast.error(error?.message || 'Failed to reassign cutting master');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reassign Cutting Master</DialogTitle>
          <DialogDescription>
            Reassign left quantities from one cutting master to another for order {assignment.orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Section 1: Current Assignment Info */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                Current Cutting Masters
              </h3>
              <div className="space-y-3">
                {assignment.cuttingMasters.map((master) => {
                  // Show cutting master name, how much they've cut, and left quantities
                  const masterLeftQty = master.leftQuantity ?? 0;
                  const masterCutQty = master.completedQuantity ?? 0;
                  const masterAssignedQty = master.assignedQuantity ?? null;
                  const masterBomQty = master.bomTotalQuantity ?? assignment.quantity;
                  const masterEffectiveAssignedQty = masterAssignedQty ?? masterBomQty;
                  const masterLeftQuantitiesBySize = master.leftQuantitiesBySize || {};
                  const masterCutQuantitiesBySize = master.cutQuantitiesBySize || {};
                  const isSelected = master.id === selectedOldMasterId;
                  const hasSizeBreakdown = Object.keys(masterLeftQuantitiesBySize).length > 0;
                  // Recalculate leftQty if needed - allow reassignment if there's assigned quantity not fully cut
                  const effectiveMasterLeftQty = masterLeftQty > 0 
                    ? masterLeftQty 
                    : Math.max(0, masterEffectiveAssignedQty - masterCutQty);

                  return (
                    <div
                      key={master.id}
                      className={`p-3 rounded-lg border-2 ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={master.avatarUrl} />
                              <AvatarFallback className="text-xs">{master.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{master.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Assigned: {masterEffectiveAssignedQty} pcs | Cut: {masterCutQty} pcs | Left: {effectiveMasterLeftQty} pcs
                              </div>
                            </div>
                          </div>
                          {hasSizeBreakdown && (
                            <div className="mt-2 space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">Cut by size:</div>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                                {Object.entries(masterCutQuantitiesBySize)
                                  .filter(([_, qty]) => qty > 0)
                                  .map(([size, qty]) => (
                                    <span key={size} className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                      {size}: {qty}
                                    </span>
                                  ))}
                                {Object.keys(masterCutQuantitiesBySize).filter(size => (masterCutQuantitiesBySize[size] || 0) > 0).length === 0 && (
                                  <span className="text-muted-foreground">No cuts yet</span>
                                )}
                              </div>
                              <div className="text-xs font-medium text-muted-foreground mt-1">Left by size:</div>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                                {Object.entries(masterLeftQuantitiesBySize)
                                  .filter(([_, qty]) => qty > 0)
                                  .map(([size, qty]) => (
                                    <span key={size} className="bg-gray-100 px-2 py-0.5 rounded">
                                      {size}: {qty}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {assignment.cuttingMasters && assignment.cuttingMasters.length > 1 && (
                          <Button
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedOldMasterId(master.id)}
                            disabled={masterEffectiveAssignedQty <= 0 || (effectiveMasterLeftQty === 0 && masterCutQty >= masterEffectiveAssignedQty)}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Select New Cutting Master */}
          <div>
            <Label htmlFor="new-master">Select New Cutting Master</Label>
            <Select value={selectedNewMasterId || ''} onValueChange={setSelectedNewMasterId}>
              <SelectTrigger id="new-master" className="mt-2">
                <SelectValue placeholder="Choose a cutting master" />
              </SelectTrigger>
              <SelectContent>
                {availableWorkers.length === 0 ? (
                  <SelectItem value="none" disabled>No available cutting masters</SelectItem>
                ) : (
                  availableWorkers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name} ({(worker as any).designation})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Section 3: Reassignment Options */}
          {selectedOldMasterId && effectiveAssignedQty > 0 && (
            <div>
              <Label>Reassignment Type</Label>
              <RadioGroup
                value={reassignmentType}
                onValueChange={(value) => setReassignmentType(value as 'all' | 'partial')}
                className="mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all" className="cursor-pointer">
                    Reassign All Left Quantity ({leftQty})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial" className="cursor-pointer">
                    Reassign Partial Quantity
                  </Label>
                </div>
              </RadioGroup>

              {reassignmentType === 'partial' && (
                <div className="mt-4">
                  <Label htmlFor="partial-qty">Quantity to Reassign</Label>
                  <Input
                    id="partial-qty"
                    type="number"
                    min={1}
                    max={leftQty}
                    value={partialQuantity || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setPartialQuantity(Math.min(Math.max(1, val), leftQty));
                    }}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Maximum: {leftQty} (left quantity)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Summary Preview */}
          {selectedOldMasterId && selectedNewMasterId && reassignedQty > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Reassignment Summary
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="mb-2">
                      <div className="font-medium">Old Master: {selectedOldMaster?.name}</div>
                      <div className="text-muted-foreground">
                        Cut: {selectedOldMaster?.completedQuantity || 0} pcs | Left: {leftQty} pcs → {remainingWithOldMaster} remaining ({reassignedQty} reassigned)
                      </div>
                    </div>
                    {Object.keys(leftQuantitiesBySize).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Reassigned by size:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(reassignedQuantitiesBySize)
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
                      <div className="font-medium">New Master: {workers.find(w => w.id === selectedNewMasterId)?.name}</div>
                      <div className="text-muted-foreground">0 assigned → {reassignedQty} assigned (0 cut, {reassignedQty} left)</div>
                    </div>
                    {Object.keys(reassignedQuantitiesBySize).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Left to cut by size:</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(reassignedQuantitiesBySize)
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
          <Button
            onClick={handleReassign}
            disabled={!selectedOldMasterId || !selectedNewMasterId || reassignedQty <= 0 || loading}
          >
            {loading ? 'Reassigning...' : 'Confirm Reassignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

