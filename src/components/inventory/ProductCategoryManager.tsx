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
  const [currentSlide, setCurrentSlide] = useState(0);
  const [itemsPerSlide] = useState(3); // Number of cards per slide
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

  // Carousel navigation functions
  const nextSlide = () => {
    const maxSlides = Math.ceil(categories.length / itemsPerSlide) - 1;
    setCurrentSlide(prev => prev < maxSlides ? prev + 1 : 0);
  };

  const prevSlide = () => {
    const maxSlides = Math.ceil(categories.length / itemsPerSlide) - 1;
    setCurrentSlide(prev => prev > 0 ? prev - 1 : maxSlides);
  };

  const goToSlide = (slideIndex: number) => {
    setCurrentSlide(slideIndex);
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            {categories.length > itemsPerSlide && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevSlide}
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentSlide + 1} of {Math.ceil(categories.length / itemsPerSlide)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextSlide}
                  disabled={currentSlide >= Math.ceil(categories.length / itemsPerSlide) - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {categories.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">No categories found</div>
              <Button onClick={openDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Category
              </Button>
                               </div>
          ) : (
            <div className="space-y-6">
              {/* Carousel Container */}
              <div className="relative overflow-hidden">
                <div 
                  className="flex transition-transform duration-300 ease-in-out"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {Array.from({ length: Math.ceil(categories.length / itemsPerSlide) }).map((_, slideIndex) => (
                    <div key={slideIndex} className="w-full flex-shrink-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {categories
                          .slice(slideIndex * itemsPerSlide, (slideIndex + 1) * itemsPerSlide)
                          .map((category) => (
                            <Card key={category.id} className="group hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20 bg-white rounded-lg overflow-hidden">
                              {/* Header with action buttons */}
                              <div className="flex justify-end items-center p-4 pb-2">
                                <div className="flex space-x-1 opacity-60 hover:opacity-100 transition-opacity">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(category)}
                        title="Edit Category"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(category.id)}
                        title="Delete Category"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                                </div>
                              </div>

                              {/* Main Content - Horizontal Layout */}
                              <div className="flex">
                                {/* Left Side - Product Image (Much Bigger) */}
                                <div className="w-3/5 p-2">
                                  <div className="relative">
                                {(() => {
                                  // Get images for this category
                                  const categoryImages = category.category_images && Array.isArray(category.category_images) 
                                    ? category.category_images 
                                    : category.category_image_url 
                                      ? [{ url: category.category_image_url, alt: category.category_name, type: 'main' }]
                                      : [];
                                  
                                  return categoryImages.length > 0 ? (
                                    <div className="relative flex items-center justify-center">
                                      {/* Left Arrow */}
                                      {categoryImages.length > 1 && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white shadow-md z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToPreviousImage(category.id, categoryImages.length);
                                          }}
                                        >
                                          <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                      )}

                                      {/* Main Product Image - Much Bigger Size */}
                                      <img 
                                        src={categoryImages[currentImageIndex[category.id] || 0].url} 
                                        alt={categoryImages[currentImageIndex[category.id] || 0].alt}
                                        className="w-full h-[28rem] object-contain"
                                      />

                                      {/* Right Arrow */}
                                      {categoryImages.length > 1 && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white shadow-md z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToNextImage(category.id, categoryImages.length);
                                          }}
                                        >
                                          <ChevronRight className="w-4 h-4" />
                                        </Button>
                                      )}
                                      
                                      {/* Image Indicators */}
                                      {categoryImages.length > 1 && (
                                        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                                          {categoryImages.map((_, index) => (
                                            <div 
                                              key={index}
                                              className={`w-2 h-2 rounded-full ${
                                                index === (currentImageIndex[category.id] || 0) ? 'bg-primary' : 'bg-white/70'
                                              }`}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="w-full h-[28rem] bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg flex items-center justify-center">
                                      <div className="text-center text-muted-foreground">
                                        <div className="text-6xl mb-4">📦</div>
                                        <div className="text-lg">No Image</div>
                                      </div>
                                    </div>
                                  );
                                })()}
                                  </div>
                                </div>

                                {/* Right Side - Content */}
                                <div className="w-2/5 p-4 flex flex-col justify-center">
                                  {/* Category Name */}
                                  <h3 className="text-xl font-bold mb-3 text-center">
                                    {category.category_name.toUpperCase()}
                                  </h3>

                                  {/* Product Description */}
                                  <div className="mb-4">
                                    <p className="text-sm text-muted-foreground text-center">
                                      {category.description || `${category.category_name} Product`}
                                    </p>
                                  </div>

                                  {/* Associated Fabrics */}
                                  <div>
                                <div className="text-sm font-semibold text-foreground mb-2">Associated Fabric</div>
                                <div className="flex flex-wrap gap-2">
                                  {(() => {
                                    // Get unique fabric names from selected fabrics
                                    const fabricIds = Array.isArray(category.fabrics) ? category.fabrics : [];
                                    const selectedFabrics = fabricIds.map(id => fabrics.find(f => f.id === id)).filter(Boolean) || [];
                                    const uniqueFabricNames = [...new Set(selectedFabrics.map(f => f!.fabric_name))];
                                    
                                    return uniqueFabricNames.map((fabricName, index) => {
                                      const fabric = selectedFabrics.find(f => f!.fabric_name === fabricName)!;
                                      const colorCount = selectedFabrics.filter(f => f!.fabric_name === fabricName).length;
                                      
                                      return (
                                        <div key={index} className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-2 text-xs border">
                                          {/* Fabric Icon */}
                                          <div className="w-4 h-4 rounded-full overflow-hidden border">
                                            {fabric.image ? (
                                              <img 
                                                src={fabric.image} 
                                                alt={fabric.fabric_name} 
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-full h-full bg-gradient-to-br from-orange-200 to-orange-300 flex items-center justify-center">
                                                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                              </div>
                                            )}
                                          </div>
                                          <span className="font-medium">{fabricName}</span>
                                          <span className="text-muted-foreground">({colorCount})</span>
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Carousel Indicators */}
              {categories.length > itemsPerSlide && (
                <div className="flex justify-center space-x-2">
                  {Array.from({ length: Math.ceil(categories.length / itemsPerSlide) }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        index === currentSlide ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
