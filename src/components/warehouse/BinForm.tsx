import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BinFormData, Warehouse, Floor, Rack, LocationType, LOCATION_TYPE_CONFIGS } from '@/types/warehouse';

interface BinFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: BinFormData) => void;
  editingItem?: any;
  warehouses: Warehouse[];
}

export const BinForm: React.FC<BinFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  editingItem,
  warehouses
}) => {
  const [formData, setFormData] = useState<BinFormData>({
    rack_id: '',
    bin_code: '',
    location_type: 'RECEIVING_ZONE',
    dimensions: {
      length: 0,
      width: 0,
      height: 0
    },
    is_active: true
  });

  const [loading, setLoading] = useState(false);
  const [availableRacks, setAvailableRacks] = useState<Rack[]>([]);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        rack_id: editingItem.rack_id || '',
        bin_code: editingItem.bin_code || '',
        location_type: editingItem.location_type || 'RECEIVING_ZONE',
        dimensions: editingItem.dimensions || { length: 0, width: 0, height: 0 },
        is_active: editingItem.is_active ?? true
      });
    } else {
      setFormData({
        rack_id: '',
        bin_code: '',
        location_type: 'RECEIVING_ZONE',
        dimensions: { length: 0, width: 0, height: 0 },
        is_active: true
      });
    }
  }, [editingItem, open]);

  // Get all racks from warehouses
  useEffect(() => {
    const racks: Rack[] = [];
    warehouses.forEach(warehouse => {
      warehouse.floors?.forEach(floor => {
        if (floor.racks) {
          racks.push(...floor.racks);
        }
      });
    });
    setAvailableRacks(racks);
  }, [warehouses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting bin form:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof BinFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDimensionChange = (dimension: keyof BinFormData['dimensions'], value: number) => {
    setFormData(prev => ({
      ...prev,
      dimensions: {
        ...prev.dimensions,
        [dimension]: value
      }
    }));
  };

  const getRackDisplayName = (rackId: string) => {
    const rack = availableRacks.find(r => r.id === rackId);
    if (!rack) return '';
    
    const warehouse = warehouses.find(w => 
      w.floors?.some(f => f.racks?.some(r => r.id === rackId))
    );
    const floor = warehouse?.floors?.find(f => f.racks?.some(r => r.id === rackId));
    
    return `${warehouse?.name} - Floor ${floor?.floor_number} - ${rack.rack_code}`;
  };

  // Calculate volume from dimensions
  const calculateVolume = () => {
    const { length, width, height } = formData.dimensions;
    return length * width * height;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? 'Edit Bin' : 'Add New Bin'}
          </DialogTitle>
          <DialogDescription>
            {editingItem ? 'Update bin information' : 'Add a new storage bin to the rack'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rack_id">Rack *</Label>
            <Select
              value={formData.rack_id}
              onValueChange={(value) => handleInputChange('rack_id', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select rack" />
              </SelectTrigger>
              <SelectContent>
                {availableRacks.map((rack) => (
                  <SelectItem key={rack.id} value={rack.id}>
                    {getRackDisplayName(rack.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bin_code">Bin Code *</Label>
            <Input
              id="bin_code"
              value={formData.bin_code}
              onChange={(e) => handleInputChange('bin_code', e.target.value)}
              placeholder="e.g., BIN-01"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location_type">Location Type *</Label>
            <Select
              value={formData.location_type}
              onValueChange={(value) => handleInputChange('location_type', value as LocationType)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOCATION_TYPE_CONFIGS).map(([type, config]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${config.bgColor}`}></div>
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>


          <div className="space-y-4">
            <Label>Dimensions (meters)</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="length" className="text-xs">Length</Label>
                <Input
                  id="length"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.dimensions.length}
                  onChange={(e) => handleDimensionChange('length', parseFloat(e.target.value) || 0)}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="width" className="text-xs">Width</Label>
                <Input
                  id="width"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.dimensions.width}
                  onChange={(e) => handleDimensionChange('width', parseFloat(e.target.value) || 0)}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="height" className="text-xs">Height</Label>
                <Input
                  id="height"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.dimensions.height}
                  onChange={(e) => handleDimensionChange('height', parseFloat(e.target.value) || 0)}
                  placeholder="0.0"
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Calculated Volume: {calculateVolume().toFixed(2)} m³
            </div>
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
