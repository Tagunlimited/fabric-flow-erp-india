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
import { Plus, Edit, Trash2, Search, Download, Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import * as XLSX from 'xlsx';

interface ProductMaster {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  subcategory?: string;
  description?: string;
  unit_of_measure: string;
  base_price?: number;
  cost_price?: number;
  hsn_code?: string;
  tax_rate: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
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
    product_code: "",
    product_name: "",
    category: "",
    subcategory: "",
    description: "",
    unit_of_measure: "PCS",
    base_price: "",
    cost_price: "",
    hsn_code: "",
    tax_rate: "18",
    status: "active" as const
  });

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('product_master')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
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
      const productData = {
        product_code: formData.product_code,
        product_name: formData.product_name,
        category: formData.category,
        subcategory: formData.subcategory || null,
        description: formData.description || null,
        unit_of_measure: formData.unit_of_measure,
        base_price: formData.base_price ? parseFloat(formData.base_price) : null,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
        hsn_code: formData.hsn_code || null,
        tax_rate: parseFloat(formData.tax_rate),
        status: formData.status
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('product_master')
          .update(productData)
          .eq('id', editingProduct.id);
        
        if (error) throw error;
        toast.success('Product updated successfully!');
      } else {
        const { error } = await supabase
          .from('product_master')
          .insert([productData]);
        
        if (error) throw error;
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
      product_code: "",
      product_name: "",
      category: "",
      subcategory: "",
      description: "",
      unit_of_measure: "PCS",
      base_price: "",
      cost_price: "",
      hsn_code: "",
      tax_rate: "18",
      status: "active"
    });
  };

  const handleEdit = (product: ProductMaster) => {
    setEditingProduct(product);
    setFormData({
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category,
      subcategory: product.subcategory || "",
      description: product.description || "",
      unit_of_measure: product.unit_of_measure,
      base_price: product.base_price?.toString() || "",
      cost_price: product.cost_price?.toString() || "",
      hsn_code: product.hsn_code || "",
      tax_rate: product.tax_rate.toString(),
      status: product.status
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

  const downloadTemplate = () => {
    const template = [
      {
        product_code: "PROD001",
        product_name: "Sample Product",
        category: "Category Name",
        subcategory: "Subcategory Name",
        description: "Product description",
        unit_of_measure: "PCS",
        base_price: "100.00",
        cost_price: "80.00",
        hsn_code: "HSN123456",
        tax_rate: "18.00",
        status: "active"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Template");
    
    // Add header row with column descriptions
    const headerRow = [
      "Product Code* (Unique identifier)",
      "Product Name* (Product name)",
      "Category* (Product category)",
      "Subcategory (Optional subcategory)",
      "Description (Product description)",
      "Unit of Measure* (PCS, KG, M, etc.)",
      "Base Price (Selling price)",
      "Cost Price (Purchase cost)",
      "HSN Code (Tax code)",
      "Tax Rate (Default: 18.00)",
      "Status (active/inactive)"
    ];
    
    XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });
    XLSX.utils.sheet_add_aoa(ws, [template[0]], { origin: "A2" });
    
    XLSX.writeFile(wb, "product_master_template.xlsx");
    toast.success('Template downloaded successfully!');
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
        const productData = {
          product_code: row.product_code?.toString().trim(),
          product_name: row.product_name?.toString().trim(),
          category: row.category?.toString().trim(),
          subcategory: row.subcategory?.toString().trim() || null,
          description: row.description?.toString().trim() || null,
          unit_of_measure: row.unit_of_measure?.toString().trim() || 'PCS',
          base_price: row.base_price ? parseFloat(row.base_price) : null,
          cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
          hsn_code: row.hsn_code?.toString().trim() || null,
          tax_rate: row.tax_rate ? parseFloat(row.tax_rate) : 18.00,
          status: row.status?.toString().trim() || 'active'
        };

        // Validation
        if (!productData.product_code || !productData.product_name || !productData.category) {
          throw new Error('Missing required fields: product_code, product_name, category');
        }

        const { error } = await supabase
          .from('product_master')
          .insert([productData]);

        if (error) throw error;
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  };

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Product Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your product catalog and inventory
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
                    <Label htmlFor="product_code">Product Code *</Label>
                    <Input
                      id="product_code"
                      value={formData.product_code}
                      onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="product_name">Product Name *</Label>
                    <Input
                      id="product_name"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
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
                    <Label htmlFor="subcategory">Subcategory</Label>
                    <Input
                      id="subcategory"
                      value={formData.subcategory}
                      onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    />
                  </div>
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

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="unit_of_measure">Unit of Measure *</Label>
                    <Select value={formData.unit_of_measure} onValueChange={(value) => setFormData({ ...formData, unit_of_measure: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PCS">PCS</SelectItem>
                        <SelectItem value="KG">KG</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="BOX">BOX</SelectItem>
                        <SelectItem value="SET">SET</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="base_price">Base Price</Label>
                    <Input
                      id="base_price"
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                    />
                  </div>
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
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="hsn_code">HSN Code</Label>
                    <Input
                      id="hsn_code"
                      value={formData.hsn_code}
                      onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                    <Input
                      id="tax_rate"
                      type="number"
                      step="0.01"
                      value={formData.tax_rate}
                      onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value: 'active' | 'inactive') => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <TableHead className="font-semibold">Pricing</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        <div>
                          <div className="font-semibold text-gray-900">{product.product_name}</div>
                          <div className="text-sm text-muted-foreground">
                            Code: {product.product_code}
                          </div>
                          {product.description && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {product.description}
                            </div>
                          )}
                          {product.subcategory && (
                            <div className="text-xs text-blue-600 mt-1">
                              {product.subcategory}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {product.base_price && (
                            <div className="font-semibold text-green-600">
                              ₹{product.base_price.toLocaleString()}
                            </div>
                          )}
                          {product.cost_price && (
                            <div className="text-sm text-muted-foreground">
                              Cost: ₹{product.cost_price.toLocaleString()}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {product.unit_of_measure} • Tax: {product.tax_rate}%
                          </div>
                          {product.hsn_code && (
                            <div className="text-xs text-gray-500">
                              HSN: {product.hsn_code}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={product.status === 'active' ? 'default' : 'secondary'}
                          className={product.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                        >
                          {product.status}
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