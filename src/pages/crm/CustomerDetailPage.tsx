import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Mail, Phone, MapPin, CreditCard, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ErpLayout } from '@/components/ErpLayout';
import { CustomerForm } from '@/components/customers/CustomerForm';
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
}

const CustomerDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCustomer();
    }
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setCustomer(data);
    } catch (error) {
      console.error('Error fetching customer:', error);
      toast.error('Failed to fetch customer details');
      navigate('/crm/customers');
    } finally {
      setLoading(false);
    }
  };

  // Fetch orders for this customer
  const fetchOrders = async (customerId: string) => {
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      toast.error('Failed to fetch order history');
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch invoices for this customer
  const fetchInvoices = async (customerId: string) => {
    setInvoicesLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      console.log('Fetched invoices for customer:', customerId, data);
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to fetch invoice history');
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  };

  // Fetch orders and invoices when customer is loaded
  useEffect(() => {
    if (customer?.id) {
      fetchOrders(customer.id);
      fetchInvoices(customer.id);
    }
  }, [customer?.id]);

  const handleFormSave = () => {
    setShowEditForm(false);
    fetchCustomer();
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ErpLayout>
    );
  }

  if (!customer) {
    return (
      <ErpLayout>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-muted-foreground">Customer not found</h2>
          <Button onClick={() => navigate('/crm/customers')} className="mt-4">
            Back to Customers
          </Button>
        </div>
      </ErpLayout>
    );
  }

  if (showEditForm) {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => setShowEditForm(false)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Details
            </Button>
          </div>
          <CustomerForm
            customer={customer}
            onSave={handleFormSave}
            onCancel={() => setShowEditForm(false)}
          />
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate('/crm/customers')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Customers
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {customer.company_name}
              </h1>
              <p className="text-muted-foreground">Customer Details</p>
            </div>
          </div>
          <Button onClick={() => setShowEditForm(true)} className="bg-gradient-primary hover:bg-gradient-primary/90">
            <Edit className="w-4 h-4 mr-2" />
            Edit Customer
          </Button>
        </div>

        {/* Customer Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Credit Limit</p>
                  <p className="text-2xl font-bold">₹{customer.credit_limit?.toLocaleString() || '0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-8 h-8 text-accent" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Outstanding</p>
                  <p className="text-2xl font-bold">₹{customer.outstanding_amount?.toLocaleString() || '0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{customer.total_orders || 0}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{customer.total_orders || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Badge className={`${customer.customer_tier === 'gold' ? 'bg-yellow-500' : customer.customer_tier === 'silver' ? 'bg-gray-400' : 'bg-orange-600'} text-white`}>
                  {customer.customer_tier || 'Bronze'}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Customer Tier</p>
                  <p className="text-lg font-semibold capitalize">{customer.customer_tier || 'Bronze'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-accent">₹</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Lifetime Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(calculateLifetimeValue(invoices, orders))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-success">★</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Loyalty Points</p>
                  <p className="text-2xl font-bold">{(customer.total_orders || 0) * 150}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information */}
        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">Customer Details</TabsTrigger>
            <TabsTrigger value="orders">Order History</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{customer.phone}</p>
                      <p className="text-sm text-muted-foreground">Primary Phone</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{customer.email}</p>
                      <p className="text-sm text-muted-foreground">Email Address</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-5 h-5 text-muted-foreground mt-1" />
                    <div>
                      <p className="font-medium">{customer.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {customer.city}, {customer.state} - {customer.pincode}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Business Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Business Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{customer.contact_person || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Customer Type</p>
                    <Badge variant="outline">{customer.customer_type || 'Retail'}</Badge>
                  </div>
                  {customer.gstin && (
                    <div>
                      <p className="text-sm text-muted-foreground">GSTIN</p>
                      <p className="font-medium font-mono">{customer.gstin}</p>
                    </div>
                  )}
                  {customer.pan && (
                    <div>
                      <p className="text-sm text-muted-foreground">PAN</p>
                      <p className="font-medium font-mono">{customer.pan}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Customer Since</p>
                    <p className="font-medium">{new Date(customer.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Purchase Date</p>
                    <p className="font-medium">{customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString() : 'No orders yet'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Purchase Value</p>
                    <p className="font-medium">₹{customer.last_order_date ? '25,000' : '0'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Loyalty Points Earned</p>
                    <p className="font-medium">{(customer.total_orders || 0) * 150} pts</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Loyalty Points Redeemed</p>
                    <p className="font-medium">{Math.floor((customer.total_orders || 0) * 50)} pts</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Order History</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-muted-foreground">No orders found for this customer.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {orders.map((order) => (
                          <tr
                            key={order.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            <td className="px-4 py-2 font-mono">{order.order_number}</td>
                            <td className="px-4 py-2">{order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                order.status === 'in_production' ? 'bg-purple-100 text-purple-800' :
                                order.status === 'completed' ? 'bg-green-100 text-green-800' :
                                order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {order.status?.replace('_', ' ').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2">₹{order.final_amount?.toLocaleString() || '0'}</td>
                            <td className="px-4 py-2">
                              <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}>
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoice History</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : invoices.length === 0 ? (
                  <p className="text-muted-foreground">No invoices found for this customer.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {invoices.map((invoice) => (
                          <tr
                            key={invoice.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => navigate(`/accounts/invoices/${invoice.id}`)}
                          >
                            <td className="px-4 py-2 font-mono">{invoice.invoice_number}</td>
                            <td className="px-4 py-2">{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString() : '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                                invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {invoice.status?.replace('_', ' ').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2">₹{invoice.total_amount?.toLocaleString() || '0'}</td>
                            <td className="px-4 py-2">
                              <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); navigate(`/accounts/invoices/${invoice.id}`); }}>
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
};

export default CustomerDetailPage;