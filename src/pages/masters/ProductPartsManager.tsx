import { useState, useEffect, useRef } from 'react';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Settings, Save, X, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BackButton } from '@/components/common/BackButton';

interface ProductPart {
  id: string;
  part_name: string;
  part_type: 'dropdown' | 'number';
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PartAddon {
  id: string;
  part_id: string;
  addon_name: string;
  addon_value: string | null;
  price_adjustment: number;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  image_alt_text?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductCategory {
  id: string;
  category_name: string;
  category_image_url: string;
}

interface ProductCategoryPart {
  id: string;
  product_category_id: string;
  part_id: string;
  is_required: boolean;
  sort_order: number;
  category_name?: string;
  part_name?: string;
}

export default function ProductPartsManager() {
  const [parts, setParts] = useState<ProductPart[]>([]);
  const [addons, setAddons] = useState<PartAddon[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryParts, setCategoryParts] = useState<ProductCategoryPart[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [showPartDialog, setShowPartDialog] = useState(false);
  const [showAddonDialog, setShowAddonDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingPart, setEditingPart] = useState<ProductPart | null>(null);
  const [editingAddon, setEditingAddon] = useState<PartAddon | null>(null);
  
  // Form states
  const [partForm, setPartForm] = useState({
    part_name: '',
    part_type: 'dropdown' as 'dropdown' | 'number',
    description: '',
    is_active: true
  });
  
  const [addonForm, setAddonForm] = useState({
    part_id: '',
    addon_name: '',
    addon_value: '',
    price_adjustment: 0,
    sort_order: 0,
    is_active: true,
    image_url: '',
    image_alt_text: ''
  });
  
  const [categoryForm, setCategoryForm] = useState({
    selectedCategories: [] as string[]
  });

  // File upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch parts
      const { data: partsData, error: partsError } = await supabase
        .from('product_parts')
        .select('*')
        .order('part_name');
      
      if (partsError) throw partsError;
      setParts(partsData || []);
      
      // Fetch addons
      const { data: addonsData, error: addonsError } = await supabase
        .from('part_addons')
        .select('*')
        .order('part_id, sort_order');
      
      if (addonsError) throw addonsError;
      setAddons(addonsData || []);
      
      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('product_categories')
        .select('*')
        .order('category_name');
      
      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);
      
      // Fetch category-parts relationships
      const { data: categoryPartsData, error: categoryPartsError } = await supabase
        .from('product_category_parts')
        .select(`
          *,
          product_categories!inner(category_name),
          product_parts!inner(part_name)
        `)
        .order('product_category_id, sort_order');
      
      if (categoryPartsError) throw categoryPartsError;
      setCategoryParts(categoryPartsData || []);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePart = async () => {
    try {
      const { error } = await supabase
        .from('product_parts')
        .insert([partForm]);
      
      if (error) throw error;
      
      toast.success('Part created successfully');
      setShowPartDialog(false);
      resetPartForm();
      fetchData();
    } catch (error) {
      console.error('Error creating part:', error);
      toast.error('Failed to create part');
    }
  };

  const handleUpdatePart = async () => {
    if (!editingPart) return;
    
    try {
      const { error } = await supabase
        .from('product_parts')
        .update(partForm)
        .eq('id', editingPart.id);
      
      if (error) throw error;
      
      toast.success('Part updated successfully');
      setShowPartDialog(false);
      setEditingPart(null);
      resetPartForm();
      fetchData();
    } catch (error) {
      console.error('Error updating part:', error);
      toast.error('Failed to update part');
    }
  };

  const handleDeletePart = async (partId: string) => {
    if (!confirm('Are you sure you want to delete this part? This will also delete all associated addons and category links.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('product_parts')
        .delete()
        .eq('id', partId);
      
      if (error) throw error;
      
      toast.success('Part deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting part:', error);
      toast.error('Failed to delete part');
    }
  };

  const handleCreateAddon = async () => {
    if (!addonForm.part_id || !addonForm.addon_name.trim() || addonForm.sort_order === undefined) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      let imageUrl = addonForm.image_url;
      
      // Upload file if selected
      if (selectedFile) {
        const uploadedUrl = await uploadImage(selectedFile);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          return; // Upload failed, don't create addon
        }
      }

      const { error } = await supabase
        .from('part_addons')
        .insert([{
          part_id: addonForm.part_id,
          addon_name: addonForm.addon_name,
          addon_value: null,
          price_adjustment: 0,
          sort_order: addonForm.sort_order,
          image_url: imageUrl || null,
          image_alt_text: addonForm.image_alt_text || null
        }]);
      
      if (error) throw error;
      
      toast.success('Addon created successfully');
      setShowAddonDialog(false);
      resetAddonForm();
      clearImageUpload();
      fetchData();
    } catch (error) {
      console.error('Error creating addon:', error);
      toast.error('Failed to create addon');
    }
  };

  const handleUpdateAddon = async () => {
    if (!editingAddon) return;
    
    if (!addonForm.part_id || !addonForm.addon_name.trim() || addonForm.sort_order === undefined) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    try {
      let imageUrl = addonForm.image_url;
      
      // Upload file if selected
      if (selectedFile) {
        const uploadedUrl = await uploadImage(selectedFile);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          return; // Upload failed, don't update addon
        }
      }

      const { error } = await supabase
        .from('part_addons')
        .update({
          part_id: addonForm.part_id,
          addon_name: addonForm.addon_name,
          addon_value: null,
          price_adjustment: 0,
          sort_order: addonForm.sort_order,
          image_url: imageUrl || null,
          image_alt_text: addonForm.image_alt_text || null
        })
        .eq('id', editingAddon.id);
      
      if (error) throw error;
      
      toast.success('Addon updated successfully');
      setShowAddonDialog(false);
      setEditingAddon(null);
      resetAddonForm();
      clearImageUpload();
      fetchData();
    } catch (error) {
      console.error('Error updating addon:', error);
      toast.error('Failed to update addon');
    }
  };

