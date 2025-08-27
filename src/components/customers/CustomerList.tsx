import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, Download, Upload } from 'lucide-react';
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
  mobile: string;
  email: string;
  customer_type_id: number;
  address: string;
  city: string;
  state_id: number;
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
        .select(`
          *,
          customer_types!customers_customer_type_id_fkey(name),
          states!customers_state_id_fkey(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to include the names
      const transformedData = (data || []).map(customer => ({
        ...customer,
        customer_type_name: customer.customer_types?.name || 'Unknown',
        state_name: customer.states?.name || 'Unknown'
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
        customer.mobile?.includes(searchTerm) ||
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
        customer.mobile || '',
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

    // Create data sheet
    const dataSheet = [
      ['Company Name', 'GSTIN', 'Mobile', 'Email', 'Customer Type', 'Address', 'City', 'State', 'Pincode', 'Loyalty Points'],
      ['Example Company', 'GSTIN123456789', '9876543210', 'example@email.com', 'Wholesale', '123 Main St', 'Mumbai', 'Maharashtra', '400001', '0'],
      ['ABC Textiles', 'GSTIN987654321', '9876543211', 'contact@abctextiles.com', 'Retail', '456 Industrial Area', 'Delhi', 'Delhi', '110001', '0'],
      ['Fashion Hub', 'GSTIN456789123', '9876543212', 'sales@fashionhub.com', 'Ecommerce', '789 Commercial Plaza', 'Bangalore', 'Karnataka', '560001', '0'],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '']
    ];

    const dataWorksheet = XLSX.utils.aoa_to_sheet(dataSheet);
    XLSX.utils.book_append_sheet(workbook, dataWorksheet, 'Data Entry');

    // Create instructions sheet
    const instructionsSheet = [
      ['CUSTOMER BULK UPLOAD INSTRUCTIONS'],
      [''],
      ['📋 REQUIRED FIELDS:'],
      ['• Company Name: Required, cannot be empty'],
      ['• Mobile: Required, must be at least 10 digits'],
      ['• Email: Required, must be valid email format'],
      ['• Customer Type: Required, must be one of the valid types'],
      ['• Address: Required, cannot be empty'],
      ['• City: Required, cannot be empty'],
      ['• State: Required, must be one of the valid states'],
      ['• Pincode: Required, must be exactly 6 digits'],
      [''],
      ['📋 OPTIONAL FIELDS:'],
      ['• GSTIN: Optional but recommended for business customers'],
      ['• Loyalty Points: Optional, defaults to 0'],
      [''],
      ['📋 VALID CUSTOMER TYPES:'],
      ['• Wholesale - Wholesale customers (15% discount)'],
      ['• Retail - Retail customers (5% discount)'],
      ['• Ecommerce - Online platform customers (10% discount)'],
      ['• Staff - Company staff purchases (25% discount)'],
      [''],
      ['📋 VALID STATES:'],
      ['• Andhra Pradesh (AP)'],
      ['• Arunachal Pradesh (AR)'],
      ['• Assam (AS)'],
      ['• Bihar (BR)'],
      ['• Chhattisgarh (CG)'],
      ['• Delhi (DL)'],
      ['• Goa (GA)'],
      ['• Gujarat (GJ)'],
      ['• Haryana (HR)'],
      ['• Himachal Pradesh (HP)'],
      ['• Jharkhand (JH)'],
      ['• Karnataka (KA)'],
      ['• Kerala (KL)'],
      ['• Madhya Pradesh (MP)'],
      ['• Maharashtra (MH)'],
      ['• Manipur (MN)'],
      ['• Meghalaya (ML)'],
      ['• Mizoram (MZ)'],
      ['• Nagaland (NL)'],
      ['• Odisha (OR)'],
      ['• Punjab (PB)'],
      ['• Rajasthan (RJ)'],
      ['• Sikkim (SK)'],
      ['• Tamil Nadu (TN)'],
      ['• Telangana (TS)'],
      ['• Tripura (TR)'],
      ['• Uttar Pradesh (UP)'],
      ['• Uttarakhand (UK)'],
      ['• West Bengal (WB)'],
      [''],
      ['📋 FORMAT REQUIREMENTS:'],
      ['• Mobile: Must be at least 10 digits (e.g., 9876543210)'],
      ['• Email: Must be valid format (e.g., user@domain.com)'],
      ['• Pincode: Must be exactly 6 digits (e.g., 400001)'],
      ['• GSTIN: Should be in format GSTINXXXXXXXXX (optional)'],
      ['• Loyalty Points: Must be a number (default 0)'],
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
      ['• Use exact customer type names as listed above'],
      ['• All required fields must be filled'],
      ['• Save as CSV format before uploading'],
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
      ['ID', 'Name', 'Description', 'Discount'],
      [1, 'Wholesale', 'Wholesale customers', '15%'],
      [2, 'Retail', 'Retail customers', '5%'],
      [3, 'Ecommerce', 'Online platform customers', '10%'],
      [4, 'Staff', 'Company staff purchases', '25%'],
      [''],
      ['STATES:'],
      ['ID', 'Name', 'Code', 'Major Cities'],
      [1, 'Andhra Pradesh', 'AP', 'Visakhapatnam, Vijayawada'],
      [2, 'Arunachal Pradesh', 'AR', 'Itanagar'],
      [3, 'Assam', 'AS', 'Guwahati'],
      [4, 'Bihar', 'BR', 'Patna'],
      [5, 'Chhattisgarh', 'CG', 'Raipur'],
      [6, 'Delhi', 'DL', 'New Delhi'],
      [7, 'Goa', 'GA', 'Panaji'],
      [8, 'Gujarat', 'GJ', 'Ahmedabad, Surat'],
      [9, 'Haryana', 'HR', 'Gurgaon, Chandigarh'],
      [10, 'Himachal Pradesh', 'HP', 'Shimla'],
      [11, 'Jharkhand', 'JH', 'Ranchi'],
      [12, 'Karnataka', 'KA', 'Bangalore, Mysore'],
      [13, 'Kerala', 'KL', 'Kochi, Trivandrum'],
      [14, 'Madhya Pradesh', 'MP', 'Bhopal, Indore'],
      [15, 'Maharashtra', 'MH', 'Mumbai, Pune, Nagpur'],
      [16, 'Manipur', 'MN', 'Imphal'],
      [17, 'Meghalaya', 'ML', 'Shillong'],
      [18, 'Mizoram', 'MZ', 'Aizawl'],
      [19, 'Nagaland', 'NL', 'Kohima'],
      [20, 'Odisha', 'OR', 'Bhubaneswar'],
      [21, 'Punjab', 'PB', 'Chandigarh, Ludhiana'],
      [22, 'Rajasthan', 'RJ', 'Jaipur, Jodhpur'],
      [23, 'Sikkim', 'SK', 'Gangtok'],
      [24, 'Tamil Nadu', 'TN', 'Chennai, Coimbatore'],
      [25, 'Telangana', 'TS', 'Hyderabad'],
      [26, 'Tripura', 'TR', 'Agartala'],
      [27, 'Uttar Pradesh', 'UP', 'Lucknow, Kanpur'],
      [28, 'Uttarakhand', 'UK', 'Dehradun'],
      [29, 'West Bengal', 'WB', 'Kolkata, Howrah']
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
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
                if (lines[i].includes('Company Name') && lines[i].includes('Customer Type')) {
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
                console.log('Column 0 (Company):', dataLines[0][0]);
                console.log('Column 1 (GSTIN):', dataLines[0][1]);
                console.log('Column 2 (Mobile):', dataLines[0][2]);
                console.log('Column 3 (Email):', dataLines[0][3]);
                console.log('Column 4 (Customer Type):', dataLines[0][4]);
                console.log('Column 5 (Address):', dataLines[0][5]);
                console.log('Column 6 (City):', dataLines[0][6]);
                console.log('Column 7 (State):', dataLines[0][7]);
                console.log('Column 8 (Pincode):', dataLines[0][8]);
                console.log('Column 9 (Loyalty):', dataLines[0][9]);
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
            
            // First, fetch the reference data
            const { data: customerTypes, error: customerTypesError } = await supabase.from('customer_types').select('id, name');
            const { data: states, error: statesError } = await supabase.from('states').select('id, name');
            
            console.log('Customer Types from DB:', customerTypes);
            console.log('States from DB:', states);
            console.log('Customer Types Error:', customerTypesError);
            console.log('States Error:', statesError);
            
            if (customerTypesError || statesError) {
              console.error('Error fetching customer types:', customerTypesError);
              console.error('Error fetching states:', statesError);
              // Fallback to enum values if table doesn't exist
              const fallbackCustomerTypes = [
                { id: 1, name: 'Wholesale' },
                { id: 2, name: 'Retail' },
                { id: 3, name: 'Ecommerce' },
                { id: 4, name: 'Staff' }
              ];
              const fallbackStates = [
                { id: 1, name: 'Andhra Pradesh' },
                { id: 2, name: 'Arunachal Pradesh' },
                { id: 3, name: 'Assam' },
                { id: 4, name: 'Bihar' },
                { id: 5, name: 'Chhattisgarh' },
                { id: 6, name: 'Delhi' },
                { id: 7, name: 'Goa' },
                { id: 8, name: 'Gujarat' },
                { id: 9, name: 'Haryana' },
                { id: 10, name: 'Himachal Pradesh' },
                { id: 11, name: 'Jharkhand' },
                { id: 12, name: 'Karnataka' },
                { id: 13, name: 'Kerala' },
                { id: 14, name: 'Madhya Pradesh' },
                { id: 15, name: 'Maharashtra' },
                { id: 16, name: 'Manipur' },
                { id: 17, name: 'Meghalaya' },
                { id: 18, name: 'Mizoram' },
                { id: 19, name: 'Nagaland' },
                { id: 20, name: 'Odisha' },
                { id: 21, name: 'Punjab' },
                { id: 22, name: 'Rajasthan' },
                { id: 23, name: 'Sikkim' },
                { id: 24, name: 'Tamil Nadu' },
                { id: 25, name: 'Telangana' },
                { id: 26, name: 'Tripura' },
                { id: 27, name: 'Uttar Pradesh' },
                { id: 28, name: 'Uttarakhand' },
                { id: 29, name: 'West Bengal' }
              ];
              const customerTypeMap = new Map(fallbackCustomerTypes.map(ct => [ct.name.toLowerCase(), ct.id]));
              const stateMap = new Map(fallbackStates.map(s => [s.name.toLowerCase(), s.id]));
              
              console.log('Using fallback customer types:', fallbackCustomerTypes);
              console.log('Customer Type Map:', customerTypeMap);
              
              const customers = dataLines.map((values, index) => {
                const customerTypeName = values[4]?.trim()?.toLowerCase();
                const stateName = values[7]?.trim()?.toLowerCase();
                
                console.log(`Row ${index + 1}: Customer Type "${values[4]?.trim()}" -> "${customerTypeName}"`);
                console.log(`Row ${index + 1}: State "${values[7]?.trim()}" -> "${stateName}"`);
                
                // Validate customer type
                if (!customerTypeMap.has(customerTypeName)) {
                  const validTypes = Array.from(customerTypeMap.keys()).map(k => k.charAt(0).toUpperCase() + k.slice(1));
                  throw new Error(`Row ${index + 1}: Invalid Customer Type "${values[4]?.trim()}". Valid types: ${validTypes.join(', ')}`);
                }
                
                // Validate state
                if (!stateMap.has(stateName)) {
                  const validStates = Array.from(stateMap.keys()).map(k => k.charAt(0).toUpperCase() + k.slice(1));
                  throw new Error(`Row ${index + 1}: Invalid State "${values[7]?.trim()}". Valid states: ${validStates.join(', ')}`);
                }
                
                return {
                  company_name: values[0]?.trim(),
                  gstin: values[1]?.trim() || null,
                  mobile: values[2]?.trim(),
                  email: values[3]?.trim(),
                  customer_type_id: customerTypeMap.get(customerTypeName)!,
                  address: values[5]?.trim(),
                  city: values[6]?.trim(),
                  state_id: stateMap.get(stateName)!,
                  pincode: values[8]?.trim(),
                  loyalty_points: parseInt(values[9]) || 0
                };
              });

              // Validate required fields
              const invalidCustomers = customers.filter(customer => 
                !customer.company_name || !customer.mobile || !customer.email || !customer.address || !customer.city || !customer.pincode
              );
              
              if (invalidCustomers.length > 0) {
                throw new Error(`Invalid data found in ${invalidCustomers.length} rows. Please check required fields: Company Name, Mobile, Email, Address, City, Pincode`);
              }

              const { error } = await supabase
                .from('customers')
                .insert(customers);
              
              if (error) {
                console.error('Supabase error details:', error);
                if (error.message.includes('customer_type_id')) {
                  throw new Error('Invalid Customer Type. Valid types: Wholesale, Retail, Ecommerce, Staff');
                } else if (error.message.includes('state_id')) {
                  throw new Error('Invalid State. Please use exact state names like "Maharashtra", "Delhi", "Karnataka", etc.');
                } else if (error.message.includes('mobile')) {
                  throw new Error('Mobile number must be at least 10 digits');
                } else if (error.message.includes('email')) {
                  throw new Error('Invalid email format');
                } else if (error.message.includes('pincode')) {
                  throw new Error('Pincode must be exactly 6 digits');
                } else {
                  throw error;
                }
              }
              toast({
                title: "Success",
                description: `Successfully uploaded ${customers.length} customers! 🎉`,
              });
              fetchCustomers();
            } else {
              // Use actual database data
              const customerTypeMap = new Map(customerTypes?.map(ct => [ct.name.toLowerCase(), ct.id]) || []);
              const stateMap = new Map(states?.map(s => [s.name.toLowerCase(), s.id]) || []);
              
              console.log('Customer Type Map:', customerTypeMap);
              console.log('State Map:', stateMap);
              
              const customers = dataLines.map((values, index) => {
                const customerTypeName = values[4]?.trim()?.toLowerCase();
                const stateName = values[7]?.trim()?.toLowerCase();
                
                console.log(`Row ${index + 1}: Customer Type "${values[4]?.trim()}" -> "${customerTypeName}"`);
                console.log(`Row ${index + 1}: State "${values[7]?.trim()}" -> "${stateName}"`);
                
                // Validate customer type
                if (!customerTypeMap.has(customerTypeName)) {
                  const validTypes = Array.from(customerTypeMap.keys()).map(k => k.charAt(0).toUpperCase() + k.slice(1));
                  throw new Error(`Row ${index + 1}: Invalid Customer Type "${values[4]?.trim()}". Valid types: ${validTypes.join(', ')}`);
                }
                
                // Validate state
                if (!stateMap.has(stateName)) {
                  const validStates = Array.from(stateMap.keys()).map(k => k.charAt(0).toUpperCase() + k.slice(1));
                  throw new Error(`Row ${index + 1}: Invalid State "${values[7]?.trim()}". Valid states: ${validStates.join(', ')}`);
                }
                
                return {
                  company_name: values[0]?.trim(),
                  gstin: values[1]?.trim() || null,
                  mobile: values[2]?.trim(),
                  email: values[3]?.trim(),
                  customer_type_id: customerTypeMap.get(customerTypeName)!,
                  address: values[5]?.trim(),
                  city: values[6]?.trim(),
                  state_id: stateMap.get(stateName)!,
                  pincode: values[8]?.trim(),
                  loyalty_points: parseInt(values[9]) || 0
                };
              });

              // Validate required fields
              const invalidCustomers = customers.filter(customer => 
                !customer.company_name || !customer.mobile || !customer.email || !customer.address || !customer.city || !customer.pincode
              );
              
              if (invalidCustomers.length > 0) {
                throw new Error(`Invalid data found in ${invalidCustomers.length} rows. Please check required fields: Company Name, Mobile, Email, Address, City, Pincode`);
              }

              const { error } = await supabase
                .from('customers')
                .insert(customers);
              
              if (error) {
                console.error('Supabase error details:', error);
                if (error.message.includes('customer_type_id')) {
                  throw new Error('Invalid Customer Type. Valid types: Wholesale, Retail, Ecommerce, Staff');
                } else if (error.message.includes('state_id')) {
                  throw new Error('Invalid State. Please use exact state names like "Maharashtra", "Delhi", "Karnataka", etc.');
                } else if (error.message.includes('mobile')) {
                  throw new Error('Mobile number must be at least 10 digits');
                } else if (error.message.includes('email')) {
                  throw new Error('Invalid email format');
                } else if (error.message.includes('pincode')) {
                  throw new Error('Pincode must be exactly 6 digits');
                } else {
                  throw error;
                }
              }
              toast({
                title: "Success",
                description: `Successfully uploaded ${customers.length} customers! 🎉`,
              });
              fetchCustomers();
            }
          } catch (error) {
            console.error('Error uploading customers:', error);
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to upload customers. Please check the template format.",
              variant: "destructive",
            });
          }
        };
        
        if (file.name.endsWith('.csv')) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
      }
    };
    input.click();
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
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Download Excel Template
          </Button>
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
                          <div className="text-sm">{customer.mobile}</div>
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
    </div>
  );
}