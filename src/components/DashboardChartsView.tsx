import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { 
  DollarSign,
  ShoppingCart,
  Factory,
  CheckCircle,
  TrendingUp,
  Users,
  Package,
  AlertTriangle
} from "lucide-react";
import { Link } from "react-router-dom";

interface DashboardChartsViewProps {
  data: any;
  chartTypes: {
    metrics: 'bar' | 'line' | 'pie';
    stats: 'bar' | 'doughnut' | 'area';
  };
}

export function DashboardChartsView({ data, chartTypes }: DashboardChartsViewProps) {
  const keyMetricsData = [
    {
      name: "Revenue",
      value: Math.round(data.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / 100000),
      fullValue: `₹${(data.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / 100000).toFixed(1)}L`,
      change: "+12.5%",
      color: "#10B981"
    },
    {
      name: "Active Orders",
      value: data.orders.filter((order: any) => 
        ['pending', 'confirmed', 'in_production', 'quality_check'].includes(order.status)
      ).length,
      fullValue: data.orders.filter((order: any) => 
        ['pending', 'confirmed', 'in_production', 'quality_check'].includes(order.status)
      ).length.toString(),
      change: "+8.2%",
      color: "#3B82F6"
    },
    {
      name: "Production Efficiency",
      value: Math.round(data.productionLogs.reduce((sum: number, log: any) => sum + log.efficiency, 0) / data.productionLogs.length),
      fullValue: `${Math.round(data.productionLogs.reduce((sum: number, log: any) => sum + log.efficiency, 0) / data.productionLogs.length)}%`,
      change: "-2.1%",
      color: "#F59E0B"
    },
    {
      name: "Quality Pass Rate",
      value: Math.round((data.qualityChecks.filter((qc: any) => qc.passed).length / data.qualityChecks.length) * 100),
      fullValue: `${Math.round((data.qualityChecks.filter((qc: any) => qc.passed).length / data.qualityChecks.length) * 100)}%`,
      change: "+5.3%",
      color: "#8B5CF6"
    }
  ];

  const quickStatsData = [
    {
      name: "Customers",
      value: data.customers.length,
      color: "#10B981",
      icon: Users
    },
    {
      name: "Employees", 
      value: 50,
      color: "#3B82F6",
      icon: Users
    },
    {
      name: "Products",
      value: data.products.length,
      color: "#F59E0B",
      icon: Package
    },
    {
      name: "Low Stock",
      value: data.inventoryItems.filter((item: any) => item.stockStatus === 'low' || item.stockStatus === 'critical').length,
      color: "#EF4444",
      icon: AlertTriangle
    }
  ];

  const orderStatusData = [
    {
      name: "Pending",
      value: data.orders.filter((o: any) => o.status === 'pending').length,
      color: "#F59E0B"
    },
    {
      name: "Confirmed",
      value: data.orders.filter((o: any) => o.status === 'confirmed').length,
      color: "#3B82F6"
    },
    {
      name: "In Production",
      value: data.orders.filter((o: any) => o.status === 'in_production').length,
      color: "#8B5CF6"
    },
    {
      name: "Quality Check",
      value: data.orders.filter((o: any) => o.status === 'quality_check').length,
      color: "#EC4899"
    },
    {
      name: "Ready",
      value: data.orders.filter((o: any) => o.status === 'ready').length,
      color: "#10B981"
    },
    {
      name: "Delivered",
      value: data.orders.filter((o: any) => o.status === 'delivered').length,
      color: "#06B6D4"
    }
  ];

  // Monthly revenue trend
  const monthlyRevenue = data.orders.reduce((acc: any, order: any) => {
    const month = new Date(order.orderDate).toLocaleDateString('en-US', { month: 'short' });
    acc[month] = (acc[month] || 0) + order.totalAmount;
    return acc;
  }, {});

  const revenueChartData = Object.entries(monthlyRevenue).map(([month, revenue]) => ({
    month,
    revenue: Math.round((revenue as number) / 100000),
    fullRevenue: `₹${((revenue as number) / 100000).toFixed(1)}L`
  }));

  const renderMetricsChart = () => {
    switch (chartTypes.metrics) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={keyMetricsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => [value, 'Value']} />
              <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={keyMetricsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => [value, 'Value']} />
              <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={keyMetricsData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {keyMetricsData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  const renderStatsChart = () => {
    switch (chartTypes.stats) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={quickStatsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'doughnut':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={quickStatsData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {quickStatsData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={quickStatsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            Key Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderMetricsChart()}
          <div className="grid grid-cols-4 gap-4 mt-4">
            {keyMetricsData.map((metric) => (
              <div key={metric.name} className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold" style={{ color: metric.color }}>
                  {metric.fullValue}
                </p>
                <p className="text-sm text-muted-foreground">{metric.name}</p>
                <Badge variant={metric.change.startsWith('+') ? 'default' : 'destructive'} className="mt-1">
                  {metric.change}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart className="w-5 h-5 mr-2" />
            Quick Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderStatsChart()}
        </CardContent>
      </Card>

      {/* Order Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Order Status Distribution
            </div>
            <Link to="/orders">
              <Button variant="outline" size="sm">
                View Orders
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={orderStatusData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {orderStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Monthly Revenue Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => [`₹${value}L`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}