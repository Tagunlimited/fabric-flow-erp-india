import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

interface Fabric {
  id: string;
  name: string;
  description: string;
  gsm?: string;
  created_at: string;
  image_url?: string | null;
  variants: FabricVariant[];
}

const DEFAULT_VARIANT: FabricVariant = {
  color: '',
  gsm: '',
  description: '',
  stock_quantity: 0,
  rate_per_meter: 0
};

export function FabricManager() {
  // State management
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [editingFabric, setEditingFabric] = useState<Fabric | null>(null);
  const [fabricImageFile, setFabricImageFile] = useState<File | null>(null);
  const [fabricImagePreview, setFabricImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    variants: [DEFAULT_VARIANT]
  });

  const bulkTemplateHeaders = [
    'Fabric Name', 'Description', 'Fabric Image URL', 
    'Variant Color', 'Variant Hex Code', 'Variant GSM', 
    'Variant UOM', 'Variant Description', 'Stock Quantity', 
    'Rate Per Meter', 'Variant Image URL'
  ];

  // Fetch fabrics and their variants
  const fetchFabrics = async () => {
    try {
      setLoading(true);
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
      if (!formData.name.trim()) {
        toast.error('Fabric name is required');
        return;
      }

      if (formData.variants.some(v => !v.color.trim())) {
        toast.error('Color is required for all variants');
        return;
      }

      let uploadedImageUrl = editingFabric?.image_url || '';

      // Handle image upload if new file was selected
      if (fabricImageFile) {
        const fileExt = fabricImageFile.name.split('.').pop();
        const fileName = `fabric_${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage
          .from('fabric-images')
          .upload(fileName, fabricImageFile, { upsert: true });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('fabric-images')
          .getPublicUrl(fileName);

        uploadedImageUrl = publicUrl;
      }

      let fabricRes;
      if (editingFabric) {
        // Update existing fabric
        const { data, error } = await supabase
          .from('fabrics')
          .update({
            name: formData.name,
            description: formData.description,
            image_url: uploadedImageUrl
          })
          .eq('id', editingFabric.id)
          .select()
          .single();

        if (error) throw error;
        fabricRes = data;
      } else {
        // Create new fabric
        const { data, error } = await supabase
          .from('fabrics')
          .insert([{
            name: formData.name,
            description: formData.description,
            image_url: uploadedImageUrl,
          }])
          .select()
          .single();

        if (error) throw error;
        fabricRes = data;
      }

      // Delete existing variants if editing
      if (editingFabric) {
        const { error } = await supabase
          .from('fabric_variants')
          .delete()
          .eq('fabric_id', editingFabric.id);

        if (error) throw error;
      }

      // Insert new variants
      const variantInserts = formData.variants
        .filter(v => v.color.trim())
        .map(variant => ({
          fabric_id: fabricRes.id,
          color: variant.color,
          hex_code: variant.hex_code || null,
          gsm: variant.gsm,
          uom: variant.uom || 'MTR',
          description: variant.description || null,
          stock_quantity: Number(variant.stock_quantity) || 0,
          rate_per_meter: parseFloat(String(variant.rate_per_meter)) || 0,
          image_url: variant.image_url || null
        }));

      if (variantInserts.length > 0) {
        const { error } = await supabase
          .from('fabric_variants')
          .insert(variantInserts);

        if (error) throw error;
      }

      toast.success(`Fabric ${editingFabric ? 'updated' : 'created'} successfully`);
      setDialogOpen(false);
      resetForm();
      fetchFabrics();
    } catch (error) {
      console.error('Error saving fabric:', error);
      toast.error(`Failed to ${editingFabric ? 'update' : 'create'} fabric`);
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
      const requiredColumns = ['Fabric Name', 'Variant Color', 'Variant GSM'];
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      const fabricGroups: Record<string, string[][]> = {};

      // Group fabrics by name
      for (const row of dataRows) {
        const cols = row.split(',');
        const get = (key: string) => cols[headers.indexOf(key)]?.trim() || '';
        const fabricName = get('Fabric Name');
        
        if (!fabricName) continue;
        
        if (!fabricGroups[fabricName]) {
          fabricGroups[fabricName] = [];
        }
        
        fabricGroups[fabricName].push(cols);
      }

      let uploadedImageUrl = '';
      if (fabricImageFile) {
        const fileExt = fabricImageFile.name.split('.').pop();
        const fileName = `bulk_${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage
          .from('fabric-images')
          .upload(fileName, fabricImageFile, { upsert: true });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('fabric-images')
          .getPublicUrl(fileName);

        uploadedImageUrl = publicUrl;
      }

      // Process each fabric group
      for (const fabricName in fabricGroups) {
        const group = fabricGroups[fabricName];
        const firstRow = group[0];
        const get = (key: string) => firstRow[headers.indexOf(key)]?.trim() || '';

        // Insert fabric
        const { data: fabricRes, error: fabricErr } = await supabase
          .from('fabrics')
          .insert([{
            name: fabricName,
            description: get('Description'),
            image_url: get('Fabric Image URL') || uploadedImageUrl,
          }])
          .select()
          .single();

        if (fabricErr) throw fabricErr;

        // Insert variants
        for (const row of group) {
          const getV = (key: string) => row[headers.indexOf(key)]?.trim() || '';
          
          if (getV('Variant Color')) {
            const variant = {
              fabric_id: fabricRes.id,
              color: getV('Variant Color'),
              hex_code: getV('Variant Hex Code') || null,
              gsm: getV('Variant GSM'),
              uom: getV('Variant UOM') || 'MTR',
              description: getV('Variant Description') || null,
              stock_quantity: Math.max(0, Number(getV('Stock Quantity')) || 0),
              rate_per_meter: parseFloat(getV('Rate Per Meter')) || 0,
              image_url: getV('Variant Image URL') || null
            };

            const { error: variantErr } = await supabase
              .from('fabric_variants')
              .insert([variant]);

            if (variantErr) {
              console.error('Bulk upload variant insert error:', {
                error: variantErr,
                variantData: variant,
                rowData: row
              });
              throw new Error(`Failed to insert variant: ${variantErr.message}`);
            }
          }
        }
      }

      toast.success('Bulk upload completed successfully!');
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
    setFormData({
      name: '',
      description: '',
      variants: [DEFAULT_VARIANT]
    });
    setFabricImageFile(null);
    setFabricImagePreview(null);
  };

  const handleEdit = (fabric: Fabric) => {
    setEditingFabric(fabric);
    setFormData({
      name: fabric.name,
      description: fabric.description,
      variants: fabric.variants.length > 0 
        ? fabric.variants.map(v => ({ 
            ...v,
            stock_quantity: v.stock_quantity || 0,
            rate_per_meter: v.rate_per_meter || 0
          }))
        : [DEFAULT_VARIANT]
    });
    setFabricImagePreview(fabric.image_url || null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fabric and all its variants?')) return;

    try {
      setLoading(true);
      // Delete variants first (due to foreign key constraint)
      await supabase
        .from('fabric_variants')
        .delete()
        .eq('fabric_id', id);

      // Then delete the fabric
      const { error } = await supabase
        .from('fabrics')
        .delete()
        .eq('id', id);

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

  const addVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, { ...DEFAULT_VARIANT }]
    }));
  };

  const removeVariant = (index: number) => {
    if (formData.variants.length > 1) {
      setFormData(prev => ({
        ...prev,
        variants: prev.variants.filter((_, i) => i !== index)
      }));
    }
  };

  const updateVariant = (index: number, field: keyof FabricVariant, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map((variant, i) =>
        i === index ? { ...variant, [field]: value } : variant
      )
    }));
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
    const csv = bulkTemplateHeaders.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fabric_bulk_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Fabric Management</h2>
        <div className="flex gap-2">
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
                    <Label htmlFor="name" className="text-sm font-medium">Fabric Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
                      placeholder="Additional details about the fabric..."
                    />
                  </div>
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
                    <div className="mt-2 flex items-center gap-4">
                      <img 
                        src={fabricImagePreview} 
                        alt="Fabric preview" 
                        className="w-30 h-30 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFabricImageFile(null);
                          setFabricImagePreview(null);
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Color Variants *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addVariant}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Variant
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                    {formData.variants.map((variant, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 border rounded-lg bg-muted/30">
                        <div>
                          <Label className="text-xs">Color *</Label>
                          <Input
                            value={variant.color}
                            onChange={(e) => updateVariant(index, 'color', e.target.value)}
                            placeholder="e.g., Red, Blue"
                            required
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">GSM *</Label>
                          <Input
                            value={variant.gsm}
                            onChange={(e) => updateVariant(index, 'gsm', e.target.value)}
                            placeholder="e.g., 180, 200"
                            required
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Stock Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            value={variant.stock_quantity}
                            onChange={(e) => updateVariant(index, 'stock_quantity', Number(e.target.value))}
                            placeholder="0"
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rate/Meter</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={variant.rate_per_meter}
                            onChange={(e) => updateVariant(index, 'rate_per_meter', Number(e.target.value))}
                            placeholder="0.00"
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">UOM</Label>
                          <Input
                            value={variant.uom || ''}
                            onChange={(e) => updateVariant(index, 'uom', e.target.value)}
                            placeholder="e.g. MTR, KGS"
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeVariant(index)}
                            disabled={formData.variants.length === 1}
                            className="h-9 w-9 p-0"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
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
            Bulk Upload
          </Button>
        </div>
      </div>

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
              Download Template CSV
            </Button>
            <div className="text-sm text-muted-foreground">
              <ul className="list-disc pl-4 space-y-1">
                <li>Download the template and fill all columns</li>
                <li>Hex Code columns are optional but recommended</li>
                <li>Image URL columns accept public URLs</li>
                <li>File must be in CSV format</li>
                <li>Required columns: Fabric Name, Color, GSM</li>
              </ul>
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
            <div className="space-y-2">
              <Label>Fabric Image (optional)</Label>
              <Input 
                type="file" 
                accept="image/*" 
                onChange={handleFabricImageChange} 
              />
              {fabricImagePreview && (
                <div className="flex items-center gap-2 mt-2">
                  <img 
                    src={fabricImagePreview} 
                    alt="Preview" 
                    className="w-12 h-12 object-cover rounded border" 
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFabricImageFile(null);
                      setFabricImagePreview(null);
                    }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Remove
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

      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <CardTitle className="text-lg">Fabrics Inventory</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {loading && !fabrics.length ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
            </div>
          ) : fabrics.length === 0 ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fabrics.map((fabric) => (
                <div 
                  key={fabric.id} 
                  className="relative rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute top-4 right-4 flex gap-2">
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleEdit(fabric)}
                      className="h-8 w-8"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="icon"
                      onClick={() => handleDelete(fabric.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-start gap-4">
                    {fabric.image_url && (
                      <div className="shrink-0">
                        <img 
                          src={fabric.image_url} 
                          alt={fabric.name} 
                          className="w-20 h-20 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{fabric.name}</h3>
                      {fabric.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {fabric.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Color Variants</h4>
                      {fabric.variants.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {fabric.variants.map((variant, idx) => (
                            <div 
                              key={idx} 
                              className="group relative"
                              title={`${variant.color} (${variant.stock_quantity} ${variant.uom || 'units'})`}
                            >
                              <div
                                style={{ 
                                  backgroundColor: variant.hex_code || '#eee',
                                  width: 24,
                                  height: 24
                                }}
                                className="rounded-full border-2 border-background shadow-sm"
                              />
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                                {variant.color}: {variant.stock_quantity} {variant.uom || 'units'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No variants</p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-1">GSM Values</h4>
                      {fabric.variants.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {[...new Set(fabric.variants.map(v => v.gsm))].map((gsm, idx) => (
                            <Badge 
                              key={idx} 
                              variant="outline"
                              className="font-medium"
                            >
                              {gsm}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No GSM values</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}