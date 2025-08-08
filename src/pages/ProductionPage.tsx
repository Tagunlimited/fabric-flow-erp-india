import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, Clock, Users, TrendingUp } from "lucide-react";

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