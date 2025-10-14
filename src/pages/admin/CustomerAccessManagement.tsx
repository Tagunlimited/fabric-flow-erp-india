import { useState, useEffect } from 'react';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  UserPlus, 
  Lock, 
  Unlock,
  Mail,
  Phone,
  Building,
  Users,
  UserCheck,
  UserX,
  Key,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Customer {
  id: string;
  company_name: string;
  email: string;
  phone: string;
  customer_type: string;
  has_portal_access: boolean;
  portal_settings?: any;
}

export function CustomerAccessManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form state for creating customer account
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    canViewOrders: true,
    canViewInvoices: true,
    canViewQuotations: true,
    canViewProductionStatus: true,
    canDownloadDocuments: true,
    canRequestChanges: true
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          customer_users(user_id),
          customer_portal_settings(*)
        `)
        .order('company_name');

      if (error) throw error;

      const customersWithAccess = data?.map((customer: any) => {
        const hasLink = Array.isArray(customer.customer_users) && customer.customer_users.length > 0;
        const hasSettings = Array.isArray(customer.customer_portal_settings) && customer.customer_portal_settings.length > 0;
        return {
        ...customer,
          has_portal_access: hasLink || hasSettings,
          portal_settings: hasSettings ? customer.customer_portal_settings[0] : null
        } as Customer & { portal_settings: any };
      }) || [];

      setCustomers(customersWithAccess);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const createCustomerAccount = async () => {
    if (!selectedCustomer) return;

    try {
      setCreating(true);

      // Call RPC to (re)create customer portal user with limited permissions
      const { error: rpcError } = await supabase.rpc('create_customer_portal_user_safe', {
        customer_email: formData.email,
        customer_password: formData.password,
        p_customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.company_name,
        p_can_view_orders: formData.canViewOrders,
        p_can_view_invoices: formData.canViewInvoices,
        p_can_view_quotations: formData.canViewQuotations,
        p_can_view_production_status: formData.canViewProductionStatus,
        p_can_download_documents: formData.canDownloadDocuments,
        p_can_request_changes: formData.canRequestChanges
      });

      if (rpcError) throw rpcError;

      toast.success(selectedCustomer.has_portal_access ? 'Portal settings updated' : 'Customer portal access enabled');
      const targetId = selectedCustomer.id;
      setShowCreateDialog(false);
      setFormData({
        email: '',
        password: '',
        canViewOrders: true,
        canViewInvoices: true,
        canViewQuotations: true,
        canViewProductionStatus: true,
        canDownloadDocuments: true,
        canRequestChanges: true
      });
      setSelectedCustomer(null);
      // Optimistically mark as active
      setCustomers(prev => prev.map(c => c.id === targetId ? {
        ...c,
        has_portal_access: true,
        portal_settings: {
          can_view_orders: formData.canViewOrders,
          can_view_invoices: formData.canViewInvoices,
          can_view_quotations: formData.canViewQuotations,
          can_view_production_status: formData.canViewProductionStatus,
          can_download_documents: formData.canDownloadDocuments,
          can_request_changes: formData.canRequestChanges
        }
      } : c));
      await fetchCustomers();
    } catch (error: any) {
      console.error('Error creating customer account:', error);
      toast.error(error.message || 'Failed to create customer account');
    } finally {
      setCreating(false);
    }
  };

  const toggleCustomerAccess = async (customer: Customer) => {
    try {
      if (customer.has_portal_access) {
        // Disable access
        const { error } = await supabase
          .from('customer_users')
          .delete()
          .eq('customer_id', customer.id);

        if (error) throw error;
        // Also remove portal settings so status reflects correctly on refresh
        await supabase
          .from('customer_portal_settings')
          .delete()
          .eq('customer_id', customer.id);
        toast.success('Customer portal access disabled');
      } else {
        // Enable access by creating account
        setSelectedCustomer(customer);
        setFormData(prev => ({ ...prev, email: customer.email || '' }));
        setShowCreateDialog(true);
        return;
      }

      // Optimistically update UI
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, has_portal_access: !customer.has_portal_access } : c));
      await fetchCustomers();
    } catch (error: any) {
      console.error('Error toggling customer access:', error);
      toast.error('Failed to update customer access');
    }
  };

  const stats = {
    total: customers.length,
    withAccess: customers.filter(c => c.has_portal_access).length,
    withoutAccess: customers.filter(c => !c.has_portal_access).length
  };

  const updatePortalSettings = async (customerId: string, settings: any) => {
    try {
      const { error } = await supabase
        .from('customer_portal_settings')
        .upsert({
          customer_id: customerId,
          ...settings
        });

      if (error) throw error;
      toast.success('Portal settings updated');
      fetchCustomers();
    } catch (error: any) {
      console.error('Error updating portal settings:', error);
      toast.error('Failed to update portal settings');
    }
  };

  if (loading) {
    return (
      <ErpLayout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customers...</p>
        </div>
      </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customer Access Management</h1>
          <p className="text-gray-600 mt-1">
            Create customer portal accounts with passwords and limited permissions
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Create Customer Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Customer Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Customer</Label>
                <Select onValueChange={(id) => {
                  const c = customers.find(x => x.id === id) || null;
                  setSelectedCustomer(c);
                  setFormData(prev => ({ ...prev, email: c?.email || '' }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers
                      .filter(c => !c.has_portal_access)
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.company_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="customer@company.com"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-3">
                <Label>Portal Permissions</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canViewOrders" checked={formData.canViewOrders} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canViewOrders: v as boolean }))} />
                    <Label htmlFor="canViewOrders" className="text-sm">View Orders</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canViewInvoices" checked={formData.canViewInvoices} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canViewInvoices: v as boolean }))} />
                    <Label htmlFor="canViewInvoices" className="text-sm">View Invoices</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canViewQuotations" checked={formData.canViewQuotations} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canViewQuotations: v as boolean }))} />
                    <Label htmlFor="canViewQuotations" className="text-sm">View Quotations</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canViewProductionStatus" checked={formData.canViewProductionStatus} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canViewProductionStatus: v as boolean }))} />
                    <Label htmlFor="canViewProductionStatus" className="text-sm">View Production Status</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canDownloadDocuments" checked={formData.canDownloadDocuments} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canDownloadDocuments: v as boolean }))} />
                    <Label htmlFor="canDownloadDocuments" className="text-sm">Download Documents</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="canRequestChanges" checked={formData.canRequestChanges} onCheckedChange={(v) => setFormData(prev => ({ ...prev, canRequestChanges: v as boolean }))} />
                    <Label htmlFor="canRequestChanges" className="text-sm">Request Changes</Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={createCustomerAccount} disabled={creating} className="flex-1">
                  {creating ? 'Creating...' : (selectedCustomer?.has_portal_access ? 'Update Settings' : 'Create Account')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards to mirror Employee Access */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Customers</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With Portal Access</p>
                <p className="text-2xl font-bold">{stats.withAccess}</p>
              </div>
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">No Access</p>
                <p className="text-2xl font-bold">{stats.withoutAccess}</p>
              </div>
              <UserX className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Portal Access</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{customer.company_name}</div>
                      <div className="text-sm text-gray-500">{customer.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {customer.phone || 'N/A'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{customer.customer_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={customer.has_portal_access ? "default" : "secondary"}
                      className="flex items-center gap-1"
                    >
                      {customer.has_portal_access ? (
                        <>
                          <Unlock className="h-3 w-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {customer.has_portal_access ? (
                      <Button
                          variant="ghost"
                        size="sm"
                        onClick={() => toggleCustomerAccess(customer)}
                      >
                          <Trash2 className="w-4 h-4" />
                      </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCustomerAccess(customer)}
                        >
                          <Key className="w-4 h-4 mr-1" />
                          Grant Access
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* The create dialog is rendered in the header via Dialog */}
    </div>
    </ErpLayout>
  );
} 