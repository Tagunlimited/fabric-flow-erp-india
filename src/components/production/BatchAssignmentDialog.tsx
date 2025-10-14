import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Clock, User } from 'lucide-react';
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

interface BatchAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  customerName: string;
  onSuccess: () => void;
  currentAssignment?: {
    assigned_batch_id?: string;
    assigned_batch_name?: string;
    assigned_batch_code?: string;
    batch_assignment_notes?: string;
  };
}

export const BatchAssignmentDialog: React.FC<BatchAssignmentDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  customerName,
  onSuccess,
  currentAssignment
}) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchingBatches, setFetchingBatches] = useState(false);
  const { toast } = useToast();

  // Fetch available batches when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchAvailableBatches();
      // Set current assignment if editing
      if (currentAssignment) {
        setSelectedBatchId(currentAssignment.assigned_batch_id || '');
        setNotes(currentAssignment.batch_assignment_notes || '');
      } else {
        setSelectedBatchId('');
        setNotes('');
      }
    }
  }, [isOpen, currentAssignment]);

  const fetchAvailableBatches = async () => {
    setFetchingBatches(true);
    try {
      const { data, error } = await supabase
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

      if (error) throw error;

      const batchesWithLeader = (data || []).map(batch => ({
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
    } catch (error) {
      console.error('Error fetching batches:', error);
      toast({
        title: "Error",
        description: "Failed to fetch available batches",
        variant: "destructive",
      });
    } finally {
      setFetchingBatches(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedBatchId) {
      toast({
        title: "Error",
        description: "Please select a batch",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedBatch = batches.find(b => b.id === selectedBatchId);
      
      // Get current user info (you might want to get this from auth context)
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update order_assignments table
      const { error } = await supabase
        .from('order_assignments')
        .upsert({
          order_id: orderId,
          assigned_batch_id: selectedBatchId,
          assigned_batch_name: selectedBatch?.batch_name,
          assigned_batch_code: selectedBatch?.batch_code,
          batch_assignment_date: new Date().toISOString().split('T')[0],
          assigned_by_id: user?.id,
          assigned_by_name: user?.user_metadata?.full_name || 'System',
          batch_assignment_notes: notes
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Batch ${selectedBatch?.batch_name} assigned to order ${orderNumber}`,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error assigning batch:', error);
      toast({
        title: "Error",
        description: "Failed to assign batch to order",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('order_assignments')
        .update({
          assigned_batch_id: null,
          assigned_batch_name: null,
          assigned_batch_code: null,
          batch_assignment_date: null,
          assigned_by_id: null,
          assigned_by_name: null,
          batch_assignment_notes: null
        })
        .eq('order_id', orderId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Batch assignment removed",
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error removing batch assignment:', error);
      toast({
        title: "Error",
        description: "Failed to remove batch assignment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {currentAssignment?.assigned_batch_id ? 'Edit Batch Assignment' : 'Assign Tailor Batch'}
          </DialogTitle>
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

          {/* Batch Selection */}
          <div className="space-y-2">
            <Label htmlFor="batch-select">Select Batch</Label>
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId} disabled={fetchingBatches}>
              <SelectTrigger>
                <SelectValue placeholder={fetchingBatches ? "Loading batches..." : "Choose a batch"} />
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

          {/* Selected Batch Details */}
          {selectedBatchId && (
            <Card>
              <CardContent className="pt-6">
                {(() => {
                  const selectedBatch = batches.find(b => b.id === selectedBatchId);
                  if (!selectedBatch) return null;
                  
                  return (
                    <div className="space-y-3">
                      <h4 className="font-medium">Batch Details</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span><strong>Name:</strong> {selectedBatch.batch_name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span><strong>Code:</strong> {selectedBatch.batch_code}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span><strong>Leader:</strong> {selectedBatch.batch_leader_name}</span>
                        </div>
                        <div>
                          <span><strong>Type:</strong> </span>
                          <Badge variant="outline">{selectedBatch.tailor_type}</Badge>
                        </div>
                        <div>
                          <span><strong>Capacity:</strong> {selectedBatch.current_capacity}/{selectedBatch.max_capacity}</span>
                        </div>
                        <div>
                          <span><strong>Available:</strong> </span>
                          <Badge variant="secondary">{selectedBatch.available_capacity}</Badge>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Assignment Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this batch assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          
          {currentAssignment?.assigned_batch_id && (
            <Button 
              variant="destructive" 
              onClick={handleRemoveAssignment}
              disabled={loading}
            >
              Remove Assignment
            </Button>
          )}
          
          <Button onClick={handleSubmit} disabled={loading || !selectedBatchId}>
            {loading ? 'Processing...' : currentAssignment?.assigned_batch_id ? 'Update Assignment' : 'Assign Batch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
