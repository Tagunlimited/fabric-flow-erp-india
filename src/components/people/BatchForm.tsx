import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";

interface BatchFormProps {
  batch?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Tailor {
  id: string;
  tailor_code: string;
  full_name: string;
  avatar_url?: string;
  tailor_type: 'single_needle' | 'overlock_flatlock';
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  batch_id: string | null;
}

export function BatchForm({ batch, onSuccess, onCancel }: BatchFormProps) {
  const [loading, setLoading] = useState(false);
  const [availableTailors, setAvailableTailors] = useState<Tailor[]>([]);
  const [selectedTailors, setSelectedTailors] = useState<string[]>([]);
  const [batchLeader, setBatchLeader] = useState<string>('');
  const [formData, setFormData] = useState({
    batch_name: batch?.batch_name || '',
    batch_code: batch?.batch_code || '',
    max_capacity: batch?.max_capacity || 10,
    status: batch?.status || 'active'
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchAvailableTailors();
    if (batch) {
      // If editing, load existing tailors in this batch
      fetchBatchTailors();
    }
  }, [batch]);

  const fetchAvailableTailors = async () => {
    try {
      // Only fetch tailors who are not assigned to any batch (or assigned to current batch if editing)
      let query = supabase
        .from('tailors')
        .select('*')
        .eq('status', 'active');

      if (batch) {
        // If editing, include tailors from this batch or unassigned tailors
        query = query.or(`batch_id.is.null,batch_id.eq.${batch.id}`);
      } else {
        // If creating new, only include unassigned tailors (not part of any batch)
        query = query.is('batch_id', null);
      }

      // Apply ordering after all filters
      const { data, error } = await query.order('full_name');
      if (error) throw error;
      
      // Additional client-side filter to ensure no tailors with batch_id are shown when creating
      const filteredData = batch 
        ? (data || [])
        : (data || []).filter(tailor => !tailor.batch_id);
      
      setAvailableTailors(filteredData);
    } catch (error) {
      console.error('Error fetching tailors:', error);
      toast({
        title: "Error",
        description: "Failed to load available tailors.",
        variant: "destructive",
      });
    }
  };

  const fetchBatchTailors = async () => {
    if (!batch?.id) return;
    
    try {
      // Fetch tailors in this batch
      const { data: tailorsData, error: tailorsError } = await supabase
        .from('tailors')
        .select('id, is_batch_leader')
        .eq('batch_id', batch.id);

      if (tailorsError) throw tailorsError;
      
      const tailorIds = (tailorsData || []).map(t => t.id);
      setSelectedTailors(tailorIds);
      
      // Find and set the batch leader
      const leader = tailorsData?.find(t => t.is_batch_leader);
      if (leader) {
        setBatchLeader(leader.id);
      }
    } catch (error) {
      console.error('Error fetching batch tailors:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Determine tailor type based on selected tailors
      const selectedTailorTypes = selectedTailors.map(tailorId => {
        const tailor = availableTailors.find(t => t.id === tailorId);
        return tailor?.tailor_type;
      }).filter(Boolean);

      // Use the most common tailor type, or 'single_needle' as default
      const batchTailorType = selectedTailorTypes.length > 0 
        ? selectedTailorTypes[0] 
        : 'single_needle';

      const batchData = {
        batch_name: formData.batch_name,
        batch_code: formData.batch_code,
        tailor_type: batchTailorType,
        max_capacity: formData.max_capacity,
        status: formData.status,
        current_capacity: selectedTailors.length
      };

      let batchId;

      if (batch) {
        // Update existing batch
        const { error } = await supabase
          .from('batches')
          .update(batchData)
          .eq('id', batch.id);

        if (error) throw error;
        batchId = batch.id;
        toast({
          title: "Success",
          description: "Batch updated successfully.",
        });
      } else {
        // Create new batch
        const { data, error } = await supabase
          .from('batches')
          .insert([batchData])
          .select()
          .single();

        if (error) throw error;
        batchId = data.id;
        toast({
          title: "Success",
          description: "Batch created successfully.",
        });
      }

      // Update tailor assignments
      if (batchId) {
        // First, remove all tailors from this batch and clear batch leader status
        await supabase
          .from('tailors')
          .update({ batch_id: null, is_batch_leader: false })
          .eq('batch_id', batchId);

        // Then, assign selected tailors to this batch
        if (selectedTailors.length > 0) {
          // Update all selected tailors to be in this batch
          const { error: updateError } = await supabase
            .from('tailors')
            .update({ batch_id: batchId })
            .in('id', selectedTailors);

          if (updateError) throw updateError;

          // Set batch leader if one is selected
          if (batchLeader && selectedTailors.includes(batchLeader)) {
            const { error: leaderError } = await supabase
              .from('tailors')
              .update({ is_batch_leader: true })
              .eq('id', batchLeader);

            if (leaderError) throw leaderError;
          }
        }
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving batch:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save batch. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{batch ? 'Edit Batch' : 'Create New Batch'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="batch_name">Batch Name *</Label>
              <Input
                id="batch_name"
                value={formData.batch_name}
                onChange={(e) => setFormData({ ...formData, batch_name: e.target.value })}
                placeholder="e.g., Production Batch 1"
                required
              />
            </div>

            <div>
              <Label htmlFor="batch_code">Batch Code *</Label>
              <Input
                id="batch_code"
                value={formData.batch_code}
                onChange={(e) => setFormData({ ...formData, batch_code: e.target.value })}
                placeholder="e.g., BATCH-001"
                required
              />
            </div>

            <div>
              <Label htmlFor="max_capacity">Max Capacity *</Label>
              <Input
                id="max_capacity"
                type="number"
                min="1"
                max="20"
                value={formData.max_capacity}
                onChange={(e) => setFormData({ ...formData, max_capacity: parseInt(e.target.value) })}
                required
              />
            </div>

            <div>
              <Label htmlFor="status">Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Batch Leader Selection */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="batch_leader">Batch Leader</Label>
              <Select
                value={batchLeader}
                onValueChange={setBatchLeader}
                disabled={selectedTailors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedTailors.length === 0 ? "Select tailors first" : "Select batch leader"} />
                </SelectTrigger>
                <SelectContent>
                  {selectedTailors.map((tailorId) => {
                    const tailor = availableTailors.find(t => t.id === tailorId);
                    if (!tailor) return null;
                    return (
                      <SelectItem key={tailorId} value={tailorId}>
                        <div className="flex items-center space-x-2">
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={tailor.avatar_url} alt={tailor.full_name} />
                            <AvatarFallback className="text-xs">
                              {tailor.full_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span>{tailor.full_name} ({tailor.tailor_code})</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tailor Selection */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <Label className="text-lg font-medium">Select Tailors</Label>
              <Badge variant="outline">
                {selectedTailors.length} selected
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto border rounded-lg p-4">
              {availableTailors.map((tailor) => (
                <div key={tailor.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                  <Checkbox
                    id={tailor.id}
                    checked={selectedTailors.includes(tailor.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTailors([...selectedTailors, tailor.id]);
                      } else {
                        setSelectedTailors(selectedTailors.filter(id => id !== tailor.id));
                      }
                    }}
                  />
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={tailor.avatar_url} alt={tailor.full_name} />
                    <AvatarFallback className="text-xs">
                      {tailor.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{tailor.full_name}</div>
                    <div className="text-xs text-muted-foreground">{tailor.tailor_code}</div>
                  </div>
                  <div className="flex space-x-1">
                    <Badge variant={
                      tailor.tailor_type === 'single_needle' ? 'default' : 'secondary'
                    } className="text-xs">
                      {tailor.tailor_type === 'single_needle' ? 'SN' : 'OL'}
                    </Badge>
                    <Badge variant={
                      tailor.skill_level === 'expert' ? 'default' :
                      tailor.skill_level === 'advanced' ? 'secondary' :
                      tailor.skill_level === 'intermediate' ? 'outline' : 'destructive'
                    } className="text-xs">
                      {tailor.skill_level.charAt(0).toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            
            {availableTailors.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No available tailors found.</p>
                <p className="text-sm">Create tailors first to assign them to batches.</p>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {batch ? 'Update Batch' : 'Create Batch'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
