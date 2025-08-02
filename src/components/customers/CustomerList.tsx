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

interface Customer {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
  customer_tier: string;
  customer_type: string;
  credit_limit: number;
  outstanding_amount: number;
  total_orders: number;
  last_order_date: string;
  created_at: string;
  updated_at: string;
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
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
      
      // Fetch lifetime values for all customers
      if (data && data.length > 0) {
        await fetchCustomerLifetimeValues(data);
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
        customer.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(customer => 
        customer.customer_type?.toLowerCase() === selectedType.toLowerCase()
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

  const downloadTemplate = () => {
    const templateContent = [
      ['Company Name', 'Contact Person', 'Phone', 'Email', 'Address', 'City', 'State', 'Pincode', 'GSTIN', 'PAN', 'Customer Type', 'Customer Tier', 'Credit Limit', 'Outstanding Amount'],
      ['Sample Company Ltd', 'John Doe', '+91-9876543210', 'contact@samplecompany.com', '123 Main Street', 'Mumbai', 'Maharashtra', '400001', '27XXXXX1234X1Z5', 'ABCDE1234F', 'Wholesale', 'bronze', '100000', '0'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_upload_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Success",
      description: "Template downloaded successfully!",
    });
  };

  const exportCustomers = () => {
    const csvContent = [
      ['Company Name', 'Contact Person', 'Phone', 'Email', 'Address', 'City', 'State', 'Pincode', 'GSTIN', 'PAN', 'Customer Type', 'Customer Tier', 'Credit Limit', 'Outstanding Amount', 'Total Orders', 'Last Order Date', 'Lifetime Value'],
      ...filteredCustomers.map(customer => [
        customer.company_name,
        customer.contact_person || '',
        customer.phone || '',
        customer.email || '',
        customer.address || '',
        customer.city || '',
        customer.state || '',
        customer.pincode || '',
        customer.gstin || '',
        customer.pan || '',
        customer.customer_type || 'Retail',
        customer.customer_tier || 'bronze',
        customer.credit_limit?.toString() || '0',
        customer.outstanding_amount?.toString() || '0',
        customer.total_orders?.toString() || '0',
        customer.last_order_date || '',
        customerLifetimeValues[customer.id]?.toString() || '0'
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

  const handleBulkUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const csv = event.target?.result as string;
          const lines = csv.split('\n');
          const headers = lines[0].split(',');
          
          const customers = lines.slice(1).filter(line => line.trim()).map(line => {
            const values = line.split(',');
            return {
              company_name: values[0]?.trim(),
              contact_person: values[1]?.trim(),
              phone: values[2]?.trim(),
              email: values[3]?.trim(),
              address: values[4]?.trim(),
              city: values[5]?.trim(),
              state: values[6]?.trim(),
              pincode: values[7]?.trim(),
              gstin: values[8]?.trim(),
              pan: values[9]?.trim(),
              customer_type: values[10]?.trim() as any || 'Retail',
              customer_tier: values[11]?.trim() as any || 'bronze',
              credit_limit: parseFloat(values[12]) || 0,
              outstanding_amount: parseFloat(values[13]) || 0
            };
          });

          try {
            const { error } = await supabase
              .from('customers')
              .insert(customers);
            
            if (error) throw error;
            toast({
              title: "Success",
              description: `Successfully uploaded ${customers.length} customers! 🎉`,
            });
            fetchCustomers();
          } catch (error) {
            console.error('Error uploading customers:', error);
            toast({
              title: "Error",
              description: "Failed to upload customers. Please check the template format.",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
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
            Download Template
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
                    <TableHead>Credit Limit</TableHead>
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
                          <div className="text-sm font-medium">{customer.contact_person}</div>
                          <div className="text-sm">{customer.phone}</div>
                          <div className="text-sm text-muted-foreground">{customer.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {customer.customer_type || 'Retail'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.city}</div>
                          <div className="text-muted-foreground">
                            {customer.state} - {customer.pincode}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge className="bg-accent text-accent-foreground">
                            Credit: ₹{customer.credit_limit?.toLocaleString() || '0'}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            LTV: ₹{customerLifetimeValues[customer.id]?.toLocaleString() || '0'}
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