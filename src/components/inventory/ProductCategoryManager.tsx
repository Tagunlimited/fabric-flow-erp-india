import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CategoryImage {
  type: string;
  url: string;
  alt: string;
}

interface ProductCategory {
  id: string;
  category_name: string;
  description: string;
  category_image_url: string;
  category_images: CategoryImage[];
  fabrics: string[];
  created_at: string;
}

interface FabricMaster {
  id: string;
  fabric_code: string;
  fabric_name: string;
  fabric_description?: string | null;
  type: string;
  color: string;
  hex?: string | null;
  gsm?: string | null;
  uom: string;
  rate: number;
  hsn_code?: string | null;
  gst: number;
  image?: string | null;
  inventory: number;
  supplier1?: string | null;
  supplier2?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export function ProductCategoryManager() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [fabrics, setFabrics] = useState<FabricMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [imageFiles, setImageFiles] = useState<{ [key: string]: File | null }>({
    front: null,
    back: null,
    side: null,
    detail: null
  });
  const [formData, setFormData] = useState({
    category_name: '',
    description: '',
    selectedFabrics: [] as string[],
    category_images: [] as CategoryImage[]
  });
  const [currentImageIndex, setCurrentImageIndex] = useState<{[key: string]: number}>({});

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('category_name');

      if (error) throw error;
      
