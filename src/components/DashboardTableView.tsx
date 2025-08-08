import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  ShoppingCart,
  Factory,
  CheckCircle,
  Users,
  Package,
  AlertTriangle,
  UserPlus,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";

interface DashboardTableViewProps {
  data: any;
}

export function DashboardTableView({ data }: DashboardTableViewProps) {
  const navigate = useNavigate();

  const keyMetricsData = [
    {
      metric: "Total Revenue",
      value: `₹${(data.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0) / 100000).toFixed(1)}L`,
      change: "+12.5%",
      trend: "up",
      icon: DollarSign,
      color: "text-success"
    },
    {
      metric: "Active Orders",
      value: data.orders.filter((order: any) => 
        ['pending', 'confirmed', 'in_production', 'quality_check'].includes(order.status)
      ).length.toString(),
      change: "+8.2%",
      trend: "up",
      icon: ShoppingCart,
      color: "text-manufacturing"
    },
    {
      metric: "Production Efficiency",
      value: `${Math.round(data.productionLogs.reduce((sum: number, log: any) => sum + log.efficiency, 0) / data.productionLogs.length)}%`,
      change: "-2.1%",
      trend: "down",
      icon: Factory,
      color: "text-warning"
    },
    {
      metric: "Quality Pass Rate",
      value: `${Math.round((data.qualityChecks.filter((qc: any) => qc.passed).length / data.qualityChecks.length) * 100)}%`,
      change: "+5.3%",
      trend: "up",
      icon: CheckCircle,
      color: "text-quality"
    }
  ];

  const quickStatsData = [
    {
      category: "Customers",
      count: data.customers.length,
      status: "Active",
      link: "/crm/customers"
    },
    {
      category: "Employees",
      count: 50,
      status: "Active",
      link: "/people/employees"
    },
    {
      category: "Products",
      count: data.products.length,
      status: "Available",
      link: "/inventory"
    },
    {
      category: "Low Stock Alerts",
      count: data.inventoryItems.filter((item: any) => item.stockStatus === 'low' || item.stockStatus === 'critical').length,
      status: "Critical",
      link: "/inventory"
    }
  ];

  const recentOrdersData = data.orders
    .sort((a: any, b: any) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
    .slice(0, 10);

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
      {/* Key Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Key Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Current Value</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keyMetricsData.map((metric) => (
                <TableRow key={metric.metric}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <metric.icon className="w-4 h-4 mr-2" />
                      {metric.metric}
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-lg">{metric.value}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      {metric.trend === 'up' ? (
                        <TrendingUp className="w-4 h-4 text-success mr-1" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-error mr-1" />
                      )}
                      <span className={cn(
                        "font-medium",
                        metric.trend === 'up' ? 'text-success' : 'text-error'
                      )}>
                        {metric.change}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={metric.trend === 'up' ? 'default' : 'destructive'}>
                      {metric.trend === 'up' ? 'Positive' : 'Negative'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={cn("font-medium", metric.color)}>
                      {metric.metric.includes('Revenue') ? 'Financial' :
                       metric.metric.includes('Orders') ? 'Sales' :
                       metric.metric.includes('Production') ? 'Operations' : 'Quality'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Statistics Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quickStatsData.map((stat) => (
                <TableRow key={stat.category}>
                  <TableCell className="font-medium">{stat.category}</TableCell>
                  <TableCell className="text-2xl font-bold">{stat.count}</TableCell>
                  <TableCell>
                    <Badge variant={stat.status === 'Critical' ? 'destructive' : 'default'}>
                      {stat.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link to={stat.link}>
                      <Button variant="outline" size="sm">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Recent Orders
            <Link to="/orders">
              <Button variant="outline" size="sm">
                View All Orders
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrdersData.map((order: any) => (
                <TableRow 
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>
                    {data.customers.find((c: any) => c.id === order.customerId)?.companyName || 'Unknown'}
                  </TableCell>
                  <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                  <TableCell className="font-semibold">₹{order.totalAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}