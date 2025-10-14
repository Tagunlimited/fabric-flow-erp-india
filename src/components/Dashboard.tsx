import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  ShoppingCart, 
  Package, 
  Factory, 
  CheckCircle,
  Truck,
  AlertTriangle,
  DollarSign,
  Clock,
  Target
} from "lucide-react";

import { getDashboardData, type DashboardData } from "@/lib/database";
import { cn } from "@/lib/utils";

interface DashboardMetric {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  icon: any;
  color: string;
}

interface QuickStat {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: any;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const dashboardData = await getDashboardData();
        setData(dashboardData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-muted rounded w-2/3"></div>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6">
              <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
              <div className="h-40 bg-muted rounded"></div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const metrics: DashboardMetric[] = [
    {
      title: "Total Revenue",
      value: `₹${(data.summary.totalRevenue / 100000).toFixed(1)}L`,
      change: "N/A",
      trend: "neutral",
      icon: DollarSign,
      color: "text-success"
    },
    {
      title: "Active Orders",
      value: (data.summary.pendingOrders + data.summary.inProductionOrders).toString(),
      change: "N/A",
      trend: "neutral",
      icon: ShoppingCart,
      color: "text-manufacturing"
    },
    {
      title: "Production Efficiency",
      value: `${Math.round(data.productionOrders.reduce((sum, order) => sum + (order.efficiency_percentage || 0), 0) / Math.max(data.productionOrders.length, 1))}%`,
      change: "N/A",
      trend: "neutral",
      icon: Factory,
      color: "text-warning"
    },
    {
      title: "Quality Pass Rate",
      value: `${Math.round((data.qualityChecks.filter((qc) => qc.status === 'passed').length / Math.max(data.qualityChecks.length, 1)) * 100)}%`,
      change: "N/A",
      trend: "neutral",
      icon: CheckCircle,
      color: "text-quality"
    }
  ];

  const quickStats: QuickStat[] = [
    {
      label: "Customers",
      value: data.summary.totalCustomers,
      total: data.summary.totalCustomers,
      color: "bg-accent",
      icon: Users
    },
    {
      label: "Products",
      value: data.summary.totalProducts,
      total: data.summary.totalProducts,
      color: "bg-inventory",
      icon: Package
    },
    {
      label: "Low Stock Items",
      value: data.summary.lowStockItems,
      total: data.summary.totalInventory,
      color: "bg-error",
      icon: AlertTriangle
    },
    {
      label: "Ready to Dispatch",
      value: data.orders.filter((order) => order.status === 'completed').length,
      total: data.summary.totalOrders,
      color: "bg-primary",
      icon: Truck
    }
  ];

  const recentOrders = (data.orders || [])
    .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
    .slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-orange-100 text-orange-800';
      case 'quality_check': return 'bg-purple-100 text-purple-800';
      case 'designing_done': return 'bg-teal-100 text-teal-800';
      case 'under_procurement': return 'bg-amber-100 text-amber-800';
      case 'under_cutting': return 'bg-orange-100 text-orange-800';
      case 'under_stitching': return 'bg-indigo-100 text-indigo-800';
      case 'under_qc': return 'bg-pink-100 text-pink-800';
      case 'ready_for_dispatch': return 'bg-green-100 text-green-800';
      case 'rework': return 'bg-red-100 text-red-800';
      case 'designing_done': return 'bg-teal-100 text-teal-800';
      case 'under_procurement': return 'bg-amber-100 text-amber-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's what's happening with your business today.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => (
          <Card key={metric.title} className={cn(
            "relative overflow-hidden shadow-erp-md hover:shadow-erp-lg transition-all duration-300 hover:scale-105 group border-0",
            idx === 0 && "bg-green-100 text-green-900",
            idx === 1 && "bg-blue-100 text-blue-900",
            idx === 2 && "bg-yellow-100 text-yellow-900",
            idx === 3 && "bg-purple-100 text-purple-900"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium opacity-90">{metric.title}</p>
                  <p className="text-xl font-bold mt-1">{metric.value}</p>
                  <div className="flex items-center mt-2">
                    {metric.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                    ) : metric.trend === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                    ) : null}
                    <span className={cn(
                      "text-sm font-medium",
                      metric.trend === 'up' ? 'text-green-700' : 
                      metric.trend === 'down' ? 'text-red-700' : 'text-gray-700'
                    )}>
                      {metric.change}
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-full bg-white/70 group-hover:scale-110 transition-transform">
                  <metric.icon className="w-5 h-5 text-gray-700" />
                </div>
              </div>
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat, idx) => (
          <Card key={stat.label} className={cn(
            "shadow-erp-md hover:shadow-erp-lg transition-all duration-300 hover:scale-105 border-0",
            idx === 0 && "bg-pink-100 text-pink-900",
            idx === 1 && "bg-indigo-100 text-indigo-900",
            idx === 2 && "bg-orange-100 text-orange-900",
            idx === 3 && "bg-red-100 text-red-900"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/70">
                  <stat.icon className="w-5 h-5 text-gray-700" />
                </div>
              </div>
              <div className="mt-3">
                <Progress 
                  value={(stat.value / stat.total) * 100} 
                  className="h-2 bg-gray-200"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders & Production Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.customers.find((c: any) => c.id === order.customerId)?.companyName}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.replace('_', ' ')}
                    </Badge>

                     <p className="text-sm font-medium mt-1">{formatCurrency(order.totalAmount)}</p>

                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Production Status */}
        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Factory className="w-5 h-5 mr-2" />
              Production Status
              <Badge className="ml-2 bg-manufacturing text-manufacturing-foreground">
                Live
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['cutting', 'stitching', 'embroidery', 'quality_check'].map((stage) => {
                const stageOrders = (data.productionOrders || []).filter((order: any) => order.stage === stage);
                const percentage = Math.round((stageOrders.length / Math.max((data.productionOrders || []).length, 1)) * 100);
                const avgEfficiency = Math.round(
                  stageOrders.reduce((sum: number, order: any) => sum + (order.efficiency_percentage || 0), 0) / Math.max(stageOrders.length, 1)
                );
                
                return (
                  <div key={stage} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium capitalize">{stage.replace('_', ' ')}</span>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">{stageOrders.length} orders</span>
                        <span className="text-xs text-muted-foreground block">
                          {avgEfficiency || 0}% efficiency
                        </span>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Overview */}
      <Card className="shadow-erp-md">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="w-5 h-5 mr-2" />
            System Overview
            <Badge className="ml-2 bg-success text-success-foreground">
              {(data.summary.totalCustomers + data.summary.totalOrders + data.summary.totalProducts + data.summary.totalEmployees).toLocaleString()} Records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-accent">{data.summary.totalEmployees}</p>
              <p className="text-sm text-muted-foreground">Users</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-manufacturing">{data.summary.totalCustomers}</p>
              <p className="text-sm text-muted-foreground">Customers</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-inventory">{data.summary.totalProducts}</p>
              <p className="text-sm text-muted-foreground">Products</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-primary">{data.summary.totalOrders}</p>
              <p className="text-sm text-muted-foreground">Orders</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-warning">{data.productionOrders.length}</p>
              <p className="text-sm text-muted-foreground">Production</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-quality">{(data.qualityChecks || []).length}</p>
              <p className="text-sm text-muted-foreground">QC Checks</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-success">{data.summary.totalInventory}</p>
              <p className="text-sm text-muted-foreground">Inventory</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}