      // Parse category_images from JSON string if needed
      const categoriesData = (data || []).map(item => ({
        ...item,
        category_images: (() => {
          try {
            if (typeof item.category_images === 'string') {
              return JSON.parse(item.category_images) as CategoryImage[];
            }
            return Array.isArray(item.category_images) ? (item.category_images as unknown as CategoryImage[]) : [];
          } catch {
            return [];
          }
        })()
      }));
      
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch categories');
    }
  };

  const fetchFabrics = async () => {
    try {
      const { data, error } = await supabase
        .from('fabric_master')
        .select('*')
        .eq('status', 'active')
        .order('fabric_name');

      if (error) throw error;
      setFabrics((data as any) || []);
    } catch (error) {
      console.error('Error fetching fabrics:', error);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchFabrics();
  }, []);

  // Reset form when dialog opens for a new category (not editing)
  useEffect(() => {
    if (dialogOpen && !editingCategory) {
      setFormData({ category_name: '', description: '', selectedFabrics: [], category_images: [] });
      setImageFiles({ front: null, back: null, side: null, detail: null });
    }
  }, [dialogOpen, editingCategory]);

  const uploadImages = async (): Promise<CategoryImage[]> => {
    const uploadedImages: CategoryImage[] = [...formData.category_images];
    
    try {
      for (const [imageType, file] of Object.entries(imageFiles)) {
        if (file) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${imageType}.${fileExt}`;
          const filePath = `category-images/${fileName}`;

          console.log(`Uploading ${imageType} image:`, { fileName, filePath, fileSize: file.size });

          const { error: uploadError } = await supabase.storage
            .from('company-assets')
            .upload(filePath, file);

          if (uploadError) {
            console.error(`Upload error for ${imageType}:`, uploadError);
            throw new Error(`Failed to upload ${imageType} image: ${uploadError.message}`);
          }

          const { data: { publicUrl } } = supabase.storage
            .from('company-assets')
            .getPublicUrl(filePath);

          console.log(`Successfully uploaded ${imageType} image:`, publicUrl);
          
          uploadedImages.push({
            type: imageType,
            url: publicUrl,
            alt: `${formData.category_name} ${imageType} view`
          });
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error(`Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }

    return uploadedImages;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category_name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      setLoading(true);
      const uploadedImages = await uploadImages();
      const imageUrl = uploadedImages.length > 0 ? uploadedImages[0].url : null;

      const categoryData = {
        category_name: formData.category_name,
        description: formData.description,
        category_image_url: imageUrl,
        category_images: JSON.stringify(uploadedImages),
        fabrics: formData.selectedFabrics
      };

      if (editingCategory) {
        const { error } = await supabase
          .from('product_categories')
          .update(categoryData)
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast.success('Category updated successfully');
      } else {
        const { error } = await supabase
          .from('product_categories')
          .insert([categoryData]);

        if (error) throw error;
        toast.success('Category created successfully');
      }

      setDialogOpen(false);
      setEditingCategory(null);
      setFormData({ category_name: '', description: '', selectedFabrics: [], category_images: [] });
      setImageFiles({ front: null, back: null, side: null, detail: null });
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to save category: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (category: ProductCategory) => {
    setEditingCategory(category);
    setFormData({
      category_name: category.category_name,
      description: category.description,
      selectedFabrics: category.fabrics || [],
      category_images: category.category_images || []
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      setLoading(true);
      
      // Check for dependencies before deletion
      const [orderItemsResult, fabricsResult, childCategoriesResult] = await Promise.all([
        supabase.from('order_items').select('id').eq('product_category_id', id).limit(1),
        supabase.from('fabrics').select('id').eq('category_id', id).limit(1),
        supabase.from('product_categories').select('id').eq('parent_category_id', id).limit(1)
      ]);

      const hasOrderItems = orderItemsResult.data && orderItemsResult.data.length > 0;
      const hasFabrics = fabricsResult.data && fabricsResult.data.length > 0;
      const hasChildCategories = childCategoriesResult.data && childCategoriesResult.data.length > 0;

      if (hasOrderItems || hasFabrics || hasChildCategories) {
        let errorMessage = 'Cannot delete category because it is being used by: ';
        const issues = [];
        
        if (hasOrderItems) issues.push('existing orders');
        if (hasFabrics) issues.push('fabric records');
        if (hasChildCategories) issues.push('child categories');
        
        errorMessage += issues.join(', ');
        toast.error(errorMessage);
        return;
      }

      // If no dependencies, proceed with deletion
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Category deleted successfully');
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openDialog = () => {
    setEditingCategory(null);
    setFormData({ category_name: '', description: '', selectedFabrics: [], category_images: [] });
    setImageFiles({ front: null, back: null, side: null, detail: null });
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    // Reset form when dialog closes
    if (!open) {
      // Small delay to ensure state updates complete
      setTimeout(() => {
        setFormData({ category_name: '', description: '', selectedFabrics: [], category_images: [] });
        setImageFiles({ front: null, back: null, side: null, detail: null });
        setEditingCategory(null);
      }, 100);
    }
  };

  // Image navigation functions
  const goToPreviousImage = (categoryId: string, totalImages: number) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [categoryId]: prev[categoryId] ? (prev[categoryId] - 1 + totalImages) % totalImages : totalImages - 1
    }));
  };

  const goToNextImage = (categoryId: string, totalImages: number) => {
    setCurrentImageIndex(prev => ({
      ...prev,
      [categoryId]: prev[categoryId] !== undefined ? (prev[categoryId] + 1) % totalImages : 1
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Product Categories</h2>
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={openDialog} className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80">
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
             <DialogHeader>
               <DialogTitle className="text-xl">
                 {editingCategory ? 'Edit Category' : 'Add New Category'}
               </DialogTitle>
              <DialogDescription>
                {editingCategory ? 'Update the category details and associated fabrics.' : 'Create a new product category with images and fabric associations.'}
              </DialogDescription>
             </DialogHeader>
             <form onSubmit={handleSubmit} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                  <Label htmlFor="category_name">Category Name *</Label>
                   <Input
                     id="category_name"
                     value={formData.category_name}
                     onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
                    placeholder="Enter category name"
                     required
                   />
                 </div>
                 <div>
                  <Label htmlFor="description">Description</Label>
                   <Textarea
                     id="description"
                     value={formData.description}
                     onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter category description"
                     rows={3}
                   />
                 </div>
               </div>

               <div className="space-y-4">
                 <Label className="text-sm font-medium">Category Images</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {['front', 'back', 'side', 'detail'].map((type) => (
                    <div key={type} className="space-y-2">
                      <Label className="text-xs capitalize">{type} View</Label>
                       <Input
                         type="file"
                         accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setImageFiles(prev => ({ ...prev, [type]: file }));
                        }}
                         className="text-xs"
                       />
                      {imageFiles[type] && (
                        <div className="text-xs text-green-600">
                          ✓ {imageFiles[type]?.name}
                          </div>
                        )}
                     </div>
                   ))}
                 </div>
               </div>

               <div>
                 <Label className="text-sm font-medium">Associated Fabrics</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                  {(() => {
                    // Get unique fabric names
                    const uniqueFabricNames = [...new Set(fabrics.map(f => f.fabric_name))];
                    
                    return uniqueFabricNames.map((fabricName) => {
                      // Get the first fabric of this name for display
                      const displayFabric = fabrics.find(f => f.fabric_name === fabricName)!;
                      // Get all fabric IDs with this name
                      const fabricIds = fabrics.filter(f => f.fabric_name === fabricName).map(f => f.id);
                      // Check if any of these fabric IDs are selected
                      const isSelected = fabricIds.some(id => formData.selectedFabrics.includes(id));
                      
                      return (
                        <label key={fabricName} className="flex items-center space-x-3 text-sm hover:bg-muted/50 p-3 rounded border">
                       <input
                         type="checkbox"
                            checked={isSelected}
                         onChange={(e) => {
                           if (e.target.checked) {
                                // Add all fabric IDs with this name
                             setFormData(prev => ({
                               ...prev,
                                  selectedFabrics: [...prev.selectedFabrics, ...fabricIds.filter(id => !prev.selectedFabrics.includes(id))]
                             }));
                           } else {
                                // Remove all fabric IDs with this name
                             setFormData(prev => ({
                               ...prev,
                                  selectedFabrics: prev.selectedFabrics.filter(id => !fabricIds.includes(id))
                             }));
                           }
                         }}
                            className="rounded accent-primary mt-1"
                          />
                          <div className="flex items-center gap-2 flex-1">
                            {displayFabric.image && (
                              <img 
                                src={displayFabric.image} 
                                alt={displayFabric.fabric_name} 
                                className="w-8 h-8 object-cover rounded border"
                              />
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium">{displayFabric.fabric_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {displayFabric.gsm && `${displayFabric.gsm} GSM`} • ₹{displayFabric.rate}
                                {fabricIds.length > 1 && ` • ${fabricIds.length} colors available`}
                              </span>
                            </div>
                          </div>
                     </label>
                      );
                    });
                  })()}
                </div>
              </div>

               <div className="flex justify-end space-x-2 pt-6 border-t">
                 <Button 
                   type="button" 
                   variant="outline" 
                   onClick={() => setDialogOpen(false)}
                 >
                   Cancel
                 </Button>
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="px-6 bg-gradient-to-r from-primary to-primary/90"
                >
                   {loading ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
                 </Button>
               </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Categories List ({categories.length} categories)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {categories.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">No categories found</div>
              <Button onClick={openDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Category
              </Button>
                               </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {categories.map((category) => (
                <Card
                  key={category.id}
                  className="group hover:shadow-md transition-all duration-200 border bg-white rounded-lg overflow-hidden"
                >
                  <CardContent className="p-2 sm:p-2.5">
                    <div className="flex justify-end items-center pb-0.5">
                      <div className="flex space-x-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => handleEdit(category)}
                          title="Edit Category"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleDelete(category.id)}
                          title="Delete Category"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col items-center text-center gap-1">
                      {(() => {
                        const categoryImages =
                          category.category_images && Array.isArray(category.category_images)
                            ? category.category_images
                            : category.category_image_url
                              ? [{ url: category.category_image_url, alt: category.category_name, type: 'main' }]
                              : [];

                        if (categoryImages.length === 0) return null;
                        const index = currentImageIndex[category.id] || 0;
                        const activeImage = categoryImages[index];

                        return (
                          <div className="relative w-full flex items-center justify-center">
                            {categoryImages.length > 1 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 p-0 bg-white/90 hover:bg-white z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  goToPreviousImage(category.id, categoryImages.length);
                                }}
                              >
                                <ChevronLeft className="w-2.5 h-2.5" />
                              </Button>
                            )}

                            <img src={activeImage.url} alt={activeImage.alt} className="w-full h-14 sm:h-16 object-contain" />

                            {categoryImages.length > 1 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 p-0 bg-white/90 hover:bg-white z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  goToNextImage(category.id, categoryImages.length);
                                }}
                              >
                                <ChevronRight className="w-2.5 h-2.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })()}

                      <h3 className="text-xs sm:text-sm font-bold leading-tight line-clamp-2">{category.category_name.toUpperCase()}</h3>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground line-clamp-1">
                        {category.description || `${category.category_name} Product`}
                      </p>

                      <div className="w-full">
                        <div className="text-[10px] font-semibold text-foreground mb-0.5">Associated Fabric</div>
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {(() => {
                            const fabricIds = Array.isArray(category.fabrics) ? category.fabrics : [];
                            const selectedFabrics = fabricIds.map(id => fabrics.find(f => f.id === id)).filter(Boolean) || [];
                            const uniqueFabricNames = [...new Set(selectedFabrics.map(f => f!.fabric_name))];

                            if (uniqueFabricNames.length === 0) {
                              return <span className="text-[11px] text-muted-foreground">—</span>;
                            }

                            return (
                              <>
                                {uniqueFabricNames.slice(0, 1).map((fabricName, index) => (
                                  <Badge key={index} variant="secondary" className="text-[10px] px-2 py-0.5">
                                    {fabricName}
                                  </Badge>
                                ))}
                                {uniqueFabricNames.length > 1 && (
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                    +{uniqueFabricNames.length - 1}
                                  </Badge>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