  const handleDeleteAddon = async (addonId: string) => {
    if (!confirm('Are you sure you want to delete this addon?')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('part_addons')
        .delete()
        .eq('id', addonId);
      
      if (error) throw error;
      
      toast.success('Addon deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting addon:', error);
      toast.error('Failed to delete addon');
    }
  };

  const handleSaveCategoryLinks = async () => {
    if (!editingPart) return;
    
    try {
      // Delete existing links
      await supabase
        .from('product_category_parts')
        .delete()
        .eq('part_id', editingPart.id);
      
      // Insert new links
      if (categoryForm.selectedCategories.length > 0) {
        const links = categoryForm.selectedCategories.map((categoryId, index) => ({
          product_category_id: categoryId,
          part_id: editingPart.id,
          sort_order: index + 1
        }));
        
        const { error } = await supabase
          .from('product_category_parts')
          .insert(links);
        
        if (error) throw error;
      }
      
      toast.success('Category links updated successfully');
      setShowCategoryDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error updating category links:', error);
      toast.error('Failed to update category links');
    }
  };

  const resetPartForm = () => {
    setPartForm({
      part_name: '',
      part_type: 'dropdown',
      description: '',
      is_active: true
    });
  };

  const resetAddonForm = () => {
    setAddonForm({
      part_id: '',
      addon_name: '',
      addon_value: '',
      price_adjustment: 0,
      sort_order: 0,
      is_active: true,
      image_url: '',
      image_alt_text: ''
    });
    clearImageUpload();
  };

  const openEditPart = (part: ProductPart) => {
    setEditingPart(part);
    setPartForm({
      part_name: part.part_name,
      part_type: part.part_type,
      description: part.description || '',
      is_active: part.is_active
    });
    setShowPartDialog(true);
  };

