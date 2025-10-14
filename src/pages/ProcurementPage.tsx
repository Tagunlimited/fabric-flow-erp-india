import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Filter, Search, PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: { company_name: string };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
}

export default function ProcurementPage() {
  const navigate = useNavigate();
  const { orders, loading, refetch } = useOrdersWithReceipts<Order>();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);




  useEffect(() => {
    // hook fetches on mount
  }, []);

  const fetchOrders = async () => { await refetch(); };

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => !filterStatus || o.status === filterStatus)
      .filter(o => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          o.order_number?.toLowerCase().includes(term) ||
          o.customer?.company_name?.toLowerCase().includes(term)
        );
      });
  }, [orders, filterStatus, searchTerm]);

  const totals = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      acc.totalAmount += order.final_amount || 0;
      acc.pendingAmount += order.balance_amount || 0;
      return acc;
    }, { totalAmount: 0, pendingAmount: 0 });
  }, [filteredOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Procurement</h1>
          <p className="text-muted-foreground mt-1">Orders with receipts for procurement actions</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/bom/new')} className="rounded-full bg-emerald-600 hover:bg-emerald-700">
            <PlusCircle className="w-4 h-4 mr-2" /> Create BOM
          </Button>
          <Button onClick={() => navigate('/procurement/po')} variant="outline">
            Purchase Orders
          </Button>
          <Button onClick={() => navigate('/procurement/grn')} variant="outline">
            Goods Receipt Notes
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{filteredOrders.length}</p>
                </div>
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm font-bold">{filteredOrders.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold text-green-600">₹{totals.totalAmount.toFixed(2)}</p>
                </div>
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 text-sm font-bold">₹</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Amount</p>
                  <p className="text-2xl font-bold text-orange-600">₹{totals.pendingAmount.toFixed(2)}</p>
                </div>
                <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-orange-600 text-sm font-bold">₹</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <CardTitle>Orders with Receipts</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSearchTerm(s => s ? "" : s)}>
                  <Search className="w-4 h-4 mr-2" /> Search
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="w-4 h-4 mr-2" /> Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFilterStatus(null)} className={!filterStatus ? 'bg-accent/20 font-semibold' : ''}>All Statuses</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('pending')} className={filterStatus==='pending' ? 'bg-accent/20 font-semibold' : ''}>Pending</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('confirmed')} className={filterStatus==='confirmed' ? 'bg-accent/20 font-semibold' : ''}>Confirmed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('in_production')} className={filterStatus==='in_production' ? 'bg-accent/20 font-semibold' : ''}>In Production</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('completed')} className={filterStatus==='completed' ? 'bg-accent/20 font-semibold' : ''}>Completed</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                 <Button variant="outline" size="sm" onClick={fetchOrders}>Refresh</Button>
              </div>
            </div>
            {searchTerm && (
              <div className="mt-2">
                <Input placeholder="Search by order # or customer" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                 <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Pending Amount</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(o => (
                      <TableRow key={o.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell>{o.customer?.company_name}</TableCell>
                        <TableCell>{new Date(o.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(o.status)}>{o.status.replace('_', ' ').toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="text-green-600">₹{(o.final_amount || 0).toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="text-orange-600">₹{(o.balance_amount || 0).toFixed(2)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${o.id}`)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700" 
                              onClick={() => {
                                const orderData = encodeURIComponent(JSON.stringify({
                                  order_id: o.id,
                                  order_number: o.order_number,
                                  customer: o.customer,
                                  order_item: {
                                    product_description: 'Product from Order',
                                    category_image_url: null,
                                    quantity: 1
                                  }
                                }));
                                navigate(`/bom/new?order=${orderData}`);
                              }}
                            >
                              Create BOM
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
    </ErpLayout>
  );
}


