import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { getCustomerMobile } from '@/lib/customerContact';
import { Eye, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import '../OrdersPageViewSwitch.css';
import { playOrderStatusChangeSound } from '@/utils/orderStatusSound';
import { cn } from '@/lib/utils';
import { Filter } from 'lucide-react';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string; phone?: string | null; mobile?: string | null };
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

type InvoiceColumnFilters = {
  order_number: string;
  customer: string;
  mobile: string;
  date: string;
  status: string;
  amount: string;
  dispatched: string;
  sales_manager: string;
};
const EMPTY_COLUMN_FILTERS: InvoiceColumnFilters = {
  order_number: '',
  customer: '',
  mobile: '',
  date: '',
  status: '',
  amount: '',
  dispatched: '',
  sales_manager: '',
};
type InvoiceFilterColumnKey = keyof InvoiceColumnFilters;
const FILTER_META: Record<InvoiceFilterColumnKey, { title: string; description: string; placeholder: string }> = {
  order_number: { title: 'Filter by order #', description: 'Match order number.', placeholder: 'e.g. TUC/' },
  customer: { title: 'Filter by customer', description: 'Match customer name.', placeholder: 'e.g. Rajiv' },
  mobile: { title: 'Filter by mobile', description: 'Match customer phone/mobile.', placeholder: 'e.g. 98' },
  date: { title: 'Filter by date', description: 'Match visible date text.', placeholder: 'e.g. 17 Apr' },
  status: { title: 'Filter by status', description: 'Match order status.', placeholder: 'e.g. dispatched' },
  amount: { title: 'Filter by amount', description: 'Match amount text.', placeholder: 'e.g. 12000' },
  dispatched: { title: 'Filter by dispatched qty', description: 'Match dispatched/approved text.', placeholder: 'e.g. 12' },
  sales_manager: { title: 'Filter by sales manager', description: 'Match manager name.', placeholder: 'e.g. Monika' },
};
function includesFilter(filterRaw: string, value: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return value.toLowerCase().includes(f);
}
function ColumnFilterTrigger({
  active,
  ariaLabel,
  onOpen,
}: {
  active: boolean;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'h-7 w-7 shrink-0 rounded-full transition-all duration-200 ease-out',
        active
          ? 'bg-primary/20 text-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.45),0_4px_14px_-4px_hsl(var(--primary)/0.45)] ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:bg-primary/28 hover:ring-primary/65'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      )}
    >
      <Filter
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200 ease-out',
          active && 'scale-110 fill-primary text-primary [filter:drop-shadow(0_0_5px_hsl(var(--primary)/0.55))]'
        )}
        strokeWidth={active ? 2.5 : 2}
        aria-hidden
      />
    </Button>
  );
}

