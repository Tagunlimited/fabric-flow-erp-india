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
  ToggleRight,
  RefreshCw
} from "lucide-react";
import { getDashboardData, getDepartmentCount, getRecentActivities, type DashboardData } from "@/lib/database";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { CalendarView } from "@/components/CalendarView";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardSettings, type DashboardSettings as DashboardSettingsType } from "@/components/DashboardSettings";
import { DashboardTableView } from "@/components/DashboardTableView";
import { DashboardChartsView } from "@/components/DashboardChartsView";
import { useCachedData } from "@/hooks/useCachedData";
import { usePageCaching } from "@/components/CachedPageWrapper";
import { CachedPageWrapper } from "@/components/CachedPageWrapper";

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

function EnhancedDashboardContent() {
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
  const { saveState, getState } = usePageCaching('dashboard');

  // Use cached data hooks for all data fetching
  const { 
    data: dashboardData, 
    loading: dashboardLoading, 
    error: dashboardError,
    refetch: refetchDashboard 
  } = useCachedData({
    queryKey: ['dashboard-data'],
    queryFn: getDashboardData,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheConfig: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    }
  });

  const { 
    data: departmentCount, 
    loading: deptLoading,
    refetch: refetchDept 
  } = useCachedData({
    queryKey: ['department-count'],
    queryFn: getDepartmentCount,
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheConfig: {
      ttl: 30 * 60 * 1000, // 30 minutes
      persistToStorage: true
    }
  });

  const { 
    data: recentActivities, 
    loading: activitiesLoading,
    refetch: refetchActivities 
  } = useCachedData({
    queryKey: ['recent-activities'],
    queryFn: () => getRecentActivities(10),
    staleTime: 1 * 60 * 1000, // 1 minute
    cacheConfig: {
      ttl: 5 * 60 * 1000, // 5 minutes
      persistToStorage: true
    }
  });

  // Save dashboard settings to cache
  useEffect(() => {
    const savedSettings = getState()?.settings;
    if (savedSettings) {
      setDashboardSettings(savedSettings);
    }
  }, [getState]);

  useEffect(() => {
    saveState({
      settings: dashboardSettings,
      viewMode,
      timestamp: Date.now()
    });
  }, [dashboardSettings, viewMode, saveState]);

  // Auto-refresh based on settings
  // DISABLED: Auto-refresh on visibility change to prevent form resets
  // Forms should remain open when switching tabs
  useEffect(() => {
    if (!dashboardSettings.refreshInterval) return;

    // DISABLED: Don't auto-refresh when tab becomes visible
    // This was causing forms to reset when switching tabs
    // const interval = setInterval(() => {
    //   if (document.visibilityState === 'visible') {
    //     refetchDashboard();
    //     refetchDept();
    //     refetchActivities();
    //   }
    // }, dashboardSettings.refreshInterval * 1000);

    // return () => clearInterval(interval);
    
    // Only refresh based on time interval, NOT on visibility changes
    const interval = setInterval(() => {
      // Only refresh if user is actively on the page (not just visible)
      // This prevents refresh when switching tabs
      if (document.hasFocus() && document.visibilityState === 'visible') {
        refetchDashboard();
        refetchDept();
        refetchActivities();
      }
    }, dashboardSettings.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [dashboardSettings.refreshInterval, refetchDashboard, refetchDept, refetchActivities]);

  // Helper function to format time ago
  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getActivityTypeColor = (type: string) => {
    switch (type) {
      case 'order_created': return 'bg-blue-500';
      case 'order_completed': return 'bg-green-500';
      case 'customer_added': return 'bg-purple-500';
      case 'production_started': return 'bg-orange-500';
      case 'quality_check': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const loading = dashboardLoading || deptLoading || activitiesLoading;

  if (loading && !dashboardData) {
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

  if (dashboardError) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load dashboard</h3>
          <p className="text-muted-foreground mb-4">
            {dashboardError.message || 'An error occurred while loading dashboard data'}
          </p>
          <Button onClick={() => {
            refetchDashboard();
            refetchDept();
            refetchActivities();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!dashboardData) return null;

  const keyMetrics: DashboardMetric[] = [
    {
      title: "Total Revenue",
      value: `₹${dashboardData.totalRevenue?.toLocaleString() || '0'}`,
      change: `+${dashboardData.revenueGrowth || 0}%`,
      trend: (dashboardData.revenueGrowth || 0) >= 0 ? 'up' : 'down',
      icon: DollarSign,
      color: "text-green-600"
    },
    {
      title: "Total Orders",
      value: dashboardData.totalOrders?.toString() || '0',
      change: `+${dashboardData.orderGrowth || 0}%`,
      trend: (dashboardData.orderGrowth || 0) >= 0 ? 'up' : 'down',
      icon: ShoppingCart,
      color: "text-blue-600"
    },
    {
      title: "Active Customers",
      value: dashboardData.totalCustomers?.toString() || '0',
      change: `+${dashboardData.customerGrowth || 0}%`,
      trend: (dashboardData.customerGrowth || 0) >= 0 ? 'up' : 'down',
      icon: Users,
      color: "text-purple-600"
    },
    {
      title: "Production Efficiency",
      value: `${dashboardData.productionEfficiency || 0}%`,
      change: `+${dashboardData.efficiencyGrowth || 0}%`,
      trend: (dashboardData.efficiencyGrowth || 0) >= 0 ? 'up' : 'down',
      icon: Factory,
      color: "text-orange-600"
    }
  ];

  const quickStats: QuickStat[] = [
    {
      label: "Pending Orders",
      value: dashboardData.pendingOrders || 0,
      total: dashboardData.totalOrders || 0,
      color: "bg-blue-500",
      icon: Clock,
      link: "/orders"
    },
    {
      label: "In Production",
      value: dashboardData.inProduction || 0,
      total: dashboardData.totalOrders || 0,
      color: "bg-orange-500",
      icon: Factory,
      link: "/production"
    },
    {
      label: "Quality Checks",
      value: dashboardData.qualityChecks || 0,
      total: dashboardData.totalOrders || 0,
      color: "bg-yellow-500",
      icon: CheckCircle,
      link: "/quality"
    },
    {
      label: "Ready for Dispatch",
      value: dashboardData.readyForDispatch || 0,
      total: dashboardData.totalOrders || 0,
      color: "bg-green-500",
      icon: Truck,
      link: "/dispatch"
    }
  ];

  const moduleCards: ModuleCard[] = [
    {
      title: "CRM",
      description: "Manage customers and relationships",
      icon: Users,
      color: "bg-blue-500",
      link: "/crm",
      stats: [
        { label: "Total Customers", value: dashboardData.totalCustomers?.toString() || '0' },
        { label: "New This Month", value: dashboardData.newCustomers?.toString() || '0' }
      ]
    },
    {
      title: "Orders",
      description: "Track and manage orders",
      icon: ShoppingCart,
      color: "bg-green-500",
      link: "/orders",
      stats: [
        { label: "Total Orders", value: dashboardData.totalOrders?.toString() || '0' },
        { label: "Pending", value: dashboardData.pendingOrders?.toString() || '0' }
      ]
    },
    {
      title: "Production",
      description: "Monitor production status",
      icon: Factory,
      color: "bg-orange-500",
      link: "/production",
      stats: [
        { label: "In Production", value: dashboardData.inProduction?.toString() || '0' },
        { label: "Efficiency", value: `${dashboardData.productionEfficiency || 0}%` }
      ]
    },
    {
      title: "Inventory",
      description: "Manage stock and materials",
      icon: Package,
      color: "bg-purple-500",
      link: "/inventory",
      stats: [
        { label: "Total Items", value: dashboardData.totalItems?.toString() || '0' },
        { label: "Low Stock", value: dashboardData.lowStockItems?.toString() || '0' }
      ]
    }
  ];

  if (viewMode === 'calendar') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === 'dashboard' ? 'default' : 'outline'}
              onClick={() => setViewMode('dashboard')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'outline'}
              onClick={() => setViewMode('calendar')}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Calendar
            </Button>
            <DashboardSettings
              settings={dashboardSettings}
              onSettingsChange={setDashboardSettings}
            />
          </div>
        </div>
        <CalendarView />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.user_metadata?.full_name || 'User'}! Here's what's happening.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => {
              refetchDashboard();
              refetchDept();
              refetchActivities();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant={viewMode === 'dashboard' ? 'default' : 'outline'}
            onClick={() => setViewMode('dashboard')}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            onClick={() => setViewMode('calendar')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </Button>
          <DashboardSettings
            settings={dashboardSettings}
            onSettingsChange={setDashboardSettings}
          />
        </div>
      </div>

      {/* Key Metrics */}
      {dashboardSettings.visibleWidgets.keyMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {keyMetrics.map((metric, index) => (
            <Card key={index} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.title}
                </CardTitle>
                <metric.icon className={`h-4 w-4 ${metric.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                  {metric.trend === 'up' ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : metric.trend === 'down' ? (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-gray-400" />
                  )}
                  <span className={cn(
                    metric.trend === 'up' ? 'text-green-500' : 
                    metric.trend === 'down' ? 'text-red-500' : 
                    'text-gray-500'
                  )}>
                    {metric.change}
                  </span>
                  <span>from last month</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {dashboardSettings.visibleWidgets.quickStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickStats.map((stat, index) => (
            <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
              <Link to={stat.link}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <Progress 
                        value={(stat.value / stat.total) * 100} 
                        className="mt-2 h-2"
                      />
                    </div>
                    <div className={`p-3 rounded-full ${stat.color}`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {/* Module Cards */}
      {dashboardSettings.visibleWidgets.moduleCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {moduleCards.map((module, index) => (
            <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
              <Link to={module.link}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-full ${module.color}`}>
                      <module.icon className="h-6 w-6 text-white" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{module.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
                  <div className="space-y-2">
                    {module.stats.map((stat, statIndex) => (
                      <div key={statIndex} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{stat.label}</span>
                        <span className="font-medium">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      {dashboardSettings.visibleWidgets.recentActivity && recentActivities && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.slice(0, 5).map((activity, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className={`w-2 h-2 rounded-full ${getActivityTypeColor(activity.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">{formatTimeAgo(activity.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts View */}
      {dashboardSettings.viewMode === 'charts' && (
        <DashboardChartsView data={dashboardData} />
      )}

      {/* Table View */}
      {dashboardSettings.viewMode === 'table' && (
        <DashboardTableView data={dashboardData} />
      )}
    </div>
  );
}

export function EnhancedDashboard() {
  return (
    <CachedPageWrapper 
      pageKey="dashboard"
      enableAutoSave={true}
      autoSaveInterval={30000}
      cacheConfig={{
        ttl: 10 * 60 * 1000, // 10 minutes
        persistToStorage: true
      }}
    >
      <EnhancedDashboardContent />
    </CachedPageWrapper>
  );
}
