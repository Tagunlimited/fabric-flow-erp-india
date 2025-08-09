import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Filter, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
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
                        <TableCell>₹{(o.final_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>₹{(o.balance_amount || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${o.id}`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
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


