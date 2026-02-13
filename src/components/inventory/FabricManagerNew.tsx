import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Download, Upload, Settings, GripVertical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FabricMaster {
  id?: string;
  fabric_code: string;
  fabric_description?: string;
  fabric_name: string;
  fabric_for_supplier?: string;
  type?: string;
  color?: string;
  hex?: string;
  gsm?: string;
  uom?: string;
  rate?: number;
  hsn_code?: string;
  gst?: number;
  image?: string;
  inventory?: number;
  supplier1?: string;
  supplier2?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_FABRIC: FabricMaster = {
  fabric_code: '',
  fabric_description: '',
  fabric_name: '',
  fabric_for_supplier: '',
  type: '',
  color: '',
  hex: '',
  gsm: '',
  uom: 'meters',
  rate: 0,
  hsn_code: '',
  gst: 18.00,
  image: '',
  inventory: 0,
  supplier1: '',
  supplier2: '',
  status: 'active'
};

const BULK_TEMPLATE_HEADERS = [
  'fabric_code',
  'fabric_description', 
  'fabric_name',
  'fabric_for_supplier',
  'type',
  'color',
  'hex',
  'gsm',
  'uom',
  'rate',
  'hsn_code',
  'gst',
  'image',
  'inventory',
  'supplier1',
  'supplier2'
];

export function FabricManagerNew() {
  const [fabrics, setFabrics] = useState<FabricMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [editingFabric, setEditingFabric] = useState<FabricMaster | null>(null);
  const [fabricImageFile, setFabricImageFile] = useState<File | null>(null);
  const [fabricImagePreview, setFabricImagePreview] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = localStorage.getItem('fabric-table-column-widths');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback to default if parsing fails
      }
    }
    return {
      code: 80,
      fabricDetails: 160,
      type: 96,
      color: 128,
      gsm: 64,
      rate: 80,
      inventory: 96,
      status: 80,
      actions: 96
    };
  });
  
  const [formData, setFormData] = useState<FabricMaster>(DEFAULT_FABRIC);

  // Fetch fabrics from fabric_master table with inventory totals
  const fetchFabrics = async () => {
    try {
      setLoading(true);
      
      // Fetch fabrics
      const { data: fabricsData, error: fabricsError } = await supabase
        .from('fabric_master')
        .select('*')
        .order('created_at', { ascending: false });

      if (fabricsError) throw fabricsError;

      // Fetch warehouse inventory to calculate totals
      const [warehouseInventoryResult, fabricInventoryResult, grnFabricDetailsResult] = await Promise.all([
        supabase
          .from('warehouse_inventory')
          .select(`
            quantity,
            grn_item:grn_item_id (
              fabric_name,
              item_name,
              item_type
            )
          `),
        supabase
          .from('fabric_inventory')
          .select(`
            fabric_id,
            quantity
          `),
        supabase
          .from('grn_items_fabric_details')
          .select(`
            fabric_id,
            approved_quantity,
            grn_item:grn_item_id (
              warehouse_inventory (
                quantity
              )
            )
          `)
      ]);

      const { data: warehouseInventoryData, error: warehouseInventoryError } = warehouseInventoryResult;
      const { data: fabricInventoryData, error: fabricInventoryError } = fabricInventoryResult;
      const { data: grnFabricDetailsData, error: grnFabricDetailsError } = grnFabricDetailsResult;

      if (warehouseInventoryError) {
        console.warn('Could not fetch warehouse inventory data:', warehouseInventoryError);
      }
      if (fabricInventoryError) {
        console.warn('Could not fetch fabric inventory data:', fabricInventoryError);
      }
      if (grnFabricDetailsError) {
        console.warn('Could not fetch GRN fabric details data:', grnFabricDetailsError);
      }

      // Calculate total inventory for each fabric
      const inventoryTotals: { [key: string]: number } = {};
      
      // Add fabric inventory data (direct fabric_id matches)
      if (fabricInventoryData) {
        (fabricInventoryData as any[]).forEach(item => {
          if (item.fabric_id && item.quantity) {
            inventoryTotals[item.fabric_id] = (inventoryTotals[item.fabric_id] || 0) + item.quantity;
          }
        });
      }

      // Add GRN fabric details data (direct fabric_id matches)
      if (grnFabricDetailsData) {
        (grnFabricDetailsData as any[]).forEach(item => {
          if (item.fabric_id && item.approved_quantity) {
            inventoryTotals[item.fabric_id] = (inventoryTotals[item.fabric_id] || 0) + item.approved_quantity;
          }
        });
      }

      // Add warehouse inventory data (name-based matching)
      if (warehouseInventoryData) {
        console.log('Processing warehouse inventory for name-based matching...');
        (warehouseInventoryData as any[]).forEach(item => {
          const fabricName = item.grn_item?.fabric_name;
          const itemName = item.grn_item?.item_name;
          const itemType = item.grn_item?.item_type;
          
          if (item.quantity && (fabricName || (itemType === 'fabric' && itemName))) {
            // Try to match by fabric name first
            let matchingFabric = null;
            if (fabricName) {
              matchingFabric = (fabricsData as any[]).find(fabric => 
                fabric.fabric_name?.toLowerCase() === fabricName.toLowerCase()
              );
            }
            
            // If no match by fabric name, try by item name for fabric type
            if (!matchingFabric && itemType === 'fabric' && itemName) {
              matchingFabric = (fabricsData as any[]).find(fabric => 
                fabric.fabric_name?.toLowerCase() === itemName.toLowerCase()
              );
            }
            
            if (matchingFabric) {
              inventoryTotals[matchingFabric.id] = (inventoryTotals[matchingFabric.id] || 0) + item.quantity;
              console.log(`Matched fabric: ${fabricName || itemName} -> ${matchingFabric.fabric_name} (ID: ${matchingFabric.id}) - Qty: ${item.quantity}`);
            } else {
              console.log(`No fabric match found for: ${fabricName || itemName} (Type: ${itemType})`);
            }
          }
        });
      }

      console.log('Final inventory totals calculated:', inventoryTotals);
      console.log('Warehouse inventory data:', warehouseInventoryData);
      console.log('Fabric inventory data:', fabricInventoryData);
      console.log('GRN fabric details data:', grnFabricDetailsData);

      // Merge fabrics with inventory totals
      const fabricsWithInventory = (fabricsData as any[]).map(fabric => ({
        ...fabric,
        inventory: inventoryTotals[fabric.id] || 0
      }));

      console.log('Final fabrics data with inventory:', fabricsWithInventory);
      setFabrics(fabricsWithInventory);
    } catch (error) {
      console.error('Error fetching fabrics:', error);
      toast.error('Failed to fetch fabrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFabrics();
  }, []);

  // Handle form submit (add/edit fabric)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.fabric_code.trim()) {
        toast.error('Fabric code is required');
        return;
      }
      if (!formData.fabric_name.trim()) {
        toast.error('Fabric name is required');
        return;
      }

      let uploadedImageUrl = editingFabric?.image || '';

      // Handle image upload if new file was selected
      if (fabricImageFile) {
        try {
          console.log('Starting image upload for file:', fabricImageFile.name);
        const fileExt = fabricImageFile.name.split('.').pop();
        const fileName = `fabric_${Date.now()}.${fileExt}`;
          console.log('Uploading to bucket: fabric-images, filename:', fileName);
          
          // Try fabric-images bucket first, fallback to company-assets if it doesn't exist
          let uploadResult = await supabase.storage
          .from('fabric-images')
          .upload(fileName, fabricImageFile, { upsert: true });

          // If fabric-images bucket doesn't exist, try company-assets
          if (uploadResult.error && uploadResult.error.message.includes('not found')) {
            console.log('fabric-images bucket not found, trying company-assets...');
            uploadResult = await supabase.storage
              .from('company-assets')
              .upload(`fabric-images/${fileName}`, fabricImageFile, { upsert: true });
          }
          
          const { error } = uploadResult;

          if (error) {
            console.error('Storage upload error:', error);
            toast.error(`Image upload failed: ${error.message}. Saving fabric without image.`);
            uploadedImageUrl = ''; // Continue without image
          } else {
            console.log('Image uploaded successfully, getting public URL...');
            // Use the same bucket that was used for upload
            const bucketName = uploadResult.data?.path?.includes('fabric-images/') ? 'company-assets' : 'fabric-images';
            const filePath = uploadResult.data?.path?.includes('fabric-images/') ? `fabric-images/${fileName}` : fileName;
            
            const { data: { publicUrl } } = supabase.storage
              .from(bucketName)
              .getPublicUrl(filePath);
            console.log('Public URL generated:', publicUrl);
        uploadedImageUrl = publicUrl;
          }
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          toast.error(`Image upload failed. Saving fabric without image.`);
          uploadedImageUrl = ''; // Continue without image
        }
      }

      const fabricData = {
        ...formData,
        image: uploadedImageUrl,
        rate: Number(formData.rate) || 0,
        gst: Number(formData.gst) || 18.00,
        inventory: Number(formData.inventory) || 0
      };
      
      console.log('Fabric data to save:', fabricData);
      console.log('Image URL being saved:', uploadedImageUrl);

      if (editingFabric) {
        // Update existing fabric
        const { error } = await supabase
          .from('fabric_master')
          .update(fabricData as any)
          .eq('id', editingFabric.id as any);

        if (error) {
          console.error('Database update error:', error);
          throw new Error(`Failed to update fabric: ${error.message}`);
        }
        toast.success('Fabric updated successfully');
      } else {
        // Create new fabric
        const { error } = await supabase
          .from('fabric_master')
          .insert([fabricData as any]);

        if (error) {
          console.error('Database insert error:', error);
          throw new Error(`Failed to create fabric: ${error.message}`);
        }
        toast.success('Fabric created successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchFabrics();
    } catch (error) {
      console.error('Error saving fabric:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Failed to ${editingFabric ? 'update' : 'create'} fabric: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk upload of fabrics from CSV
  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setLoading(true);

    try {
      const fileText = await bulkFile.text();
      const dataRows = fileText.split('\n').filter(row => row.trim());
      const headers = dataRows.shift()?.split(',') || [];

      // Validate required columns
      const requiredColumns = ['fabric_code', 'fabric_name'];
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      const fabricsToInsert = [];

      for (const row of dataRows) {
        const cols = row.split(',');
        const get = (key: string) => cols[headers.indexOf(key)]?.trim() || '';
        
        const fabricCode = get('fabric_code');
        const fabricName = get('fabric_name');
        
        if (!fabricCode || !fabricName) continue;

        const fabric: FabricMaster = {
          fabric_code: fabricCode,
          fabric_description: get('fabric_description'),
          fabric_name: fabricName,
          fabric_for_supplier: get('fabric_for_supplier'),
          type: get('type'),
          color: get('color'),
          hex: get('hex'),
          gsm: get('gsm'),
          uom: get('uom') || 'meters',
          rate: Number(get('rate')) || 0,
          hsn_code: get('hsn_code'),
          gst: Number(get('gst')) || 18.00,
          image: get('image'),
          inventory: Number(get('inventory')) || 0,
          supplier1: get('supplier1'),
          supplier2: get('supplier2'),
          status: 'active'
        };

        fabricsToInsert.push(fabric);
      }

      if (fabricsToInsert.length > 0) {
        const { error } = await supabase
          .from('fabric_master')
          .insert(fabricsToInsert);

        if (error) throw error;
      }

      toast.success(`Bulk upload completed! ${fabricsToInsert.length} fabrics added.`);
      setBulkDialogOpen(false);
      resetForm();
      fetchFabrics();
    } catch (err) {
      console.error('Bulk upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Bulk upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const resetForm = () => {
    setEditingFabric(null);
    setFormData(DEFAULT_FABRIC);
    setFabricImageFile(null);
    setFabricImagePreview(null);
  };

  const handleEdit = (fabric: FabricMaster) => {
    setEditingFabric(fabric);
    setFormData(fabric);
    setFabricImagePreview(fabric.image || null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fabric?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('fabric_master')
        .delete()
        .eq('id', id as any);

      if (error) throw error;
      toast.success('Fabric deleted successfully');
      fetchFabrics();
    } catch (error) {
      console.error('Error deleting fabric:', error);
      toast.error('Failed to delete fabric');
    } finally {
      setLoading(false);
    }
  };

  const handleFabricImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFabricImageFile(file);
    if (file) {
      setFabricImagePreview(URL.createObjectURL(file));
    } else {
      setFabricImagePreview(null);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a comprehensive template with examples
    const templateData = [
      BULK_TEMPLATE_HEADERS.join(','),
      'FAB001,Premium Cotton Jersey Fabric for T-shirts,Cotton Jersey,Cotton,Black,#000000,180,meters,150.00,5208,18.00,,100,ABC Textiles,XYZ Fabrics',
      'FAB002,Soft Polyester Blend Material,Poly Blend,Polyester,White,#FFFFFF,200,meters,120.00,5407,18.00,,75,DEF Suppliers,GHI Textiles',
      'FAB003,Heavy Denim Fabric for Jeans,Denim Fabric,Denim,Blue,#0066CC,250,meters,200.00,5209,18.00,,50,JKL Denim Mills,MNO Textiles',
      'FAB004,Lightweight Cotton Voile,Cotton Voile,Cotton,Red,#FF0000,120,meters,80.00,5208,18.00,,200,PQR Cotton Mills,STU Fabrics',
      'FAB005,Stretchable Spandex Material,Spandex Fabric,Spandex,Green,#00FF00,150,meters,180.00,5407,18.00,,30,VWX Stretch Co,YZA Materials'
    ].join('\n');
    
    const blob = new Blob([templateData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fabric_master_bulk_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleColumnWidthChange = (column: keyof typeof columnWidths, width: number) => {
    const newWidths = {
      ...columnWidths,
      [column]: Math.max(60, Math.min(300, width)) // Min 60px, Max 300px
    };
    setColumnWidths(newWidths);
    localStorage.setItem('fabric-table-column-widths', JSON.stringify(newWidths));
  };

  const resetColumnWidths = () => {
    const defaultWidths = {
      code: 80,
      fabricDetails: 160,
      type: 96,
      color: 128,
      gsm: 64,
      rate: 80,
      inventory: 96,
      status: 80,
      actions: 96
    };
    setColumnWidths(defaultWidths);
    localStorage.setItem('fabric-table-column-widths', JSON.stringify(defaultWidths));
  };

  // Filter fabrics based on search and type
  const filteredFabrics = fabrics.filter(fabric => {
    const matchesSearch = 
      fabric.fabric_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fabric.fabric_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fabric.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fabric.type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || fabric.type === filterType;
    
    return matchesSearch && matchesType;
  });

  const uniqueTypes = [...new Set(fabrics.map(f => f.type).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Fabric Master</h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setColumnSettingsOpen(true)} 
            variant="outline"
            className="border-gray-300"
          >
            <Settings className="w-4 h-4 mr-2" />
            Column Settings
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setDialogOpen(true)} className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80">
                <Plus className="w-4 h-4 mr-2" />
                Add Fabric
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {editingFabric ? 'Edit Fabric' : 'Add New Fabric'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fabric_code" className="text-sm font-medium">Fabric Code *</Label>
                    <Input
                      id="fabric_code"
                      value={formData.fabric_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, fabric_code: e.target.value }))}
                      required
                      className="mt-1"
                      placeholder="e.g., FAB001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fabric_name" className="text-sm font-medium">Fabric Name *</Label>
                    <Input
                      id="fabric_name"
                      value={formData.fabric_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, fabric_name: e.target.value }))}
                      required
                      className="mt-1"
                      placeholder="e.g., Cotton Jersey"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fabric_for_supplier" className="text-sm font-medium">Fabric for Supplier</Label>
                    <Input
                      id="fabric_for_supplier"
                      value={formData.fabric_for_supplier || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, fabric_for_supplier: e.target.value }))}
                      className="mt-1"
                      placeholder="Supplier-specific fabric name (for purchase orders)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This name will be shown in purchase orders instead of the fabric name
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type" className="text-sm font-medium">Type</Label>
                    <Input
                      id="type"
                      value={formData.type}
                      onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                      className="mt-1"
                      placeholder="e.g., Cotton, Polyester"
                    />
                  </div>
                  <div>
                    <Label htmlFor="color" className="text-sm font-medium">Color</Label>
                    <Input
                      id="color"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                      className="mt-1"
                      placeholder="e.g., Black, White"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="hex" className="text-sm font-medium">Hex Code</Label>
                    <Input
                      id="hex"
                      value={formData.hex}
                      onChange={(e) => setFormData(prev => ({ ...prev, hex: e.target.value }))}
                      className="mt-1"
                      placeholder="#000000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gsm" className="text-sm font-medium">GSM</Label>
                    <Input
                      id="gsm"
                      value={formData.gsm}
                      onChange={(e) => setFormData(prev => ({ ...prev, gsm: e.target.value }))}
                      className="mt-1"
                      placeholder="e.g., 180, 200"
                    />
                  </div>
                  <div>
                    <Label htmlFor="uom" className="text-sm font-medium">Unit of Measure</Label>
                    <Select value={formData.uom} onValueChange={(value) => setFormData(prev => ({ ...prev, uom: value }))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select UOM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meters">Meters</SelectItem>
                        <SelectItem value="yards">Yards</SelectItem>
                        <SelectItem value="kg">Kilograms</SelectItem>
                        <SelectItem value="pieces">Pieces</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="rate" className="text-sm font-medium">Rate</Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      value={formData.rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate: Number(e.target.value) }))}
                      className="mt-1"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="hsn_code" className="text-sm font-medium">HSN Code</Label>
                    <Input
                      id="hsn_code"
                      value={formData.hsn_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, hsn_code: e.target.value }))}
                      className="mt-1"
                      placeholder="e.g., 5208"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gst" className="text-sm font-medium">GST %</Label>
                    <Input
                      id="gst"
                      type="number"
                      step="0.01"
                      value={formData.gst}
                      onChange={(e) => setFormData(prev => ({ ...prev, gst: Number(e.target.value) }))}
                      className="mt-1"
                      placeholder="18.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inventory" className="text-sm font-medium">Inventory</Label>
                    <Input
                      id="inventory"
                      type="number"
                      value={formData.inventory || 0}
                      onChange={(e) => setFormData(prev => ({ ...prev, inventory: Number(e.target.value) }))}
                      className="mt-1"
                      placeholder="0"
                      disabled
                      title="Inventory is calculated from warehouse stock"
                    />
                  </div>
                  <div>
                    <Label htmlFor="status" className="text-sm font-medium">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier1" className="text-sm font-medium">Supplier 1</Label>
                    <Input
                      id="supplier1"
                      value={formData.supplier1}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplier1: e.target.value }))}
                      className="mt-1"
                      placeholder="Primary supplier"
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplier2" className="text-sm font-medium">Supplier 2</Label>
                    <Input
                      id="supplier2"
                      value={formData.supplier2}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplier2: e.target.value }))}
                      className="mt-1"
                      placeholder="Secondary supplier"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="fabric_description" className="text-sm font-medium">Description</Label>
                  <Textarea
                    id="fabric_description"
                    value={formData.fabric_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, fabric_description: e.target.value }))}
                    rows={3}
                    className="mt-1"
                    placeholder="Additional details about the fabric..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Fabric Image</Label>
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFabricImageChange} 
                    className="cursor-pointer"
                  />
                  {fabricImagePreview && (
                    <div className="mt-3 p-4 border rounded-lg bg-gray-50">
                      <div className="flex items-start gap-4">
                        <img 
                          src={fabricImagePreview} 
                          alt="Fabric preview" 
                          className="w-24 h-24 object-cover rounded-lg border shadow-sm"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 mb-1">Image Preview</p>
                          <p className="text-xs text-gray-500">Click the X button to remove this image</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFabricImageFile(null);
                            setFabricImagePreview(null);
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
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
                  <Button 
                    type="submit" 
                    disabled={loading} 
                    className="px-6 bg-gradient-to-r from-primary to-primary/90"
                  >
                    {loading ? 'Saving...' : editingFabric ? 'Update Fabric' : 'Create Fabric'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Button 
            onClick={() => setBulkDialogOpen(true)} 
            variant="outline" 
            className="border-primary text-primary"
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <Input
            placeholder="Search fabrics by code, name, color, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Fabrics</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button 
              onClick={handleDownloadTemplate} 
              variant="secondary"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template CSV
            </Button>
            <div className="text-sm text-muted-foreground">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <h4 className="font-medium text-blue-900 mb-2">📋 Template Instructions:</h4>
                <ul className="list-disc pl-4 space-y-1 text-blue-800">
                  <li><strong>Required fields:</strong> fabric_code, fabric_name</li>
                  <li><strong>Optional fields:</strong> All other columns</li>
                  <li><strong>Format:</strong> CSV file with comma separators</li>
                  <li><strong>Examples:</strong> Template includes 5 sample records</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="font-medium text-yellow-900 mb-2">⚠️ Important Notes:</h4>
                <ul className="list-disc pl-4 space-y-1 text-yellow-800">
                  <li>fabric_code must be unique for each fabric</li>
                  <li>hex field should be in format #RRGGBB (e.g., #FF0000)</li>
                  <li>uom options: meters, yards, kg, pieces</li>
                  <li>gst should be decimal (e.g., 18.00 for 18%)</li>
                  <li>image field accepts public URLs or leave empty</li>
                  <li>rate and inventory should be numeric values</li>
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <Label>CSV File *</Label>
              <Input 
                type="file" 
                accept=".csv" 
                onChange={e => setBulkFile(e.target.files?.[0] || null)} 
              />
              {bulkFile && (
                <div className="text-sm flex items-center gap-2 mt-1">
                  <span>Selected: {bulkFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBulkFile(null)}
                    className="h-6 p-1 text-muted-foreground"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setBulkDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                disabled={!bulkFile || loading} 
                onClick={handleBulkUpload} 
                className="bg-primary text-white"
              >
                {loading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Column Settings Dialog */}
      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Column Width Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Adjust the width of each column in the fabric table. Changes are applied immediately.
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(columnWidths).map(([column, width]) => (
                <div key={column} className="flex items-center gap-4">
                  <Label className="w-32 text-sm font-medium capitalize">
                    {column === 'fabricDetails' ? 'Fabric Details' : column}
                  </Label>
                  <div className="flex-1">
                    <Input
                      type="range"
                      min="60"
                      max="300"
                      value={width as number}
                      onChange={(e) => handleColumnWidthChange(column as keyof typeof columnWidths, parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="w-16 text-sm text-muted-foreground text-right">
                    {width as number}px
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between items-center pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={resetColumnWidths}
                className="text-sm"
              >
                Reset to Default
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setColumnSettingsOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fabrics Table */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <CardTitle className="text-lg">Fabric Master ({filteredFabrics.length} fabrics)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !fabrics.length ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
            </div>
          ) : filteredFabrics.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No fabrics found</p>
              <Button 
                onClick={() => setDialogOpen(true)} 
                className="mt-4"
              >
                Add Your First Fabric
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: `${columnWidths.code}px` }}>Code</TableHead>
                    <TableHead style={{ width: `${columnWidths.fabricDetails}px` }}>Fabric Details</TableHead>
                    <TableHead style={{ width: `${columnWidths.type}px` }}>Type</TableHead>
                    <TableHead style={{ width: `${columnWidths.color}px` }}>Color</TableHead>
                    <TableHead style={{ width: `${columnWidths.gsm}px` }}>GSM</TableHead>
                    <TableHead style={{ width: `${columnWidths.rate}px` }}>Rate</TableHead>
                    <TableHead style={{ width: `${columnWidths.inventory}px` }}>Inventory</TableHead>
                    <TableHead style={{ width: `${columnWidths.status}px` }}>Status</TableHead>
                    <TableHead style={{ width: `${columnWidths.actions}px` }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFabrics.map((fabric) => (
                    <TableRow key={fabric.id}>
                      <TableCell className="font-medium">{fabric.fabric_code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {fabric.image && (
                            <img 
                              src={fabric.image} 
                              alt={fabric.fabric_name} 
                              className="w-10 h-10 object-cover rounded border shadow-sm flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                const modal = document.createElement('div');
                                modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                modal.innerHTML = `
                                  <div class="relative max-w-4xl max-h-full">
                                    <img src="${fabric.image}" alt="${fabric.fabric_name}" class="max-w-full max-h-full object-contain rounded-lg" />
                                    <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </button>
                                  </div>
                                `;
                                document.body.appendChild(modal);
                                modal.onclick = (e) => {
                                  if (e.target === modal) modal.remove();
                                };
                              }}
                              onError={(e) => {
                                console.error('Image failed to load:', fabric.image);
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-medium text-sm truncate">{fabric.fabric_name}</span>
                            {fabric.fabric_description && (
                              <span className="text-xs text-muted-foreground truncate">
                                {fabric.fabric_description}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{fabric.type}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {fabric.hex ? (
                            <div className="flex items-center gap-2">
                              <div
                                style={{ 
                                  backgroundColor: fabric.hex.startsWith('#') ? fabric.hex : `#${fabric.hex}`,
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  border: '2px solid #e5e7eb',
                                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                                  display: 'block'
                                }}
                                title={`${fabric.color} (${fabric.hex})`}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{fabric.color}</span>
                                <span className="text-xs text-muted-foreground font-mono">{fabric.hex}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{fabric.color || 'N/A'}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{fabric.gsm}</TableCell>
                      <TableCell>₹{fabric.rate}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{fabric.inventory || 0}</span>
                          <span className="text-xs text-muted-foreground">{fabric.uom}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={fabric.status === 'active' ? 'default' : 'secondary'}>
                          {fabric.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(fabric)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDelete(fabric.id!)}
                          >
                            <Trash2 className="w-3 h-3" />
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

