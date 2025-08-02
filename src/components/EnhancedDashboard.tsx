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
import { generateAllDummyData } from "@/lib/dummyData";
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
  const [data, setData] = useState<any>(null);
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
      </div>
    );
  }

  const keyMetrics: DashboardMetric[] = [
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
      label: "Total Customers",
      value: data.customers.length,
      total: data.customers.length,
      color: "bg-accent",
      icon: Users,
      link: "/crm/customers"
    },
    {
      label: "Active Employees",
      value: 50, // From employees data
      total: 50,
      color: "bg-primary",
      icon: UserPlus,
      link: "/people/employees"
    },
    {
      label: "Products",
      value: data.products.length,
      total: data.products.length,
      color: "bg-inventory",
      icon: Package,
      link: "/inventory"
    },
    {
      label: "Low Stock Alerts",
      value: data.inventoryItems.filter((item: any) => item.stockStatus === 'low' || item.stockStatus === 'critical').length,
      total: data.inventoryItems.length,
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
        { label: "Customers", value: data.customers.length.toString() },
        { label: "Active Orders", value: data.orders.filter((o: any) => o.status !== 'delivered').length.toString() }
      ]
    },
    {
      title: "Order Management",
      description: "Track and manage all customer orders",
      icon: ShoppingCart,
      color: "bg-manufacturing",
      link: "/orders",
      stats: [
        { label: "Total Orders", value: data.orders.length.toString() },
        { label: "Pending", value: data.orders.filter((o: any) => o.status === 'pending').length.toString() }
      ]
    },
    {
      title: "Production Management",
      description: "Monitor production stages and efficiency",
      icon: Factory,
      color: "bg-warning",
      link: "/production",
      stats: [
        { label: "In Production", value: data.productionLogs.length.toString() },
        { label: "Avg Efficiency", value: `${Math.round(data.productionLogs.reduce((sum: number, log: any) => sum + log.efficiency, 0) / data.productionLogs.length)}%` }
      ]
    },
    {
      title: "Quality Control",
      description: "Quality checks and compliance tracking",
      icon: Shield,
      color: "bg-quality",
      link: "/quality",
      stats: [
        { label: "QC Checks", value: data.qualityChecks.length.toString() },
        { label: "Pass Rate", value: `${Math.round((data.qualityChecks.filter((qc: any) => qc.passed).length / data.qualityChecks.length) * 100)}%` }
      ]
    },
    {
      title: "Inventory Management",
      description: "Stock levels, suppliers, and procurement",
      icon: Package,
      color: "bg-inventory",
      link: "/inventory",
      stats: [
        { label: "Items", value: data.inventoryItems.length.toString() },
        { label: "Low Stock", value: data.inventoryItems.filter((item: any) => item.stockStatus === 'low').length.toString() }
      ]
    },
    {
      title: "Dispatch & Logistics",
      description: "Shipping, tracking, and delivery management",
      icon: Truck,
      color: "bg-primary",
      link: "/dispatch",
      stats: [
        { label: "Ready to Ship", value: data.orders.filter((o: any) => o.status === 'ready').length.toString() },
        { label: "In Transit", value: data.orders.filter((o: any) => o.status === 'dispatched').length.toString() }
      ]
    },
    {
      title: "People Management",
      description: "Employee directory and organizational structure",
      icon: Building,
      color: "bg-accent",
      link: "/people",
      stats: [
        { label: "Employees", value: "50" },
        { label: "Departments", value: "8" }
      ]
    },
    {
      title: "Analytics & Reports",
      description: "Business insights and performance metrics",
      icon: BarChart3,
      color: "bg-success",
      link: "/analytics",
      stats: [
        { label: "Revenue", value: `₹${(data.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / 100000).toFixed(1)}L` },
        { label: "Growth", value: "+12.5%" }
      ]
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
                        const stageOrders = data.productionLogs.filter((log: any) => log.stage === stage);
                        const percentage = Math.round((stageOrders.length / data.productionLogs.length) * 100);
                        
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
                      {[
                        {
                          user: "System Administrator",
                          action: "Created new order",
                          time: "5 min ago",
                          department: "Sales",
                          type: "order"
                        },
                        {
                          user: "Production Manager",
                          action: "Updated production stage",
                          time: "12 min ago",
                          department: "Production",
                          type: "production"
                        },
                        {
                          user: "Quality Inspector",
                          action: "Completed QC check",
                          time: "25 min ago",
                          department: "Quality",
                          type: "quality"
                        },
                        {
                          user: "Dispatch Manager",
                          action: "Scheduled delivery",
                          time: "1 hr ago",
                          department: "Dispatch",
                          type: "dispatch"
                        },
                        {
                          user: "Sales Manager",
                          action: "Added new customer",
                          time: "2 hr ago",
                          department: "Sales",
                          type: "customer"
                        }
                      ].slice(0, dashboardSettings.compactMode ? 3 : 5).map((activity, index) => (
                        <div key={index} className="flex items-start space-x-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
                          <div className={cn(
                            "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                            activity.type === 'order' ? 'bg-blue-500' :
                            activity.type === 'production' ? 'bg-orange-500' :
                            activity.type === 'quality' ? 'bg-green-500' :
                            activity.type === 'dispatch' ? 'bg-purple-500' :
                            'bg-gray-500'
                          )} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{activity.user}</p>
                            <p className="text-xs text-muted-foreground">{activity.action}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-muted-foreground">{activity.department}</span>
                              <span className="text-xs text-muted-foreground">{activity.time}</span>
                            </div>
                          </div>
                        </div>
                      ))}
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
                      {data.summary.totalRecords.toLocaleString()} Total Records
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
                    <p className={cn("font-bold text-accent", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalUsers}</p>
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
                    <p className={cn("font-bold text-warning", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalProductionLogs}</p>
                    <p className="text-sm text-muted-foreground font-medium">Production Jobs</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-quality", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalQualityChecks}</p>
                    <p className="text-sm text-muted-foreground font-medium">QC Checks</p>
                  </div>
                  <div className={cn("bg-gradient-subtle rounded-xl shadow-md hover:shadow-lg transition-shadow", dashboardSettings.compactMode ? "p-4" : "p-6")}>
                    <p className={cn("font-bold text-success", dashboardSettings.compactMode ? "text-2xl" : "text-3xl")}>{data.summary.totalInventoryItems}</p>
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