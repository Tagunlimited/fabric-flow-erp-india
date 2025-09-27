import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Search, Tag, Upload, Download, FileText, AlertCircle, CheckCircle, XCircle, Grid3X3, List } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface Supplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  credit_limit: number | null;
  pan: string | null;
  gst_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  enabled: boolean | null;
  total_outstanding_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
  supplier_specializations?: SupplierSpecialization[];
}

interface SupplierSpecialization {
  id: string;
  supplier_id: string;
  specialization_type: 'fabric' | 'item' | 'product';
  specialization_id: string;
  specialization_name: string;
  priority: number | null;
  created_at: string | null;
}

interface SpecializationOption {
  id: string;
  name: string;
  type: 'fabric' | 'item' | 'product';
}

interface BulkUploadRow {
  row: number;
  data: any;
  errors: string[];
  status: 'pending' | 'success' | 'error';
}

export function SupplierMaster() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [specializations, setSpecializations] = useState<SupplierSpecialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<string>('all');
  const [showSpecializations, setShowSpecializations] = useState<string | null>(null);
  const [specializationOptions, setSpecializationOptions] = useState<SpecializationOption[]>([]);

  // Bulk upload states
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedData, setUploadedData] = useState<BulkUploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // View toggle state
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [formData, setFormData] = useState({
    supplier_code: '',
    supplier_name: '',
    credit_limit: '',
    pan: '',
    gst_number: '',
    contact_person: '',
    email: '',
    phone: '',
    billing_address: '',
    enabled: true
  });

  const [specializationForm, setSpecializationForm] = useState({
    specialization_type: 'fabric' as 'fabric' | 'item' | 'product',
    specialization_id: '',
    specialization_name: '',
    priority: 1
  });

  useEffect(() => {
    fetchSuppliers();
    fetchSpecializationOptions();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('supplier_master')
        .select(`
          *,
          supplier_specializations (
            id,
            specialization_type,
            specialization_id,
            specialization_name,
            priority
          )
        `)
        .order('supplier_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecializations = async (supplierId: string) => {
    try {
      const { data, error } = await supabase
        .from('supplier_specializations')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('priority', { ascending: false });

      if (error) throw error;
      setSpecializations(data || []);
    } catch (error) {
      console.error('Error fetching specializations:', error);
      toast.error('Failed to fetch specializations');
    }
  };

  const fetchSpecializationOptions = async () => {
    try {
      const options: SpecializationOption[] = [];

      // Fetch fabrics
      const { data: fabrics } = await supabase
        .from('fabrics')
        .select('id, name');
      fabrics?.forEach(f => options.push({ id: f.id, name: f.name, type: 'fabric' as const }));

      // Fetch items
      const { data: items } = await supabase
        .from('item_master')
        .select('id, item_name')
        .eq('is_active', true);
      items?.forEach(i => options.push({ id: i.id, name: i.item_name, type: 'item' as const }));

      // Fetch products
      let products = null;
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name');
        if (error) {
          // Try product_master as fallback
          const { data: fallbackData } = await supabase
            .from('product_master')
            .select('id, product_name');
          products = fallbackData;
        } else {
          products = data;
        }
      } catch (err) {
        console.log('Error fetching products:', err);
      }
      
      products?.forEach(p => options.push({ 
        id: p.id, 
        name: p.product_name || p.name, 
        type: 'product' as const 
      }));

      setSpecializationOptions(options);
    } catch (error) {
      console.error('Error fetching specialization options:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supplierData = {
        ...formData,
        credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : null
      };

      if (editingSupplier) {
        const { error } = await supabase
          .from('supplier_master')
          .update(supplierData)
          .eq('id', editingSupplier.id);

        if (error) throw error;
        toast.success('Supplier updated successfully');
      } else {
        const { error } = await supabase
          .from('supplier_master')
          .insert(supplierData);

        if (error) throw error;
        toast.success('Supplier created successfully');
      }

      setShowDialog(false);
      resetForm();
      fetchSuppliers();
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      toast.error(error.message || 'Failed to save supplier');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;

    try {
      const { error } = await supabase
        .from('supplier_master')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Supplier deleted successfully');
      fetchSuppliers();
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      toast.error(error.message || 'Failed to delete supplier');
    }
  };

  const handleAddSpecialization = async () => {
    if (!showSpecializations || !specializationForm.specialization_id) return;

    try {
      const { error } = await supabase
        .from('supplier_specializations')
        .insert({
          supplier_id: showSpecializations,
          specialization_type: specializationForm.specialization_type,
          specialization_id: specializationForm.specialization_id,
          specialization_name: specializationForm.specialization_name,
          priority: specializationForm.priority
        });

      if (error) throw error;
      toast.success('Specialization added successfully');
      setSpecializationForm({
        specialization_type: 'fabric',
        specialization_id: '',
        specialization_name: '',
        priority: 1
      });
      fetchSpecializations(showSpecializations);
    } catch (error: any) {
      console.error('Error adding specialization:', error);
      toast.error(error.message || 'Failed to add specialization');
    }
  };

  const handleRemoveSpecialization = async (id: string) => {
    try {
      const { error } = await supabase
        .from('supplier_specializations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Specialization removed successfully');
      if (showSpecializations) {
        fetchSpecializations(showSpecializations);
      }
    } catch (error: any) {
      console.error('Error removing specialization:', error);
      toast.error(error.message || 'Failed to remove specialization');
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_code: '',
      supplier_name: '',
      credit_limit: '',
      pan: '',
      gst_number: '',
      contact_person: '',
      email: '',
      phone: '',
      billing_address: '',
      enabled: true
    });
    setEditingSupplier(null);
  };

  const openDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        supplier_code: supplier.supplier_code,
        supplier_name: supplier.supplier_name,
        credit_limit: supplier.credit_limit?.toString() || '',
        pan: supplier.pan || '',
        gst_number: supplier.gst_number || '',
        contact_person: supplier.contact_person || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        billing_address: supplier.billing_address || '',
        enabled: supplier.enabled || true
      });
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = !searchTerm || 
      supplier.supplier_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.contact_person && supplier.contact_person.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterEnabled === 'all' || 
      (filterEnabled === 'enabled' && supplier.enabled) ||
      (filterEnabled === 'disabled' && !supplier.enabled);
    
    return matchesSearch && matchesFilter;
  });

  const getSpecializationOptions = (type: 'fabric' | 'item' | 'product') => {
    return specializationOptions.filter(option => option.type === type);
  };

  // Bulk Upload Functions
  const downloadTemplate = () => {
    const template = [
      {
        'Supplier Code*': 'SUP001',
        'Supplier Name*': 'ABC Fabrics Ltd',
        'Credit Limit': '100000',
        'PAN': 'ABCDE1234F',
        'GST Number': '27ABCDE1234F1Z5',
        'Contact Person': 'John Doe',
        'Phone': '+91-9876543210',
        'Email': 'john@abcfabrics.com',
        'Billing Address': '123 Fabric Street, Building A, Mumbai, Maharashtra, India - 400001',
        'Enabled': 'true',
        'Total Outstanding Amount': '0'
      },
      {
        'Supplier Code*': 'SUP002',
        'Supplier Name*': 'XYZ Textiles',
        'Credit Limit': '75000',
        'PAN': 'XYZAB5678G',
        'GST Number': '27XYZAB5678G2Z6',
        'Contact Person': 'Jane Smith',
        'Phone': '+91-9876543211',
        'Email': 'jane@xyztextiles.com',
        'Billing Address': '456 Textile Road, Surat, Gujarat, India - 395001',
        'Enabled': 'true',
        'Total Outstanding Amount': '0'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Template');
    
    // Add instructions sheet
    const instructions = [
      { 'Field': 'Supplier Code*', 'Description': 'Unique identifier for the supplier (required)', 'Format': 'Alphanumeric, max 50 characters' },
      { 'Field': 'Supplier Name*', 'Description': 'Full name of the supplier (required)', 'Format': 'Text, max 255 characters' },
      { 'Field': 'Credit Limit', 'Description': 'Maximum credit amount allowed', 'Format': 'Numeric, e.g., 100000' },
      { 'Field': 'PAN', 'Description': 'Permanent Account Number', 'Format': '10 characters, e.g., ABCDE1234F' },
      { 'Field': 'GST Number', 'Description': 'GST registration number', 'Format': '15 characters, e.g., 27ABCDE1234F1Z5' },
      { 'Field': 'Contact Person', 'Description': 'Primary contact person name', 'Format': 'Text, max 255 characters' },
      { 'Field': 'Phone', 'Description': 'Contact phone number', 'Format': 'Text, max 20 characters, e.g., +91-9876543210' },
      { 'Field': 'Email', 'Description': 'Contact email address', 'Format': 'Valid email format, max 255 characters' },
      { 'Field': 'Billing Address', 'Description': 'Complete billing address', 'Format': 'Text, include street, city, state, country, pincode' },
      { 'Field': 'Enabled', 'Description': 'Whether supplier is active', 'Format': 'true/false, default: true' },
      { 'Field': 'Total Outstanding Amount', 'Description': 'Current outstanding amount', 'Format': 'Numeric, e.g., 0' }
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
    
    XLSX.writeFile(wb, 'supplier_bulk_upload_template.xlsx');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setUploadedFile(file);
    processFile(file);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          toast.error('File must contain at least a header row and one data row');
          return;
        }

        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1) as any[][];

        const processedData: BulkUploadRow[] = rows.map((row, index) => {
          const rowData: any = {};
          const errors: string[] = [];

          headers.forEach((header, colIndex) => {
            const value = row[colIndex];
            rowData[header] = value;
          });

                     // Validate required fields
           if (!rowData['Supplier Code*']?.toString().trim()) {
             errors.push('Supplier Code is required');
           }
           if (!rowData['Supplier Name*']?.toString().trim()) {
             errors.push('Supplier Name is required');
           }

                     // Validate email format
           if (rowData['Email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowData['Email'])) {
             errors.push('Invalid email format');
           }

           // Validate PAN format
           if (rowData['PAN'] && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(rowData['PAN'])) {
             errors.push('Invalid PAN format (should be like ABCDE1234F)');
           }

           // Validate GST format
           if (rowData['GST Number'] && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/.test(rowData['GST Number'])) {
             errors.push('Invalid GST format');
           }

           // Validate field lengths
           if (rowData['Supplier Code*'] && rowData['Supplier Code*'].toString().length > 50) {
             errors.push('Supplier Code must be 50 characters or less');
           }
           if (rowData['Supplier Name*'] && rowData['Supplier Name*'].toString().length > 255) {
             errors.push('Supplier Name must be 255 characters or less');
           }
           if (rowData['Contact Person'] && rowData['Contact Person'].toString().length > 255) {
             errors.push('Contact Person must be 255 characters or less');
           }
           if (rowData['Phone'] && rowData['Phone'].toString().length > 20) {
             errors.push('Phone must be 20 characters or less');
           }
           if (rowData['Email'] && rowData['Email'].toString().length > 255) {
             errors.push('Email must be 255 characters or less');
           }
           if (rowData['PAN'] && rowData['PAN'].toString().length > 10) {
             errors.push('PAN must be 10 characters or less');
           }
           if (rowData['GST Number'] && rowData['GST Number'].toString().length > 15) {
             errors.push('GST Number must be 15 characters or less');
           }

          return {
            row: index + 2, // +2 because we start from row 2 (after header)
            data: rowData,
            errors,
            status: errors.length > 0 ? 'error' : 'pending'
          };
        });

        setUploadedData(processedData);
        toast.success(`Processed ${processedData.length} rows`);
      } catch (error) {
        console.error('Error processing file:', error);
        toast.error('Error processing file. Please check the file format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const uploadSuppliers = async () => {
    const validRows = uploadedData.filter(row => row.errors.length === 0);
    
    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const data = row.data;

                 try {
           const supplierData = {
             supplier_code: data['Supplier Code*'].toString().trim(),
             supplier_name: data['Supplier Name*'].toString().trim(),
             credit_limit: data['Credit Limit'] ? parseFloat(data['Credit Limit']) : null,
             pan: data['PAN']?.toString().trim() || null,
             gst_number: data['GST Number']?.toString().trim() || null,
             contact_person: data['Contact Person']?.toString().trim() || null,
             phone: data['Phone']?.toString().trim() || null,
             email: data['Email']?.toString().trim() || null,
             billing_address: data['Billing Address']?.toString().trim() || null,
             enabled: data['Enabled'] === 'true' || data['Enabled'] === true || data['Enabled'] === undefined,
             total_outstanding_amount: data['Total Outstanding Amount'] ? parseFloat(data['Total Outstanding Amount']) : 0
           };

          const { error } = await supabase
            .from('supplier_master')
            .insert(supplierData);

          if (error) {
            row.errors.push(error.message);
            row.status = 'error';
            errorCount++;
          } else {
            row.status = 'success';
            successCount++;
          }
        } catch (error: any) {
          row.errors.push(error.message);
          row.status = 'error';
          errorCount++;
        }

        setUploadProgress(((i + 1) / validRows.length) * 100);
      }

      setUploadedData([...uploadedData]); // Trigger re-render
      
      if (successCount > 0) {
        toast.success(`Successfully uploaded ${successCount} suppliers`);
        fetchSuppliers(); // Refresh the list
      }
      
      if (errorCount > 0) {
        toast.error(`${errorCount} suppliers failed to upload`);
      }

    } catch (error) {
      console.error('Error uploading suppliers:', error);
      toast.error('Error uploading suppliers');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const downloadErrorFile = () => {
    const errorRows = uploadedData.filter(row => row.errors.length > 0);
    
    if (errorRows.length === 0) {
      toast.error('No errors to download');
      return;
    }

         const errorData = errorRows.map(row => ({
       'Row': row.row,
       'Supplier Code': row.data['Supplier Code*'] || '',
       'Supplier Name': row.data['Supplier Name*'] || '',
       'Contact Person': row.data['Contact Person'] || '',
       'Phone': row.data['Phone'] || '',
       'Email': row.data['Email'] || '',
       'Billing Address': row.data['Billing Address'] || '',
       'Errors': row.errors.join('; ')
     }));

    const ws = XLSX.utils.json_to_sheet(errorData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'supplier_upload_errors.xlsx');
  };

  const resetBulkUpload = () => {
    setUploadedFile(null);
    setUploadedData([]);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent tracking-tight">
            Supplier Master
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Manage your supplier records and specializations
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowBulkUpload(true)}
            variant="outline"
            className="bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:scale-105 transition-transform"
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
          <Button 
            onClick={() => openDialog()}
            className="bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* Filters and View Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search suppliers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterEnabled} onValueChange={setFilterEnabled}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                <SelectItem value="enabled">Enabled Only</SelectItem>
                <SelectItem value="disabled">Disabled Only</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4 mr-2" />
                Table
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('cards')}
              >
                <Grid3X3 className="w-4 h-4 mr-2" />
                Cards
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Display */}
      <Card>
        <CardHeader>
          <CardTitle>Suppliers ({filteredSuppliers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Specializations</TableHead>
                    <TableHead>Credit Limit</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier, index) => (
                    <TableRow 
                      key={supplier.id}
                      className={`hover:bg-gray-50 transition-colors duration-200 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                      } ${
                        supplier.enabled ? 'border-l-4 border-l-green-200' : 'border-l-4 border-l-red-200'
                      }`}
                    >
                      <TableCell className="font-medium text-blue-600">{supplier.supplier_code}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-bold text-gray-800">{supplier.supplier_name}</div>
                          {supplier.gst_number && (
                            <div className="text-xs text-gray-500">GST: {supplier.gst_number}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {supplier.contact_person && (
                            <div className="font-medium text-gray-800">{supplier.contact_person}</div>
                          )}
                          {supplier.phone && (
                            <div className="text-blue-600">{supplier.phone}</div>
                          )}
                          {supplier.email && (
                            <div className="text-blue-600">{supplier.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-xs truncate text-purple-700">
                          {supplier.billing_address || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {supplier.supplier_specializations && supplier.supplier_specializations.length > 0 ? (
                            supplier.supplier_specializations
                              .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                              .slice(0, 3)
                              .map((spec) => (
                                <Badge 
                                  key={spec.id} 
                                  variant="outline" 
                                  className={`text-xs font-medium ${
                                    (spec.priority || 1) === 1 
                                      ? 'bg-orange-100 text-orange-800 border-orange-300' 
                                      : (spec.priority || 1) === 2 
                                      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                      : 'bg-gray-100 text-gray-800 border-gray-300'
                                  }`}
                                >
                                  {spec.specialization_name} (P:{spec.priority || 1})
                                </Badge>
                              ))
                          ) : (
                            <span className="text-xs text-orange-600">No specializations</span>
                          )}
                          {supplier.supplier_specializations && supplier.supplier_specializations.length > 3 && (
                            <div className="text-xs text-orange-600 font-medium">
                              +{supplier.supplier_specializations.length - 3} more
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-emerald-700">
                          {supplier.credit_limit ? formatCurrency(supplier.credit_limit) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`font-bold ${
                          (supplier.total_outstanding_amount || 0) > 0 
                            ? 'text-red-600' 
                            : 'text-emerald-700'
                        }`}>
                          {supplier.total_outstanding_amount ? formatCurrency(supplier.total_outstanding_amount) : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={supplier.enabled ? "default" : "secondary"}>
                          {supplier.enabled ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowSpecializations(supplier.id);
                              fetchSpecializations(supplier.id);
                            }}
                          >
                            <Tag className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDialog(supplier)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(supplier.id)}
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSuppliers.map((supplier, index) => (
                <Card 
                  key={supplier.id} 
                  className={`hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-l-4 ${
                    supplier.enabled 
                      ? 'border-l-green-500 bg-gradient-to-br from-white to-green-50' 
                      : 'border-l-red-500 bg-gradient-to-br from-white to-red-50'
                  }`}
                  style={{
                    background: supplier.enabled 
                      ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)'
                      : 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)'
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-bold text-gray-800">{supplier.supplier_name}</CardTitle>
                        <p className="text-sm font-medium text-blue-600">{supplier.supplier_code}</p>
                      </div>
                      <Badge 
                        variant={supplier.enabled ? "default" : "secondary"}
                        className={`font-semibold ${
                          supplier.enabled 
                            ? 'bg-green-100 text-green-800 border-green-200' 
                            : 'bg-red-100 text-red-800 border-red-200'
                        }`}
                      >
                        {supplier.enabled ? "✓ Active" : "✗ Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Contact Information */}
                    <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
                      <h4 className="font-semibold text-sm text-blue-800 flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        Contact
                      </h4>
                      {supplier.contact_person && (
                        <p className="text-sm font-medium text-gray-800">{supplier.contact_person}</p>
                      )}
                      {supplier.phone && (
                        <p className="text-sm text-blue-600">{supplier.phone}</p>
                      )}
                      {supplier.email && (
                        <p className="text-sm text-blue-600">{supplier.email}</p>
                      )}
                    </div>

                    {/* Address */}
                    {supplier.billing_address && (
                      <div className="space-y-2 p-3 bg-purple-50 rounded-lg">
                        <h4 className="font-semibold text-sm text-purple-800 flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          Address
                        </h4>
                        <p className="text-sm text-purple-700">{supplier.billing_address}</p>
                      </div>
                    )}

                    {/* Specializations */}
                    <div className="space-y-2 p-3 bg-orange-50 rounded-lg">
                      <h4 className="font-semibold text-sm text-orange-800 flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        Specializations
                      </h4>
                      {supplier.supplier_specializations && supplier.supplier_specializations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {supplier.supplier_specializations
                            .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                            .map((spec) => (
                              <Badge 
                                key={spec.id} 
                                variant="outline" 
                                className={`text-xs font-medium ${
                                  (spec.priority || 1) === 1 
                                    ? 'bg-orange-100 text-orange-800 border-orange-300' 
                                    : (spec.priority || 1) === 2 
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                    : 'bg-gray-100 text-gray-800 border-gray-300'
                                }`}
                              >
                                {spec.specialization_name} (P:{spec.priority || 1})
                              </Badge>
                            ))}
                        </div>
                      ) : (
                        <p className="text-sm text-orange-600">No specializations</p>
                      )}
                    </div>

                    {/* Financial Information */}
                    <div className="grid grid-cols-2 gap-4 p-3 bg-emerald-50 rounded-lg">
                      <div>
                        <p className="text-xs text-emerald-700 font-medium">Credit Limit</p>
                        <p className="text-sm font-bold text-emerald-800">
                          {supplier.credit_limit ? formatCurrency(supplier.credit_limit) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-emerald-700 font-medium">Outstanding</p>
                        <p className={`text-sm font-bold ${
                          (supplier.total_outstanding_amount || 0) > 0 
                            ? 'text-red-600' 
                            : 'text-emerald-800'
                        }`}>
                          {supplier.total_outstanding_amount ? formatCurrency(supplier.total_outstanding_amount) : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t border-gray-200">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 hover:text-blue-800"
                        onClick={() => {
                          setShowSpecializations(supplier.id);
                          fetchSpecializations(supplier.id);
                        }}
                      >
                        <Tag className="w-4 h-4 mr-2" />
                        Specializations
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800"
                        onClick={() => openDialog(supplier)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-red-50 hover:bg-red-100 border-red-200 text-red-700 hover:text-red-800"
                        onClick={() => handleDelete(supplier.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier_code">Supplier Code *</Label>
                    <Input
                      id="supplier_code"
                      value={formData.supplier_code}
                      onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplier_name">Supplier Name *</Label>
                    <Input
                      id="supplier_name"
                      value={formData.supplier_name}
                      onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="credit_limit">Credit Limit</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      value={formData.credit_limit}
                      onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pan">PAN</Label>
                    <Input
                      id="pan"
                      value={formData.pan}
                      onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gst_number">GST Number</Label>
                  <Input
                    id="gst_number"
                    value={formData.gst_number}
                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                
                <div>
                  <Label htmlFor="contact_person">Contact Person</Label>
                  <Input
                    id="contact_person"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Billing Address</h3>
              
              <div>
                <Label htmlFor="billing_address">Billing Address</Label>
                <textarea
                  id="billing_address"
                  value={formData.billing_address}
                  onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
                  className="w-full min-h-[100px] px-3 py-2 border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-md"
                  placeholder="Enter complete billing address including street, city, state, country, pincode..."
                />
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSupplier ? 'Update Supplier' : 'Create Supplier'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Specializations Dialog */}
      <Dialog open={!!showSpecializations} onOpenChange={() => setShowSpecializations(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Manage Specializations</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Add Specialization */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Type</Label>
                <Select 
                  value={specializationForm.specialization_type} 
                  onValueChange={(value: 'fabric' | 'item' | 'product') => 
                    setSpecializationForm({ ...specializationForm, specialization_type: value, specialization_id: '', specialization_name: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fabric">Fabric</SelectItem>
                    <SelectItem value="item">Item</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Item</Label>
                <Select 
                  value={specializationForm.specialization_id}
                  onValueChange={(value) => {
                    const option = specializationOptions.find(opt => opt.id === value);
                    setSpecializationForm({ 
                      ...specializationForm, 
                      specialization_id: value,
                      specialization_name: option?.name || ''
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getSpecializationOptions(specializationForm.specialization_type).map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={specializationForm.priority}
                  onChange={(e) => setSpecializationForm({ ...specializationForm, priority: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="10"
                />
              </div>
              
              <div className="flex items-end">
                <Button onClick={handleAddSpecialization} disabled={!specializationForm.specialization_id}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Current Specializations */}
            <div>
              <h4 className="font-semibold mb-3">Current Specializations</h4>
              <div className="space-y-2">
                {specializations.map((spec) => (
                  <div key={spec.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{spec.specialization_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {spec.specialization_type} • Priority: {spec.priority}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveSpecialization(spec.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {specializations.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    No specializations added yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Suppliers</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Instructions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Step 1: Download Template</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Download the Excel template with the correct format and sample data.
                    </p>
                    <Button onClick={downloadTemplate} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download Template
                    </Button>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Step 2: Upload File</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Fill in your data and upload the Excel file for validation.
                    </p>
                    <div className="relative">
                      <Input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                
                                 <div className="bg-blue-50 p-4 rounded-lg">
                   <h4 className="font-semibold text-blue-800 mb-2">Important Notes:</h4>
                   <ul className="text-sm text-blue-700 space-y-1">
                     <li>• Fields marked with * are required</li>
                     <li>• Supplier Code must be unique</li>
                     <li>• Email must be in valid format</li>
                     <li>• PAN must be in format: ABCDE1234F</li>
                     <li>• GST must be in valid format</li>
                     <li>• Enabled field accepts: true/false (default: true)</li>
                     <li>• Billing Address should include complete address details</li>
                     <li>• Total Outstanding Amount defaults to 0 if not provided</li>
                   </ul>
                 </div>
              </CardContent>
            </Card>

            {/* File Upload Status */}
            {uploadedFile && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    File: {uploadedFile.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        Total Rows: {uploadedData.length}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Valid: {uploadedData.filter(r => r.errors.length === 0).length}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Errors: {uploadedData.filter(r => r.errors.length > 0).length}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {uploadedData.filter(r => r.errors.length > 0).length > 0 && (
                        <Button onClick={downloadErrorFile} variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Download Errors
                        </Button>
                      )}
                      <Button onClick={resetBulkUpload} variant="outline" size="sm">
                        Reset
                      </Button>
                    </div>
                  </div>

                  {/* Upload Progress */}
                  {uploading && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Uploading...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!uploading && uploadedData.length > 0 && (
                    <div className="flex gap-2">
                      <Button 
                        onClick={uploadSuppliers}
                        disabled={uploadedData.filter(r => r.errors.length === 0).length === 0}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload {uploadedData.filter(r => r.errors.length === 0).length} Suppliers
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Preview Table */}
            {uploadedData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                                                     <TableHead>Row</TableHead>
                           <TableHead>Supplier Code</TableHead>
                           <TableHead>Supplier Name</TableHead>
                           <TableHead>Contact</TableHead>
                           <TableHead>Billing Address</TableHead>
                           <TableHead>Credit Limit</TableHead>
                           <TableHead>Status</TableHead>
                           <TableHead>Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {uploadedData.map((row, index) => (
                          <TableRow key={index}>
                            <TableCell>{row.row}</TableCell>
                            <TableCell className="font-medium">
                              {row.data['Supplier Code*'] || '-'}
                            </TableCell>
                            <TableCell>{row.data['Supplier Name*'] || '-'}</TableCell>
                                                         <TableCell>
                               <div className="text-sm">
                                 {row.data['Contact Person'] && <div>{row.data['Contact Person']}</div>}
                                 {row.data['Phone'] && <div className="text-muted-foreground">{row.data['Phone']}</div>}
                                 {row.data['Email'] && <div className="text-muted-foreground">{row.data['Email']}</div>}
                               </div>
                             </TableCell>
                             <TableCell>
                               <div className="text-sm max-w-xs truncate">
                                 {row.data['Billing Address'] || '-'}
                               </div>
                             </TableCell>
                             <TableCell>
                               {row.data['Credit Limit'] ? formatCurrency(parseFloat(row.data['Credit Limit'])) : '-'}
                             </TableCell>
                            <TableCell>
                              {row.status === 'pending' && (
                                <Badge variant="secondary">Pending</Badge>
                              )}
                              {row.status === 'success' && (
                                <Badge variant="default" className="bg-green-600">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Success
                                </Badge>
                              )}
                              {row.status === 'error' && (
                                <Badge variant="destructive">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Error
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.errors.length > 0 ? (
                                <div className="text-sm text-red-600">
                                  {row.errors.map((error, i) => (
                                    <div key={i} className="flex items-start gap-1">
                                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                      <span>{error}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-green-600">Valid</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
