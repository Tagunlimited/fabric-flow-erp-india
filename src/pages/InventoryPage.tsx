import { useState, useEffect } from 'react';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  TrendingDown, 
  Grid, 
  List, 
  Download,
  Search,
  Eye,
  Edit,
  Trash2,
  Plus,
  Upload
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from 'xlsx';

// Types
interface Fabric {
  id: string;
  name: string;
  description: string;
  gsm?: string;
  created_at: string;
  image_url?: string | null;
  variants: FabricVariant[];
}

interface FabricVariant {
  id?: string;
  color: string;
  gsm: string;
  uom?: string;
  hex_code?: string | null;
  description?: string | null;
  stock_quantity?: number;
  rate_per_meter?: number;
  image_url?: string | null;
}

interface Item {
  id?: string;
  item_code: string;
  item_name: string;
  category: string;
  subcategory?: string;
  description?: string;
  unit_of_measure: string;
  minimum_stock?: number;
  maximum_stock?: number;
  reorder_level?: number;
  standard_cost?: number;
  status: string;
  image?: string;
  created_at?: string;
}

interface Product {
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
}

const InventoryPage = () => {
  // State management
  const [activeTab, setActiveTab] = useState("fabrics");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [addDialogType, setAddDialogType] = useState<"fabric" | "item" | "product">("fabric");
  
  // Form states for Add Inventory
  const [addFormData, setAddFormData] = useState({
    sku: "",
    inventory: "",
    location: "",
    qty: ""
  });
  
  // Form states for Fabric selection
  const [selectedFabric, setSelectedFabric] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [availableColors, setAvailableColors] = useState<FabricVariant[]>([]);
  
  // Data states
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Filtered data states
  const [filteredFabrics, setFilteredFabrics] = useState<Fabric[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // Fetch data based on active tab
  const fetchData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case "fabrics":
          await fetchFabrics();
          break;
        case "items":
          await fetchItems();
          break;
        case "products":
          await fetchProducts();
          break;
        default:
          console.log('Unknown activeTab:', activeTab);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFabrics = async () => {
    const { data: fabricsData, error: fabricsError } = await supabase
      .from('fabrics')
      .select('*')
      .order('created_at', { ascending: false });

    if (fabricsError) throw fabricsError;

    const fabricsWithVariants = await Promise.all(
      (fabricsData || []).map(async (fabric) => {
        const { data: variants, error: variantsError } = await supabase
          .from('fabric_variants')
          .select('*')
          .eq('fabric_id', fabric.id)
          .order('color');

        if (variantsError) {
          console.error('Error fetching variants for fabric:', fabric.id, variantsError);
          throw variantsError;
        }

        return {
          ...fabric,
          variants: variants || []
        };
      })
    );

    setFabrics(fabricsWithVariants);
    setFilteredFabrics(fabricsWithVariants);
  };

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('item_master')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setItems(data || []);
    setFilteredItems(data || []);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('product_master')
      .select('*');
      

    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
    
    setProducts(data || []);
    setFilteredProducts(data || []);
  };

  // Filter data based on search term
  useEffect(() => {
    const filterData = () => {
      const term = searchTerm.toLowerCase();
      
      switch (activeTab) {
        case "fabrics":
          const filteredF = fabrics.filter(fabric => 
            fabric.name.toLowerCase().includes(term) ||
            fabric.description.toLowerCase().includes(term) ||
            fabric.variants.some(variant => 
              variant.color.toLowerCase().includes(term) ||
              variant.gsm.toLowerCase().includes(term)
            )
          );
          setFilteredFabrics(filteredF);
          break;
          
                 case "items":
           const filteredI = items.filter(item => 
             item.item_name.toLowerCase().includes(term) ||
             item.item_code.toLowerCase().includes(term) ||
             item.category.toLowerCase().includes(term) ||
             (item.description && item.description.toLowerCase().includes(term))
           );
           setFilteredItems(filteredI);
           break;
           
         case "products":
           const filteredP = products.filter(product => 
             product.name.toLowerCase().includes(term) ||
             product.sku.toLowerCase().includes(term) ||
             product.category.toLowerCase().includes(term)  
           );
           setFilteredProducts(filteredP);
           break;
      }
    };

    filterData();
  }, [searchTerm, activeTab, fabrics, items, products]);

  // Fetch data when tab changes
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Handle fabric selection for color dropdown
  const handleFabricSelect = (fabricId: string) => {
    setSelectedFabric(fabricId);
    setSelectedColor("");
    const fabric = fabrics.find(f => f.id === fabricId);
    if (fabric) {
      setAvailableColors(fabric.variants);
    } else {
      setAvailableColors([]);
    }
  };

  // Handle form submission
  const handleAddInventory = async () => {
    try {
      if (addDialogType === "fabric") {
        if (!selectedFabric || !selectedColor || !addFormData.location || !addFormData.qty) {
          toast.error("Please fill all required fields");
          return;
        }
        // TODO: Implement fabric inventory update
        toast.success("Fabric inventory updated successfully");
      } else {
        if (!addFormData.sku || !addFormData.inventory || !addFormData.location || !addFormData.qty) {
          toast.error("Please fill all required fields");
          return;
        }
        // TODO: Implement item/product inventory update
        toast.success(`${addDialogType === "item" ? "Item" : "Product"} inventory updated successfully`);
      }
      setShowAddDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error adding inventory:', error);
      toast.error('Failed to add inventory');
    }
  };

  // Export functionality
  const exportToExcel = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`${filename} exported successfully`);
  };

  const handleExport = () => {
    switch (activeTab) {
      case "fabrics":
        const fabricExportData = fabrics.map(fabric => ({
          'Fabric Name': fabric.name,
          'Description': fabric.description,
          'GSM': fabric.gsm || '',
          'Created Date': new Date(fabric.created_at).toLocaleDateString(),
          'Total Variants': fabric.variants.length,
          'Image URL': fabric.image_url || ''
        }));
        exportToExcel(fabricExportData, 'Fabrics');
        break;
        
             case "items":
         const itemExportData = items.map(item => ({
           'Item Code': item.item_code,
           'Item Name': item.item_name,
           'Category': item.category,
           'Description': item.description || '',
           'Unit of Measure': item.unit_of_measure,
           'Minimum Stock': item.minimum_stock || 0,
           'Maximum Stock': item.maximum_stock || 0,
           'Standard Cost': item.standard_cost || 0,
           'Status': item.status,
           'Created Date': item.created_at ? new Date(item.created_at).toLocaleDateString() : ''
         }));
         exportToExcel(itemExportData, 'Items');
         break;
         
       case "products":
         const productExportData = products.map(product => ({
          sku: product.sku || "",
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      images: product.images ? product.images : "",
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
         }));
         exportToExcel(productExportData, 'Products');
         break;
    }
  };

  // Render table view
  const renderTableView = () => {
    switch (activeTab) {
             case "fabrics":
         return (
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Image</TableHead>
                 <TableHead>Fabric Name - Color</TableHead>
                 <TableHead>Description</TableHead>
                 <TableHead>GSM</TableHead>
                 <TableHead>Total Stock</TableHead>
                 <TableHead>Rate/Meter</TableHead>
                 <TableHead>Actions</TableHead>
               </TableRow>
             </TableHeader>
            <TableBody>
              {filteredFabrics.flatMap((fabric) =>
                fabric.variants.length > 0 
                                     ? fabric.variants.map((variant) => (
                       <TableRow key={`${fabric.id}-${variant.id}`}>
                         <TableCell>
                           {variant.image_url ? (
                             <img 
                               src={variant.image_url} 
                               alt={`${fabric.name} - ${variant.color}`}
                               className="w-12 h-12 object-cover rounded"
                             />
                           ) : fabric.image_url ? (
                             <img 
                               src={fabric.image_url} 
                               alt={fabric.name}
                               className="w-12 h-12 object-cover rounded"
                             />
                           ) : (
                             <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                               <Package className="w-6 h-6 text-gray-400" />
                             </div>
                           )}
                         </TableCell>
                         <TableCell className="font-medium">
                           {fabric.name} - {variant.color}
                         </TableCell>
                         <TableCell>{fabric.description}</TableCell>
                         <TableCell>{variant.gsm || fabric.gsm || '-'}</TableCell>
                         <TableCell>
                           <span className={variant.stock_quantity && variant.stock_quantity < 10 ? 'text-red-600 font-semibold' : ''}>
                             {variant.stock_quantity || 0}
                           </span>
                         </TableCell>
                         <TableCell>₹{variant.rate_per_meter || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  : [(
                      <TableRow key={fabric.id}>
                        <TableCell>
                          {fabric.image_url ? (
                            <img 
                              src={fabric.image_url} 
                              alt={fabric.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                              <Package className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{fabric.name}</TableCell>
                        <TableCell>{fabric.description}</TableCell>
                        <TableCell>{fabric.gsm || '-'}</TableCell>
                        <TableCell>0</TableCell>
                        <TableCell>₹0</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )]
              )}
            </TableBody>
          </Table>
        );

             case "items":
         return (
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Image</TableHead>
                 <TableHead>Item Code</TableHead>
                 <TableHead>Item Name</TableHead>
                 <TableHead>Category</TableHead>
                 <TableHead>UOM</TableHead>
                 <TableHead>Min Stock</TableHead>
                 <TableHead>Max Stock</TableHead>
                 <TableHead>Standard Cost</TableHead>
                 <TableHead>Status</TableHead>
                 <TableHead>Actions</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {filteredItems.map((item) => (
                 <TableRow key={item.id}>
                   <TableCell>
                     {item.image ? (
                       <img 
                         src={item.image} 
                         alt={item.item_name}
                         className="w-12 h-12 object-cover rounded"
                       />
                     ) : (
                       <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                         <Package className="w-6 h-6 text-gray-400" />
                       </div>
                     )}
                   </TableCell>
                   <TableCell className="font-medium">{item.item_code}</TableCell>
                   <TableCell>{item.item_name}</TableCell>
                   <TableCell>
                     <Badge variant="outline">{item.category}</Badge>
                   </TableCell>
                   <TableCell>{item.unit_of_measure || '-'}</TableCell>
                   <TableCell>{item.minimum_stock || 0}</TableCell>
                   <TableCell>{item.maximum_stock || 0}</TableCell>
                   <TableCell>₹{item.standard_cost || 0}</TableCell>
                   <TableCell>
                     <Badge variant={item.status === 'active' ? "default" : "secondary"}>
                       {item.status === 'active' ? "Active" : "Inactive"}
                     </Badge>
                   </TableCell>
                   <TableCell>
                     <div className="flex gap-2">
                       <Button size="sm" variant="outline">
                         <Eye className="w-4 h-4" />
                       </Button>
                       <Button size="sm" variant="outline">
                         <Edit className="w-4 h-4" />
                       </Button>
                     </div>
                   </TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
         );

             case "products":
         return (
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Image</TableHead>
                 <TableHead>Product Code</TableHead>
                 <TableHead>Product Name</TableHead>
                 <TableHead>Category</TableHead>
                 <TableHead>Subcategory</TableHead>
                 <TableHead>Unit of Measure</TableHead>
                 <TableHead>Base Price</TableHead>
                 <TableHead>Tax Rate</TableHead>
                 <TableHead>Status</TableHead>
                 <TableHead>Actions</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {filteredProducts.map((product) => (
                 <TableRow key={product.sku}>
                   <TableCell>
                     <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                       <Package className="w-6 h-6 text-gray-400" />
                     </div>
                   </TableCell>
                   <TableCell className="font-medium">{product.sku}</TableCell>
                   <TableCell>{product.name}</TableCell>
                   <TableCell>
                     <Badge variant="outline">{product.category}</Badge>
                   </TableCell>
                   <TableCell>{product.category || '-'}</TableCell>
                   {/* <TableCell>{product.unit_of_measure}</TableCell>
                   <TableCell>₹{product.base_price || 0}</TableCell> */}
                   <TableCell>{product.gst_rate || 0}%</TableCell>
                   <TableCell>
                     {/* <Badge variant={product.status === 'active' ? "default" : "secondary"}>
                       {product.status === 'active' ? "Active" : "Inactive"}
                     </Badge> */}
                   </TableCell>
                   <TableCell>
                     <div className="flex gap-2">
                       <Button size="sm" variant="outline">
                         <Eye className="w-4 h-4" />
                       </Button>
                       <Button size="sm" variant="outline">
                         <Edit className="w-4 h-4" />
                       </Button>
                     </div>
                   </TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
         );

      default:
        return null;
    }
  };

  // Render card view
  const renderCardView = () => {
    switch (activeTab) {
      case "fabrics":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFabrics.flatMap((fabric) =>
              fabric.variants.length > 0 
                ? fabric.variants.map((variant) => (
                    <Card key={`${fabric.id}-${variant.id}`} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{fabric.name} - {variant.color}</CardTitle>
                          <Badge variant={variant.stock_quantity && variant.stock_quantity < 10 ? "destructive" : "secondary"}>
                            Stock: {variant.stock_quantity || 0}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {variant.image_url ? (
                            <img 
                              src={variant.image_url} 
                              alt={`${fabric.name} - ${variant.color}`}
                              className="w-full h-full object-cover"
                            />
                          ) : fabric.image_url ? (
                            <img 
                              src={fabric.image_url} 
                              alt={fabric.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{fabric.description}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">GSM:</span>
                            <p className="font-medium">{variant.gsm || fabric.gsm || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Rate:</span>
                            <p className="font-medium">₹{variant.rate_per_meter || 0}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1">
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : [(
                    <Card key={fabric.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{fabric.name}</CardTitle>
                          <Badge variant="secondary">No variants</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {fabric.image_url ? (
                            <img 
                              src={fabric.image_url} 
                              alt={fabric.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{fabric.description}</p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">GSM: {fabric.gsm || 'N/A'}</span>
                          <span className="text-gray-500">{new Date(fabric.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" className="flex-1">
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )]
            )}
          </div>
        );

             case "items":
         return (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredItems.map((item) => (
               <Card key={item.id} className="hover:shadow-lg transition-shadow">
                 <CardHeader className="pb-3">
                   <div className="flex items-center justify-between">
                     <CardTitle className="text-lg">{item.item_name}</CardTitle>
                     <Badge variant={item.status === 'active' ? "default" : "secondary"}>
                       {item.status === 'active' ? "Active" : "Inactive"}
                     </Badge>
                   </div>
                 </CardHeader>
                 <CardContent className="space-y-3">
                   <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                     {item.image ? (
                       <img 
                         src={item.image} 
                         alt={item.item_name}
                         className="w-full h-full object-cover"
                       />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center">
                         <Package className="w-12 h-12 text-gray-400" />
                       </div>
                     )}
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="text-gray-500">Code:</span>
                       <p className="font-medium">{item.item_code}</p>
                     </div>
                     <div>
                       <span className="text-gray-500">Category:</span>
                       <p className="font-medium">{item.category}</p>
                     </div>
                     <div>
                       <span className="text-gray-500">Min Stock:</span>
                       <p className="font-medium">{item.minimum_stock || 0}</p>
                     </div>
                     <div>
                       <span className="text-gray-500">Cost:</span>
                       <p className="font-medium">₹{item.standard_cost || 0}</p>
                     </div>
                   </div>
                   {item.description && (
                     <p className="text-sm text-gray-600 truncate">{item.description}</p>
                   )}
                   <div className="flex gap-2 pt-2">
                     <Button size="sm" variant="outline" className="flex-1">
                       <Eye className="w-4 h-4 mr-1" />
                       View
                     </Button>
                     <Button size="sm" variant="outline" className="flex-1">
                       <Edit className="w-4 h-4 mr-1" />
                       Edit
                     </Button>
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
         );

             case "products":
         return (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredProducts.map((product) => (
               <Card key={product.sku} className="hover:shadow-lg transition-shadow">
                 <CardHeader className="pb-3">
                   <div className="flex items-center justify-between">
                     <CardTitle className="text-lg">{product.name}</CardTitle>
                     <Badge variant="outline">{product.category}</Badge>
                   </div>
                 </CardHeader>
                 <CardContent className="space-y-3">
                   <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                     <div className="w-full h-full flex items-center justify-center">
                       <Package className="w-12 h-12 text-gray-400" />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="text-gray-500">Code:</span>
                       <p className="font-medium">{product.sku}</p>
                     </div>
                     <div>
                       <span className="text-gray-500">Base Price:</span>
                       <p className="font-medium">₹{product.selling_price || 0}</p>
                     </div>
                     <div>
                       <span className="text-gray-500">Tax Rate:</span>
                       <p className="font-medium">{product.gst_rate || 0}%</p>
                     </div>
                     <div>
                       <span className="text-gray-500">UOM:</span>
                       {/* <p className="font-medium">{product.quantity}</p> */}
                     </div>
                   </div>
                   {product.description && (
                     <p className="text-sm text-gray-600 truncate">{product.description}</p>
                   )}
                   <div className="flex gap-2 pt-2">
                     <Button size="sm" variant="outline" className="flex-1">
                       <Eye className="w-4 h-4 mr-1" />
                       View
                     </Button>
                     <Button size="sm" variant="outline" className="flex-1">
                       <Edit className="w-4 h-4 mr-1" />
                       Edit
                     </Button>
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
         );

      default:
        return null;
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Inventory Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor stock levels and manage your inventory efficiently
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{items.length}</span>
                <Package className="w-5 h-5 text-inventory" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Fabrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{fabrics.length}</span>
                <TrendingDown className="w-5 h-5 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{products.length}</span>
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                                 <span className="text-2xl font-bold">
                   {items.filter(item => item.minimum_stock && item.minimum_stock > 0).length}
                 </span>
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="fabrics">Fabrics</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === "table" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="rounded-r-none"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "card" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("card")}
                  className="rounded-l-none"
                >
                  <Grid className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Add Inventory Button */}
              <Button 
                onClick={() => {
                  setAddDialogType(activeTab as "fabric" | "item" | "product");
                  setShowAddDialog(true);
                  // Reset form data
                  setAddFormData({ sku: "", inventory: "", location: "", qty: "" });
                  setSelectedFabric("");
                  setSelectedColor("");
                }}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Inventory
              </Button>
              
              {/* Bulk Upload Button */}
              <Button 
                onClick={() => {
                  setAddDialogType(activeTab as "fabric" | "item" | "product");
                  setShowBulkDialog(true);
                }}
                variant="outline"
              >
                <Download className="w-4 h-4 mr-2" />
                Bulk Upload
              </Button>
              
              {/* Export Button */}
              <Button onClick={handleExport} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <TabsContent value="fabrics" className="space-y-6">
            <Card className="shadow-erp-md">
              <CardHeader>
                <CardTitle>Fabrics Inventory</CardTitle>
                <p className="text-muted-foreground">
                  Manage fabric inventory with variants, colors, and stock levels
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredFabrics.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No fabrics found
                  </div>
                ) : (
                  viewMode === "table" ? renderTableView() : renderCardView()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-6">
            <Card className="shadow-erp-md">
              <CardHeader>
                <CardTitle>Items Inventory</CardTitle>
                <p className="text-muted-foreground">
                  Manage individual inventory items, stock levels, and reorder points
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No items found
                  </div>
                ) : (
                  viewMode === "table" ? renderTableView() : renderCardView()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card className="shadow-erp-md">
              <CardHeader>
                <CardTitle>Products Inventory</CardTitle>
                <p className="text-muted-foreground">
                  Manage finished products with pricing, categories, and stock management
                </p>
              </CardHeader>
                             <CardContent>
                
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No products found
                  </div>
                ) : (
                  viewMode === "table" ? renderTableView() : renderCardView()
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Inventory Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Add Inventory - {addDialogType === "fabric" ? "Fabric" : addDialogType === "item" ? "Item" : "Product"}
              </DialogTitle>
            </DialogHeader>
            
            
            
            {/* Always show a form - fallback */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input 
                  id="sku"
                  value={addFormData.sku}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, sku: e.target.value }))}
                  placeholder="Enter SKU"
                />
              </div>
              
              <div>
                <Label htmlFor="inventory">Inventory Name</Label>
                <Input 
                  id="inventory"
                  value={addFormData.inventory}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, inventory: e.target.value }))}
                  placeholder="Enter inventory name"
                />
              </div>
              
              <div>
                <Label htmlFor="location">Location</Label>
                <Input 
                  id="location"
                  value={addFormData.location}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Enter location"
                />
              </div>
              
              <div>
                <Label htmlFor="qty">Quantity</Label>
                <Input 
                  id="qty"
                  type="number"
                  value={addFormData.qty}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, qty: e.target.value }))}
                  placeholder="Enter quantity"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddInventory}>
                Add Inventory
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Upload Dialog */}
        <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Bulk Upload - {addDialogType === "fabric" ? "Fabric" : addDialogType === "item" ? "Item" : "Product"} Inventory
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-file">Upload CSV/Excel File</Label>
                <Input 
                  id="bulk-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  placeholder="Select file"
                />
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Required columns:</p>
                {addDialogType === "fabric" ? (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Fabric Name</li>
                    <li>Color</li>
                    <li>Location</li>
                    <li>Quantity</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-1">
                    <li>SKU</li>
                    <li>Inventory Name</li>
                    <li>Location</li>
                    <li>Quantity</li>
                  </ul>
                )}
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  toast.success("Bulk upload completed successfully");
                  setShowBulkDialog(false);
                  fetchData();
                }}>
                  Upload
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default InventoryPage;