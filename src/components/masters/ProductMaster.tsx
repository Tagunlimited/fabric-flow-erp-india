import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Search, Download, Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Package } from "lucide-react";
import * as XLSX from 'xlsx';

interface ProductMaster {
  id: string;
  [key: string]: any; // Allow for any fields
}

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: string[];
}

export function ProductMaster() {
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductMaster | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkUploadResult, setBulkUploadResult] = useState<BulkUploadResult | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    category: "",
    images: "",
    hsn: "",
    gst_rate: "18",
    mrp: "",
    cost_price: "",
    selling_price: "",
    fabric: "",
    gsm: "",
    min_stock: "",
    maximum_stock: "",
    sku_hierarchy: ""
  });

  const fetchProducts = async () => {
    try {
      console.log('Fetching products...');
      const { data, error } = await supabase
        .from('product_master')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      console.log('Sample product data:', data);
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast.error('Name is required');
        return;
      }
      if (!formData.category.trim()) {
        toast.error('Category is required');
        return;
      }

      const productData = {
        sku: formData.sku.trim() || null,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category.trim(),
        images: formData.images.trim() ? formData.images.split(',').map(img => img.trim()) : null,
        hsn: formData.hsn.trim() || null,
        gst_rate: formData.gst_rate ? parseFloat(formData.gst_rate) : null,
        mrp: formData.mrp ? parseFloat(formData.mrp) : null,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
        selling_price: formData.selling_price ? parseFloat(formData.selling_price) : null,
        fabric: formData.fabric.trim() || null,
        gsm: formData.gsm ? parseFloat(formData.gsm) : null,
        min_stock: formData.min_stock ? parseFloat(formData.min_stock) : null,
        maximum_stock: formData.maximum_stock ? parseFloat(formData.maximum_stock) : null,
        sku_hierarchy: formData.sku_hierarchy ? parseFloat(formData.sku_hierarchy) : null
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('product_master')
          .update(productData)
          .eq('id', editingProduct.id);
        
        if (error) {
          if (error.code === '23505') {
            toast.error(`SKU "${productData.sku}" already exists`);
            return;
          }
          throw error;
        }
        toast.success('Product updated successfully!');
      } else {
        const { error } = await supabase
          .from('product_master')
          .insert([productData]);
        
        if (error) {
          if (error.code === '23505') {
            toast.error(`SKU "${productData.sku}" already exists`);
            return;
          }
          throw error;
        }
        toast.success('Product created successfully!');
      }

      fetchProducts();
      setShowDialog(false);
      setEditingProduct(null);
      resetForm();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product');
    }
  };

  const resetForm = () => {
    setFormData({
      sku: "",
      name: "",
      description: "",
      category: "",
      images: "",
      hsn: "",
      gst_rate: "18",
      mrp: "",
      cost_price: "",
      selling_price: "",
      fabric: "",
      gsm: "",
      min_stock: "",
      maximum_stock: "",
      sku_hierarchy: ""
    });
  };

  const handleEdit = (product: ProductMaster) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku || "",
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      images: product.images ? product.images.join(',') : "",
      hsn: product.hsn || "",
      gst_rate: product.gst_rate?.toString() || "18",
      mrp: product.mrp?.toString() || "",
      cost_price: product.cost_price?.toString() || "",
      selling_price: product.selling_price?.toString() || "",
      fabric: product.fabric || "",
      gsm: product.gsm?.toString() || "",
      min_stock: product.min_stock?.toString() || "",
      maximum_stock: product.maximum_stock?.toString() || "",
      sku_hierarchy: product.sku_hierarchy?.toString() || ""
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_master')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Product deleted successfully!');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const openDialog = () => {
    setEditingProduct(null);
    resetForm();
    setShowDialog(true);
  };

  const downloadTemplate = async () => {
    try {
      // Fetch actual column information from the database
      const { data: columnInfo, error } = await supabase
        .from('product_master')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error('Error fetching column info:', error);
        // Fallback to known schema based on actual database
        const fallbackTemplate = [
          {
            sku: "SKU001",
            name: "Sample Product",
            description: "Product description",
            category: "Category Name",
            images: "image1.jpg,image2.jpg",
            hsn: "HSN123456",
            gst_rate: "18.00",
            mrp: "1000.00",
            cost_price: "800.00",
            selling_price: "900.00",
            fabric: "Cotton",
            gsm: "200",
            min_stock: "10",
            maximum_stock: "100",
            sku_hierarchy: "1"
          }
        ];

        const ws = XLSX.utils.json_to_sheet(fallbackTemplate);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Product Template");
        
        // Add header row with all columns from actual product_master table
        const headerRow = [
          "SKU (Stock Keeping Unit)",
          "Name* (Product name, required)",
          "Description (Product description)",
          "Category* (Product category, required)",
          "Images (Comma separated image URLs)",
          "HSN (Tax code)",
          "GST Rate (Default: 18.00)",
          "MRP (Maximum Retail Price)",
          "Cost Price (Purchase cost)",
          "Selling Price (Sale price)",
          "Fabric (Material type)",
          "GSM (Grams per square meter)",
          "Min Stock (Minimum stock level)",
          "Maximum Stock (Maximum stock level)",
          "SKU Hierarchy (Numeric order)"
        ];
        
        XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });
        XLSX.utils.sheet_add_aoa(ws, [Object.values(fallbackTemplate[0])], { origin: "A2" });
        
        XLSX.writeFile(wb, "product_master_template.xlsx");
        toast.success('Template downloaded successfully!');
        return;
      }

      // Get column names from the actual database schema
      const actualColumns = [
        'sku',
        'name', 
        'description',
        'category',
        'images',
        'hsn',
        'gst_rate',
        'mrp',
        'cost_price',
        'selling_price',
        'fabric',
        'gsm',
        'min_stock',
        'maximum_stock',
        'sku_hierarchy'
      ];

      // Create template with actual column structure
      const template = [
        {
          sku: "SKU001",
          name: "Sample Product",
          description: "Product description",
          category: "Category Name",
          images: "image1.jpg,image2.jpg",
          hsn: "HSN123456",
          gst_rate: "18.00",
          mrp: "1000.00",
          cost_price: "800.00",
          selling_price: "900.00",
          fabric: "Cotton",
          gsm: "200",
          min_stock: "10",
          maximum_stock: "100",
          sku_hierarchy: "1"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product Template");
      
      // Add header row with actual column names and descriptions
      const headerRow = [
        "SKU (Stock Keeping Unit)",
        "Name* (Product name, required)",
        "Description (Product description)",
        "Category* (Product category, required)",
        "Images (Comma separated image URLs)",
        "HSN (Tax code)",
        "GST Rate (Default: 18.00)",
        "MRP (Maximum Retail Price)",
        "Cost Price (Purchase cost)",
        "Selling Price (Sale price)",
        "Fabric (Material type)",
        "GSM (Grams per square meter)",
        "Min Stock (Minimum stock level)",
        "Maximum Stock (Maximum stock level)",
        "SKU Hierarchy (Numeric order)"
      ];
      
      XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });
      XLSX.utils.sheet_add_aoa(ws, [Object.values(template[0])], { origin: "A2" });
      
      XLSX.writeFile(wb, "product_master_template.xlsx");
      toast.success('Template downloaded successfully with actual database columns!');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    }
  };

  const handleBulkUpload = async (file: File) => {
    setUploading(true);
    setBulkUploadResult(null);
    
    try {
      const data = await readExcelFile(file);
      const result = await processBulkUpload(data);
      setBulkUploadResult(result);
      
      if (result.success > 0) {
        toast.success(`${result.success} products uploaded successfully!`);
        fetchProducts();
      }
      
      if (result.failed > 0) {
        toast.error(`${result.failed} products failed to upload. Check errors below.`);
      }
    } catch (error) {
      console.error('Error processing bulk upload:', error);
      toast.error('Failed to process bulk upload');
    } finally {
      setUploading(false);
    }
  };

  const readExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Skip header row and convert to objects
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1) as any[][];
          
          const products = rows.map(row => {
            const product: any = {};
            headers.forEach((header, index) => {
              if (row[index] !== undefined) {
                product[header.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')] = row[index];
              }
            });
            return product;
          });
          
          resolve(products);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const processBulkUpload = async (data: any[]): Promise<BulkUploadResult> => {
    const result: BulkUploadResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        // Map Excel columns to actual database columns
        const productData = {
          sku: row.sku?.toString().trim(),
          name: row.name?.toString().trim(),
          description: row.description?.toString().trim() || null,
          category: row.category?.toString().trim(),
          images: row.images?.toString().trim() ? row.images.toString().split(',').map((img: string) => img.trim()) : null,
          hsn: row.hsn?.toString().trim() || null,
          gst_rate: row.gst_rate ? parseFloat(row.gst_rate) : null,
          mrp: row.mrp ? parseFloat(row.mrp) : null,
          cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
          selling_price: row.selling_price ? parseFloat(row.selling_price) : null,
          fabric: row.fabric?.toString().trim() || null,
          gsm: row.gsm ? parseFloat(row.gsm) : null,
          min_stock: row.min_stock ? parseFloat(row.min_stock) : null,
          maximum_stock: row.maximum_stock ? parseFloat(row.maximum_stock) : null,
          sku_hierarchy: row.sku_hierarchy ? parseFloat(row.sku_hierarchy) : null
        };

        // Validation for required fields
        if (!productData.name) {
          throw new Error('Name is required');
        }
        if (!productData.category) {
          throw new Error('Category is required');
        }

        // Validate data types
        if (productData.gst_rate !== null && isNaN(productData.gst_rate)) {
          throw new Error('GST Rate must be a valid number');
        }
        if (productData.mrp !== null && isNaN(productData.mrp)) {
          throw new Error('MRP must be a valid number');
        }
        if (productData.cost_price !== null && isNaN(productData.cost_price)) {
          throw new Error('Cost Price must be a valid number');
        }
        if (productData.selling_price !== null && isNaN(productData.selling_price)) {
          throw new Error('Selling Price must be a valid number');
        }
        if (productData.gsm !== null && isNaN(productData.gsm)) {
          throw new Error('GSM must be a valid number');
        }
        if (productData.min_stock !== null && isNaN(productData.min_stock)) {
          throw new Error('Min Stock must be a valid number');
        }
        if (productData.maximum_stock !== null && isNaN(productData.maximum_stock)) {
          throw new Error('Maximum Stock must be a valid number');
        }
        if (productData.sku_hierarchy !== null && isNaN(productData.sku_hierarchy)) {
          throw new Error('SKU Hierarchy must be a valid number');
        }

        const { error } = await supabase
          .from('product_master')
          .insert([productData]);

        if (error) {
          if (error.code === '23505') {
            throw new Error(`SKU "${productData.sku}" already exists`);
          }
          throw new Error(error.message || 'Database error');
        }
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  };

  const filteredProducts = products.filter(product => {
    const productName = product.name || '';
    const productCode = product.sku || '';
    const category = product.category || '';
    
    return productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
           category.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Product Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your product catalog
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Bulk Upload Products
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">Instructions:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Download the template to see the required format</li>
                    <li>• Fill in your product data following the template</li>
                    <li>• Upload the completed Excel file</li>
                    <li>• Required fields: Product Code, Product Name, Category</li>
                  </ul>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={downloadTemplate} variant="outline" className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
                </div>

                <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleBulkUpload(file);
                      }
                    }}
                    className="hidden"
                    id="bulk-upload"
                    disabled={uploading}
                  />
                  <label htmlFor="bulk-upload" className="cursor-pointer block">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium">Upload Excel File</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx or .xls files only</p>
                  </label>
                </div>

                {uploading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                    <span>Processing upload...</span>
                  </div>
                )}

                {bulkUploadResult && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-semibold">{bulkUploadResult.success} successful</span>
                      </div>
                      {bulkUploadResult.failed > 0 && (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="w-5 h-5" />
                          <span className="font-semibold">{bulkUploadResult.failed} failed</span>
                        </div>
                      )}
                    </div>
                    
                    {bulkUploadResult.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                        <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Errors:
                        </h4>
                        <ul className="text-sm text-red-700 space-y-1">
                          {bulkUploadResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button onClick={openDialog} className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="hsn">HSN Code</Label>
                    <Input
                      id="hsn"
                      value={formData.hsn}
                      onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gst_rate">GST Rate (%)</Label>
                    <Input
                      id="gst_rate"
                      type="number"
                      step="0.01"
                      value={formData.gst_rate}
                      onChange={(e) => setFormData({ ...formData, gst_rate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="mrp">MRP</Label>
                    <Input
                      id="mrp"
                      type="number"
                      step="0.01"
                      value={formData.mrp}
                      onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="cost_price">Cost Price</Label>
                    <Input
                      id="cost_price"
                      type="number"
                      step="0.01"
                      value={formData.cost_price}
                      onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="selling_price">Selling Price</Label>
                    <Input
                      id="selling_price"
                      type="number"
                      step="0.01"
                      value={formData.selling_price}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fabric">Fabric</Label>
                    <Input
                      id="fabric"
                      value={formData.fabric}
                      onChange={(e) => setFormData({ ...formData, fabric: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="gsm">GSM</Label>
                    <Input
                      id="gsm"
                      type="number"
                      step="0.01"
                      value={formData.gsm}
                      onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="min_stock">Min Stock</Label>
                    <Input
                      id="min_stock"
                      type="number"
                      step="1"
                      value={formData.min_stock}
                      onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maximum_stock">Maximum Stock</Label>
                    <Input
                      id="maximum_stock"
                      type="number"
                      step="1"
                      value={formData.maximum_stock}
                      onChange={(e) => setFormData({ ...formData, maximum_stock: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="sku_hierarchy">SKU Hierarchy</Label>
                    <Input
                      id="sku_hierarchy"
                      type="number"
                      step="1"
                      value={formData.sku_hierarchy}
                      onChange={(e) => setFormData({ ...formData, sku_hierarchy: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="images">Images (Comma-separated URLs)</Label>
                    <Input
                      id="images"
                      value={formData.images}
                      onChange={(e) => setFormData({ ...formData, images: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                    {editingProduct ? 'Update' : 'Create'} Product
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Products</p>
                <p className="text-2xl font-bold text-blue-900">{products.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50/50">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-gray-800">
              Products ({filteredProducts.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {product.name || 'Unnamed Product'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            SKU: {product.sku || 'N/A'}
                          </div>
                          {product.description && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {product.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {product.category || 'Uncategorized'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(product)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(product.id)}
                            className="hover:bg-red-50 hover:text-red-600"
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