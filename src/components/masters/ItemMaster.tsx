import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/utils";
import Papa from "papaparse";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../ui/Table";
import { Badge } from "../ui/Badge";
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
  "tax_rate",
  "is_active",
  "image"
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
  tax_rate?: number;
  is_active?: boolean;
  image?: string;
  created_at?: string;
}

export function ItemMaster() {
  // State management
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  // Form state
  const [formData, setFormData] = useState<Omit<Item, 'id' | 'created_at'>>({
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
    tax_rate: 0,
    is_active: true,
    image: ""
  });

  // Initialize Supabase client only once
  useEffect(() => {
    fetchItems();
  }, []);

  // Filter items based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(items);
    } else {
      const filtered = items.filter(item =>
        item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, items]);

  // Fetch items from Supabase
  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('item_master')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setItems(data || []);
      setFilteredItems(data || []);
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
          tax_rate: itemToEdit.tax_rate || 0,
          is_active: itemToEdit.is_active || true,
          image: itemToEdit.image || ""
        });
      }
    }
  }, [editMode, currentItemId, items]);

  // Handle form submission (both add and edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      if (editMode && currentItemId) {
        // Update existing item
        const { error } = await supabase
          .from('item_master')
          .update(formData)
          .eq('id', currentItemId);
        
        if (error) throw error;
      } else {
        // Add new item
        const { error } = await supabase
          .from('item_master')
          .insert([formData]);
        
        if (error) throw error;
      }
      
      setShowDialog(false);
      await fetchItems();
      resetForm();
    } catch (error) {
      console.error('Error saving item:', error);
    } finally {
      setLoading(false);
    }
  };

  // Reset form to default values
  const resetForm = () => {
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
      tax_rate: 0,
      is_active: true,
      image: ""
    });
    setEditMode(false);
    setCurrentItemId(null);
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
          .eq('id', itemId);
        
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
        tax_rate: item.tax_rate ? Number(item.tax_rate) : 0,
        is_active: item.is_active ? item.is_active.toString().toLowerCase() === 'true' : true
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
    <div className="space-y-8">
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
              resetForm();
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
        <DialogContent className="max-w-4xl overflow-y-auto max-h-screen">
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
                <Input
                  value={formData.uom}
                  onChange={(e) => setFormData({...formData, uom: e.target.value})}
                />
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
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({...formData, tax_rate: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label>Image URL</Label>
                <Input
                  value={formData.image}
                  onChange={(e) => setFormData({...formData, image: e.target.value})}
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
      <Card className="shadow-erp-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-2xl font-bold">Items ({filteredItems.length})</CardTitle>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-full shadow"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              {items.length === 0 ? "No items found" : "No matching items found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead>Item</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-blue-50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {item.image && (
                            <img src={item.image} alt={item.item_name} className="h-11 w-11 rounded border object-cover" />
                          )}
                          <div>
                            <div className="font-semibold">{item.item_name}</div>
                            {item.brand && (
                              <div className="text-xs text-muted-foreground">{item.brand}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.item_code}</TableCell>
                      <TableCell>{item.item_type}</TableCell>
                      <TableCell>
                        <div>
                          <div>{item.current_stock} {item.uom}</div>
                          {item.min_stock_level && item.current_stock <= item.min_stock_level && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Low Stock
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        ${item.cost_price?.toFixed(2)}
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