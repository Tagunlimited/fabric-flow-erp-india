import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { Eye, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string };
  status: string;
  final_amount: number;
  sales_manager?: string;
  dispatched_quantity?: number;
  approved_quantity?: number;
  has_invoice?: boolean;
  invoice_id?: string;
  invoice_number?: string;
  is_credit?: boolean; // Flag to indicate if order has credit receipt
}

export default function InvoicePage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Get all dispatched and completed orders (include readymade orders that have been dispatched)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`*, customer:customers(company_name)`)
        .in('status', ['dispatched', 'partial_dispatched', 'completed'] as any)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      let list: Order[] = (ordersData as any) || [];
      
      // Also fetch orders that are "ready to dispatch" (all approved items dispatched)
      // These might have different statuses but should still show in invoices
      try {
        // Get all orders that have dispatch records (challans)
        const { data: dispatchOrders } = await supabase
          .from('dispatch_orders')
          .select('order_id')
          .in('status', ['pending', 'packed', 'shipped', 'delivered'] as any);
        
        if (dispatchOrders && dispatchOrders.length > 0) {
          // Get unique order IDs from dispatch orders
          const dispatchOrderIds = Array.from(new Set(
            dispatchOrders.map((d: any) => d.order_id).filter(Boolean)
          ));
          
          // Fetch these orders if not already in list
          const existingIds = new Set(list.map(o => o.id));
          const missingIds = dispatchOrderIds.filter((id: string) => !existingIds.has(id));
          
          if (missingIds.length > 0) {
            const { data: readyOrders } = await supabase
              .from('orders')
              .select(`*, customer:customers(company_name)`)
              .in('id', missingIds as any)
              .order('created_at', { ascending: false });
            
            if (readyOrders) {
              list = [...list, ...(readyOrders as any[])];
            }
          }
        }
      } catch (error) {
        console.error('Error fetching ready to dispatch orders:', error);
      }

      // Get all invoices for these orders
      const orderIds = list.map(o => o.id);
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('id, invoice_number, order_id')
        .in('order_id', orderIds as any);

      // Create a map of order_id to invoice
      const invoiceMap: Record<string, { id: string; invoice_number: string }> = {};
      ((invoicesData as any) || []).forEach((invoice: any) => {
        invoiceMap[invoice.order_id] = {
          id: invoice.id,
          invoice_number: invoice.invoice_number
        };
      });

      // Check for credit receipts (receipts with amount 0 and payment_type/mode = 'Credit')
      const creditOrderIds = new Set<string>();
      try {
        // Fetch receipts by reference_id (order_id)
        if (orderIds.length > 0) {
          const { data: receiptsById } = await supabase
            .from('receipts')
            .select('reference_id, reference_number, amount, payment_type, payment_mode')
            .eq('reference_type', 'order')
            .in('reference_id', orderIds as any);
          
          if (receiptsById) {
            receiptsById.forEach((receipt: any) => {
              const isCredit = (Number(receipt.amount || 0) === 0) && 
                              (receipt.payment_type === 'Credit' || receipt.payment_mode === 'Credit');
              if (isCredit && receipt.reference_id) {
                creditOrderIds.add(receipt.reference_id);
              }
            });
          }
        }
        
        // Also check by reference_number (order_number)
        const orderNumbers = list.map(o => o.order_number).filter(Boolean);
        if (orderNumbers.length > 0) {
          const { data: receiptsByNumber } = await supabase
            .from('receipts')
            .select('reference_id, reference_number, amount, payment_type, payment_mode')
            .in('reference_number', orderNumbers as any);
          
          if (receiptsByNumber) {
            receiptsByNumber.forEach((receipt: any) => {
              const isCredit = (Number(receipt.amount || 0) === 0) && 
                              (receipt.payment_type === 'Credit' || receipt.payment_mode === 'Credit');
              if (isCredit && receipt.reference_number) {
                const matchingOrder = list.find(o => o.order_number === receipt.reference_number);
                if (matchingOrder) {
                  creditOrderIds.add(matchingOrder.id);
                }
              }
            });
          }
        }
      } catch (error) {
        console.error('Error fetching credit receipts:', error);
      }

      // Get dispatched quantities and invoice status for each order
      const ordersWithData = await Promise.all(
        list.map(async (order) => {
          try {
            const { data: dispatchItems } = await supabase
              .from('dispatch_order_items')
              .select('quantity')
              .eq('order_id', order.id as any);
            
            const dispatchedQuantity = dispatchItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
            
            // Get approved/total quantity for comparison
            // For readymade orders, get from order_items; for custom orders, get from QC reviews
            let approvedQuantity = 0;
            if (order.order_type === 'readymade') {
              const { data: orderItems } = await supabase
                .from('order_items')
                .select('quantity')
                .eq('order_id', order.id as any);
              approvedQuantity = orderItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
            } else {
              const { data: qcReviews } = await supabase
                .from('qc_reviews')
                .select('approved_quantity, order_batch_assignment_id')
                .in('order_batch_assignment_id', 
                  (await supabase
                    .from('order_batch_assignments')
                    .select('id')
                    .eq('order_id', order.id as any)
                  ).data?.map((a: any) => a.id) || []
                );
              approvedQuantity = qcReviews?.reduce((sum: number, qc: any) => sum + (qc.approved_quantity || 0), 0) || 0;
            }
            
            const invoice = invoiceMap[order.id];
            
            return {
              ...order,
              dispatched_quantity: dispatchedQuantity,
              approved_quantity: approvedQuantity,
              has_invoice: !!invoice,
              invoice_id: invoice?.id,
              invoice_number: invoice?.invoice_number,
              is_credit: creditOrderIds.has(order.id),
            };
          } catch (error) {
            console.error('Error fetching data for order:', order.id, error);
            return {
              ...order,
              dispatched_quantity: 0,
              approved_quantity: 0,
              has_invoice: !!invoiceMap[order.id],
              invoice_id: invoiceMap[order.id]?.id,
              invoice_number: invoiceMap[order.id]?.invoice_number,
              is_credit: creditOrderIds.has(order.id),
            };
          }
        })
      );

      setOrders(ordersWithData);

      // Fetch sales manager names/avatars in a second query (avoids FK join issues)
      const ids = Array.from(new Set(list.map(o => o.sales_manager).filter(Boolean)));
      if (ids.length > 0) {
        const { data: emps, error: empErr } = await supabase
          .from('employees')
          .select('id, full_name, avatar_url')
          .in('id', ids as any);
        if (!empErr && emps) {
          const map: Record<string, { full_name: string; avatar_url?: string }> = {};
          (emps as any[]).forEach(e => { map[e.id] = { full_name: e.full_name, avatar_url: e.avatar_url }; });
          setEmployeeMap(map);
        } else {
          setEmployeeMap({});
        }
      } else {
        setEmployeeMap({});
      }
    } catch (error) {
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (order: Order) => {
    try {
      setCreatingInvoice(order.id);
      
      // Calculate due date (30 days from today)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // Create invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          order_id: order.id,
          customer_id: order.customer_id,
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          subtotal: order.final_amount,
          tax_amount: (order.final_amount * 18) / 100, // Default 18% tax
          total_amount: order.final_amount + (order.final_amount * 18) / 100,
          status: 'draft',
          notes: `Invoice for dispatched order ${order.order_number}`,
          terms_and_conditions: 'Payment due within 30 days',
        } as any)
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        toast.error('Failed to create invoice');
        return;
      }

      // Update order status to completed
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({ status: 'completed' } as any)
        .eq('id', order.id as any);

      if (orderUpdateError) {
        console.error('Error updating order status:', orderUpdateError);
        toast.warning('Invoice created but failed to update order status');
      } else {
        toast.success('Invoice created successfully and order marked as completed');
      }
      
      // Refresh the orders list
      await fetchOrders();
      
      // Navigate to the invoice detail page
      navigate(`/accounts/invoices/${(invoiceData as any).id}`);
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    } finally {
      setCreatingInvoice(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'dispatched': return 'bg-green-100 text-green-800';
      case 'partial_dispatched': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter orders based on active tab
  const pendingOrders = orders.filter(order => !order.has_invoice);
  const completedOrders = orders.filter(order => order.has_invoice);

  const renderOrderRow = (order: Order) => (
    <TableRow key={order.id}>
      <TableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <span>{order.order_number}</span>
          {order.order_type === 'readymade' && (
            <Badge variant="outline" className="text-xs">Readymade</Badge>
          )}
          {order.is_credit && (
            <Badge className="bg-orange-100 text-orange-800 text-xs font-semibold">CREDIT</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{order.customer?.company_name}</TableCell>
      <TableCell>{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
      <TableCell>
        <Badge className={getStatusColor(order.status)}>
          {order.status === 'dispatched' ? 'Ready to Dispatch' : 
           order.status === 'partial_dispatched' ? 'Partially Dispatched' :
           order.status === 'completed' ? 'Completed' : order.status}
        </Badge>
      </TableCell>
      <TableCell>{formatCurrency(order.final_amount || 0)}</TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{order.dispatched_quantity || 0} pieces</div>
          <div className="text-muted-foreground text-xs">
            of {order.approved_quantity || 0} approved
          </div>
        </div>
      </TableCell>
      <TableCell>
        {employeeMap[order.sales_manager || ''] ? (
          <div className="flex items-center gap-2">
            {employeeMap[order.sales_manager!].avatar_url && (
              <img
                src={employeeMap[order.sales_manager!].avatar_url as string}
                alt={employeeMap[order.sales_manager!].full_name}
                className="w-6 h-6 rounded-full object-cover"
              />
            )}
            <span>{employeeMap[order.sales_manager!].full_name}</span>
          </div>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          {order.has_invoice ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/accounts/invoices/${order.invoice_id}`)}
              >
                <Eye className="w-4 h-4 mr-1" /> View Invoice
              </Button>
              <Badge variant="secondary" className="ml-2">
                {order.invoice_number}
              </Badge>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => handleCreateInvoice(order)}
              disabled={creatingInvoice === order.id}
            >
              <Plus className="w-4 h-4 mr-1" /> 
              {creatingInvoice === order.id ? 'Creating...' : 'Create Invoice'}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1">View all dispatched orders and create invoices</p>
        </div>
        
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'completed')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">
              Pending ({pendingOrders.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle>Pending Orders (No Invoice Created)</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Dispatched Qty</TableHead>
                        <TableHead>Sales Manager</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={8}>Loading...</TableCell></TableRow>
                      ) : pendingOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={8}>No pending orders found.</TableCell></TableRow>
                      ) : (
                        pendingOrders.map(renderOrderRow)
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle>Completed Orders (Invoice Created)</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Dispatched Qty</TableHead>
                        <TableHead>Sales Manager</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={8}>Loading...</TableCell></TableRow>
                      ) : completedOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={8}>No completed orders found.</TableCell></TableRow>
                      ) : (
                        completedOrders.map(renderOrderRow)
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
}