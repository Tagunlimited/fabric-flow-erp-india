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
import { Eye } from 'lucide-react';
import { calculateOrderSummary } from '@/utils/priceCalculation';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string };
  status: string;
  final_amount: number;
  sales_manager?: string;
  gst_rate?: number;
  calculatedAmount?: number; // Store calculated amount with size-based pricing
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function QuotationsPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState<'no' | 'yes'>('no');
  const [employeeMap, setEmployeeMap] = useState<Record<string, { full_name: string; avatar_url?: string }>>({});

  useEffect(() => {
    fetchOrders();
  }, [showCompleted]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      let query: any = supabase
        .from('orders')
        .select(`*, customer:customers(company_name), gst_rate`);

      if (showCompleted === 'no') {
        query = query.neq('status', 'completed');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      const list: Order[] = data || [];
      
      // Calculate correct amounts using size-based pricing for each order
      const ordersWithCalculatedAmounts = await Promise.all(
        list.map(async (order) => {
          try {
            // Fetch order items to calculate correct total
            const { data: orderItems } = await supabase
              .from('order_items')
              .select('*, size_prices, sizes_quantities, specifications')
              .eq('order_id', order.id);
            
            // Calculate correct total using size-based pricing
            let calculatedAmount = order.final_amount; // Fallback to final_amount
            if (orderItems && orderItems.length > 0) {
              const summary = calculateOrderSummary(orderItems, order);
              calculatedAmount = summary.grandTotal;
            }
            
            return {
              ...order,
              calculatedAmount
            };
          } catch (error) {
            console.error(`Error calculating amount for order ${order.order_number}:`, error);
            return {
              ...order,
              calculatedAmount: order.final_amount // Fallback to final_amount on error
            };
          }
        })
      );
      
      setOrders(ordersWithCalculatedAmounts);

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
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show completed</span>
                <Select value={showCompleted} onValueChange={(v: 'no' | 'yes') => setShowCompleted(v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="No (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No (default)</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                    <TableRow><TableCell colSpan={7}>No orders found.</TableCell></TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.order_number}</TableCell>
                        <TableCell>{order.customer?.company_name}</TableCell>
                        <TableCell>{new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                        <TableCell><Badge>{order.status}</Badge></TableCell>
                        <TableCell>{formatCurrency(order.calculatedAmount ?? order.final_amount ?? 0)}</TableCell>
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
                            onClick={() => navigate('/accounts/receipts', { state: { prefill: { type: 'order', id: order.id, number: order.order_number, date: order.order_date, customer_id: order.customer_id, amount: order.calculatedAmount ?? order.final_amount }, tab: 'create' } })}
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
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
} 