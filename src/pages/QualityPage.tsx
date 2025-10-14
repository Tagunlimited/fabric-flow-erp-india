import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle, Target } from "lucide-react";

const QualityPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Quality Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Ensure product quality with comprehensive quality assurance processes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Checks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">150</span>
                <CheckCircle className="w-5 h-5 text-quality" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pass Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">95%</span>
                <Target className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">8</span>
                <XCircle className="w-5 h-5 text-error" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rework Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">3</span>
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle>Quality Assurance System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Rigorous quality control with 150+ checks maintaining 95% pass rate.
              Comprehensive defect tracking and correction workflow management.
            </p>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default QualityPage;