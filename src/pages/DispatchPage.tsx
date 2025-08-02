import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Package, Clock, MapPin } from "lucide-react";

const DispatchPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Dispatch Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage shipments and track delivery status efficiently
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ready to Ship
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">100</span>
                <Package className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Transit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">45</span>
                <Truck className="w-5 h-5 text-manufacturing" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">320</span>
                <MapPin className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Delivery
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">3.2 days</span>
                <Clock className="w-5 h-5 text-accent" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle>Dispatch & Logistics System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Streamlined dispatch management with 100+ orders ready for shipment.
              Track deliveries across India with real-time status updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default DispatchPage;