  const openEditAddon = (addon: PartAddon) => {
    setEditingAddon(addon);
    setAddonForm({
      part_id: addon.part_id,
      addon_name: addon.addon_name,
      addon_value: addon.addon_value || '',
      price_adjustment: addon.price_adjustment,
      sort_order: addon.sort_order,
      is_active: addon.is_active,
      image_url: addon.image_url || '',
      image_alt_text: addon.image_alt_text || ''
    });
    // Set image preview if existing image
    if (addon.image_url) {
      setImagePreview(addon.image_url);
    } else {
      setImagePreview(null);
    }
    setShowAddonDialog(true);
  };

  const openCategoryDialog = (part: ProductPart) => {
    setEditingPart(part);
    
    // Get currently linked categories
    const linkedCategories = categoryParts
      .filter(cp => cp.part_id === part.id)
      .map(cp => cp.product_category_id);
    
    setCategoryForm({
      selectedCategories: linkedCategories
    });
    setShowCategoryDialog(true);
  };

  const getAddonsForPart = (partId: string) => {
    return addons.filter(addon => addon.part_id === partId);
  };

  const getCategoriesForPart = (partId: string) => {
    return categoryParts
      .filter(cp => cp.part_id === partId)
      .map(cp => cp.product_categories?.category_name || 'Unknown')
      .join(', ');
  };

