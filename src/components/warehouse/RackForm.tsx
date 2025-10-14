import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RackFormData, Warehouse, Floor } from '@/types/warehouse';

interface RackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RackFormData) => void;
  editingItem?: any;
  warehouses: Warehouse[];
}

export const RackForm: React.FC<RackFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  editingItem,
  warehouses
}) => {
  const [formData, setFormData] = useState<RackFormData>({
    floor_id: '',
    rack_code: '',
    description: '',
    is_active: true
  });

  const [loading, setLoading] = useState(false);
  const [availableFloors, setAvailableFloors] = useState<Floor[]>([]);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        floor_id: editingItem.floor_id || '',
        rack_code: editingItem.rack_code || '',
        description: editingItem.description || '',
        is_active: editingItem.is_active ?? true
      });
    } else {
      setFormData({
        floor_id: '',
        rack_code: '',
        description: '',
        is_active: true
      });
    }
  }, [editingItem, open]);

  // Get all floors from warehouses
  useEffect(() => {
    const floors: Floor[] = [];
    warehouses.forEach(warehouse => {
      if (warehouse.floors) {
        floors.push(...warehouse.floors);
      }
    });
    setAvailableFloors(floors);
  }, [warehouses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting rack form:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof RackFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getFloorDisplayName = (floorId: string) => {
    const floor = availableFloors.find(f => f.id === floorId);
    if (!floor) return '';
    
    const warehouse = warehouses.find(w => w.floors?.some(f => f.id === floorId));
    return `${warehouse?.name} - Floor ${floor.floor_number}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? 'Edit Rack' : 'Add New Rack'}
          </DialogTitle>
          <DialogDescription>
            {editingItem ? 'Update rack information' : 'Add a new rack to the floor'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="floor_id">Floor *</Label>
            <Select
              value={formData.floor_id}
              onValueChange={(value) => handleInputChange('floor_id', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select floor" />
              </SelectTrigger>
              <SelectContent>
                {availableFloors.map((floor) => (
                  <SelectItem key={floor.id} value={floor.id}>
                    {getFloorDisplayName(floor.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rack_code">Rack Code *</Label>
            <Input
              id="rack_code"
              value={formData.rack_code}
              onChange={(e) => handleInputChange('rack_code', e.target.value)}
              placeholder="e.g., RACK-A"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter rack description"
              rows={3}
            />
          </div>


          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleInputChange('is_active', checked)}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : editingItem ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
