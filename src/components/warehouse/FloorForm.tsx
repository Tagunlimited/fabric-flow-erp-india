import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FloorFormData, Warehouse } from '@/types/warehouse';

interface FloorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FloorFormData) => void;
  editingItem?: any;
  warehouses: Warehouse[];
}

export const FloorForm: React.FC<FloorFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  editingItem,
  warehouses
}) => {
  const [formData, setFormData] = useState<FloorFormData>({
    warehouse_id: '',
    floor_number: 1,
    description: '',
    is_active: true
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        warehouse_id: editingItem.warehouse_id || '',
        floor_number: editingItem.floor_number || 1,
        description: editingItem.description || '',
        is_active: editingItem.is_active ?? true
      });
    } else {
      setFormData({
        warehouse_id: '',
        floor_number: 1,
        description: '',
        is_active: true
      });
    }
  }, [editingItem, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting floor form:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FloorFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? 'Edit Floor' : 'Add New Floor'}
          </DialogTitle>
          <DialogDescription>
            {editingItem ? 'Update floor information' : 'Add a new floor to the warehouse'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="warehouse_id">Warehouse *</Label>
            <Select
              value={formData.warehouse_id}
              onValueChange={(value) => handleInputChange('warehouse_id', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="floor_number">Floor Number *</Label>
            <Input
              id="floor_number"
              type="number"
              min="1"
              value={formData.floor_number}
              onChange={(e) => handleInputChange('floor_number', parseInt(e.target.value) || 1)}
              placeholder="e.g., 1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter floor description"
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
