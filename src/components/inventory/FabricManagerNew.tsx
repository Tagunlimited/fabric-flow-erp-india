import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Download, Upload, Settings, GripVertical, Filter, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  FABRIC_MASTER_PAGE_SIZE_OPTIONS,
  fetchAllFabricMasterMatchingFilters,
  fetchDistinctFabricTypes,
  fetchFabricMasterPage,
  type FabricMasterListFilters,
  type FabricMasterRow,
} from '@/lib/fabricMasterQueries';
import { chunkArray } from '@/lib/chunkArray';

type FabricMaster = FabricMasterRow;

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

const EXPORT_HEADERS = [...BULK_TEMPLATE_HEADERS, 'status'];

function fabricToExportRow(fabric: FabricMaster): (string | number)[] {
  return [
    fabric.fabric_code || '',
    fabric.fabric_description || '',
    fabric.fabric_name || '',
    fabric.fabric_for_supplier || '',
    fabric.type || '',
    fabric.color || '',
    fabric.hex || '',
    fabric.gsm || '',
    fabric.uom || '',
    fabric.rate ?? '',
    fabric.hsn_code || '',
    fabric.gst ?? '',
    fabric.image || '',
    fabric.inventory ?? 0,
    fabric.supplier1 || '',
    fabric.supplier2 || '',
    fabric.status || '',
  ];
}

function escapeCsvCell(cell: string | number): string {
  const cellStr = String(cell ?? '');
  if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
    return `"${cellStr.replace(/"/g, '""')}"`;
  }
  return cellStr;
}

