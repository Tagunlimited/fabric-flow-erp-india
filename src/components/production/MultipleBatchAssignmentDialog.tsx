import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Clock, User, Plus, Trash2, Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Batch {
  id: string;
  batch_name: string;
  batch_code: string;
  tailor_type: string;
  max_capacity: number;
  current_capacity: number;
  status: string;
  batch_leader_name: string;
  available_capacity: number;
}

interface OrderSize {
  size_name: string;
  total_quantity: number;
}

interface BatchAssignment {
  batch_id: string;
  batch_name: string;
  batch_code: string;
  size_distributions: { [size: string]: number };
  notes: string;
}

interface MultipleBatchAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  onSuccess: () => void;
  existingAssignments?: BatchAssignment[];
}

export const MultipleBatchAssignmentDialog: React.FC<MultipleBatchAssignmentDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  customerName,
  onSuccess,
  existingAssignments = []
}) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orderSizes, setOrderSizes] = useState<OrderSize[]>([]);
  const [assignments, setAssignments] = useState<BatchAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const { toast } = useToast();

  // Initialize assignments when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAssignments([...existingAssignments]);
      fetchData();
    }
  }, [isOpen, existingAssignments]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // Fetch available batches
      const { data: batchesData, error: batchesError } = await supabase
        .from('batches')
        .select(`
          id,
          batch_name,
          batch_code,
          tailor_type,
          max_capacity,
          current_capacity,
          status,
          batch_leader_id,
          tailors!batches_batch_leader_id_fkey(full_name, tailor_code)
        `)
        .eq('status', 'active')
        .order('batch_name');

      if (batchesError) throw batchesError;

      const batchesWithLeader = (batchesData || []).map(batch => ({
        id: batch.id,
        batch_name: batch.batch_name,
        batch_code: batch.batch_code,
        tailor_type: batch.tailor_type,
        max_capacity: batch.max_capacity,
        current_capacity: batch.current_capacity,
        status: batch.status,
        batch_leader_name: batch.tailors?.full_name || 'No Leader',
        available_capacity: batch.max_capacity - batch.current_capacity
      })).filter(batch => batch.available_capacity > 0);

      setBatches(batchesWithLeader);

      // Fetch order sizes
      const { data: sizesData, error: sizesError } = await supabase
        .rpc('get_order_sizes', { order_uuid: orderId });

      if (sizesError) throw sizesError;
      setOrderSizes(sizesData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setFetchingData(false);
    }
  };

  const addBatchAssignment = () => {
    const newAssignment: BatchAssignment = {
      batch_id: '',
      batch_name: '',
      batch_code: '',
      size_distributions: {},
      notes: ''
    };
    setAssignments([...assignments, newAssignment]);
  };

  const removeBatchAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const updateBatchAssignment = (index: number, field: keyof BatchAssignment, value: any) => {
    const updated = [...assignments];
    if (field === 'batch_id') {
      const selectedBatch = batches.find(b => b.id === value);
      updated[index] = {
        ...updated[index],
        batch_id: value,
        batch_name: selectedBatch?.batch_name || '',
        batch_code: selectedBatch?.batch_code || '',
        size_distributions: {} // Reset size distributions when batch changes
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value
      };
    }
    setAssignments(updated);
  };

  const updateSizeDistribution = (assignmentIndex: number, size: string, quantity: number) => {
    const updated = [...assignments];
    updated[assignmentIndex].size_distributions[size] = quantity;
    setAssignments(updated);
  };

  const getTotalQuantityForSize = (size: string) => {
    return assignments.reduce((total, assignment) => {
      return total + (assignment.size_distributions[size] || 0);
    }, 0);
  };

  const getRemainingQuantityForSize = (size: string) => {
    const orderSize = orderSizes.find(s => s.size_name === size);
    const totalAssigned = getTotalQuantityForSize(size);
    return (orderSize?.total_quantity || 0) - totalAssigned;
  };

  const getTotalQuantityForBatch = (assignment: BatchAssignment) => {
    return Object.values(assignment.size_distributions).reduce((total, qty) => total + qty, 0);
  };

  const validateAssignments = () => {
    // Check if all sizes are fully distributed
    for (const size of orderSizes) {
      const remaining = getRemainingQuantityForSize(size.size_name);
      if (remaining > 0) {
        toast({
          title: "Validation Error",
          description: `Size ${size.size_name} has ${remaining} remaining quantity to be assigned`,
          variant: "destructive",
        });
        return false;
      }
    }

    // Check if all assignments have batches selected
    for (const assignment of assignments) {
      if (!assignment.batch_id) {
        toast({
          title: "Validation Error",
          description: "Please select a batch for all assignments",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateAssignments()) return;

    setLoading(true);
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();

      // Delete existing assignments for this order
      const { error: deleteError } = await supabase
        .from('order_batch_assignments')
        .delete()
        .eq('order_id', orderId);

      if (deleteError) throw deleteError;

      // Insert new assignments
      for (const assignment of assignments) {
        // Insert batch assignment
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('order_batch_assignments')
          .insert({
            order_id: orderId,
            batch_id: assignment.batch_id,
            assigned_by_id: user?.id,
            assigned_by_name: user?.user_metadata?.full_name || 'System',
            assignment_date: new Date().toISOString().split('T')[0],
            notes: assignment.notes
          })
          .select()
          .single();

        if (assignmentError) throw assignmentError;

        // Insert size distributions
        const sizeDistributions = Object.entries(assignment.size_distributions)
          .filter(([_, quantity]) => quantity > 0)
          .map(([size_name, quantity]) => ({
            order_batch_assignment_id: assignmentData.id,
            size_name,
            quantity
          }));

        if (sizeDistributions.length > 0) {
          const { error: sizeError } = await supabase
            .from('order_batch_size_distributions')
            .insert(sizeDistributions);

          if (sizeError) throw sizeError;
        }
      }

      toast({
        title: "Success",
        description: `Batch assignments saved for order ${orderNumber}`,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving batch assignments:', error);
      toast({
        title: "Error",
        description: "Failed to save batch assignments",
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
          <DialogTitle>Assign Multiple Batches to Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <h4 className="font-medium">Order Details</h4>
                <p><span className="font-medium">Order:</span> {orderNumber}</p>
                <p><span className="font-medium">Customer:</span> {customerName}</p>
              </div>
            </CardContent>
          </Card>

          {/* Order Sizes Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Sizes & Quantities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {orderSizes.map((size) => (
                  <div key={size.size_name} className="text-center p-3 border rounded-lg">
                    <div className="font-medium">{size.size_name}</div>
                    <div className="text-2xl font-bold text-blue-600">{size.total_quantity}</div>
                    <div className="text-sm text-muted-foreground">pieces</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Batch Assignments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Batch Assignments</CardTitle>
                <Button onClick={addBatchAssignment} disabled={fetchingData}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Batch
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No batch assignments yet. Click "Add Batch" to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {assignments.map((assignment, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <h4 className="font-medium">Batch Assignment #{index + 1}</h4>
                            {assignment.batch_name && (
                              <Badge variant="secondary">
                                {assignment.batch_name} ({assignment.batch_code})
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeBatchAssignment(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Batch Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Select Batch</Label>
                            <Select
                              value={assignment.batch_id}
                              onValueChange={(value) => updateBatchAssignment(index, 'batch_id', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a batch" />
                              </SelectTrigger>
                              <SelectContent>
                                {batches.map((batch) => (
                                  <SelectItem key={batch.id} value={batch.id}>
                                    <div className="flex items-center justify-between w-full">
                                      <span>{batch.batch_name} ({batch.batch_code})</span>
                                      <Badge variant="secondary" className="ml-2">
                                        {batch.available_capacity} available
                                      </Badge>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Assignment Notes (Optional)</Label>
                            <Textarea
                              placeholder="Add notes about this batch assignment..."
                              value={assignment.notes}
                              onChange={(e) => updateBatchAssignment(index, 'notes', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>

                        {/* Size Distribution */}
                        {assignment.batch_id && (
                          <div>
                            <Label>Size-wise Quantity Distribution</Label>
                            <div className="mt-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Available</TableHead>
                                    <TableHead>Assigned</TableHead>
                                    <TableHead>Remaining</TableHead>
                                    <TableHead>Quantity</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {orderSizes.map((size) => {
                                    const assigned = assignment.size_distributions[size.size_name] || 0;
                                    const remaining = getRemainingQuantityForSize(size.size_name) + assigned;
                                    return (
                                      <TableRow key={size.size_name}>
                                        <TableCell className="font-medium">{size.size_name}</TableCell>
                                        <TableCell>{size.total_quantity}</TableCell>
                                        <TableCell>
                                          <span className={assigned > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                                            {assigned}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          <span className={remaining > 0 ? 'text-orange-600' : 'text-green-600'}>
                                            {remaining}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            type="number"
                                            min="0"
                                            max={remaining}
                                            value={assigned}
                                            onChange={(e) => updateSizeDistribution(index, size.size_name, parseInt(e.target.value) || 0)}
                                            className="w-20"
                                          />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                              <div className="mt-2 text-sm text-muted-foreground">
                                Total assigned to this batch: <span className="font-medium">{getTotalQuantityForBatch(assignment)}</span> pieces
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          {assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Calculator className="w-5 h-5 mr-2" />
                  Assignment Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {orderSizes.map((size) => {
                    const totalAssigned = getTotalQuantityForSize(size.size_name);
                    const remaining = getRemainingQuantityForSize(size.size_name);
                    return (
                      <div key={size.size_name} className="text-center p-3 border rounded-lg">
                        <div className="font-medium">{size.size_name}</div>
                        <div className="text-lg font-bold text-blue-600">{totalAssigned}</div>
                        <div className="text-sm text-muted-foreground">of {size.total_quantity}</div>
                        {remaining > 0 && (
                          <div className="text-xs text-orange-600 mt-1">
                            {remaining} remaining
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            onClick={handleSubmit} 
            disabled={loading || assignments.length === 0 || fetchingData}
          >
            {loading ? 'Saving...' : 'Save Assignments'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