export default function InvoicePage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [showCompleted, setShowCompleted] = useState<'no' | 'yes'>('no');
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<InvoiceColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<InvoiceFilterColumnKey | null>(null);
  const filterDialogMeta = filterDialogColumn ? FILTER_META[filterDialogColumn] : null;
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);

  useEffect(() => {
    fetchOrders();
  }, [activeTab, showCompleted]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      const visibleStatuses =
        showCompleted === 'yes'
          ? (['dispatched', 'partial_dispatched', 'completed'] as const)
          : (['dispatched', 'partial_dispatched'] as const);

      // Get all invoicable orders (completed included only when enabled)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`*, customer:customers(company_name, phone)`)
        .eq('is_deleted', false)
        .in('status', visibleStatuses as any)
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
          .eq('is_deleted', false)
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
              .select(`*, customer:customers(company_name, phone)`)
              .eq('is_deleted', false)
              .in('status', visibleStatuses as any)
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
        .eq('is_deleted', false)
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
            .eq('is_deleted', false)
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
            .eq('is_deleted', false)
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
              .eq('is_deleted', false)
              .eq('order_id', order.id as any);
            
            const dispatchedQuantity = dispatchItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
            
            // Get approved/total quantity for comparison
            // For readymade orders, get from order_items; for custom orders, get from QC reviews
            let approvedQuantity = 0;
            if (order.order_type === 'readymade') {
              const { data: orderItems } = await supabase
                .from('order_items')
                .select('quantity')
                .eq('is_deleted', false)
                .eq('order_id', order.id as any);
              approvedQuantity = orderItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
            } else {
              const { data: qcReviews } = await supabase
                .from('qc_reviews')
                .select('approved_quantity, order_batch_assignment_id')
                .eq('is_deleted', false)
                .in('order_batch_assignment_id', 
                  (await supabase
                    .from('order_batch_assignments')
                    .select('id')
                    .eq('is_deleted', false)
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

  const getFinancialYear = (date: Date) => {
    const startYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
    const endYearShort = String(startYear + 1).slice(-2);
    return `${startYear}-${endYearShort}`;
  };

  const generateInvoiceNumber = async () => {
    const fy = getFinancialYear(new Date());
    const prefix = `TUC/${fy}/TI/`;
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('is_deleted', false)
      .ilike('invoice_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    const last = data?.[0]?.invoice_number as string | undefined;
    const match = last?.match(/\/(\d{1,})$/);
    const next = match ? Number.parseInt(match[1], 10) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  };

  const handleCreateInvoice = async (order: Order) => {
    try {
      setCreatingInvoice(order.id);
      
      // Calculate due date (30 days from today)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Generate invoice number: TUC/YYYY-YY/TI/0001
      const invoiceNumber = await generateInvoiceNumber();

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
        playOrderStatusChangeSound();
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
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const mobile = getCustomerMobile(order.customer as any) || '';
      const dateLabel = new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      const dispatchedLabel = `${order.dispatched_quantity || 0} ${order.approved_quantity || 0}`;
      const manager = employeeMap[order.sales_manager || '']?.full_name || '';
      return (
        includesFilter(columnFilters.order_number, order.order_number || '') &&
        includesFilter(columnFilters.customer, order.customer?.company_name || '') &&
        includesFilter(columnFilters.mobile, mobile) &&
        includesFilter(columnFilters.date, dateLabel) &&
        includesFilter(columnFilters.status, order.status || '') &&
        includesFilter(columnFilters.amount, formatCurrency(order.final_amount || 0)) &&
        includesFilter(columnFilters.dispatched, dispatchedLabel) &&
        includesFilter(columnFilters.sales_manager, manager)
      );
    });
  }, [orders, columnFilters, employeeMap]);
  const pendingOrders = filteredOrders.filter(order => !order.has_invoice);
  const completedOrders = filteredOrders.filter(order => order.has_invoice);

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
      <TableCell className="font-mono text-xs whitespace-nowrap">
        {getCustomerMobile(order.customer as any) || '—'}
      </TableCell>
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
        
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <label
              htmlFor="invoice-page-view-switch"
              className="orders-view-switch"
              aria-label="Switch between pending orders and completed invoices"
            >
              <input
                id="invoice-page-view-switch"
                type="checkbox"
                role="switch"
                aria-checked={activeTab === 'completed'}
                checked={activeTab === 'completed'}
                onChange={(e) => setActiveTab(e.target.checked ? 'completed' : 'pending')}
              />
              <span>Pending ({pendingOrders.length})</span>
              <span>Completed ({completedOrders.length})</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show completed</span>
              <Select value={showCompleted} onValueChange={(v: 'no' | 'yes') => setShowCompleted(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="No (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No (default)</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeTab === 'pending' && (
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
                        <TableHead><div className="flex items-center gap-1">Order #<ColumnFilterTrigger active={!!columnFilters.order_number} ariaLabel="Filter order number" onOpen={() => setFilterDialogColumn('order_number')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Customer<ColumnFilterTrigger active={!!columnFilters.customer} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Mobile<ColumnFilterTrigger active={!!columnFilters.mobile} ariaLabel="Filter mobile" onOpen={() => setFilterDialogColumn('mobile')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Date<ColumnFilterTrigger active={!!columnFilters.date} ariaLabel="Filter date" onOpen={() => setFilterDialogColumn('date')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Status<ColumnFilterTrigger active={!!columnFilters.status} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Amount<ColumnFilterTrigger active={!!columnFilters.amount} ariaLabel="Filter amount" onOpen={() => setFilterDialogColumn('amount')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Dispatched Qty<ColumnFilterTrigger active={!!columnFilters.dispatched} ariaLabel="Filter dispatched quantity" onOpen={() => setFilterDialogColumn('dispatched')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Sales Manager<ColumnFilterTrigger active={!!columnFilters.sales_manager} ariaLabel="Filter sales manager" onOpen={() => setFilterDialogColumn('sales_manager')} /></div></TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={9}>Loading...</TableCell></TableRow>
                      ) : pendingOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={9}>No pending orders found.</TableCell></TableRow>
                      ) : (
                        pendingOrders.map(renderOrderRow)
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'completed' && (
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
                        <TableHead><div className="flex items-center gap-1">Order #<ColumnFilterTrigger active={!!columnFilters.order_number} ariaLabel="Filter order number" onOpen={() => setFilterDialogColumn('order_number')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Customer<ColumnFilterTrigger active={!!columnFilters.customer} ariaLabel="Filter customer" onOpen={() => setFilterDialogColumn('customer')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Mobile<ColumnFilterTrigger active={!!columnFilters.mobile} ariaLabel="Filter mobile" onOpen={() => setFilterDialogColumn('mobile')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Date<ColumnFilterTrigger active={!!columnFilters.date} ariaLabel="Filter date" onOpen={() => setFilterDialogColumn('date')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Status<ColumnFilterTrigger active={!!columnFilters.status} ariaLabel="Filter status" onOpen={() => setFilterDialogColumn('status')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Amount<ColumnFilterTrigger active={!!columnFilters.amount} ariaLabel="Filter amount" onOpen={() => setFilterDialogColumn('amount')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Dispatched Qty<ColumnFilterTrigger active={!!columnFilters.dispatched} ariaLabel="Filter dispatched quantity" onOpen={() => setFilterDialogColumn('dispatched')} /></div></TableHead>
                        <TableHead><div className="flex items-center gap-1">Sales Manager<ColumnFilterTrigger active={!!columnFilters.sales_manager} ariaLabel="Filter sales manager" onOpen={() => setFilterDialogColumn('sales_manager')} /></div></TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={9}>Loading...</TableCell></TableRow>
                      ) : completedOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={9}>No completed orders found.</TableCell></TableRow>
                      ) : (
                        completedOrders.map(renderOrderRow)
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {hasActiveColumnFilters && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}>
                Clear column filters
              </Button>
            </div>
          )}
          <Dialog
            open={filterDialogColumn !== null}
            onOpenChange={(open) => {
              if (!open) setFilterDialogColumn(null);
            }}
          >
            <DialogContent className="sm:max-w-md">
              {filterDialogColumn && filterDialogMeta && (
                <>
                  <DialogHeader>
                    <DialogTitle>{filterDialogMeta.title}</DialogTitle>
                    <DialogDescription>{filterDialogMeta.description}</DialogDescription>
                  </DialogHeader>
                  <Input
                    autoFocus
                    placeholder={filterDialogMeta.placeholder}
                    value={columnFilters[filterDialogColumn]}
                    onChange={(e) =>
                      setColumnFilters((p) => ({ ...p, [filterDialogColumn]: e.target.value }))
                    }
                  />
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setColumnFilters((p) => ({ ...p, [filterDialogColumn]: '' }))}
                    >
                      Clear this filter
                    </Button>
                    <Button type="button" onClick={() => setFilterDialogColumn(null)}>
                      Done
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ErpLayout>
  );
}