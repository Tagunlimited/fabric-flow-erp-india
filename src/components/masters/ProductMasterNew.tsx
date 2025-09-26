import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import Papa from "papaparse";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Settings, 
  Grid3X3, 
  ExternalLink, 
  ChevronDown,
  ArrowUpDown,
  Filter,
  Eye,
  EyeOff
} from "lucide-react";

const BULK_TEMPLATE_HEADERS = [
  "product_id",
  "product_name", 
  "product_category",
  "description",
  "unit",
  "current_stock",
  "default_price",
  "regular_buying_price",
  "wholesale_buying_price",
  "regular_selling_price",
  "mrp",
  "gst_rate",
  "weight",
  "brand",
  "image_url",
  "is_active"
];

interface Product {
  id?: string;
  product_id: string;
  product_name: string;
  product_category?: string;
  description?: string;
  unit?: string;
  current_stock?: number;
  default_price?: number;
  regular_buying_price?: number;
  wholesale_buying_price?: number;
  regular_selling_price?: number;
  mrp?: number;
  gst_rate?: number;
  weight?: number;
  brand?: string;
  image_url?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ColumnVisibility {
  [key: string]: boolean;
}

export function ProductMasterNew() {
  // Auth context
  const { user, profile } = useAuth();
  
  // State management
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  
  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    product_id: true,
    product_name: true,
    product_category: true,
    current_stock: true,
    unit: true,
    default_price: true,
    regular_buying_price: true,
    wholesale_buying_price: true,
    regular_selling_price: true,
    mrp: true,
    gst_rate: true,
    weight: true,
    brand: true,
    image_url: true,
    is_active: true
  });

  // Form state
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'created_at' | 'updated_at'>>({
    product_id: "",
    product_name: "",
    product_category: "",
    description: "",
    unit: "pcs",
    current_stock: 0,
    default_price: 0,
    regular_buying_price: 0,
    wholesale_buying_price: 0,
    regular_selling_price: 0,
    mrp: 0,
    gst_rate: 0,
    weight: 0,
    brand: "",
    image_url: "",
    is_active: true
  });

  // Initialize Supabase client only once
  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  // Filter and sort products
  useEffect(() => {
    let filtered = products;
    
    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter(product => product.product_category === categoryFilter);
    }
    
    // Apply status filter
    if (statusFilter !== "All") {
      const isActive = statusFilter === "Active";
      filtered = filtered.filter(product => product.is_active === isActive);
    }
    
    // Apply search term filter
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(product =>
        product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        const aVal = a[sortField as keyof Product];
        const bVal = b[sortField as keyof Product];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
      });
    }
    
    setFilteredProducts(filtered);
  }, [searchTerm, categoryFilter, statusFilter, products, sortField, sortDirection]);

  // Fetch products from Supabase
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_master')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      const productsData = (data as unknown as Product[]) || [];
      setProducts(productsData);
      setFilteredProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load product data when in edit mode
  useEffect(() => {
    if (editMode && currentProductId) {
      const productToEdit = products.find(product => product.id === currentProductId);
      if (productToEdit) {
        setFormData({
          product_id: productToEdit.product_id || "",
          product_name: productToEdit.product_name || "",
          product_category: productToEdit.product_category || "",
          description: productToEdit.description || "",
          unit: productToEdit.unit || "pcs",
          current_stock: productToEdit.current_stock || 0,
          default_price: productToEdit.default_price || 0,
          regular_buying_price: productToEdit.regular_buying_price || 0,
          wholesale_buying_price: productToEdit.wholesale_buying_price || 0,
          regular_selling_price: productToEdit.regular_selling_price || 0,
          mrp: productToEdit.mrp || 0,
          gst_rate: productToEdit.gst_rate || 0,
          weight: productToEdit.weight || 0,
          brand: productToEdit.brand || "",
          image_url: productToEdit.image_url || "",
          is_active: productToEdit.is_active || true
        });
      }
    }
  }, [editMode, currentProductId, products]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.product_id.trim()) {
      alert('Product ID is required');
      return;
    }
    if (!formData.product_name.trim()) {
      alert('Product Name is required');
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare data for submission
      let submitData = { ...formData };
      
      // Handle image upload if a file is selected
      if (imageFile) {
        const imageUrl = await uploadImage(imageFile);
        if (imageUrl) {
          submitData.image_url = imageUrl;
        } else {
          alert('Image upload failed, but product will be saved without image. You can add the image later.');
        }
      }
      
      if (editMode && currentProductId) {
        // Update existing product
        const { error } = await supabase
          .from('product_master')
          .update(submitData as any)
          .eq('id', currentProductId as any);
        
        if (error) throw error;
      } else {
        // Add new product
        const { error } = await supabase
          .from('product_master')
          .insert([submitData as any]);
        
        if (error) throw error;
      }
      
      setShowDialog(false);
      await fetchProducts();
      resetForm(true);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error saving product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reset form to default values
  const resetForm = (clearImage = true) => {
    setFormData({
      product_id: "",
      product_name: "",
      product_category: "",
      description: "",
      unit: "pcs",
      current_stock: 0,
      default_price: 0,
      regular_buying_price: 0,
      wholesale_buying_price: 0,
      regular_selling_price: 0,
      mrp: 0,
      gst_rate: 0,
      weight: 0,
      brand: "",
      image_url: "",
      is_active: true
    });
    setEditMode(false);
    setCurrentProductId(null);
    if (clearImage) {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Upload image to Supabase storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, GIF, etc.)');
        return null;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return null;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `product-${Date.now()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        if (uploadError.message.includes('already exists')) {
          alert('A file with this name already exists. Please try again.');
        } else if (uploadError.message.includes('not found')) {
          alert('Storage bucket not found. Please contact administrator.');
        } else if (uploadError.message.includes('permission')) {
          alert('Permission denied. Please check your storage permissions.');
        } else if (uploadError.message.includes('size')) {
          alert('File size exceeds the limit. Please choose a smaller image.');
        } else {
          alert(`Upload failed: ${uploadError.message}`);
        }
        return null;
      }

      const { data: urlData, error: urlError } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      if (urlError) {
        alert('Failed to generate image URL. Please try again.');
        return null;
      }
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('An unexpected error occurred during upload. Please try again.');
      return null;
    }
  };

  // Handle edit button click
  const handleEdit = (productId: string) => {
    setCurrentProductId(productId);
    setEditMode(true);
    setShowDialog(true);
  };

  // Handle delete button click
  const handleDelete = async (productId: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('product_master')
          .delete()
          .eq('id', productId as any);
        
        if (error) throw error;
        
        await fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle bulk upload
  const handleBulkUpload = async (file: File) => {
    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);
    try {
      const text = await file.text();
      const result = Papa.parse(text, { header: true });
      const products = result.data.filter((row: any) => 
        Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== "")
      );
      
      if (!products.length) {
        throw new Error("No valid products found in CSV.");
      }
      
      // Convert string values to proper types
      const formattedProducts = products.map((product: any) => ({
        ...product,
        current_stock: product.current_stock ? Number(product.current_stock) : 0,
        default_price: product.default_price ? Number(product.default_price) : 0,
        regular_buying_price: product.regular_buying_price ? Number(product.regular_buying_price) : 0,
        wholesale_buying_price: product.wholesale_buying_price ? Number(product.wholesale_buying_price) : 0,
        regular_selling_price: product.regular_selling_price ? Number(product.regular_selling_price) : 0,
        mrp: product.mrp ? Number(product.mrp) : 0,
        gst_rate: product.gst_rate ? Number(product.gst_rate) : 0,
        weight: product.weight ? Number(product.weight) : 0,
        is_active: product.is_active ? product.is_active.toString().toLowerCase() === 'true' : true
      }));
      
      const { error } = await supabase
        .from('product_master')
        .insert(formattedProducts);
      
      if (error) throw error;
      
      setBulkSuccess(`Successfully uploaded ${formattedProducts.length} products.`);
      await fetchProducts();
      
    } catch (err: any) {
      setBulkError(err.message || "Failed to upload products.");
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
    a.download = "product_master_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique categories
  const categories = [...new Set(products.map(p => p.product_category).filter(Boolean))];

  // Calculate summary statistics
  const totalStockValue = products.reduce((sum, product) => 
    sum + ((product.current_stock || 0) * (product.default_price || 0)), 0);
  const lowStockCount = products.filter(p => 
    (p.current_stock || 0) <= 10).length; // Assuming 10 is low stock threshold
  const excessStockCount = products.filter(p => 
    (p.current_stock || 0) >= 1000).length; // Assuming 1000 is excess stock threshold

  return (
    <div className="w-full px-4 py-8 space-y-6">
      {/* Navigation Tabs */}
      <div className="flex space-x-8 border-b">
        <div className="pb-2 border-b-2 border-blue-600 text-blue-600 font-medium">
          Product Master
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Inventory Approvals
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Stock Movement
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Barcode
        </div>
      </div>

      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Product Master</h1>
          <div className="w-4 h-4 bg-gray-300 rounded-full flex items-center justify-center">
            <span className="text-xs text-gray-600">i</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="outline" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Actions
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <Button 
            onClick={() => {
              resetForm(false);
              setShowDialog(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Single Product
          </Button>
        </div>
      </div>

      {/* Dashboard Button */}
      <Button className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
        <Grid3X3 className="w-4 h-4" />
        View Inventory Dashboard
      </Button>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Value</p>
                <p className="text-2xl font-bold">₹ {totalStockValue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold">{lowStockCount}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Excess Stock</p>
                <p className="text-2xl font-bold">{excessStockCount}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label>Products/Services:</Label>
          <Select value="Products" disabled>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Stores:</Label>
          <Select>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Show/Hide Columns:</Label>
          <div className="relative">
            <Button 
              variant="outline" 
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {Object.values(columnVisibility).filter(Boolean).length} columns selected
            </Button>
            {showColumnSelector && (
              <div className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 z-10 min-w-48">
                <div className="space-y-2">
                  {Object.entries(columnVisibility).map(([key, visible]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={key}
                        checked={visible}
                        onChange={(e) => setColumnVisibility(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }))}
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key.replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) resetForm();
        setShowDialog(open);
      }}>
        <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editMode ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1 */}
            <div className="space-y-4">
              <div>
                <Label>Product ID*</Label>
                <Input
                  value={formData.product_id}
                  onChange={(e) => setFormData({...formData, product_id: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Product Name*</Label>
                <Input
                  value={formData.product_name}
                  onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Product Category</Label>
                <Input
                  value={formData.product_category}
                  onChange={(e) => setFormData({...formData, product_category: e.target.value})}
                />
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
                <Label>Unit</Label>
                <Select value={formData.unit} onValueChange={(value) => setFormData({...formData, unit: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="g">Grams (g)</SelectItem>
                    <SelectItem value="m">Meters (m)</SelectItem>
                    <SelectItem value="l">Liters (l)</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Column 2 */}
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
                <Label>Default Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) => setFormData({...formData, default_price: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Regular Buying Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.regular_buying_price}
                  onChange={(e) => setFormData({...formData, regular_buying_price: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Wholesale Buying Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.wholesale_buying_price}
                  onChange={(e) => setFormData({...formData, wholesale_buying_price: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Regular Selling Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.regular_selling_price}
                  onChange={(e) => setFormData({...formData, regular_selling_price: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>MRP</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.mrp}
                  onChange={(e) => setFormData({...formData, mrp: Number(e.target.value)})}
                />
              </div>
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
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
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
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                  placeholder="Or enter image URL directly"
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
                {loading ? "Saving..." : editMode ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Products</DialogTitle>
            <DialogDescription>
              Upload a CSV file to add multiple products at once
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
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleBulkUpload(file);
              }}
              disabled={bulkLoading}
              className="block w-full border rounded px-3 py-2"
            />
            {bulkError && <div className="text-red-600">{bulkError}</div>}
            {bulkSuccess && <div className="text-green-600">{bulkSuccess}</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Products Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-2xl font-bold">Products ({filteredProducts.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-full shadow"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!user ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              Please log in to view products
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              {products.length === 0 ? "No products found. Click 'Add Single Product' to create your first product." : "No matching products found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1400px]">
                <TableHeader>
                  <TableRow className="bg-muted">
                    {columnVisibility.product_id && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('product_id')}>
                        <div className="flex items-center gap-2">
                          Product Id
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                        <Input 
                          placeholder="Q Search" 
                          className="mt-1 h-8 text-xs"
                          onChange={(e) => {
                            // Add search functionality for this column
                          }}
                        />
                      </TableHead>
                    )}
                    {columnVisibility.product_name && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('product_name')}>
                        <div className="flex items-center gap-2">
                          Product Name
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                        <Input 
                          placeholder="Q Search" 
                          className="mt-1 h-8 text-xs"
                        />
                      </TableHead>
                    )}
                    {columnVisibility.product_category && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('product_category')}>
                        <div className="flex items-center gap-2">
                          Product Category
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.current_stock && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('current_stock')}>
                        <div className="flex items-center gap-2">
                          Current Stock
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.unit && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('unit')}>
                        <div className="flex items-center gap-2">
                          Unit
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.default_price && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('default_price')}>
                        <div className="flex items-center gap-2">
                          Default Price
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.regular_buying_price && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('regular_buying_price')}>
                        <div className="flex items-center gap-2">
                          Regular Buying Price
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.wholesale_buying_price && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('wholesale_buying_price')}>
                        <div className="flex items-center gap-2">
                          Wholesale Buying Price
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.regular_selling_price && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('regular_selling_price')}>
                        <div className="flex items-center gap-2">
                          Regular Selling Price
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.mrp && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('mrp')}>
                        <div className="flex items-center gap-2">
                          MRP
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.gst_rate && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('gst_rate')}>
                        <div className="flex items-center gap-2">
                          GST %
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.weight && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('weight')}>
                        <div className="flex items-center gap-2">
                          Weight
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.brand && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('brand')}>
                        <div className="flex items-center gap-2">
                          Brand
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.image_url && (
                      <TableHead>Image</TableHead>
                    )}
                    {columnVisibility.is_active && (
                      <TableHead>Status</TableHead>
                    )}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-blue-50 transition-colors">
                      {columnVisibility.product_id && (
                        <TableCell className="font-mono">{product.product_id}</TableCell>
                      )}
                      {columnVisibility.product_name && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {product.product_name}
                            <ExternalLink className="w-4 h-4 text-gray-400 cursor-pointer" />
                          </div>
                        </TableCell>
                      )}
                      {columnVisibility.product_category && (
                        <TableCell>{product.product_category || '-'}</TableCell>
                      )}
                      {columnVisibility.current_stock && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {product.current_stock || 0}
                            <Edit className="w-4 h-4 text-gray-400 cursor-pointer" />
                          </div>
                        </TableCell>
                      )}
                      {columnVisibility.unit && (
                        <TableCell>{product.unit || 'pcs'}</TableCell>
                      )}
                      {columnVisibility.default_price && (
                        <TableCell>₹{(product.default_price || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.regular_buying_price && (
                        <TableCell>₹{(product.regular_buying_price || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.wholesale_buying_price && (
                        <TableCell>₹{(product.wholesale_buying_price || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.regular_selling_price && (
                        <TableCell>₹{(product.regular_selling_price || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.mrp && (
                        <TableCell>₹{(product.mrp || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.gst_rate && (
                        <TableCell>{(product.gst_rate || 0).toFixed(2)}%</TableCell>
                      )}
                      {columnVisibility.weight && (
                        <TableCell>{product.weight ? `${product.weight} kg` : '-'}</TableCell>
                      )}
                      {columnVisibility.brand && (
                        <TableCell>{product.brand || '-'}</TableCell>
                      )}
                      {columnVisibility.image_url && (
                        <TableCell>
                          {product.image_url ? (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                              <img 
                                src={product.image_url} 
                                alt={product.product_name} 
                                className="h-12 w-12 rounded border object-cover" 
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const errorDiv = document.createElement('div');
                                  errorDiv.className = 'text-xs text-red-500 text-center p-1';
                                  errorDiv.innerHTML = 'Image not accessible';
                                  target.parentNode?.appendChild(errorDiv);
                                }}
                              />
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.is_active && (
                        <TableCell>
                          <Badge variant={product.is_active ? "default" : "destructive"}>
                            {product.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(product.id!)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(product.id!)}
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Rows per page:</span>
          <Select defaultValue="20">
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            1 to {filteredProducts.length} of {filteredProducts.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>
              <span>«</span>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>‹</span>
            </Button>
            <Button variant="outline" size="sm" className="bg-blue-600 text-white">
              1
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>›</span>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>»</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductMasterNew;