  // Image upload functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      
      setSelectedFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `addon-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `addon-images/${fileName}`;
      
      console.log('Uploading addon image to company-assets bucket:', filePath);
      
      // Upload to Supabase storage using company-assets bucket (same as other images)
      const { data, error } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        console.error('Storage upload error:', error);
        if (error.message.includes('not found')) {
          toast.error('Storage bucket not found. Please contact administrator.');
        } else if (error.message.includes('permission')) {
          toast.error('Permission denied. Please check your storage permissions.');
        } else {
          toast.error(`Upload failed: ${error.message}`);
        }
        return null;
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);
      
      console.log('Addon image uploaded successfully:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const clearImageUpload = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <ErpLayout fullPage>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Product Parts Manager</h1>
          <Button onClick={() => setShowPartDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Part
          </Button>
        </div>

        {/* Parts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Product Parts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Addons</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-medium">{part.part_name}</TableCell>
                    <TableCell>
                      <Badge variant={part.part_type === 'dropdown' ? 'default' : 'secondary'}>
                        {part.part_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{part.description || '-'}</TableCell>
                    <TableCell>{getCategoriesForPart(part.id) || 'None'}</TableCell>
                    <TableCell>
                      {getAddonsForPart(part.id).length} addon(s)
                    </TableCell>
                    <TableCell>
                      <Badge variant={part.is_active ? 'default' : 'secondary'}>
                        {part.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditPart(part)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCategoryDialog(part)}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePart(part.id)}
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

        {/* Addons Section */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Part Addons</CardTitle>
              <Button onClick={() => setShowAddonDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Addon
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {parts.map((part) => {
                const partAddons = getAddonsForPart(part.id);
                if (partAddons.length === 0) return null;
                
                return (
                  <div key={part.id} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4">{part.part_name} Options</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {partAddons.map((addon) => (
                        <div key={addon.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex flex-col items-center text-center space-y-3">
                            {addon.image_url && (
                              <div className="flex-shrink-0">
                                <img 
                                  src={addon.image_url} 
                                  alt={addon.image_alt_text || addon.addon_name}
                                  className="w-20 h-20 object-cover rounded-lg border-2 border-gray-100 shadow-sm"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 w-full">
                              <div className="font-semibold text-gray-900 mb-1">{addon.addon_name}</div>
                              {addon.price_adjustment !== 0 && (
                                <div className="text-sm font-medium text-green-600 mb-1">
                                  ₹{addon.price_adjustment > 0 ? '+' : ''}{addon.price_adjustment}
                                </div>
                              )}
                              {addon.image_alt_text && (
                                <div className="text-xs text-gray-500 mb-2">
                                  {addon.image_alt_text}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 w-full justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditAddon(addon)}
                                className="flex-1"
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteAddon(addon.id)}
                                className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Part Dialog */}
        <Dialog open={showPartDialog} onOpenChange={setShowPartDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingPart ? 'Edit Part' : 'Create New Part'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="part_name">Part Name</Label>
                <Input
                  id="part_name"
                  value={partForm.part_name}
                  onChange={(e) => setPartForm({ ...partForm, part_name: e.target.value })}
                  placeholder="e.g., Sleeve Length"
                />
              </div>
              <div>
                <Label htmlFor="part_type">Part Type</Label>
                <Select
                  value={partForm.part_type}
                  onValueChange={(value: 'dropdown' | 'number') => 
                    setPartForm({ ...partForm, part_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dropdown">Dropdown (Select from options)</SelectItem>
                    <SelectItem value="number">Number (Input with +/- buttons)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={partForm.description}
                  onChange={(e) => setPartForm({ ...partForm, description: e.target.value })}
                  placeholder="Describe this part..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPartDialog(false)}>
                Cancel
              </Button>
              <Button onClick={editingPart ? handleUpdatePart : handleCreatePart}>
                {editingPart ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Addon Dialog */}
        <Dialog open={showAddonDialog} onOpenChange={setShowAddonDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAddon ? 'Edit Addon' : 'Create New Addon'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="part_id">Part *</Label>
                <Select
                  value={addonForm.part_id}
                  onValueChange={(value) => setAddonForm({ ...addonForm, part_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a part" />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.filter(p => p.part_type === 'dropdown').map((part) => (
                      <SelectItem key={part.id} value={part.id}>
                        {part.part_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="addon_name">Addon Name *</Label>
                <Input
                  id="addon_name"
                  value={addonForm.addon_name}
                  onChange={(e) => setAddonForm({ ...addonForm, addon_name: e.target.value })}
                  placeholder="e.g., Long Sleeve"
                />
              </div>
              <div>
                <Label htmlFor="sort_order">Sort Order *</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={addonForm.sort_order}
                  onChange={(e) => setAddonForm({ ...addonForm, sort_order: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              {/* Image Upload Section */}
              <div className="space-y-4">
                <div>
                  <Label>Addon Image</Label>
                  <div className="mt-2 space-y-3">
                    {/* File Upload */}
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingImage ? 'Uploading...' : 'Upload Image'}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported formats: JPG, PNG, GIF (Max 5MB)
                      </p>
                    </div>

                    {/* Image Preview */}
                    {imagePreview && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Preview</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearImageUpload}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="border rounded-lg p-3 bg-gray-50">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-20 h-20 object-cover rounded-lg border"
                          />
                        </div>
                      </div>
                    )}

                    {/* Or URL Input */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="image_url">Image URL</Label>
                      <Input
                        id="image_url"
                        value={addonForm.image_url}
                        onChange={(e) => setAddonForm({ ...addonForm, image_url: e.target.value })}
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="image_alt_text">Image Alt Text</Label>
                  <Input
                    id="image_alt_text"
                    value={addonForm.image_alt_text}
                    onChange={(e) => setAddonForm({ ...addonForm, image_alt_text: e.target.value })}
                    placeholder="Description of the image"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddonDialog(false)}>
                Cancel
              </Button>
              <Button onClick={editingAddon ? handleUpdateAddon : handleCreateAddon}>
                {editingAddon ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Category Links Dialog */}
        <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link Part to Categories</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Product Categories</Label>
                <div className="space-y-2 mt-2">
                  {categories.map((category) => (
                    <label key={category.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={categoryForm.selectedCategories.includes(category.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategoryForm({
                              selectedCategories: [...categoryForm.selectedCategories, category.id]
                            });
                          } else {
                            setCategoryForm({
                              selectedCategories: categoryForm.selectedCategories.filter(id => id !== category.id)
                            });
                          }
                        }}
                      />
                      <span>{category.category_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveCategoryLinks}>
                Save Links
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}
