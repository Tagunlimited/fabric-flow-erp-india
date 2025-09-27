import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, Download, Upload, X, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CustomerForm } from './CustomerForm';
import { calculateLifetimeValue, formatCurrency } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface Customer {
  id: string;
  customer_id: string;
  company_name: string;
  gstin?: string;
  phone: string;
  email: string;
  customer_type: number;
  address: string;
  city: string;
  state: number;
  pincode: string;
  loyalty_points: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Added for display purposes
  customer_type_name?: string;
  state_name?: string;
}

export function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerLifetimeValues, setCustomerLifetimeValues] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    filterCustomers();
  }, [customers, searchTerm, selectedType]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      
      // Fetch customers with joined data
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to include the names (using enum values directly)
      const transformedData = (data || []).map(customer => ({
        ...customer,
        customer_type_name: customer.customer_type || 'Unknown',
        state_name: customer.state || 'Unknown'
      }));
      
      setCustomers(transformedData);
      
      // Fetch lifetime values for all customers
      if (transformedData && transformedData.length > 0) {
        await fetchCustomerLifetimeValues(transformedData);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerLifetimeValues = async (customerList: Customer[]) => {
    try {
      const customerIds = customerList.map(c => c.id);
      const lifetimeValues: Record<string, number> = {};

      // Fetch invoices for all customers
      const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('customer_id, total_amount')
        .in('customer_id', customerIds);

      if (invoiceError) throw invoiceError;

      // Fetch orders for all customers
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('customer_id, final_amount')
        .in('customer_id', customerIds);

      if (orderError) throw orderError;

      // Calculate lifetime value for each customer
      customerIds.forEach(customerId => {
        const customerInvoices = invoices?.filter(inv => inv.customer_id === customerId) || [];
        const customerOrders = orders?.filter(ord => ord.customer_id === customerId) || [];
        lifetimeValues[customerId] = calculateLifetimeValue(customerInvoices, customerOrders);
      });

      setCustomerLifetimeValues(lifetimeValues);
    } catch (error) {
      console.error('Error fetching customer lifetime values:', error);
    }
  };

  const filterCustomers = () => {
    let filtered = customers;

    if (searchTerm) {
      filtered = filtered.filter(customer =>
        customer.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.includes(searchTerm) ||
        customer.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(customer => 
        customer.customer_type_name?.toLowerCase() === selectedType.toLowerCase()
      );
    }

    setFilteredCustomers(filtered);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleDelete = async (customerId: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: "Error",
        description: "Failed to delete customer",
        variant: "destructive",
      });
    }
  };

  const handleFormSave = (customer: Customer) => {
    setShowForm(false);
    setEditingCustomer(null);
    fetchCustomers();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingCustomer(null);
  };

  const exportCustomers = async () => {
    const csvContent = [
      ['Company Name', 'GSTIN', 'Mobile', 'Email', 'Customer Type', 'Address', 'City', 'State', 'Pincode', 'Loyalty Points'],
      ...filteredCustomers.map(customer => [
        customer.company_name,
        customer.gstin || '',
        customer.phone || '',
        customer.email || '',
        customer.customer_type_name || 'Unknown',
        customer.address || '',
        customer.city || '',
        customer.state_name || 'Unknown',
        customer.pincode || '',
        customer.loyalty_points?.toString() || '0'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Success", 
      description: "Customer data exported successfully!",
    });
  };

  const downloadTemplate = () => {
    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Create data sheet with all database columns
    const dataSheet = [
      ['Company Name', 'Contact Person', 'Email', 'Phone', 'Address', 'City', 'State', 'Pincode', 'GSTIN', 'PAN', 'Customer Type', 'Customer Tier', 'Credit Limit', 'Outstanding Amount', 'Total Orders', 'Last Order Date'],
      ['Example Company', 'John Doe', 'example@email.com', '9876543210', '123 Main St', 'Mumbai', 'Maharashtra', '400001', 'GSTIN123456789', 'ABCDE1234F', 'Wholesale', 'gold', '100000', '0', '0', ''],
      ['ABC Textiles', 'Jane Smith', 'contact@abctextiles.com', '9876543211', '456 Industrial Area', 'Delhi', 'Delhi', '110001', 'GSTIN987654321', 'FGHIJ5678K', 'Retail', 'silver', '50000', '0', '0', ''],
      ['Fashion Hub', 'Mike Johnson', 'sales@fashionhub.com', '9876543212', '789 Commercial Plaza', 'Bangalore', 'Karnataka', '560001', 'GSTIN456789123', 'LMNOP9012Q', 'Corporate', 'bronze', '25000', '0', '0', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ];

    const dataWorksheet = XLSX.utils.aoa_to_sheet(dataSheet);
    XLSX.utils.book_append_sheet(workbook, dataWorksheet, 'Data Entry');

    // Create instructions sheet
    const instructionsSheet = [
      ['CUSTOMER BULK UPLOAD INSTRUCTIONS'],
      [''],
      ['📋 REQUIRED FIELDS:'],
      ['• Company Name: Required, cannot be empty'],
      ['• Email: Required, must be valid email format'],
      ['• Phone: Required, must be at least 10 digits'],
      ['• Address: Required, cannot be empty'],
      ['• City: Required, cannot be empty'],
      ['• State: Required, must be one of the valid states'],
      ['• Pincode: Required, must be exactly 6 digits'],
      [''],
      ['📋 OPTIONAL FIELDS:'],
      ['• Contact Person: Optional, contact person name'],
      ['• GSTIN: Optional but recommended for business customers'],
      ['• PAN: Optional, PAN number for business customers'],
      ['• Customer Type: Optional, defaults to Retail'],
      ['• Customer Tier: Optional, defaults to Bronze'],
      ['• Credit Limit: Optional, defaults to 0'],
      ['• Outstanding Amount: Optional, defaults to 0'],
      ['• Total Orders: Optional, defaults to 0'],
      ['• Last Order Date: Optional, format: YYYY-MM-DD'],
      [''],
      ['📋 VALID CUSTOMER TYPES:'],
      ['• Retail - Retail customers'],
      ['• Wholesale - Wholesale customers'],
      ['• Corporate - Corporate customers'],
      ['• B2B - Business to Business customers'],
      ['• B2C - Business to Consumer customers'],
      ['• Enterprise - Enterprise customers'],
      [''],
      ['📋 VALID CUSTOMER TIERS:'],
      ['• Bronze - Basic tier customers'],
      ['• Silver - Mid-tier customers'],
      ['• Gold - Premium tier customers'],
      ['• Platinum - VIP tier customers'],
      [''],
      ['📋 VALID STATES:'],
      ['• Andhra Pradesh, Arunachal Pradesh, Assam, Bihar'],
      ['• Chhattisgarh, Delhi, Goa, Gujarat, Haryana'],
      ['• Himachal Pradesh, Jharkhand, Karnataka, Kerala'],
      ['• Madhya Pradesh, Maharashtra, Manipur, Meghalaya'],
      ['• Mizoram, Nagaland, Odisha, Punjab, Rajasthan'],
      ['• Sikkim, Tamil Nadu, Telangana, Tripura'],
      ['• Uttar Pradesh, Uttarakhand, West Bengal'],
      [''],
      ['📋 FORMAT REQUIREMENTS:'],
      ['• Phone: Must be at least 10 digits (e.g., 9876543210)'],
      ['• Email: Must be valid format (e.g., user@domain.com)'],
      ['• Pincode: Must be exactly 6 digits (e.g., 400001)'],
      ['• GSTIN: Should be in format GSTINXXXXXXXXX (optional)'],
      ['• PAN: Should be in format ABCDE1234F (optional)'],
      ['• Credit Limit: Must be a number (default 0)'],
      ['• Outstanding Amount: Must be a number (default 0)'],
      ['• Total Orders: Must be a number (default 0)'],
      ['• Last Order Date: Format YYYY-MM-DD (optional)'],
      [''],
      ['📋 COMMON CITIES AND STATES:'],
      ['• Mumbai, Pune, Nagpur → Maharashtra'],
      ['• Delhi → Delhi'],
      ['• Bangalore, Mysore → Karnataka'],
      ['• Chennai, Coimbatore → Tamil Nadu'],
      ['• Ahmedabad, Surat → Gujarat'],
      ['• Jaipur, Jodhpur → Rajasthan'],
      ['• Kolkata, Howrah → West Bengal'],
      ['• Hyderabad → Telangana'],
      ['• Lucknow, Kanpur → Uttar Pradesh'],
      [''],
      ['⚠️ IMPORTANT NOTES:'],
      ['• Do not change the column headers'],
      ['• Use exact state names as listed above'],
      ['• Use exact customer type and tier names as listed above'],
      ['• All required fields must be filled'],
      ['• Save as CSV or Excel format before uploading'],
      ['• Test with a few records first'],
      [''],
      ['📞 SUPPORT:'],
      ['If you encounter any issues, check the error message for specific guidance.']
    ];

    const instructionsWorksheet = XLSX.utils.aoa_to_sheet(instructionsSheet);
    XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, 'Instructions');

    // Create reference data sheet
    const referenceSheet = [
      ['REFERENCE DATA'],
      [''],
      ['CUSTOMER TYPES:'],
      ['Name', 'Description'],
      ['Retail', 'Retail customers'],
      ['Wholesale', 'Wholesale customers'],
      ['Corporate', 'Corporate customers'],
      ['B2B', 'Business to Business customers'],
      ['B2C', 'Business to Consumer customers'],
      ['Enterprise', 'Enterprise customers'],
      [''],
      ['CUSTOMER TIERS:'],
      ['Name', 'Description'],
      ['Bronze', 'Basic tier customers'],
      ['Silver', 'Mid-tier customers'],
      ['Gold', 'Premium tier customers'],
      ['Platinum', 'VIP tier customers'],
      [''],
      ['STATES:'],
      ['Name', 'Major Cities'],
      ['Andhra Pradesh', 'Visakhapatnam, Vijayawada'],
      ['Arunachal Pradesh', 'Itanagar'],
      ['Assam', 'Guwahati'],
      ['Bihar', 'Patna'],
      ['Chhattisgarh', 'Raipur'],
      ['Delhi', 'New Delhi'],
      ['Goa', 'Panaji'],
      ['Gujarat', 'Ahmedabad, Surat'],
      ['Haryana', 'Gurgaon, Chandigarh'],
      ['Himachal Pradesh', 'Shimla'],
      ['Jharkhand', 'Ranchi'],
      ['Karnataka', 'Bangalore, Mysore'],
      ['Kerala', 'Kochi, Trivandrum'],
      ['Madhya Pradesh', 'Bhopal, Indore'],
      ['Maharashtra', 'Mumbai, Pune, Nagpur'],
      ['Manipur', 'Imphal'],
      ['Meghalaya', 'Shillong'],
      ['Mizoram', 'Aizawl'],
      ['Nagaland', 'Kohima'],
      ['Odisha', 'Bhubaneswar'],
      ['Punjab', 'Chandigarh, Ludhiana'],
      ['Rajasthan', 'Jaipur, Jodhpur'],
      ['Sikkim', 'Gangtok'],
      ['Tamil Nadu', 'Chennai, Coimbatore'],
      ['Telangana', 'Hyderabad'],
      ['Tripura', 'Agartala'],
      ['Uttar Pradesh', 'Lucknow, Kanpur'],
      ['Uttarakhand', 'Dehradun'],
      ['West Bengal', 'Kolkata, Howrah']
    ];

    const referenceWorksheet = XLSX.utils.aoa_to_sheet(referenceSheet);
    XLSX.utils.book_append_sheet(workbook, referenceWorksheet, 'Reference Data');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_upload_template.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Success", 
      description: "Excel template with multiple worksheets downloaded!",
    });
  };

  const handleBulkUpload = () => {
    setShowBulkUpload(true);
  };

  const handleFileUpload = async () => {
    if (!bulkFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const file = bulkFile;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            let dataLines: string[][] = [];
            
            console.log('File type detection:', file.name, 'endsWith .csv:', file.name.endsWith('.csv'));
            
            if (file.name.endsWith('.csv')) {
              console.log('Processing as CSV file');
              // Handle CSV file
              const csv = event.target?.result as string;
              const lines = csv.split('\n');
              
              console.log('CSV parsing debug:');
              console.log('Total lines:', lines.length);
              console.log('First 3 lines:', lines.slice(0, 3));
              
              // Find the data section (skip instructions)
              let dataStartIndex = 0;
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('Company Name') && lines[i].includes('Contact Person')) {
                  dataStartIndex = i;
                  break;
                }
              }
              
              console.log('Data start index:', dataStartIndex);
              console.log('Headers line:', lines[dataStartIndex]);
              
              const headers = lines[dataStartIndex].split(',');
              console.log('Headers array:', headers);
              
              const rawDataLines = lines.slice(dataStartIndex + 1).filter(line => 
                line.trim() && !line.startsWith('📋') && !line.startsWith('⚠️') && !line.startsWith('📞') && !line.startsWith('CUSTOMER')
              );
              
              console.log('Raw data lines (first 2):', rawDataLines.slice(0, 2));
              
              dataLines = rawDataLines.map(line => {
                // More robust CSV parsing that handles quoted values and commas within fields
                const result = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                  const char = line[i];
                  if (char === '"') {
                    inQuotes = !inQuotes;
                  } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                  } else {
                    current += char;
                  }
                }
                result.push(current.trim()); // Add the last field
                return result;
              });
              
              console.log('Processed data lines (first 2):', dataLines.slice(0, 2));
              console.log('Column count check - Row 1 has', dataLines[0]?.length, 'columns');
              console.log('Row 1 columns:', dataLines[0]);
              
              // Debug: Check if the data structure is correct
              if (dataLines.length > 0 && dataLines[0]) {
                console.log('DEBUG - Expected column structure:');
                console.log('Column 0 (Company Name):', dataLines[0][0]);
                console.log('Column 1 (Contact Person):', dataLines[0][1]);
                console.log('Column 2 (Email):', dataLines[0][2]);
                console.log('Column 3 (Phone):', dataLines[0][3]);
                console.log('Column 4 (Address):', dataLines[0][4]);
                console.log('Column 5 (City):', dataLines[0][5]);
                console.log('Column 6 (State):', dataLines[0][6]);
                console.log('Column 7 (Pincode):', dataLines[0][7]);
                console.log('Column 8 (GSTIN):', dataLines[0][8]);
                console.log('Column 9 (PAN):', dataLines[0][9]);
                console.log('Column 10 (Customer Type):', dataLines[0][10]);
                console.log('Column 11 (Customer Tier):', dataLines[0][11]);
                console.log('Column 12 (Credit Limit):', dataLines[0][12]);
                console.log('Column 13 (Outstanding Amount):', dataLines[0][13]);
                console.log('Column 14 (Total Orders):', dataLines[0][14]);
                console.log('Column 15 (Last Order Date):', dataLines[0][15]);
              }
            } else {
              console.log('Processing as Excel file');
              // Handle Excel file
              const data = new Uint8Array(event.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: 'array' });
              const worksheet = workbook.Sheets['Data Entry'] || workbook.Sheets[workbook.SheetNames[0]];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
              
              console.log('Excel parsing debug:');
              console.log('Sheet names:', workbook.SheetNames);
              console.log('Using worksheet:', workbook.Sheets['Data Entry'] ? 'Data Entry' : workbook.SheetNames[0]);
              console.log('Raw JSON data (first 3 rows):', jsonData.slice(0, 3));
              
              // Skip header row and empty rows
              dataLines = jsonData.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()));
              console.log('Processed data lines (first 2 rows):', dataLines.slice(0, 2));
            }
            
            // Process data directly with enum validation (no database lookup needed)
            console.log('Processing customer data with enum validation');
            
            // Skip old database lookup logic
            
            // Process data with new enum-based approach
            
            // Use actual database data - Updated for new schema
              const customers = dataLines.map((values, index) => {
                // Helper function to safely get string value
                const getStringValue = (value: any): string => {
                  if (value === null || value === undefined) return '';
                  return String(value).trim();
                };

                // Helper function to safely get string value or null
                const getStringValueOrNull = (value: any): string | null => {
                  const str = getStringValue(value);
                  return str === '' ? null : str;
                };

                const customerTypeName = getStringValue(values[10]) || 'Retail';
                const customerTierName = (getStringValue(values[11]) || 'bronze').toLowerCase();
                
                console.log(`Row ${index + 1}: Customer Type "${getStringValue(values[10])}" -> "${customerTypeName}"`);
                console.log(`Row ${index + 1}: Customer Tier "${getStringValue(values[11])}" -> "${customerTierName}"`);
                
                // Validate customer type
                const validTypes = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
                if (!validTypes.includes(customerTypeName)) {
                  throw new Error(`Row ${index + 1}: Invalid Customer Type "${getStringValue(values[10])}". Valid types: ${validTypes.join(', ')}`);
                }
                
                // Validate customer tier (case-insensitive input, but store as lowercase)
                const validTiers = ['bronze', 'silver', 'gold', 'platinum'];
                if (!validTiers.includes(customerTierName)) {
                  throw new Error(`Row ${index + 1}: Invalid Customer Tier "${getStringValue(values[11])}". Valid tiers: ${validTiers.join(', ')}`);
                }
                
                return {
                  company_name: getStringValue(values[0]),
                  contact_person: getStringValueOrNull(values[1]),
                  email: getStringValue(values[2]),
                  phone: getStringValue(values[3]),
                  address: getStringValue(values[4]),
                  city: getStringValue(values[5]),
                  state: getStringValue(values[6]),
                  pincode: getStringValue(values[7]),
                  gstin: getStringValueOrNull(values[8]),
                  pan: getStringValueOrNull(values[9]),
                  customer_type: customerTypeName,
                  customer_tier: customerTierName,
                  credit_limit: parseFloat(getStringValue(values[12])) || 0,
                  outstanding_amount: parseFloat(getStringValue(values[13])) || 0,
                  total_orders: parseInt(getStringValue(values[14])) || 0,
                  last_order_date: getStringValueOrNull(values[15])
                };
              });

              // Validate required fields
              const invalidCustomers = customers.filter(customer => 
                !customer.company_name || !customer.phone || !customer.email || !customer.address || !customer.city || !customer.pincode
              );
              
              if (invalidCustomers.length > 0) {
                throw new Error(`Invalid data found in ${invalidCustomers.length} rows. Please check required fields: Company Name, Phone, Email, Address, City, Pincode`);
              }

              console.log('About to insert customers:', customers.slice(0, 2)); // Log first 2 customers for debugging

              const { error } = await supabase
                .from('customers')
                .insert(customers);
              
              if (error) {
                console.error('Supabase error details:', error);
                console.error('Error message:', error.message);
                console.error('Error details:', error.details);
                console.error('Error hint:', error.hint);
                if (error.message.includes('customer_type')) {
                  throw new Error('Invalid Customer Type. Valid types: Retail, Wholesale, Corporate, B2B, B2C, Enterprise');
                } else if (error.message.includes('state')) {
                  throw new Error('Invalid State. Please use exact state names like "Maharashtra", "Delhi", "Karnataka", etc.');
                } else if (error.message.includes('phone')) {
                  throw new Error('Mobile number must be at least 10 digits');
                } else if (error.message.includes('email')) {
                  throw new Error('Invalid email format');
                } else if (error.message.includes('pincode')) {
                  throw new Error('Pincode must be exactly 6 digits');
                } else {
                  throw error;
                }
              }
              setUploadProgress(100);
              toast({
                title: "Success",
                description: `Successfully uploaded ${customers.length} customers! 🎉`,
              });
              fetchCustomers();
              setShowBulkUpload(false);
              setBulkFile(null);
          } catch (error) {
            console.error('Error uploading customers:', error);
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to upload customers. Please check the template format.",
              variant: "destructive",
            });
          } finally {
            setIsUploading(false);
            setUploadProgress(0);
          }
        };
        
        if (file.name.endsWith('.csv')) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
    } catch (error) {
      console.error('Error uploading customers:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload customers. Please check the template format.",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (showForm) {
    return (
      <CustomerForm
        customer={editingCustomer}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Customer Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer database and relationships
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={exportCustomers}>
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
          <Button variant="outline" onClick={handleBulkUpload}>
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
          <Button onClick={() => setShowForm(true)} className="bg-gradient-primary hover:bg-gradient-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      <Card className="shadow-erp-md">
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="ecommerce">Ecommerce</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Loyalty Points</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/crm/customers/${customer.id}`)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer.company_name}</div>
                          {customer.gstin && (
                            <div className="text-sm text-muted-foreground">GST: {customer.gstin}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{customer.phone}</div>
                          <div className="text-sm text-muted-foreground">{customer.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {customer.customer_type_name || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.city}</div>
                          <div className="text-muted-foreground">
                            {customer.state_name || 'Unknown'} - {customer.pincode}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge className="bg-accent text-accent-foreground">
                            Points: {customer.loyalty_points || 0}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            LTV: {formatCurrency(customerLifetimeValues[customer.id] || 0)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(customer)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(customer.id)}
                            className="text-error hover:text-error"
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

      {/* Bulk Upload Modal */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Customers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Download Template Button */}
            <Button 
              onClick={downloadTemplate} 
              variant="secondary"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Excel Template
            </Button>

            {/* Instructions */}
            <div className="text-sm text-muted-foreground">
              <div className="flex items-start space-x-2">
                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-2">Instructions:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Download the template and fill all required columns</li>
                    <li>Required: Company Name, Email, Phone, Address, City, State, Pincode</li>
                    <li>Optional: Contact Person, GSTIN, PAN, Customer Type, Customer Tier, etc.</li>
                    <li>File must be in CSV or Excel format</li>
                    <li>Customer Type: Retail, Wholesale, Corporate, B2B, B2C, Enterprise</li>
                    <li>Customer Tier: bronze, silver, gold, platinum (case-insensitive)</li>
                    <li>Use exact state names as shown in template</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Select File *</Label>
              <Input 
                type="file" 
                accept=".csv,.xlsx,.xls" 
                onChange={e => setBulkFile(e.target.files?.[0] || null)} 
                disabled={isUploading}
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
                    disabled={isUploading}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading customers...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowBulkUpload(false);
                  setBulkFile(null);
                  setUploadProgress(0);
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleFileUpload}
                disabled={!bulkFile || isUploading}
              >
                {isUploading ? 'Uploading...' : 'Upload Customers'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}