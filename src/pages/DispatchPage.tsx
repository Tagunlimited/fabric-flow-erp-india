import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Clock, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DispatchPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    const fetchDispatchOrders = async () => {
      try {
        setLoading(true);
        const { data, error } = await (supabase as any)
          .from('dispatch_orders')
          .select(`
            id,
            order_id,
            dispatch_number,
            dispatch_date,
            status,
            courier_name,
            tracking_number,
            delivery_address,
            estimated_delivery,
            actual_delivery,
            orders:orders ( order_number, customers:customers ( company_name ) )
          `)
          .order('dispatch_date', { ascending: false });
        if (error) throw error;
        setOrders(data || []);
      } catch (e) {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDispatchOrders();
  }, []);

  const pendingOrders = useMemo(() => (orders || []).filter((o: any) => ['pending','packed'].includes(o.status)), [orders]);
  const completedOrders = useMemo(() => (orders || []).filter((o: any) => ['shipped','delivered'].includes(o.status)), [orders]);

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

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="pending">Pending <Badge className="ml-2 bg-yellow-100 text-yellow-800">{pendingOrders.length}</Badge></TabsTrigger>
                <TabsTrigger value="completed">Dispatch Completed <Badge className="ml-2 bg-green-100 text-green-800">{completedOrders.length}</Badge></TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : pendingOrders.length === 0 ? (
                  <p className="text-muted-foreground">No pending dispatch orders.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingOrders.map((d: any) => (
                      <Card key={d.id} className="border hover:shadow-md transition">
                        <CardContent className="pt-5">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold">Order #{d.orders?.order_number || '-'}</div>
                              <div className="text-xs text-muted-foreground">{d.orders?.customers?.company_name || '-'}</div>
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-800 capitalize">{String(d.status).replace('_',' ')}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            <div>Dispatch No: {d.dispatch_number}</div>
                            <div>Dispatch Date: {new Date(d.dispatch_date).toLocaleString()}</div>
                            {d.courier_name && <div>Courier: {d.courier_name}</div>}
                            {d.tracking_number && <div>Tracking: {d.tracking_number}</div>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed">
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : completedOrders.length === 0 ? (
                  <p className="text-muted-foreground">No completed dispatch orders.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedOrders.map((d: any) => (
                      <Card key={d.id} className="border hover:shadow-md transition">
                        <CardContent className="pt-5">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold">Order #{d.orders?.order_number || '-'}</div>
                              <div className="text-xs text-muted-foreground">{d.orders?.customers?.company_name || '-'}</div>
                            </div>
                            <Badge className="bg-green-100 text-green-800 capitalize">{String(d.status).replace('_',' ')}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            <div>Dispatch No: {d.dispatch_number}</div>
                            <div>Dispatch Date: {new Date(d.dispatch_date).toLocaleString()}</div>
                            {d.courier_name && <div>Courier: {d.courier_name}</div>}
                            {d.tracking_number && <div>Tracking: {d.tracking_number}</div>}
                            {d.actual_delivery && <div>Delivered: {new Date(d.actual_delivery).toLocaleString()}</div>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default DispatchPage;