/** Minimal RFC-style CSV row parser (handles quoted fields). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const BULK_INSERT_BATCH_SIZE = 100;

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
    const defaults = {
      fabricDetails: 160,
      type: 140,
      color: 128,
      gsm: 64,
      rate: 80,
      inventory: 96,
      status: 80,
      actions: 96
    };
    const saved = localStorage.getItem('fabric-table-column-widths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, number>;
        delete parsed.code;
        return { ...defaults, ...parsed };
      } catch {
        // Fallback to default if parsing fails
      }
    }
    return defaults;
  });
  
  const [formData, setFormData] = useState<FabricMaster>(DEFAULT_FABRIC);
  const [columnFilters, setColumnFilters] = useState({
    fabric_details: '',
    fabric_for_supplier: '',
    color: '',
    gsm: '',
    rate: '',
    inventory: '',
    status: '',
  });
  const [filterDialogColumn, setFilterDialogColumn] = useState<keyof typeof columnFilters | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [fabricTypes, setFabricTypes] = useState<string[]>([]);

  const listFilters: FabricMasterListFilters = useMemo(
    () => ({
      search: searchTerm,
      filterType,
      columnFilters,
    }),
    [searchTerm, filterType, columnFilters]
  );

  const columnFiltersKey = JSON.stringify(columnFilters);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim() !== '');

  const fetchFabricsPage = useCallback(async () => {
    try {
      setLoading(true);
      const { rows, total } = await fetchFabricMasterPage({
        page,
        pageSize,
        filters: listFilters,
      });
      setFabrics(rows);
      setTotalCount(total);
    } catch (error) {
      console.error('Error fetching fabrics:', error);
      toast.error('Failed to fetch fabrics');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, listFilters]);

  useEffect(() => {
    void fetchDistinctFabricTypes()
      .then(setFabricTypes)
      .catch((error) => console.warn('Could not load fabric types:', error));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterType, pageSize, columnFiltersKey]);

  useEffect(() => {
    void fetchFabricsPage();
  }, [fetchFabricsPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
      void fetchFabricsPage();
      void fetchDistinctFabricTypes().then(setFabricTypes).catch(() => undefined);
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
      const parsedRows = parseCsvRows(fileText);
      if (parsedRows.length < 2) {
        throw new Error('CSV file is empty or has no data rows');
      }

      const headers = parsedRows[0].map((h) => h.trim());
      const dataRows = parsedRows.slice(1);

      const requiredColumns = ['fabric_code', 'fabric_name'];
      const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      const fabricsToInsert: FabricMaster[] = [];
      const seenCodes = new Set<string>();
      let duplicateRowsInFile = 0;

      for (const cols of dataRows) {
        const get = (key: string) => cols[headers.indexOf(key)]?.trim() || '';
        const fabricCode = get('fabric_code');
        const fabricName = get('fabric_name');
        if (!fabricCode || !fabricName) continue;

        const normalizedCode = fabricCode.toUpperCase();
        if (seenCodes.has(normalizedCode)) {
          duplicateRowsInFile += 1;
          continue;
        }
        seenCodes.add(normalizedCode);

        fabricsToInsert.push({
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
          gst: Number(get('gst')) || 18.0,
          image: get('image'),
          inventory: Number(get('inventory')) || 0,
          supplier1: get('supplier1'),
          supplier2: get('supplier2'),
          status: 'active',
        });
      }

      if (fabricsToInsert.length === 0) {
        throw new Error('No valid fabric rows found. Each row needs fabric_code and fabric_name.');
      }

      const existingCodes = new Set<string>();
      const codes = fabricsToInsert.map((f) => f.fabric_code);
      for (const codeChunk of chunkArray(codes, 200)) {
        const { data, error } = await supabase
          .from('fabric_master')
          .select('fabric_code')
          .in('fabric_code', codeChunk);
        if (error) throw error;
        (data || []).forEach((row: { fabric_code: string }) => {
          existingCodes.add(row.fabric_code);
        });
      }

      const newFabrics = fabricsToInsert.filter((f) => !existingCodes.has(f.fabric_code));
      const skippedExisting = fabricsToInsert.length - newFabrics.length;

      if (newFabrics.length === 0) {
        throw new Error(
          `All ${fabricsToInsert.length} fabric_code values already exist in Fabric Master. No new rows were added.`
        );
      }

      for (const batch of chunkArray(newFabrics, BULK_INSERT_BATCH_SIZE)) {
        const { error } = await supabase.from('fabric_master').insert(batch);
        if (error) {
          if (error.code === '23505' || (error as { status?: number }).status === 409) {
            throw new Error(
              `Duplicate fabric_code detected during upload (${error.message}). Some codes may already exist — remove duplicates from the CSV and try again.`
            );
          }
          throw error;
        }
      }

      const parts = [`${newFabrics.length} fabric(s) added`];
      if (skippedExisting > 0) parts.push(`${skippedExisting} skipped (already in database)`);
      if (duplicateRowsInFile > 0) parts.push(`${duplicateRowsInFile} duplicate row(s) in file ignored`);
      toast.success(`Bulk upload completed! ${parts.join(', ')}.`);

      setBulkDialogOpen(false);
      setBulkFile(null);
      resetForm();
      void fetchFabricsPage();
      void fetchDistinctFabricTypes().then(setFabricTypes).catch(() => undefined);
    } catch (err) {
      console.error('Bulk upload error:', err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Bulk upload failed';
      toast.error(message);
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
      void fetchFabricsPage();
      void fetchDistinctFabricTypes().then(setFabricTypes).catch(() => undefined);
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

  const handleExportCSV = async () => {
    try {
      setExportLoading(true);
      toast.info('Preparing export… this may take a moment for large catalogs.');
      const exportRows = await fetchAllFabricMasterMatchingFilters(listFilters);
      if (exportRows.length === 0) {
        toast.error('No fabrics to export');
        return;
      }

      const csvContent = [
        EXPORT_HEADERS.join(','),
        ...exportRows.map((fabric) =>
          fabricToExportRow(fabric).map(escapeCsvCell).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabric_master_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${exportRows.length} fabrics exported to CSV`);
    } catch (error) {
      console.error('Export CSV error:', error);
      toast.error('Failed to export fabrics to CSV');
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportLoading(true);
      toast.info('Preparing export… this may take a moment for large catalogs.');
      const exportRows = await fetchAllFabricMasterMatchingFilters(listFilters);
      if (exportRows.length === 0) {
        toast.error('No fabrics to export');
        return;
      }

      const data = [
        EXPORT_HEADERS,
        ...exportRows.map((fabric) => fabricToExportRow(fabric)),
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Fabric Master');
      XLSX.writeFile(workbook, `fabric_master_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`${exportRows.length} fabrics exported to Excel`);
    } catch (error) {
      console.error('Export Excel error:', error);
      toast.error('Failed to export fabrics to Excel');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a comprehensive template with examples
    // Note: fabric_for_supplier is included in headers and should be in each row (can be empty)
    const templateData = [
      BULK_TEMPLATE_HEADERS.join(','),
      'FAB001,Premium Cotton Jersey Fabric for T-shirts,Cotton Jersey,,Cotton,Black,#000000,180,meters,150.00,5208,18.00,,100,ABC Textiles,XYZ Fabrics',
      'FAB002,Soft Polyester Blend Material,Poly Blend,Poly Blend Supplier Name,Polyester,White,#FFFFFF,200,meters,120.00,5407,18.00,,75,DEF Suppliers,GHI Textiles',
      'FAB003,Heavy Denim Fabric for Jeans,Denim Fabric,,Denim,Blue,#0066CC,250,meters,200.00,5209,18.00,,50,JKL Denim Mills,MNO Textiles',
      'FAB004,Lightweight Cotton Voile,Cotton Voile,,Cotton,Red,#FF0000,120,meters,80.00,5208,18.00,,200,PQR Cotton Mills,STU Fabrics',
      'FAB005,Stretchable Spandex Material,Spandex Fabric,Spandex Supplier,Spandex,Green,#00FF00,150,meters,180.00,5407,18.00,,30,VWX Stretch Co,YZA Materials'
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
      fabricDetails: 160,
      type: 140,
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
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={exportLoading || totalCount === 0}
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {exportLoading ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exportLoading || totalCount === 0}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exportLoading ? 'Exporting...' : 'Export Excel'}
          </Button>
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
            placeholder="Search fabrics by code, name, color, type, or fabric for supplier..."
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
            {fabricTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveColumnFilters && (
          <Button
            variant="outline"
            onClick={() =>
              setColumnFilters({
                fabric_details: '',
                fabric_for_supplier: '',
                color: '',
                gsm: '',
                rate: '',
                inventory: '',
                status: '',
              })
            }
          >
            Clear column filters
          </Button>
        )}
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
          <CardTitle className="text-lg">
            Fabric Master ({totalCount.toLocaleString()} fabrics)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: `${columnWidths.fabricDetails}px` }}><div className="flex items-center gap-1">Fabric Details<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.fabric_details ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('fabric_details')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.type}px` }}><div className="flex items-center gap-1">Fabric for supplier<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.fabric_for_supplier ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('fabric_for_supplier')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.color}px` }}><div className="flex items-center gap-1">Color<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.color ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('color')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.gsm}px` }}><div className="flex items-center gap-1">GSM<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.gsm ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('gsm')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.rate}px` }}><div className="flex items-center gap-1">Rate<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.rate ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('rate')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.inventory}px` }}><div className="flex items-center gap-1">Inventory<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.inventory ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('inventory')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.status}px` }}><div className="flex items-center gap-1">Status<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.status ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('status')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead style={{ width: `${columnWidths.actions}px` }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fabrics.map((fabric) => (
                    <TableRow key={fabric.id}>
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
                      <TableCell>
                        {(fabric.fabric_for_supplier && fabric.fabric_for_supplier.trim()) || '—'}
                      </TableCell>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-4 border-t">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[4.5rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FABRIC_MASTER_PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium text-foreground">
                      {totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1}–
                      {Math.min(safePage * pageSize, totalCount)}
                    </span>{' '}
                    of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={safePage <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page <span className="font-medium text-foreground">{safePage}</span> / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={safePage >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!filterDialogColumn} onOpenChange={(open) => !open && setFilterDialogColumn(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter column</DialogTitle>
          </DialogHeader>
          {filterDialogColumn && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Type to filter..."
                value={columnFilters[filterDialogColumn]}
                onChange={(event) =>
                  setColumnFilters((prev) => ({
                    ...prev,
                    [filterDialogColumn]: event.target.value,
                  }))
                }
              />
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setColumnFilters((prev) => ({
                      ...prev,
                      [filterDialogColumn]: '',
                    }))
                  }
                >
                  Clear
                </Button>
                <Button onClick={() => setFilterDialogColumn(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

