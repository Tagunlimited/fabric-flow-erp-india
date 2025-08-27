import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Factory, Clock, Users, TrendingUp, Scissors, BarChart3, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const ProductionPage = () => {
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
                Production Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">300</span>
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
                <span className="text-2xl font-bold">87%</span>
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Workers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">25</span>
                <Users className="w-5 h-5 text-accent" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">8.5</span>
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
                    <span className="text-sm font-medium">12 Pending</span>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/production/orders-status">
            <Card className="shadow-erp-md hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Orders Status</CardTitle>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Track production progress and monitor order completion
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">45 In Progress</span>
                  </div>
                  <Badge variant="secondary">Monitoring</Badge>
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
                    <span className="text-sm font-medium">8 Active Jobs</span>
                  </div>
                  <Badge variant="secondary">Efficient</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle>Production Workflow System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Comprehensive production tracking with 300+ logs across cutting, stitching, embroidery, and packaging stages.
              Monitor worker efficiency and optimize production timelines.
            </p>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default ProductionPage;