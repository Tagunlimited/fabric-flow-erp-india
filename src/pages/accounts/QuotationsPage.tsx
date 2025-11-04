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
import { Eye, Receipt } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReceiptInfo {
  id: string;
  receipt_number: string;
  amount: number;
  created_at: string;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string };
  status: string;
  final_amount: number;
  sales_manager?: string;
  receipt_id?: string; // For completed orders - first receipt ID
  receipt_ids?: string[]; // For completed orders - all receipt IDs
  receipts?: ReceiptInfo[]; // Full receipt details
  pending_amount?: number; // For completed orders - remaining amount to be received
}

export default function QuotationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [showReceiptsDialog, setShowReceiptsDialog] = useState(false);
  const [selectedOrderReceipts, setSelectedOrderReceipts] = useState<ReceiptInfo[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Fetch all orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`*, customer:customers(company_name)`)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      const allOrders: Order[] = (ordersData as any) || [];

      // Fetch all quotations to check which orders have quotations
      // Since quotations don't have order_id, we'll check by customer_id and date proximity
      const { data: quotationsData } = await supabase
        .from('quotations')
        .select('id, customer_id, quotation_date, notes');

      // Create a set of customer IDs that have quotations (for orders created around the same time)
      const quotationsByCustomer: Record<string, any[]> = {};
      (quotationsData || []).forEach((q: any) => {
        if (!quotationsByCustomer[q.customer_id]) {
          quotationsByCustomer[q.customer_id] = [];
        }
        quotationsByCustomer[q.customer_id].push(q);
      });

      // Fetch all receipts with reference_type='order' to find completed orders and calculate amounts
      const { data: receiptsData } = await supabase
        .from('receipts')
        .select('id, reference_id, reference_type, amount, reference_number, receipt_number, created_at, entry_date')
        .or('reference_type.eq.order,reference_type.eq.ORDER');

      const ordersWithReceipts = new Set<string>();
      const receiptIdMap = new Map<string, string>(); // Map order_id to first receipt_id
      const receiptIdsMap = new Map<string, string[]>(); // Map order_id to all receipt_ids
      const receiptAmountsMap = new Map<string, number>(); // Map order_id to total receipt amount
      const receiptsDetailsMap = new Map<string, ReceiptInfo[]>(); // Map order_id to receipt details
      
      // Create a map of order_number to order_id for faster lookup
      const orderNumberToIdMap = new Map<string, string>();
      allOrders.forEach(order => {
        orderNumberToIdMap.set(order.order_number, order.id);
      });
      
      (receiptsData || []).forEach((r: any) => {
        let orderId: string | null = null;
        
        // First try to match by reference_id (UUID)
        if (r.reference_id) {
          orderId = String(r.reference_id);
        } 
        // Then try to match by reference_number (order_number)
        else if (r.reference_number && orderNumberToIdMap.has(r.reference_number)) {
          orderId = orderNumberToIdMap.get(r.reference_number)!;
        }
        
        if (orderId) {
          ordersWithReceipts.add(orderId);
          // Store the first receipt ID for each order (for backward compatibility)
          if (!receiptIdMap.has(orderId)) {
            receiptIdMap.set(orderId, r.id);
          }
          // Store all receipt IDs for each order
          const receiptIds = receiptIdsMap.get(orderId) || [];
          receiptIds.push(r.id);
          receiptIdsMap.set(orderId, receiptIds);
          
          // Store receipt details
          const receipts = receiptsDetailsMap.get(orderId) || [];
          receipts.push({
            id: r.id,
            receipt_number: r.receipt_number || 'N/A',
            amount: Number(r.amount || 0),
            created_at: r.created_at || r.entry_date || ''
          });
          // Sort receipts by date (most recent first)
          receipts.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA; // Descending order
          });
          receiptsDetailsMap.set(orderId, receipts);
          
          // Sum up receipt amounts for each order
          const currentTotal = receiptAmountsMap.get(orderId) || 0;
          receiptAmountsMap.set(orderId, currentTotal + Number(r.amount || 0));
        }
      });

      // Filter orders based on active tab and calculate counts
      let pendingOrders: Order[] = [];
      let completedOrders: Order[] = [];
      
      // Calculate pending orders
      pendingOrders = allOrders.filter(order => {
        // First check if it has a receipt - if it does, it's completed, not pending
        if (ordersWithReceipts.has(order.id)) {
          return false;
        }
        
        // Check if there's a quotation for this customer
        const customerQuotations = quotationsByCustomer[order.customer_id] || [];
        if (customerQuotations.length === 0) {
          return true; // No quotations for this customer, so order is pending
        }
        
        // Check if any quotation was created on or after the order date (within 30 days)
        const orderDate = new Date(order.order_date);
        orderDate.setHours(0, 0, 0, 0);
        
        const hasQuotationForOrder = customerQuotations.some((q: any) => {
          const quotationDate = new Date(q.quotation_date);
          quotationDate.setHours(0, 0, 0, 0);
          
          // Check if quotation date is on or after order date (within 30 days - reasonable timeframe)
          const daysDiff = Math.abs((quotationDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
          if (quotationDate >= orderDate && daysDiff <= 30) {
            return true;
          }
          
          // Also check if quotation notes mention the order number
          if (q.notes && typeof q.notes === 'string') {
            return q.notes.includes(order.order_number);
          }
          return false;
        });
        
        // If no quotation found for this order, it's pending
        return !hasQuotationForOrder;
      });
      
      // Calculate completed orders with receipt IDs and pending amounts
      completedOrders = allOrders
        .filter(order => ordersWithReceipts.has(order.id))
        .map(order => {
          const totalReceipts = receiptAmountsMap.get(order.id) || 0;
          const orderAmount = order.final_amount || 0;
          const pendingAmount = Math.max(0, orderAmount - totalReceipts);
          
          // Debug logging (remove in production if needed)
          if (pendingAmount === 0 && orderAmount > 0) {
            console.log(`Order ${order.order_number}: Total=${orderAmount}, Receipts=${totalReceipts}, Pending=${pendingAmount}`);
          }
          
          return {
            ...order,
            receipt_id: receiptIdMap.get(order.id),
            receipt_ids: receiptIdsMap.get(order.id) || [],
            receipts: receiptsDetailsMap.get(order.id) || [],
            pending_amount: pendingAmount
          };
        });

      // Set counts
      setPendingCount(pendingOrders.length);
      setCompletedCount(completedOrders.length);

      // Set orders based on active tab
      const currentOrders = activeTab === 'pending' ? pendingOrders : completedOrders;
      setOrders(currentOrders);

      // Fetch sales manager names/avatars in a second query (avoids FK join issues)
      const ids = Array.from(new Set(currentOrders.map(o => o.sales_manager).filter(Boolean)));
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

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quotations</h1>
          <p className="text-muted-foreground mt-1">View all orders and create/send quotations</p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle>All Orders (for Quotation)</CardTitle>
              <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'completed')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({completedCount})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="pending" className="mt-4">
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Sales Manager</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={7}>Loading...</TableCell></TableRow>
                      ) : orders.length === 0 ? (
                        <TableRow><TableCell colSpan={7}>No pending orders found.</TableCell></TableRow>
                      ) : (
                        orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                            <TableCell><Badge>{order.status}</Badge></TableCell>
                            <TableCell>{formatCurrency(order.final_amount || 0)}</TableCell>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/accounts/quotations/${order.id}`)}
                              >
                                <Eye className="w-4 h-4 mr-1" /> Quotation
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-2"
                                onClick={() => navigate('/accounts/receipts', { state: { prefill: { type: 'order', id: order.id, number: order.order_number, date: order.order_date, customer_id: order.customer_id, amount: order.final_amount }, tab: 'create' } })}
                              >
                                Create Receipt
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              
              <TabsContent value="completed" className="mt-4">
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Pending Amount</TableHead>
                        <TableHead>Sales Manager</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={8}>Loading...</TableCell></TableRow>
                      ) : orders.length === 0 ? (
                        <TableRow><TableCell colSpan={8}>No completed orders found.</TableCell></TableRow>
                      ) : (
                        orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                            <TableCell><Badge>{order.status}</Badge></TableCell>
                            <TableCell>{formatCurrency(order.final_amount || 0)}</TableCell>
                            <TableCell>
                              <span className={order.pending_amount && order.pending_amount > 0 ? 'text-orange-600 font-semibold' : 'text-green-600'}>
                                {formatCurrency(order.pending_amount || 0)}
                              </span>
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
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/accounts/quotations/${order.id}`)}
                                >
                                  <Eye className="w-4 h-4 mr-1" /> Quotation
                                </Button>
                                {order.receipt_id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // If multiple receipts, show dialog, otherwise open directly
                                      if (order.receipts && order.receipts.length > 1) {
                                        setSelectedOrderReceipts(order.receipts);
                                        setSelectedOrderNumber(order.order_number);
                                        setShowReceiptsDialog(true);
                                      } else {
                                        // Single receipt, open directly
                                        navigate('/accounts/receipts', { state: { receiptId: order.receipt_id, tab: 'view' } });
                                      }
                                    }}
                                  >
                                    <Receipt className="w-4 h-4 mr-1" /> View Receipt
                                    {order.receipts && order.receipts.length > 1 && ` (${order.receipts.length})`}
                                  </Button>
                                )}
                                {order.pending_amount !== undefined && order.pending_amount > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate('/accounts/receipts', { state: { prefill: { type: 'order', id: order.id, number: order.order_number, date: order.order_date, customer_id: order.customer_id, amount: order.pending_amount }, tab: 'create' } })}
                                  >
                                    Create Receipt
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Receipts List Dialog */}
      <Dialog open={showReceiptsDialog} onOpenChange={setShowReceiptsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receipts for Order {selectedOrderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedOrderReceipts.length === 0 ? (
              <p className="text-muted-foreground">No receipts found.</p>
            ) : (
              <div className="space-y-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt Number</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrderReceipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="font-medium">{receipt.receipt_number}</TableCell>
                        <TableCell>{formatCurrency(receipt.amount)}</TableCell>
                        <TableCell>
                          {receipt.created_at 
                            ? new Date(receipt.created_at).toLocaleDateString('en-GB', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowReceiptsDialog(false);
                              navigate('/accounts/receipts', { 
                                state: { receiptId: receipt.id, tab: 'view' } 
                              });
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Receipts:</span>
                    <span className="font-semibold">
                      {formatCurrency(selectedOrderReceipts.reduce((sum, r) => sum + r.amount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ErpLayout>
  );
} 