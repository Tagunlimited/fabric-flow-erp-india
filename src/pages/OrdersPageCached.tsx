import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShoppingCart, Plus, Eye, Edit, Package, Truck, Clock, CheckCircle, Search, Filter, Trash2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderForm } from "@/components/orders/OrderForm";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCachedData } from "@/hooks/useCachedData";
import { usePageCaching } from "@/components/CachedPageWrapper";
import { CachedPageWrapper } from "@/components/CachedPageWrapper";

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

function OrdersPageContent() {
  const navigate = useNavigate();
  const [salesManagers, setSalesManagers] = useState<{ [key: string]: { id: string; full_name: string; avatar_url?: string } }>({});
  const [activeTab, setActiveTab] = useState("list");
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const { saveState, getState } = usePageCaching('orders');

  // Use cached data for orders
  const { 
    data: orders, 
    loading, 
    error,
    refetch: refetchOrders 
  } = useCachedData({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(company_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheConfig: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    }
  });

  // Use cached data for sales managers
  const { 
    data: salesManagersData,
    refetch: refetchSalesManagers 
  } = useCachedData({
    queryKey: ['sales-managers'],
    queryFn: async () => {
      if (!orders || orders.length === 0) return {};

      const salesManagerIds = orders
        .map(order => order.sales_manager)
        .filter(Boolean)
        .filter((value, index, self) => self.indexOf(value) === index);

      if (salesManagerIds.length === 0) return {};

      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, full_name, avatar_url')
        .in('id', salesManagerIds);

      if (employeesError) throw employeesError;

      return employeesData?.reduce((acc, emp) => {
        acc[emp.id] = emp;
        return acc;
      }, {} as { [key: string]: { id: string; full_name: string; avatar_url?: string } }) || {};
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheConfig: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    }
  });

  // Save page state
  useEffect(() => {
    const savedState = getState();
    if (savedState) {
      setActiveTab(savedState.activeTab || "list");
      setSearchTerm(savedState.searchTerm || "");
      setFilterStatus(savedState.filterStatus || null);
      setSortBy(savedState.sortBy || "date_desc");
    }
  }, [getState]);

  useEffect(() => {
    saveState({
      activeTab,
      searchTerm,
      filterStatus,
      sortBy,
      timestamp: Date.now()
    });
  }, [activeTab, searchTerm, filterStatus, sortBy, saveState]);

  // Update sales managers when orders change
  useEffect(() => {
    if (salesManagersData) {
      setSalesManagers(salesManagersData);
    }
  }, [salesManagersData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-orange-100 text-orange-800';
      case 'quality_check': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-indigo-100 text-indigo-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return Clock;
      case 'confirmed': return CheckCircle;
      case 'in_production': return Package;
      case 'quality_check': return CheckCircle;
      case 'completed': return CheckCircle;
      case 'dispatched': return Truck;
      case 'cancelled': return Trash2;
      default: return Clock;
    }
  };

  const filteredOrders = orders?.filter(order => {
    const matchesSearch = !searchTerm || 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.company_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = !filterStatus || order.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  }) || [];

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case 'date_asc':
        return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
      case 'date_desc':
        return new Date(b.order_date).getTime() - new Date(a.order_date).getTime();
      case 'amount_asc':
        return a.total_amount - b.total_amount;
      case 'amount_desc':
        return b.total_amount - a.total_amount;
      case 'status':
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order deleted successfully');
      refetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(`Order status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      refetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleOrderSaved = () => {
    setShowOrderForm(false);
    setEditingOrder(null);
    refetchOrders();
    refetchSalesManagers();
  };

  const refreshData = () => {
    refetchOrders();
    refetchSalesManagers();
  };

  if (loading && !orders) {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Orders</h1>
            <div className="flex items-center space-x-2">
              <Button disabled>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </Card>
            ))}
          </div>
        </div>
      </ErpLayout>
    );
  }

  if (error) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center h-64">
          <Card className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Failed to load orders</h3>
            <p className="text-muted-foreground mb-4">
              {error.message || 'An error occurred while loading orders'}
            </p>
            <Button onClick={refreshData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </Card>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="text-muted-foreground">
              Manage and track all customer orders
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowOrderForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders?.filter(o => o.status === 'pending').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Production</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders?.filter(o => o.status === 'in_production').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders?.filter(o => o.status === 'completed').length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Order List</TabsTrigger>
            <TabsTrigger value="form">New Order</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Search and Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setFilterStatus(null)}>
                        All Status
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus('pending')}>
                        Pending
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus('confirmed')}>
                        Confirmed
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus('in_production')}>
                        In Production
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus('completed')}>
                        Completed
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Sort
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setSortBy('date_desc')}>
                        Date (Newest)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy('date_asc')}>
                        Date (Oldest)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy('amount_desc')}>
                        Amount (High to Low)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy('amount_asc')}>
                        Amount (Low to High)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle>Orders ({sortedOrders.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sales Manager</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedOrders.map((order) => {
                      const StatusIcon = getStatusIcon(order.status);
                      const salesManager = salesManagers[order.sales_manager];
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            {order.order_number}
                          </TableCell>
                          <TableCell>
                            {order.customer?.company_name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(order.order_date), 'MMM dd, yyyy')}
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
                                  <SelectItem value="designing_done">Designing Done</SelectItem>
                                  <SelectItem value="under_procurement">Under Procurement</SelectItem>
                                  <SelectItem value="in_production">In Production</SelectItem>
                                  <SelectItem value="under_cutting">Under Cutting</SelectItem>
                                  <SelectItem value="under_stitching">Under Stitching</SelectItem>
                                  <SelectItem value="under_qc">Under QC</SelectItem>
                                  <SelectItem value="quality_check">Quality Check</SelectItem>
                                  <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                                  <SelectItem value="rework">Rework</SelectItem>
                                  <SelectItem value="partial_dispatched">Partial Dispatched</SelectItem>
                                  <SelectItem value="dispatched">Dispatched</SelectItem>
                                  <SelectItem value="completed" className="text-green-600 font-semibold">✅ Completed</SelectItem>
                                  <SelectItem value="cancelled" className="text-red-600">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                              <Badge className={getStatusColor(order.status)}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {order.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {salesManager ? (
                              <div className="flex items-center space-x-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={salesManager.avatar_url} />
                                  <AvatarFallback>
                                    {salesManager.full_name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{salesManager.full_name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            ₹{order.total_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {order.status !== 'completed' && order.status !== 'cancelled' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleStatusChange(order.id, 'completed')}
                                >
                                  ✅ Complete
                                </Button>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingOrder(order);
                                  setShowOrderForm(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Order</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete order {order.order_number}? 
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteOrder(order.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="form">
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingOrder ? 'Edit Order' : 'Create New Order'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OrderForm
                  order={editingOrder}
                  onSave={handleOrderSaved}
                  onCancel={() => {
                    setShowOrderForm(false);
                    setEditingOrder(null);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
}

export default function OrdersPage() {
  return (
    <CachedPageWrapper 
      pageKey="orders"
      enableAutoSave={true}
      autoSaveInterval={30000}
      cacheConfig={{
        ttl: 10 * 60 * 1000, // 10 minutes
        persistToStorage: true
      }}
    >
      <OrdersPageContent />
    </CachedPageWrapper>
  );
}
