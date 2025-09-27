import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
  Target,
  Settings,
  BarChart3,
  UserPlus,
  Building,
  Clipboard,
  Wrench,
  Shield,
  Plus,
  ArrowRight,
  Activity,
  Calendar,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { getDashboardData, getDepartmentCount, getRecentActivities, type DashboardData } from "@/lib/database";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { CalendarView } from "@/components/CalendarView";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardSettings, type DashboardSettings as DashboardSettingsType } from "@/components/DashboardSettings";
import { DashboardTableView } from "@/components/DashboardTableView";
import { DashboardChartsView } from "@/components/DashboardChartsView";

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
  link: string;
}

interface ModuleCard {
  title: string;
  description: string;
  icon: any;
  color: string;
  link: string;
  stats: { label: string; value: string }[];
}

export function EnhancedDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [departmentCount, setDepartmentCount] = useState<number>(0);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'dashboard' | 'calendar'>('dashboard');
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettingsType>({
    viewMode: 'cards',
    visibleWidgets: {
      keyMetrics: true,
      quickStats: true,
      moduleCards: true,
      recentOrders: true,
      productionStatus: true,
      recentActivity: true,
      systemOverview: true,
    },
    chartTypes: {
      metrics: 'bar',
      stats: 'bar',
    },
    refreshInterval: 60,
    compactMode: false,
  });
  const navigate = useNavigate();
  const { user } = useAuth();

  // Helper function to format time ago
  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} sec ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hr ago`;
    return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;
  };

  // Helper function to get activity type color
  const getActivityTypeColor = (activityType: string) => {
    if (activityType.includes('order')) return 'bg-blue-500';
    if (activityType.includes('production')) return 'bg-orange-500';
    if (activityType.includes('quality')) return 'bg-green-500';
    if (activityType.includes('dispatch')) return 'bg-purple-500';
    if (activityType.includes('customer')) return 'bg-cyan-500';
    if (activityType.includes('payment')) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        console.log('Fetching dashboard data...');
        const [dashboardData, deptCount, activities] = await Promise.all([
          getDashboardData(),
          getDepartmentCount(),
          getRecentActivities(10)
        ]);
        console.log('Dashboard data received:', dashboardData);
        console.log('Department count received:', deptCount);
        console.log('Recent activities received:', activities);
        setData(dashboardData);
        setDepartmentCount(deptCount);
        setRecentActivities(activities);
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
      </div>
    );
  }

  const keyMetrics: DashboardMetric[] = [
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
      value: `${Math.round((data.productionOrders || []).reduce((sum, order) => sum + (order.efficiency_percentage || 0), 0) / Math.max((data.productionOrders || []).length, 1))}%`,
      change: "N/A",
      trend: "neutral",
      icon: Factory,
      color: "text-warning"
    },
    {
      title: "Quality Pass Rate",
      value: `${Math.round(((data.qualityChecks || []).filter((qc) => qc.status === 'passed').length / Math.max((data.qualityChecks || []).length, 1)) * 100)}%`,
      change: "N/A",
      trend: "neutral",
      icon: CheckCircle,
      color: "text-quality"
    }
  ];

  const quickStats: QuickStat[] = [
    {
      label: "Total Customers",
      value: data.summary.totalCustomers,
      total: data.summary.totalCustomers,
      color: "bg-accent",
      icon: Users,
      link: "/crm/customers"
    },
    {
      label: "Active Employees",
      value: data.summary.totalEmployees,
      total: data.summary.totalEmployees,
      color: "bg-primary",
      icon: UserPlus,
      link: "/people/employees"
    },
    {
      label: "Products",
      value: data.summary.totalProducts,
      total: data.summary.totalProducts,
      color: "bg-inventory",
      icon: Package,
      link: "/inventory"
    },
    {
      label: "Low Stock Alerts",
      value: data.summary.lowStockItems,
      total: data.summary.totalInventory,
      color: "bg-error",
      icon: AlertTriangle,
      link: "/inventory"
    }
  ];

  const moduleCards: ModuleCard[] = [
    {
      title: "Customer Relationship Management",
      description: "Manage customers, leads, and sales pipeline",
      icon: Users,
      color: "bg-accent",
      link: "/crm",
      stats: [
        { label: "Customers", value: data.summary.totalCustomers.toString() },
        { label: "Active Orders", value: (data.summary.pendingOrders + data.summary.inProductionOrders).toString() }
      ]
    },
    {
      title: "Order Management",
      description: "Track and manage all customer orders",
      icon: ShoppingCart,
      color: "bg-manufacturing",
      link: "/orders",
      stats: [
        { label: "Total Orders", value: data.summary.totalOrders.toString() },
        { label: "Pending", value: data.summary.pendingOrders.toString() }
      ]
    },
    {
      title: "Production Management",
      description: "Monitor production stages and efficiency",
      icon: Factory,
      color: "bg-warning",
      link: "/production",
      stats: [
        { label: "In Production", value: data.productionOrders.length.toString() },
        { label: "Avg Efficiency", value: `${Math.round(data.productionOrders.reduce((sum, order) => sum + (order.efficiency_percentage || 0), 0) / Math.max(data.productionOrders.length, 1))}%` }
      ]
    },
    {
      title: "Quality Control",
      description: "Quality checks and compliance tracking",
      icon: Shield,
      color: "bg-quality",
      link: "/quality",
      stats: [
        { label: "QC Checks", value: (data.qualityChecks || []).length.toString() },
        { label: "Pass Rate", value: `${Math.round(((data.qualityChecks || []).filter((qc) => qc.status === 'passed').length / Math.max((data.qualityChecks || []).length, 1)) * 100)}%` }
      ]
    },
    {
      title: "Inventory Management",
      description: "Stock levels, suppliers, and procurement",
      icon: Package,
      color: "bg-inventory",
      link: "/inventory",
      stats: [
        { label: "Items", value: data.summary.totalInventory.toString() },
        { label: "Low Stock", value: data.summary.lowStockItems.toString() }
      ]
    },
    {
      title: "Dispatch & Logistics",
      description: "Shipping, tracking, and delivery management",
      icon: Truck,
      color: "bg-primary",
      link: "/dispatch",
      stats: [
        { label: "Ready to Ship", value: data.orders.filter((o) => o.status === 'completed').length.toString() },
        { label: "In Transit", value: data.dispatchOrders.length.toString() }
      ]
    },
    {
      title: "People Management",
      description: "Employee directory and organizational structure",
      icon: Building,
      color: "bg-accent",
      link: "/people",
      stats: [
        { label: "Employees", value: data.summary.totalEmployees.toString() },
        { label: "Departments", value: departmentCount.toString() }
      ]
    },
    {
      title: "Analytics & Reports",
      description: "Business insights and performance metrics",
      icon: BarChart3,
      color: "bg-success",
      link: "/analytics",
      stats: [
        { label: "Revenue", value: `₹${(data.summary.totalRevenue / 100000).toFixed(1)}L` },
        { label: "Growth", value: "N/A" }
      ]
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
      case 'ready': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (viewMode === 'calendar') {
    return (
      <div className="space-y-6">
        {/* Header with Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Calendar View
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Schedule overview for all processes and events
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              size="lg"
              variant="outline"
              onClick={() => setViewMode('dashboard')}
              className="flex items-center bg-gradient-to-r from-card to-card/80 hover:from-primary/10 hover:to-primary/5 border-2 border-primary/20 hover:border-primary/40 px-8 py-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 text-lg font-semibold"
            >
              <ToggleLeft className="w-6 h-6 mr-3" />
              Switch to Dashboard
            </Button>
          </div>
        </div>
        <CalendarView />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            ERP Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Comprehensive business overview and quick access to all modules
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            size="lg"
            onClick={() => setViewMode('calendar')}
            className="flex items-center bg-gradient-primary text-white px-6 py-3 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 text-lg font-semibold"
          >
            <Calendar className="w-6 h-6 mr-3" />
            Calendar View
          </Button>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
          <DashboardSettings 
            settings={dashboardSettings}
            onSettingsChange={setDashboardSettings}
          />
        </div>
      </div>

      {/* Dashboard Content based on settings */}
      {dashboardSettings.viewMode === 'table' ? (
        <DashboardTableView data={data} />
      ) : dashboardSettings.viewMode === 'charts' ? (
        <DashboardChartsView data={data} chartTypes={dashboardSettings.chartTypes} />
      ) : (
        /* Cards View - Original Dashboard Layout */
        <>
          {/* Key Performance Metrics */}
          {dashboardSettings.visibleWidgets.keyMetrics && (
            <div className={cn(
              "grid gap-6",
              dashboardSettings.compactMode ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            )}>
              {keyMetrics.map((metric, idx) => (
                <Card key={metric.title} className={cn(
                  "relative overflow-hidden shadow-erp-lg hover:shadow-erp-xl transition-all duration-300 hover:scale-105 group border-0",
                  idx === 0 && "bg-green-100 text-green-900",
                  idx === 1 && "bg-blue-100 text-blue-900",
                  idx === 2 && "bg-yellow-100 text-yellow-900",
                  idx === 3 && "bg-purple-100 text-purple-900"
                )}>
                  <CardContent className={cn("p-6", dashboardSettings.compactMode && "p-4")}> 
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-90">{metric.title}</p>
                        <p className={cn("font-bold mt-2 text-3xl")}>{metric.value}</p>
                        <div className="flex items-center mt-3">
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
                      <div className="p-3 rounded-xl bg-white/70 group-hover:scale-110 transition-transform shadow-lg">
                        <metric.icon className="w-6 h-6 text-gray-700" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick Access Stats */}
          {dashboardSettings.visibleWidgets.quickStats && (
            <div className={cn(
              "grid gap-4",
              dashboardSettings.compactMode ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            )}>
              {quickStats.map((stat, idx) => (
                <Link key={stat.label} to={stat.link}>
                  <Card className={cn(
                    "shadow-erp-md hover:shadow-erp-lg transition-all duration-300 hover:scale-105 cursor-pointer group border-0",
                    idx === 0 && "bg-pink-100 text-pink-900",
                    idx === 1 && "bg-indigo-100 text-indigo-900",
                    idx === 2 && "bg-orange-100 text-orange-900",
                    idx === 3 && "bg-red-100 text-red-900"
                  )}>
                    <CardContent className={cn("p-4", dashboardSettings.compactMode && "p-3")}> 
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm opacity-90">{stat.label}</p>
                          <p className={cn("font-bold text-2xl")}>{stat.value}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/70 group-hover:scale-110 transition-transform">
                          <stat.icon className="w-5 h-5 text-gray-700" />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <Progress 
                          value={(stat.value / stat.total) * 100} 
                          className="h-2 flex-1 mr-2 bg-gray-200"
                        />
                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* ERP Modules Grid */}
          {dashboardSettings.visibleWidgets.moduleCards && (
            <div>
              <h2 className={cn("font-bold mb-6 flex items-center", dashboardSettings.compactMode ? "text-xl mb-4" : "text-2xl mb-6")}>
                <Activity className="w-6 h-6 mr-2 text-primary" />
                ERP Modules
              </h2>
              <div className={cn(
                "grid gap-6",
                dashboardSettings.compactMode ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              )}>
                {moduleCards.map((module) => (
                  <Link key={module.title} to={module.link}>
                    <Card className="h-full shadow-erp-md hover:shadow-erp-xl transition-all duration-300 hover:scale-105 cursor-pointer group border-0 bg-gradient-to-br from-card to-card/60">
                      <CardHeader className={cn("pb-3", dashboardSettings.compactMode && "pb-2")}>
                        <div className="flex items-center justify-between">
                          <div className={cn("p-3 rounded-xl shadow-lg", module.color)}>
                            <module.icon className="w-6 h-6 text-white" />
                          </div>
                          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>
                        <CardTitle className={cn("font-bold group-hover:text-primary transition-colors", dashboardSettings.compactMode ? "text-base" : "text-lg")}>
                          {module.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!dashboardSettings.compactMode && (
                          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            {module.description}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {module.stats.map((stat) => (
                            <div key={stat.label} className="text-center p-2 bg-muted/50 rounded-lg">
                              <p className={cn("font-bold text-primary", dashboardSettings.compactMode ? "text-base" : "text-lg")}>{stat.value}</p>
                              <p className="text-xs text-muted-foreground">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity & Production Status */}
          {(dashboardSettings.visibleWidgets.recentOrders || dashboardSettings.visibleWidgets.productionStatus || dashboardSettings.visibleWidgets.recentActivity) && (
            <div className={cn(
              "grid gap-6",
              dashboardSettings.compactMode ? "grid-cols-1 lg:grid-cols-3 gap-4" : "grid-cols-1 lg:grid-cols-3 gap-6"
            )}>
              {/* Recent Orders */}
              {dashboardSettings.visibleWidgets.recentOrders && (
                <Card className="shadow-erp-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        Recent Orders
                      </div>
                      <Link to="/orders">
                        <Button variant="outline" size="sm">
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentOrders.slice(0, dashboardSettings.compactMode ? 2 : 3).map((order: any) => (
                        <div 
                          key={order.id} 
                          className="flex items-center justify-between p-3 bg-gradient-subtle rounded-lg hover:bg-muted/80 transition-colors cursor-pointer group"
                          onClick={() => navigate(`/orders/${order.id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {data.customers.find((c: any) => c.id === order.customerId)?.companyName}
                            </p>
                          </div>
                          <div className="text-right ml-2">
                            <Badge className={cn("text-xs", getStatusColor(order.status))}>
                              {order.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Production Status */}
              {dashboardSettings.visibleWidgets.productionStatus && (
                <Card className="shadow-erp-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Factory className="w-5 h-5 mr-2" />
                        Production
                      </div>
                      <Link to="/production">
                        <Button variant="outline" size="sm">
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {['cutting', 'stitching', 'quality_check'].map((stage) => {
                        const stageOrders = (data.productionOrders || []).filter((order: any) => order.stage === stage);
                        const percentage = Math.round((stageOrders.length / Math.max((data.productionOrders || []).length, 1)) * 100);
                        
                        return (
                          <div 
                            key={stage} 
                            className="cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                            onClick={() => navigate(`/production?stage=${stage}`)}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium capitalize">{stage.replace('_', ' ')}</span>
                              <span className="text-xs text-muted-foreground">{stageOrders.length}</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity */}
              {dashboardSettings.visibleWidgets.recentActivity && (
                <Card className="shadow-erp-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Activity className="w-5 h-5 mr-2" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentActivities.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>No recent activity found</p>
                          <p className="text-sm">Activity will appear here as users interact with the system</p>
                        </div>
                      ) : (
                        recentActivities.slice(0, dashboardSettings.compactMode ? 3 : 5).map((activity, index) => (
                        <div key={activity.id} className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
                          <div className={cn(
                            "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                            getActivityTypeColor(activity.activity_type)
                          )} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {activity.user_name || activity.user_email || 'System'}
                            </p>
                            <p className="text-xs text-muted-foreground">{activity.activity_description}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-muted-foreground">
                                {activity.activity_type.replace('_', ' ')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTimeAgo(activity.performed_at)}
                              </span>
                            </div>
                            {activity.order_number && (
                              <p className="text-xs text-blue-600 font-medium mt-1">
                                Order: {activity.order_number}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* System Overview */}
          {dashboardSettings.visibleWidgets.systemOverview && (
            <Card className="shadow-erp-lg bg-gradient-to-r from-card to-card/80">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Target className="w-6 h-6 mr-2" />
                    System Overview
                    <Badge className="ml-3 bg-success text-success-foreground text-lg px-3 py-1">
                      {(data.summary.totalCustomers + data.summary.totalOrders + data.summary.totalProducts + data.summary.totalEmployees).toLocaleString()} Total Records
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  "grid gap-4 text-center",
                  dashboardSettings.compactMode ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4"
                )}>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-accent", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalEmployees}</p>
                    <p className="text-sm text-muted-foreground font-medium">System Users</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-manufacturing", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalCustomers}</p>
                    <p className="text-sm text-muted-foreground font-medium">Customers</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-inventory", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalProducts}</p>
                    <p className="text-sm text-muted-foreground font-medium">Products</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-primary", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalOrders}</p>
                    <p className="text-sm text-muted-foreground font-medium">Total Orders</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-warning", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{(data.productionOrders || []).length}</p>
                    <p className="text-sm text-muted-foreground font-medium">Production Jobs</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-quality", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{(data.qualityChecks || []).length}</p>
                    <p className="text-sm text-muted-foreground font-medium">QC Checks</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-success", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalInventory}</p>
                    <p className="text-sm text-muted-foreground font-medium">Inventory Items</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}