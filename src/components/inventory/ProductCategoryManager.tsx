import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
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

interface Fabric {
  id: string;
  name: string;
  color: string;
}

export function ProductCategoryManager() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
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

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
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
        .from('fabrics')
        .select('*')
        .order('name');

      if (error) throw error;
      setFabrics(data || []);
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
          const filePath = `categories/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('category-images')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('category-images')
            .getPublicUrl(filePath);

          // Remove existing image of same type
          const filteredImages = uploadedImages.filter(img => img.type !== imageType);
          uploadedImages.splice(0, uploadedImages.length, ...filteredImages);
          
          // Add new image
          uploadedImages.push({
            type: imageType,
            url: data.publicUrl,
            alt: `${imageType} view`
          });
        }
      }
      
      return uploadedImages;
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('Failed to upload images');
      return formData.category_images;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const uploadedImages = await uploadImages();
      
      // Keep existing single image for backward compatibility
      let imageUrl = editingCategory?.category_image_url || '';
      if (uploadedImages.length > 0) {
        imageUrl = uploadedImages[0].url;
      }

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
      toast.error('Failed to save category');
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
      const { error } = await supabase
        .from('product_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Category deleted successfully');
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const openDialog = () => {
    setEditingCategory(null);
    setFormData({ category_name: '', description: '', selectedFabrics: [], category_images: [] });
    setImageFiles({ front: null, back: null, side: null, detail: null });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Product Categories</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
             <DialogHeader>
               <DialogTitle className="text-xl">
                 {editingCategory ? 'Edit Category' : 'Add New Category'}
               </DialogTitle>
             </DialogHeader>
             <form onSubmit={handleSubmit} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <Label htmlFor="category_name" className="text-sm font-medium">Category Name</Label>
                   <Input
                     id="category_name"
                     value={formData.category_name}
                     onChange={(e) => setFormData(prev => ({ ...prev, category_name: e.target.value }))}
                     required
                     className="mt-1"
                   />
                 </div>
                 <div>
                   <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                   <Textarea
                     id="description"
                     value={formData.description}
                     onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                     rows={3}
                     className="mt-1"
                   />
                 </div>
               </div>

               {/* Multiple Image Upload Section */}
               <div className="space-y-4">
                 <Label className="text-sm font-medium">Category Images</Label>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                   {['front', 'back', 'side', 'detail'].map((imageType) => (
                     <div key={imageType} className="border rounded-lg p-4 space-y-2">
                       <Label htmlFor={`image_${imageType}`} className="text-sm font-medium capitalize">
                         {imageType} View
                       </Label>
                       <Input
                         id={`image_${imageType}`}
                         type="file"
                         accept="image/*"
                         onChange={(e) => setImageFiles(prev => ({ 
                           ...prev, 
                           [imageType]: e.target.files?.[0] || null 
                         }))}
                         className="text-xs"
                       />
                        {formData.category_images.find(img => img.type === imageType) && (
                          <div className="mt-2">
                            <img 
                              src={formData.category_images.find(img => img.type === imageType)?.url} 
                              alt={`${imageType} view`}
                              className="w-full h-32 object-cover rounded border cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => {
                                const img = formData.category_images.find(img => img.type === imageType);
                                if (img) {
                                  const modal = document.createElement('div');
                                  modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                  modal.innerHTML = `
                                    <div class="relative max-w-4xl max-h-full">
                                      <img src="${img.url}" alt="${img.alt}" class="max-w-full max-h-full object-contain rounded-lg" />
                                      <button class="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                          <line x1="18" y1="6" x2="6" y2="18"></line>
                                          <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                      </button>
                                    </div>
                                  `;
                                  modal.onclick = (e) => {
                                    if (e.target === modal) {
                                      document.body.removeChild(modal);
                                    }
                                  };
                                  document.body.appendChild(modal);
                                }
                              }}
                            />
                          </div>
                        )}
                     </div>
                   ))}
                 </div>
               </div>
               <div>
                 <Label className="text-sm font-medium">Associated Fabrics</Label>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                   {fabrics.map((fabric) => (
                     <label key={fabric.id} className="flex items-center space-x-2 text-sm hover:bg-muted/50 p-2 rounded">
                       <input
                         type="checkbox"
                         checked={formData.selectedFabrics.includes(fabric.id)}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setFormData(prev => ({
                               ...prev,
                               selectedFabrics: [...prev.selectedFabrics, fabric.id]
                             }));
                           } else {
                             setFormData(prev => ({
                               ...prev,
                               selectedFabrics: prev.selectedFabrics.filter(id => id !== fabric.id)
                             }));
                           }
                         }}
                         className="rounded accent-primary"
                       />
                       <span className="font-medium">{fabric.name}</span>
                       <Badge variant="secondary" className="text-xs">{fabric.color}</Badge>
                     </label>
                   ))}
                </div>
              </div>

               <div className="flex justify-end space-x-2 pt-6 border-t">
                 <Button 
                   type="button" 
                   variant="outline" 
                   onClick={() => setDialogOpen(false)}
                   className="px-6"
                 >
                   Cancel
                 </Button>
                 <Button type="submit" disabled={loading} className="px-6 bg-gradient-to-r from-primary to-primary/90">
                   {loading ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
                 </Button>
               </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <CardTitle className="text-lg">Categories List</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Images</TableHead>
                <TableHead>Category Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Fabrics</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id} className="hover:bg-muted/30">
                   <TableCell>
                     <div className="flex gap-2 flex-wrap">
                       {category.category_images && category.category_images.length > 0 ? (
                         category.category_images.map((img, index) => (
                           <div key={index} className="relative group">
                             <img 
                               src={img.url} 
                               alt={img.alt}
                               className="w-20 h-20 object-cover rounded border shadow-sm cursor-pointer hover:scale-105 transition-transform"
                               title={img.type}
                               onClick={() => {
                                 const modal = document.createElement('div');
                                 modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                 modal.innerHTML = `
                                   <div class="relative max-w-6xl max-h-full">
                                     <img src="${img.url}" alt="${img.alt}" class="max-w-full max-h-full object-contain rounded-lg" />
                                     <div class="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium capitalize">
                                       ${img.type} View
                                     </div>
                                     <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                         <line x1="18" y1="6" x2="6" y2="18"></line>
                                         <line x1="6" y1="6" x2="18" y2="18"></line>
                                       </svg>
                                     </button>
                                   </div>
                                 `;
                                 modal.onclick = (e) => {
                                   if (e.target === modal) {
                                     document.body.removeChild(modal);
                                   }
                                 };
                                 document.body.appendChild(modal);
                               }}
                             />
                             <Badge className="absolute -bottom-1 -right-1 text-xs capitalize bg-primary/90 hover:bg-primary">
                               {img.type}
                             </Badge>
                           </div>
                         ))
                       ) : category.category_image_url ? (
                         <img 
                           src={category.category_image_url} 
                           alt={category.category_name}
                           className="w-20 h-20 object-cover rounded border shadow-sm cursor-pointer hover:scale-105 transition-transform"
                           onClick={() => {
                             const modal = document.createElement('div');
                             modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                             modal.innerHTML = `
                               <div class="relative max-w-6xl max-h-full">
                                 <img src="${category.category_image_url}" alt="${category.category_name}" class="max-w-full max-h-full object-contain rounded-lg" />
                                 <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                     <line x1="18" y1="6" x2="6" y2="18"></line>
                                     <line x1="6" y1="6" x2="18" y2="18"></line>
                                   </svg>
                                 </button>
                               </div>
                             `;
                             modal.onclick = (e) => {
                               if (e.target === modal) {
                                 document.body.removeChild(modal);
                               }
                             };
                             document.body.appendChild(modal);
                           }}
                         />
                       ) : (
                         <div className="w-20 h-20 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                           No Image
                         </div>
                       )}
                     </div>
                   </TableCell>
                  <TableCell className="font-semibold text-foreground">{category.category_name}</TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm text-muted-foreground line-clamp-2">{category.description}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {category.fabrics?.slice(0, 2).map((fabricId, index) => {
                        const fabric = fabrics.find(f => f.id === fabricId);
                        return fabric ? (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {fabric.name}
                          </Badge>
                        ) : null;
                      })}
                      {category.fabrics?.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{category.fabrics.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(category)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(category.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="w-3 h-3" />
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