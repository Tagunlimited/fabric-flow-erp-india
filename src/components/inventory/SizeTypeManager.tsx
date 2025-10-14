import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
  created_at: string;
}

export function SizeTypeManager() {
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSizeType, setEditingSizeType] = useState<SizeType | null>(null);
  const [formData, setFormData] = useState({
    size_name: '',
    available_sizes: ['']
  });

  const fetchSizeTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('size_types')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSizeTypes(data || []);
    } catch (error) {
      console.error('Error fetching size types:', error);
      toast.error('Failed to fetch size types');
    }
  };

  useEffect(() => {
    fetchSizeTypes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const filteredSizes = formData.available_sizes.filter(size => size.trim() !== '');
      
      const sizeTypeData = {
        size_name: formData.size_name,
        available_sizes: filteredSizes
      };

      if (editingSizeType) {
        const { error } = await supabase
          .from('size_types')
          .update(sizeTypeData)
          .eq('id', editingSizeType.id);

        if (error) throw error;
        toast.success('Size type updated successfully');
      } else {
        const { error } = await supabase
          .from('size_types')
          .insert([sizeTypeData]);

        if (error) throw error;
        toast.success('Size type created successfully');
      }

      setDialogOpen(false);
      setEditingSizeType(null);
      setFormData({ size_name: '', available_sizes: [''] });
      fetchSizeTypes();
    } catch (error) {
      console.error('Error saving size type:', error);
      toast.error('Failed to save size type');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (sizeType: SizeType) => {
    setEditingSizeType(sizeType);
    setFormData({
      size_name: sizeType.size_name,
      available_sizes: [...sizeType.available_sizes, '']
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this size type?')) return;

    try {
      const { error } = await supabase
        .from('size_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Size type deleted successfully');
      fetchSizeTypes();
    } catch (error) {
      console.error('Error deleting size type:', error);
      toast.error('Failed to delete size type');
    }
  };

  const openDialog = () => {
    setEditingSizeType(null);
    setFormData({ size_name: '', available_sizes: [''] });
    setDialogOpen(true);
  };

  const addSizeField = () => {
    setFormData(prev => ({
      ...prev,
      available_sizes: [...prev.available_sizes, '']
    }));
  };

  const removeSizeField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      available_sizes: prev.available_sizes.filter((_, i) => i !== index)
    }));
  };

  const updateSize = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      available_sizes: prev.available_sizes.map((size, i) => i === index ? value : size)
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Size Types</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Size Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingSizeType ? 'Edit Size Type' : 'Add New Size Type'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="size_name">Size Type Name</Label>
                <Input
                  id="size_name"
                  value={formData.size_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, size_name: e.target.value }))}
                  placeholder="e.g., Standard, Kids, Adult"
                  required
                />
              </div>
              
              <div>
                <Label>Available Sizes</Label>
                <div className="space-y-2 mt-2">
                  {formData.available_sizes.map((size, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={size}
                        onChange={(e) => updateSize(index, e.target.value)}
                        placeholder="e.g., S, M, L, XL"
                      />
                      {formData.available_sizes.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeSizeField(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSizeField}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Size
                  </Button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : editingSizeType ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Size Types List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Size Type Name</TableHead>
                <TableHead>Available Sizes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sizeTypes.map((sizeType) => (
                <TableRow key={sizeType.id}>
                  <TableCell className="font-medium">{sizeType.size_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {sizeType.available_sizes.map((size, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {size}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(sizeType)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(sizeType.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}