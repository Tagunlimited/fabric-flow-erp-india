import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Factory, Clock, Users, TrendingUp, Scissors, BarChart3, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { getDashboardData, type DashboardData } from "@/lib/database";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Receipt } from "lucide-react";

const ProductionPage = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // State for orders with receipts (excluding cancelled)
  const [ordersWithReceipts, setOrdersWithReceipts] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Fetch orders with receipts (excluding cancelled orders)
  const fetchOrdersWithReceipts = async () => {
    try {
      setOrdersLoading(true);
      // 1) Fetch receipts that point to orders
      const { data: receipts, error: receiptsError } = await supabase
        .from("receipts")
        .select("reference_id, reference_number, reference_type")
        .or('reference_type.eq.order,reference_type.eq.ORDER');

      if (receiptsError) {
        console.error('Error fetching receipts:', receiptsError);
        throw receiptsError;
      }

      const validReceipts = receipts || [];
      if (validReceipts.length === 0) {
        setOrdersWithReceipts([]);
        return;
      }

      const orderIds = Array.from(
        new Set(
          validReceipts
            .map((r: any) => r.reference_id ? String(r.reference_id) : null)
            .filter(Boolean) as string[]
        )
      );
      const orderNumbers = Array.from(
        new Set(
          validReceipts
            .map((r: any) => r.reference_number ? String(r.reference_number).trim() : null)
            .filter(Boolean) as string[]
        )
      );

      // 2) Fetch orders first (simplified query) - exclude readymade orders
      let ordersQuery = supabase
        .from("orders")
        .select(`
          *,
          customer:customers(company_name)
        `)
        .neq('status', 'cancelled' as any) // Exclude cancelled orders
        .or('order_type.is.null,order_type.eq.custom'); // Exclude readymade orders

      if (orderIds.length && orderNumbers.length) {
        const idsList = orderIds.join(",");
        const numsList = orderNumbers.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(",");
        ordersQuery = ordersQuery.or(`id.in.(${idsList}),order_number.in.(${numsList})`);
      } else if (orderIds.length) {
        ordersQuery = ordersQuery.in("id", orderIds as any);
      } else if (orderNumbers.length) {
        ordersQuery = ordersQuery.in("order_number", orderNumbers as any);
      }

      const { data: ordersData, error: ordersError } = await ordersQuery;
      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        throw ordersError;
      }

      // 3) Fetch order items separately for each order
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order: any) => {
          const { data: orderItems, error: itemsError } = await supabase
            .from("order_items")
            .select(`
              id,
              quantity,
              category_image_url,
              product_description
            `)
            .eq("order_id", order.id);

          if (itemsError) {
            console.error(`Error fetching items for order ${order.id}:`, itemsError);
            return { ...order, order_items: [] };
          }

          return { ...order, order_items: orderItems || [] };
        })
      );

      // Sort by order date (newest first)
      const sorted = ordersWithItems.sort(
        (a: any, b: any) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      );

      setOrdersWithReceipts(sorted);
    } catch (error) {
      console.error("Error fetching orders with receipts:", error);
      setOrdersWithReceipts([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch orders with receipts on component mount
  useEffect(() => {
    fetchOrdersWithReceipts();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const dashboardData = await getDashboardData();
        setData(dashboardData);
      } catch (error) {
        console.error('Error fetching production data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <ErpLayout>
        <div className="space-y-6">
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

  if (!data) {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Failed to load production data</p>
          </div>
        </div>
      </ErpLayout>
    );
  }

  // Calculate production statistics
  const productionLogs = data.productionOrders.length;
  const avgEfficiency = data.productionOrders.length > 0 
    ? Math.round(data.productionOrders.reduce((sum, order) => sum + (order.efficiency_percentage || 0), 0) / data.productionOrders.length)
    : 0;
  const activeWorkers = data.employees.length;
  const avgHours = 8.5; // This would need to be calculated from actual work logs if available

  // Calculate pending assignments and active cutting jobs
  const pendingAssignments = data.orders.filter(order => order.status === 'pending').length;
  const activeCuttingJobs = data.productionOrders.filter(order => order.stage === 'cutting').length;

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Production Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Track production workflows and optimize manufacturing processes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Production Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{productionLogs}</span>
                <Factory className="w-5 h-5 text-manufacturing" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{avgEfficiency}%</span>
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{activeWorkers}</span>
                <Users className="w-5 h-5 text-accent" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{data.summary.inProductionOrders}</span>
                <Clock className="w-5 h-5 text-warning" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Production Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to="/production/assign-orders">
            <Card className="shadow-erp-md hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Assign Orders</CardTitle>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Manage order assignments and track production workflow
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">{pendingAssignments} Pending</span>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>


          <Link to="/production/cutting-manager">
            <Card className="shadow-erp-md hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Cutting Manager</CardTitle>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Manage cutting operations and track cutting efficiency
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Scissors className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">{activeCuttingJobs} Active Jobs</span>
                  </div>
                  <Badge variant="secondary">Efficient</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Active Orders Section */}
        <Card className="shadow-erp-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Active Orders
              </CardTitle>
              <Button variant="outline" size="sm" onClick={fetchOrdersWithReceipts}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Loading orders...</p>
              </div>
            ) : ordersWithReceipts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active orders found</p>
                <p className="text-sm">Active orders will appear here once they are created</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Total Qty</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersWithReceipts.map((order: any) => {
                      // Calculate total quantity from order items
                      const totalQuantity = order.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            {order.order_number}
                          </TableCell>
                          <TableCell>
                            {order.customer?.company_name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2 justify-start">
                              {order.order_items?.map((item: any, index: number) => (
                                <div key={index} className="flex flex-col items-center gap-1 min-w-0">
                                  {item.category_image_url ? (
                                    <img
                                      src={item.category_image_url}
                                      alt={item.product_description || 'Product'}
                                      className="w-12 h-12 rounded object-cover border shadow-sm flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-gray-100 border flex items-center justify-center shadow-sm flex-shrink-0">
                                      <span className="text-xs text-gray-500">IMG</span>
                                    </div>
                                  )}
                                  <span className="text-xs text-muted-foreground text-center w-16 truncate">
                                    {item.product_description || 'Product'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {totalQuantity}
                          </TableCell>
                          <TableCell>
                            {new Date(order.order_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            ₹{order.final_amount?.toLocaleString() || '0'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                order.status === 'completed' ? 'default' :
                                order.status === 'in_production' ? 'secondary' :
                                order.status === 'pending' ? 'outline' : 'secondary'
                              }
                            >
                              {order.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => window.open(`/orders/${order.id}?from=production`, '_blank')}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle>Production Workflow System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Comprehensive production tracking with {productionLogs} production orders across cutting, stitching, embroidery, and packaging stages.
              Monitor worker efficiency and optimize production timelines with {activeWorkers} employees and {avgEfficiency}% average efficiency.
            </p>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default ProductionPage;