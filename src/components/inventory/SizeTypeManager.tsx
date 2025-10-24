import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, X, Grid3X3, List, Upload, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
  image_url?: string;
  created_at: string;
}

export function SizeTypeManager() {
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSizeType, setEditingSizeType] = useState<SizeType | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    size_name: '',
    available_sizes: [''],
    image_url: ''
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

  const handleImageUpload = async (file: File): Promise<string | null> => {
    try {
      console.log('Starting image upload for file:', file.name);
      
      // Try to list buckets for debugging
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      console.log('Available buckets:', buckets);
      console.log('Bucket error:', bucketError);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `size-types/${fileName}`;

      console.log('Attempting to upload to path:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('size-type-images')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        
        // Provide more specific error messages
        if (uploadError.message.includes('row-level security policy')) {
          toast.error('Image upload not authorized. Please contact administrator to configure storage permissions.');
        } else if (uploadError.message.includes('413')) {
          toast.error('Image file is too large. Please choose a smaller image.');
        } else if (uploadError.message.includes('415')) {
          toast.error('Invalid file type. Please upload an image file (JPG, PNG, etc.).');
        } else if (uploadError.message.includes('bucket')) {
          toast.error('Storage bucket not accessible. Please check your storage configuration.');
        } else {
          toast.error(`Failed to upload image: ${uploadError.message}`);
        }
        return null;
      }

      console.log('Upload successful, getting public URL...');
      const { data } = supabase.storage
        .from('size-type-images')
        .getPublicUrl(filePath);

      console.log('Public URL generated:', data.publicUrl);
      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image. Please try again.');
      return null;
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const filteredSizes = formData.available_sizes.filter(size => size.trim() !== '');
      
      let imageUrl = formData.image_url;
      
      // Upload image if a new file was selected
      if (imageFile) {
        const uploadedUrl = await handleImageUpload(imageFile);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          toast.error('Failed to upload image');
          return;
        }
      }
      
      const sizeTypeData = {
        size_name: formData.size_name,
        available_sizes: filteredSizes,
        image_url: imageUrl
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
      setFormData({ size_name: '', available_sizes: [''], image_url: '' });
      setImageFile(null);
      setImagePreview(null);
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
      available_sizes: [...sizeType.available_sizes, ''],
      image_url: sizeType.image_url || ''
    });
    setImagePreview(sizeType.image_url || null);
    setImageFile(null);
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
    setFormData({ size_name: '', available_sizes: [''], image_url: '' });
    setImageFile(null);
    setImagePreview(null);
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
              <DialogDescription>
                {editingSizeType ? 'Update the details for this size type.' : 'Add a new size type with its available sizes and an optional image.'}
              </DialogDescription>
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
                <Label htmlFor="image">Size Type Image</Label>
                <div className="space-y-2">
                  <input
                    type="file"
                    id="image"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('image')?.click()}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {imageFile ? 'Change Image' : 'Upload Image'}
                  </Button>
                  {imagePreview && (
                    <div className="mt-2">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-24 h-24 object-contain rounded border"
                      />
                    </div>
                  )}
                </div>
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
          <div className="flex justify-between items-center">
            <CardTitle>Size Types</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4 mr-2" />
                Table View
              </Button>
              <Button
                variant={viewMode === 'card' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('card')}
              >
                <Grid3X3 className="w-4 h-4 mr-2" />
                Card View
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'table' | 'card')}>
            <TabsContent value="table" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Size Type Name</TableHead>
                    <TableHead>Available Sizes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sizeTypes.map((sizeType) => (
                    <TableRow key={sizeType.id}>
                      <TableCell>
                      {sizeType.image_url ? (
                        <img
                          src={sizeType.image_url}
                          alt={sizeType.size_name}
                          className="w-12 h-12 object-contain rounded border"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-white rounded border flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      </TableCell>
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
            </TabsContent>
            
            <TabsContent value="card" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sizeTypes.map((sizeType) => (
                  <Card key={sizeType.id} className="overflow-hidden">
                    <div className="aspect-square bg-white flex items-center justify-center">
                      {sizeType.image_url ? (
                        <img
                          src={sizeType.image_url}
                          alt={sizeType.size_name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <ImageIcon className="w-12 h-12 mb-2" />
                          <span className="text-sm">No Image</span>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-2">{sizeType.size_name}</h3>
                      <div className="flex flex-wrap gap-1 mb-4">
                        {sizeType.available_sizes.map((size, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {size}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(sizeType)}
                          className="flex-1"
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDelete(sizeType.id)}
                          className="flex-1"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}