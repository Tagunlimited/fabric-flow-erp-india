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
import { cn, formatCurrency } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";

interface DashboardTableViewProps {
  data: any;
}

export function DashboardTableView({ data }: DashboardTableViewProps) {
  const navigate = useNavigate();

  const keyMetricsData = [
    {
      metric: "Total Revenue",
      value: `₹${(data.summary.totalRevenue / 100000).toFixed(1)}L`,
      change: "N/A",
      trend: "stable",
      icon: DollarSign,
      color: "text-success"
    },
    {
      metric: "Active Orders",
      value: (data.summary.pendingOrders + data.summary.inProductionOrders).toString(),
      change: "N/A",
      trend: "stable",
      icon: ShoppingCart,
      color: "text-manufacturing"
    },
    {
      metric: "Production Efficiency",
      value: `${Math.round((data.productionOrders || []).reduce((sum: number, order: any) => sum + (order.efficiency_percentage || 0), 0) / Math.max((data.productionOrders || []).length, 1))}%`,
      change: "N/A",
      trend: "stable",
      icon: Factory,
      color: "text-warning"
    },
    {
      metric: "Quality Pass",
      value: (() => {
        const qualityChecks = data.qualityChecks || [];
        const totalApproved = qualityChecks.reduce((sum: number, qc: any) => {
          if (qc.approved_quantity != null && qc.approved_quantity > 0) {
            return sum + Number(qc.approved_quantity);
          }
          if (qc.total_quantity && qc.pass_percentage != null && qc.pass_percentage > 0) {
            return sum + Math.round((Number(qc.total_quantity) * Number(qc.pass_percentage)) / 100);
          }
          if ((qc.status === 'passed' || qc.status === 'approved') && qc.total_quantity) {
            return sum + Number(qc.total_quantity);
          }
          return sum;
        }, 0);
        return totalApproved > 0 ? totalApproved.toLocaleString() : '0';
      })(),
      change: "N/A",
      trend: "stable",
      icon: CheckCircle,
      color: "text-quality"
    }
  ];

  const quickStatsData = [
    {
      category: "Customers",
      count: data.summary.totalCustomers,
      status: "Active",
      link: "/crm/customers"
    },
    {
      category: "Employees",
      count: data.summary.totalEmployees,
      status: "Active",
      link: "/people/employees"
    },
    {
      category: "Products",
      count: data.summary.totalProducts,
      status: "Available",
      link: "/inventory"
    },
    {
      category: "Low Stock Alerts",
      count: data.summary.lowStockItems,
      status: "Critical",
      link: "/inventory"
    }
  ];

  const recentOrdersData = (data.orders || [])
    .sort((a: any, b: any) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
    .slice(0, 10);

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
                    {metric.change && metric.change !== 'N/A' ? (
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
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
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
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>
                    {order.customer?.company_name || 'Unknown'}
                  </TableCell>

                  <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-semibold">₹{order.total_amount?.toLocaleString() || '0'}</TableCell>

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