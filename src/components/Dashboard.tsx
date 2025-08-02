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
import { generateAllDummyData } from "@/lib/dummyData";
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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading and generate dummy data
    const timer = setTimeout(() => {
      const generatedData = generateAllDummyData();
      setData(generatedData);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
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
      value: `₹${(data.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / 100000).toFixed(1)}L`,
      change: "+12.5%",
      trend: "up",
      icon: DollarSign,
      color: "text-success"
    },
    {
      title: "Active Orders",
      value: data.orders.filter((order: any) => 
        ['pending', 'confirmed', 'in_production', 'quality_check'].includes(order.status)
      ).length.toString(),
      change: "+8.2%",
      trend: "up",
      icon: ShoppingCart,
      color: "text-manufacturing"
    },
    {
      title: "Production Efficiency",
      value: `${Math.round(data.productionLogs.reduce((sum: number, log: any) => sum + log.efficiency, 0) / data.productionLogs.length)}%`,
      change: "-2.1%",
      trend: "down",
      icon: Factory,
      color: "text-warning"
    },
    {
      title: "Quality Pass Rate",
      value: `${Math.round((data.qualityChecks.filter((qc: any) => qc.passed).length / data.qualityChecks.length) * 100)}%`,
      change: "+5.3%",
      trend: "up",
      icon: CheckCircle,
      color: "text-quality"
    }
  ];

  const quickStats: QuickStat[] = [
    {
      label: "Customers",
      value: data.customers.length,
      total: data.customers.length,
      color: "bg-accent",
      icon: Users
    },
    {
      label: "Products",
      value: data.products.length,
      total: data.products.length,
      color: "bg-inventory",
      icon: Package
    },
    {
      label: "Low Stock Items",
      value: data.inventoryItems.filter((item: any) => item.stockStatus === 'low' || item.stockStatus === 'critical').length,
      total: data.inventoryItems.length,
      color: "bg-error",
      icon: AlertTriangle
    },
    {
      label: "Ready to Dispatch",
      value: data.orders.filter((order: any) => order.status === 'ready').length,
      total: data.orders.length,
      color: "bg-primary",
      icon: Truck
    }
  ];

  const recentOrders = data.orders
    .sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
    .slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-orange-100 text-orange-800';
      case 'quality_check': return 'bg-purple-100 text-purple-800';
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
                    <p className="text-sm font-medium mt-1">₹{order.totalAmount.toLocaleString()}</p>
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
                const stageOrders = data.productionLogs.filter((log: any) => log.stage === stage);
                const percentage = Math.round((stageOrders.length / data.productionLogs.length) * 100);
                const avgEfficiency = Math.round(
                  stageOrders.reduce((sum: number, log: any) => sum + log.efficiency, 0) / stageOrders.length
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
              {data.summary.totalRecords.toLocaleString()} Records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-accent">{data.summary.totalUsers}</p>
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
              <p className="text-2xl font-bold text-warning">{data.summary.totalProductionLogs}</p>
              <p className="text-sm text-muted-foreground">Production</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-quality">{data.summary.totalQualityChecks}</p>
              <p className="text-sm text-muted-foreground">QC Checks</p>
            </div>
            <div className="p-4 bg-gradient-subtle rounded-lg">
              <p className="text-2xl font-bold text-success">{data.summary.totalInventoryItems}</p>
              <p className="text-sm text-muted-foreground">Inventory</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}