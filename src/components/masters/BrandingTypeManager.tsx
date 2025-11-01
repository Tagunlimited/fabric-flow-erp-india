import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BrandingType {
  id: string;
  name: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

const BrandingTypeManager = () => {
  const [brandingTypes, setBrandingTypes] = useState<BrandingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrandingType, setEditingBrandingType] = useState<BrandingType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    scope: ''
  });

  useEffect(() => {
    fetchBrandingTypes();
  }, []);

  const fetchBrandingTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('branding_types')
        .select('*')
        .order('name');

      if (error) throw error;
      setBrandingTypes(data || []);
    } catch (error) {
      console.error('Error fetching branding types:', error);
      toast.error('Failed to fetch branding types');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.scope.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      if (editingBrandingType) {
        // Update existing branding type
        const { error } = await supabase
          .from('branding_types')
          .update({
            name: formData.name.trim(),
            scope: formData.scope.trim()
          })
          .eq('id', editingBrandingType.id);

        if (error) throw error;
        toast.success('Branding type updated successfully');
      } else {
        // Create new branding type
        const { error } = await supabase
          .from('branding_types')
          .insert({
            name: formData.name.trim(),
            scope: formData.scope.trim()
          });

        if (error) throw error;
        toast.success('Branding type created successfully');
      }

      await fetchBrandingTypes();
      resetForm();
    } catch (error) {
      console.error('Error saving branding type:', error);
      toast.error('Failed to save branding type');
    }
  };

  const handleEdit = (brandingType: BrandingType) => {
    setEditingBrandingType(brandingType);
    setFormData({
      name: brandingType.name,
      scope: brandingType.scope
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this branding type?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('branding_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Branding type deleted successfully');
      await fetchBrandingTypes();
    } catch (error) {
      console.error('Error deleting branding type:', error);
      toast.error('Failed to delete branding type');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', scope: '' });
    setEditingBrandingType(null);
    setDialogOpen(false);
  };

  const getScopeBadgeVariant = (scope: string) => {
    switch (scope.toLowerCase()) {
      case 'global':
        return 'default';
      case 'regional':
        return 'secondary';
      case 'local':
        return 'outline';
      case 'national':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading branding types...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Branding Types</h2>
          <p className="text-muted-foreground">
            Manage branding types and their scope
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Branding Type
        </Button>
      </div>

      {brandingTypes.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">No branding types found</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Branding Type
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brandingTypes.map((brandingType) => (
            <Card key={brandingType.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{brandingType.name}</CardTitle>
                    <Badge variant={getScopeBadgeVariant(brandingType.scope)}>
                      {brandingType.scope}
                    </Badge>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(brandingType)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(brandingType.id)}
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm text-muted-foreground">
                  Created: {new Date(brandingType.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBrandingType ? 'Edit Branding Type' : 'Add New Branding Type'}
            </DialogTitle>
            <DialogDescription>
              {editingBrandingType 
                ? 'Update the branding type details below.' 
                : 'Create a new branding type with name and scope.'
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter branding type name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">Scope</Label>
              <Input
                id="scope"
                value={formData.scope}
                onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value }))}
                placeholder="e.g., Global, Regional, Local, National"
                required
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" />
                {editingBrandingType ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrandingTypeManager;
