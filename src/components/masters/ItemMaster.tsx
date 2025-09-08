import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import Papa from "papaparse";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";;
import { Button } from "@/components/ui/button";;
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Search } from "lucide-react";

const BULK_TEMPLATE_HEADERS = [
  "item_code",
  "item_name", 
  "item_type",
  "description",
  "uom",
  "size",
  "color",
  "material",
  "weight",
  "brand",
  "current_stock",
  "min_stock_level",
  "lead_time",
  "cost_price",
  "gst_rate",
  "image",
  "is_active",
  "image_url"
];

interface Item {
  id?: string;
  item_code: string;
  item_name: string;
  item_type: string;
  description?: string;
  uom?: string;
  size?: string;
  color?: string;
  material?: string;
  weight?: number;
  brand?: string;
  current_stock?: number;
  min_stock_level?: number;
  lead_time?: number;
  cost_price?: number;
  gst_rate?: number;
  image?: string;
  is_active?: boolean;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

export function ItemMaster() {
  // Auth context
  const { user, profile } = useAuth();
  
  // State management
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Omit<Item, 'id' | 'created_at' | 'updated_at'>>({
    item_code: "",
    item_name: "",
    item_type: "Material",
    description: "",
    uom: "pcs",
    size: "",
    color: "",
    material: "",
    weight: 0,
    brand: "",
    current_stock: 0,
    min_stock_level: 0,
    lead_time: 0,
    cost_price: 0,
    gst_rate: 0,
    image: "",
    is_active: true,
    image_url: ""
  });

  // Initialize Supabase client only once
  useEffect(() => {
    if (user) {
      fetchItems();
    }
  }, [user]);

  // Filter items based on search term and type filter
  useEffect(() => {
    let filtered = items;
    
    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter(item => item.item_type === typeFilter);
    }
    
    // Apply search term filter
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(item =>
        item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredItems(filtered);
  }, [searchTerm, typeFilter, items]);

  // Fetch items from Supabase
  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('item_master')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Fetched items data:', data);
      const itemsData = (data as unknown as Item[]) || [];
      console.log('Items with images:', itemsData.map(item => ({ 
        name: item.item_name, 
        image: item.image, 
        image_url: item.image_url 
      })));
      setItems(itemsData);
      setFilteredItems(itemsData);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load item data when in edit mode
  useEffect(() => {
    if (editMode && currentItemId) {
      const itemToEdit = items.find(item => item.id === currentItemId);
      if (itemToEdit) {
        setFormData({
          item_code: itemToEdit.item_code || "",
          item_name: itemToEdit.item_name || "",
          item_type: itemToEdit.item_type || "Material",
          description: itemToEdit.description || "",
          uom: itemToEdit.uom || "pcs",
          size: itemToEdit.size || "",
          color: itemToEdit.color || "",
          material: itemToEdit.material || "",
          weight: itemToEdit.weight || 0,
          brand: itemToEdit.brand || "",
          current_stock: itemToEdit.current_stock || 0,
          min_stock_level: itemToEdit.min_stock_level || 0,
          lead_time: itemToEdit.lead_time || 0,
          cost_price: itemToEdit.cost_price || 0,
          gst_rate: itemToEdit.gst_rate || 0,
          image: itemToEdit.image || "",
          is_active: itemToEdit.is_active || true,
          image_url: itemToEdit.image_url || ""
        });
      }
    }
  }, [editMode, currentItemId, items]);

  // Handle form submission (both add and edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.item_code.trim()) {
      alert('Item Code is required');
      return;
    }
    if (!formData.item_name.trim()) {
      alert('Item Name is required');
      return;
    }
    if (!formData.item_type.trim()) {
      alert('Item Type is required');
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare data for submission
      let submitData = { ...formData };
      
      // Handle image upload if a file is selected
      console.log('Checking imageFile state:', imageFile);
      if (imageFile) {
        console.log('Uploading image file:', imageFile.name);
        const imageUrl = await uploadImage(imageFile);
        if (imageUrl) {
          console.log('Image uploaded successfully, URL:', imageUrl);
          submitData.image = imageUrl;
          console.log('Updated submitData.image:', submitData.image);
        } else {
          console.error('Failed to upload image, but continuing with item creation');
          // Don't return here, just continue without the image
          alert('Image upload failed, but item will be saved without image. You can add the image later.');
        }
      } else {
        console.log('No image file selected for upload');
      }
      
      console.log('Final submitData before database operation:', submitData);
      
      if (editMode && currentItemId) {
        // Update existing item
        console.log('Updating existing item with ID:', currentItemId);
        const { error } = await supabase
          .from('item_master')
          .update(submitData as any)
          .eq('id', currentItemId as any);
        
        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        console.log('Item updated successfully');
      } else {
        // Add new item
        console.log('Adding new item to database');
        const { error } = await supabase
          .from('item_master')
          .insert([submitData as any]);
        
        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        console.log('Item added successfully');
      }
      
      setShowDialog(false);
      await fetchItems();
      resetForm(true); // Clear image after successful submission
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Error saving item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reset form to default values
  const resetForm = (clearImage = true) => {
    setFormData({
      item_code: "",
      item_name: "",
      item_type: "Material",
      description: "",
      uom: "pcs",
      size: "",
      color: "",
      material: "",
      weight: 0,
      brand: "",
      current_stock: 0,
      min_stock_level: 0,
      lead_time: 0,
      cost_price: 0,
      gst_rate: 0,
      image: "",
      is_active: true,
      image_url: ""
    });
    setEditMode(false);
    setCurrentItemId(null);
    if (clearImage) {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('Image file selected:', file);
    if (file) {
      console.log('Setting image file:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        console.log('Image preview loaded');
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      console.log('No file selected');
    }
  };

  // Upload image to Supabase storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      console.log('Starting image upload process...');
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.error('Invalid file type:', file.type);
        alert('Please select an image file (JPG, PNG, GIF, etc.)');
        return null;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        console.error('File too large:', file.size);
        alert('File size must be less than 10MB');
        return null;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `item-${Date.now()}.${fileExt}`;
      const filePath = fileName; // Upload directly to bucket root

      console.log('Uploading to path:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('item-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error details:', {
          error: uploadError,
          message: uploadError.message,
          statusCode: uploadError.statusCode
        });
        
        // Show user-friendly error message
        if (uploadError.message.includes('already exists')) {
          alert('A file with this name already exists. Please try again.');
        } else if (uploadError.message.includes('not found')) {
          alert('Storage bucket not found. Please contact administrator.');
        } else {
          alert(`Upload failed: ${uploadError.message}`);
        }
        return null;
      }

      console.log('Upload successful, data:', uploadData);

      const { data: urlData, error: urlError } = supabase.storage
        .from('item-images')
        .getPublicUrl(filePath);

      if (urlError) {
        console.error('URL generation error:', urlError);
        alert('Failed to generate image URL. Please try again.');
        return null;
      }

      console.log('Generated public URL:', urlData.publicUrl);
      
      // Test if the URL is accessible
      try {
        const response = await fetch(urlData.publicUrl, { method: 'HEAD' });
        if (!response.ok) {
          console.warn('Generated URL is not accessible:', response.status);
        } else {
          console.log('URL is accessible and working');
        }
      } catch (fetchError) {
        console.warn('Could not test URL accessibility:', fetchError);
      }
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('An unexpected error occurred during upload. Please try again.');
      return null;
    }
  };

  // Handle edit button click
  const handleEdit = (itemId: string) => {
    setCurrentItemId(itemId);
    setEditMode(true);
    setShowDialog(true);
  };

  // Handle delete button click
  const handleDelete = async (itemId: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('item_master')
          .delete()
          .eq('id', itemId as any);
        
        if (error) throw error;
        
        await fetchItems();
      } catch (error) {
        console.error('Error deleting item:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle bulk file selection
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    setBulkFile(file || null);
    setBulkError(null);
    setBulkSuccess(null);
  };

  // Handle bulk upload
  const handleBulkUpload = async () => {
    if (!bulkFile) {
      setBulkError("Please select a CSV file.");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const text = await bulkFile.text();
      const result = Papa.parse(text, { header: true });
      const items = result.data.filter((row: any) => 
        Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== "")
      );
      
      if (!items.length) {
        throw new Error("No valid items found in CSV.");
      }
      
      // Convert string values to proper types
      const formattedItems = items.map((item: any) => ({
        ...item,
        weight: item.weight ? Number(item.weight) : 0,
        current_stock: item.current_stock ? Number(item.current_stock) : 0,
        min_stock_level: item.min_stock_level ? Number(item.min_stock_level) : 0,
        lead_time: item.lead_time ? Number(item.lead_time) : 0,
        cost_price: item.cost_price ? Number(item.cost_price) : 0,
        gst_rate: item.gst_rate ? Number(item.gst_rate) : 0,
        is_active: item.is_active ? item.is_active.toString().toLowerCase() === 'true' : true,
        image: item.image || "",
        image_url: item.image_url || ""
      }));
      
      const { error } = await supabase
        .from('item_master')
        .insert(formattedItems);
      
      if (error) {
        console.error('Bulk upload error:', error, formattedItems);
        throw new Error(error.message || JSON.stringify(error));
      }
      
      setBulkSuccess(`Successfully uploaded ${formattedItems.length} items.`);
      setBulkFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // Refresh the items list
      await fetchItems();
      
    } catch (err: any) {
      setBulkError(err.message || JSON.stringify(err) || "Failed to upload items.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Download CSV template
  const handleDownloadTemplate = () => {
    const csv = [BULK_TEMPLATE_HEADERS.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item_master_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent tracking-tight">
            Item Master
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage your item master records
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          {/* Add Item Button */}
          <Button 
            onClick={() => {
              resetForm(false); // Don't clear image when opening dialog
              setShowDialog(true);
            }}
            className="bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>

          {/* Bulk Upload Button */}
          <Button 
            variant="outline" 
            className="border-primary text-primary hover:bg-primary/10"
            onClick={() => setBulkDialog(true)}
          >
            Bulk Upload
          </Button>

        </div>
      </div>

      {/* Add/Edit Item Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) resetForm();
        setShowDialog(open);
      }}>
        <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editMode ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1 */}
            <div className="space-y-4">
              <div>
                <Label>Item Code*</Label>
                <Input
                  value={formData.item_code}
                  onChange={(e) => setFormData({...formData, item_code: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Item Name*</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Item Type*</Label>
                <select
                  value={formData.item_type}
                  onChange={(e) => setFormData({...formData, item_type: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="Material">Material</option>
                  <option value="Component">Component</option>
                  <option value="Finished Good">Finished Good</option>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Semi-Finished">Semi-Finished</option>
                  <option value="Accessory">Accessory</option>
                  <option value="Tool">Tool</option>
                  <option value="Equipment">Equipment</option>
                </select>
              </div>
              <div>
                <Label>Description</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border rounded px-3 py-2 min-h-[100px]"
                />
              </div>
              <div>
                <Label>Unit of Measure</Label>
                <select
                  value={formData.uom}
                  onChange={(e) => setFormData({...formData, uom: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="g">Grams (g)</option>
                  <option value="m">Meters (m)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="mm">Millimeters (mm)</option>
                  <option value="l">Liters (l)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="sqm">Square Meters (sqm)</option>
                  <option value="sqft">Square Feet (sqft)</option>
                  <option value="box">Box</option>
                  <option value="pack">Pack</option>
                  <option value="set">Set</option>
                  <option value="pair">Pair</option>
                  <option value="dozen">Dozen</option>
                  <option value="roll">Roll</option>
                  <option value="sheet">Sheet</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <div>
                <Label>Size</Label>
                <Input
                  value={formData.size}
                  onChange={(e) => setFormData({...formData, size: e.target.value})}
                />
              </div>
              <div>
                <Label>Color</Label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                />
              </div>
              <div>
                <Label>Material</Label>
                <Input
                  value={formData.material}
                  onChange={(e) => setFormData({...formData, material: e.target.value})}
                />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Brand</Label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                />
              </div>
            </div>

            {/* Column 3 */}
            <div className="space-y-4">
              <div>
                <Label>Current Stock</Label>
                <Input
                  type="number"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({...formData, current_stock: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Min Stock Level</Label>
                <Input
                  type="number"
                  value={formData.min_stock_level}
                  onChange={(e) => setFormData({...formData, min_stock_level: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  value={formData.lead_time}
                  onChange={(e) => setFormData({...formData, lead_time: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Cost Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})}
                />
              </div>
            </div>

            {/* Column 4 */}
            <div className="space-y-4">
              <div>
                 <Label>GST Rate (%)</Label>
                <Input
                   type="number"
                   step="0.01"
                   value={formData.gst_rate}
                   onChange={(e) => setFormData({...formData, gst_rate: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Upload Image</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="mb-2"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Image URL</Label>
                <Input
                  value={formData.image}
                  onChange={(e) => setFormData({...formData, image: e.target.value})}
                  placeholder="Or enter image URL directly"
                />
              </div>
              <div>
                <Label>Image URL (Alternative)</Label>
                <Input
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                />
              </div>
              <div>
                <Label>Status</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
            </div>

            <div className="col-span-full flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editMode ? "Update Item" : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Items</DialogTitle>
            <DialogDescription>
              Upload a CSV file to add multiple items at once
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={handleDownloadTemplate}
            >
              Download Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleBulkFileChange}
              disabled={bulkLoading}
              className="block w-full border rounded px-3 py-2"
            />
            <Button 
              type="button" 
              onClick={handleBulkUpload} 
              disabled={bulkLoading || !bulkFile}
              className="w-fit"
            >
              {bulkLoading ? "Uploading..." : "Upload"}
            </Button>
            {bulkError && <div className="text-red-600">{bulkError}</div>}
            {bulkSuccess && <div className="text-green-600">{bulkSuccess}</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Items Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-2xl font-bold">Items ({filteredItems.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-full shadow"
                />
              </div>
              {/* <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="Material">Material</option>
                <option value="Raw Material">Raw Material</option>
                <option value="Semi-Finished">Semi-Finished</option>
                <option value="Finished Product">Finished Product</option>
                <option value="Accessory">Accessory</option>
                <option value="Tool">Tool</option>
                <option value="Equipment">Equipment</option>
                <option value="Other">Other</option>
              </select> */}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!user ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              Please log in to view items
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              {items.length === 0 ? "No items found. Click 'Add Item' to create your first item." : "No matching items found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>Item</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>GST %</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-blue-50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {(() => {
                            const imageUrl = item.image || item.image_url;
                            console.log(`Item ${item.item_name} - Image URL:`, imageUrl);
                            
                            if (imageUrl) {
                              return (
                                <div className="h-24 w-24 rounded border bg-gray-100 flex flex-col items-center justify-center relative">
                                  <img 
                                    src={imageUrl} 
                                    alt={item.item_name} 
                                    className="h-24 w-24 rounded border object-cover" 
                                    onLoad={() => {
                                      console.log('Image loaded successfully for', item.item_name, ':', imageUrl);
                                    }}
                                    onError={(e) => {
                                      console.log('Image failed to load for', item.item_name, ':', imageUrl);
                                      console.log('This is likely due to storage bucket permissions');
                                      // Hide the broken image and show error message
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      
                                      // Show error message
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'text-xs text-red-500 text-center p-2';
                                      errorDiv.innerHTML = 'Image not accessible<br/>Check storage permissions';
                                      target.parentNode?.appendChild(errorDiv);
                                    }}
                                  />
                                  {/* <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 text-center">
                                    Storage Issue
                                  </div> */}
                                </div>
                              );
                            } else {
                              console.log(`No image URL for item ${item.item_name}`);
                              return (
                                <div className="h-24 w-24 rounded border bg-gray-100 flex items-center justify-center">
                                  <span className="text-gray-400 text-xs">No Image</span>
                                </div>
                              );
                            }
                          })()}
                          <div>
                            <div className="font-semibold">{item.item_name}</div>
                            {item.brand && (
                              <div className="text-xs text-muted-foreground">{item.brand}</div>
                            )}
                            {item.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.item_code}</TableCell>
                      <TableCell>{item.item_type}</TableCell>
                      <TableCell>{item.uom || 'N/A'}</TableCell>
                      <TableCell>
                        <div>
                          <div>{item.current_stock || 0} {item.uom || ''}</div>
                          {item.min_stock_level && item.current_stock && item.current_stock <= item.min_stock_level && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Low Stock
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        ₹{item.cost_price?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        {item.gst_rate?.toFixed(2) || '0.00'}%
                      </TableCell>
                      <TableCell>
                        {item.weight ? `${item.weight} kg` : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "default" : "destructive"}>
                          {item.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(item.id!)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(item.id!)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ItemMaster;
