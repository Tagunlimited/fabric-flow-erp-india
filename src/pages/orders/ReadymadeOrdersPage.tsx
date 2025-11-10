import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShoppingCart, Plus, Eye, Package, Clock, CheckCircle, Search, Filter, RefreshCw, Truck } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReadymadeOrderForm } from "@/components/orders/ReadymadeOrderForm";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePersistentTabState } from "@/hooks/usePersistentTabState";

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  sales_manager: string;
  sales_manager_details?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
}

const ReadymadeOrdersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesManagers, setSalesManagers] = useState<{ [key: string]: { id: string; full_name: string; avatar_url?: string } }>({});
  const [loading, setLoading] = useState(true);
  const { activeTab, setActiveTab } = usePersistentTabState({
    pageKey: 'readymadeOrders',
    defaultValue: 'list'
  });
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("date_desc");

  useEffect(() => {
    if (activeTab === "list") {
      fetchOrders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.refreshOrders && activeTab === "list") {
      fetchOrders(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, activeTab, navigate, location.pathname]);

  const fetchOrders = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      if (forceRefresh) {
        setOrders([]);
        setSalesManagers({});
      }
      
      // Fetch only readymade orders
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(company_name)
        `)
        .eq('order_type', 'readymade' as any)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        const salesManagerIds = (data as any[])
          .map((order: any) => order.sales_manager)
          .filter(Boolean)
          .filter((value: any, index: number, self: any[]) => self.indexOf(value) === index);

        if (salesManagerIds.length > 0) {
          const { data: employeesData, error: employeesError } = await supabase
            .from('employees')
            .select('id, full_name, avatar_url')
            .in('id', salesManagerIds);

          if (!employeesError && employeesData) {
            const managersMap = (employeesData as any[]).reduce((acc: any, emp: any) => {
              acc[emp.id] = emp;
              return acc;
            }, {} as { [key: string]: { id: string; full_name: string; avatar_url?: string } });
            setSalesManagers(managersMap);
          }
        }
      }
      
      setOrders((data as any[]) || []);
    } catch (error) {
      console.error('Error fetching readymade orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any } as any)
        .eq('id', orderId as any);

      if (error) throw error;

      toast.success(`Order status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'ready_for_dispatch': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredOrders = orders
    .filter(order => !filterStatus || order.status === filterStatus)
    .filter(order => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(term) ||
        order.customer?.company_name?.toLowerCase().includes(term) ||
        order.status?.toLowerCase().includes(term) ||
        (order.order_date && format(new Date(order.order_date), 'dd-MMM-yy').toLowerCase().includes(term)) ||
        (order.final_amount !== undefined && order.final_amount.toString().toLowerCase().includes(term)) ||
        (order.balance_amount !== undefined && order.balance_amount.toString().toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      if (sortBy === "date_asc") {
        return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
      } else if (sortBy === "date_desc") {
        return new Date(b.order_date).getTime() - new Date(a.order_date).getTime();
      } else if (sortBy === "amount_asc") {
        return (a.final_amount || 0) - (b.final_amount || 0);
      } else if (sortBy === "amount_desc") {
        return (b.final_amount || 0) - (a.final_amount || 0);
      }
      return 0;
    });

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Readymade Orders Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage readymade product orders from creation to dispatch
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{orders.length}</span>
                <ShoppingCart className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-yellow-100 text-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'pending').length}
                </span>
                <Clock className="w-5 h-5 text-yellow-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Confirmed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'confirmed').length}
                </span>
                <Package className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-purple-100 text-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Dispatched
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'dispatched').length}
                </span>
                <Truck className="w-5 h-5 text-purple-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-green-100 text-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Ready to Dispatch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'ready_for_dispatch').length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="list">Orders List</TabsTrigger>
              <TabsTrigger value="create">Create Order</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="list" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <CardTitle>All Readymade Orders</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowSearch(v => !v)}>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Filter className="w-4 h-4 mr-2" />
                          Filter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFilterStatus(null)} className={!filterStatus ? 'bg-accent/20 font-semibold' : ''}>All Statuses</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("pending")} className={filterStatus === "pending" ? 'bg-accent/20 font-semibold' : ''}>Pending</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("confirmed")} className={filterStatus === "confirmed" ? 'bg-accent/20 font-semibold' : ''}>Confirmed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("ready_for_dispatch")} className={filterStatus === "ready_for_dispatch" ? 'bg-accent/20 font-semibold' : ''}>Ready for Dispatch</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("dispatched")} className={filterStatus === "dispatched" ? 'bg-accent/20 font-semibold' : ''}>Dispatched</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("completed")} className={filterStatus === "completed" ? 'bg-accent/20 font-semibold' : ''}>Completed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("cancelled")} className={filterStatus === "cancelled" ? 'bg-accent/20 font-semibold' : ''}>Cancelled</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Sort
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSortBy("date_desc")} className={sortBy === "date_desc" ? 'bg-accent/20 font-semibold' : ''}>Newest First</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("date_asc")} className={sortBy === "date_asc" ? 'bg-accent/20 font-semibold' : ''}>Oldest First</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("amount_desc")} className={sortBy === "amount_desc" ? 'bg-accent/20 font-semibold' : ''}>Amount High-Low</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("amount_asc")} className={sortBy === "amount_asc" ? 'bg-accent/20 font-semibold' : ''}>Amount Low-High</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="sm" onClick={() => fetchOrders(true)} disabled={loading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Force Refresh
                    </Button>
                    <Button onClick={() => setActiveTab("create")}> <Plus className="w-4 h-4 mr-2" /> New Order </Button>
                  </div>
                </div>
                {showSearch && (
                  <div className="mt-2">
                    <Input
                      autoFocus
                      placeholder="Search by order number or customer name..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                )}
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
                          <TableHead>Order Number</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Sales Manager</TableHead>
                          <TableHead>Order Date</TableHead>
                          <TableHead>Expected Delivery</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => (
                          <TableRow 
                            key={order.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            <TableCell className="font-medium">{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={salesManagers[order.sales_manager]?.avatar_url} alt={salesManagers[order.sales_manager]?.full_name} />
                                  <AvatarFallback className="text-xs">
                                    {salesManagers[order.sales_manager]?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'SM'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{salesManagers[order.sales_manager]?.full_name || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(order.order_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: '2-digit'
                              })}
                            </TableCell>
                            <TableCell>
                              {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: '2-digit'
                              }) : 'N/A'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Select 
                                  value={order.status} 
                                  onValueChange={(newStatus) => handleStatusChange(order.id, newStatus)}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                                    <SelectItem value="dispatched">Dispatched</SelectItem>
                                    <SelectItem value="completed" className="text-green-600 font-semibold">✅ Completed</SelectItem>
                                    <SelectItem value="cancelled" className="text-red-600">Cancelled</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Badge className={getStatusColor(order.status)}>
                                  {order.status.replace('_', ' ').toUpperCase()}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>₹{order.final_amount?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>₹{order.balance_amount?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/orders/${order.id}`);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredOrders.length === 0 && !loading && (
                      <div className="text-center py-8 text-muted-foreground">
                        No readymade orders found
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <ReadymadeOrderForm 
              onOrderCreated={async () => {
                setActiveTab("list");
                setTimeout(async () => {
                  await fetchOrders();
                }, 100);
                toast.success("Readymade order created successfully!");
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
};

export default ReadymadeOrdersPage;

