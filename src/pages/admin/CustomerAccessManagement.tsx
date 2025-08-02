import { useState, useEffect } from 'react';
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
  Eye, 
  EyeOff, 
  Lock, 
  Unlock,
  Mail,
  Phone,
  Building
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

      const customersWithAccess = data?.map(customer => ({
        ...customer,
        has_portal_access: customer.customer_users?.length > 0,
        portal_settings: customer.customer_portal_settings?.[0]
      })) || [];

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

      // Just create portal settings to enable access
      const { error: settingsError } = await supabase
        .from('customer_portal_settings')
        .insert({
          customer_id: selectedCustomer.id,
          can_view_orders: formData.canViewOrders,
          can_view_invoices: formData.canViewInvoices,
          can_view_quotations: formData.canViewQuotations,
          can_view_production_status: formData.canViewProductionStatus,
          can_download_documents: formData.canDownloadDocuments,
          can_request_changes: formData.canRequestChanges
        });

      if (settingsError) {
        console.error('Settings creation error:', settingsError);
        throw new Error('Failed to create portal settings');
      }

      toast.success('Customer portal access enabled successfully!');
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
      fetchCustomers();
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
        toast.success('Customer portal access disabled');
      } else {
        // Enable access by creating account
        setSelectedCustomer(customer);
        setFormData(prev => ({ ...prev, email: customer.email || '' }));
        setShowCreateDialog(true);
        return;
      }

      fetchCustomers();
    } catch (error: any) {
      console.error('Error toggling customer access:', error);
      toast.error('Failed to update customer access');
    }
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Customer Portal Access Management</h1>
        <p className="text-gray-600 mt-2">
          Manage customer accounts and portal access permissions
        </p>
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={customer.has_portal_access ? "destructive" : "default"}
                        onClick={() => toggleCustomerAccess(customer)}
                      >
                        {customer.has_portal_access ? 'Disable' : 'Enable'} Access
                      </Button>
                      {customer.has_portal_access && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setShowCreateDialog(true);
                          }}
                        >
                          Settings
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

      {/* Create Customer Account Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedCustomer?.has_portal_access ? 'Update Portal Settings' : 'Create Customer Account'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {!selectedCustomer?.has_portal_access && (
              <>
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
              </>
            )}

            <div className="space-y-3">
              <Label>Portal Permissions</Label>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canViewOrders"
                    checked={formData.canViewOrders}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canViewOrders: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canViewOrders" className="text-sm">View Orders</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canViewInvoices"
                    checked={formData.canViewInvoices}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canViewInvoices: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canViewInvoices" className="text-sm">View Invoices</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canViewQuotations"
                    checked={formData.canViewQuotations}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canViewQuotations: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canViewQuotations" className="text-sm">View Quotations</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canViewProductionStatus"
                    checked={formData.canViewProductionStatus}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canViewProductionStatus: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canViewProductionStatus" className="text-sm">View Production Status</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canDownloadDocuments"
                    checked={formData.canDownloadDocuments}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canDownloadDocuments: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canDownloadDocuments" className="text-sm">Download Documents</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="canRequestChanges"
                    checked={formData.canRequestChanges}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, canRequestChanges: checked as boolean }))
                    }
                  />
                  <Label htmlFor="canRequestChanges" className="text-sm">Request Changes</Label>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={createCustomerAccount}
                disabled={creating}
                className="flex-1"
              >
                {creating ? 'Creating...' : selectedCustomer?.has_portal_access ? 'Update Settings' : 'Create Account'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 