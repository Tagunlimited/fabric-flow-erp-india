import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Clock, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DispatchPage = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [readymadeOrders, setReadymadeOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    const fetchDispatchData = async () => {
      try {
        setLoading(true);
        
        // Fetch dispatch_orders (for custom orders that went through production)
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
            orders:orders ( order_number, order_type, customers:customers ( company_name ) )
          `)
          .order('dispatch_date', { ascending: false });
        if (error) throw error;
        setOrders(data || []);
        
        // Fetch readymade orders that are confirmed or ready_for_dispatch (pending dispatch)
        // or have been dispatched (completed)
        const { data: readymadeData, error: readymadeError } = await (supabase as any)
          .from('orders')
          .select(`
            id,
            order_number,
            order_date,
            expected_delivery_date,
            status,
            customers:customers ( company_name ),
            dispatch_orders (
              id,
              dispatch_number,
              dispatch_date,
              status,
              courier_name,
              tracking_number,
              delivery_address,
              estimated_delivery,
              actual_delivery
            )
          `)
          .eq('order_type', 'readymade')
          .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'completed'] as any)
          .order('order_date', { ascending: false });
        
        if (!readymadeError && readymadeData) {
          setReadymadeOrders(readymadeData || []);
        }
      } catch (e) {
        console.error('Error fetching dispatch data:', e);
        setOrders([]);
        setReadymadeOrders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDispatchData();
  }, []);

  // Pending: dispatch_orders with pending/packed status OR readymade orders with confirmed/ready_for_dispatch that haven't been dispatched
  const pendingOrders = useMemo(() => {
    const dispatchPending = (orders || []).filter((o: any) => ['pending','packed'].includes(o.status));
    
    // Readymade orders that are confirmed/ready_for_dispatch and don't have a dispatch_order yet
    const readymadePending = (readymadeOrders || []).filter((o: any) => {
      const isConfirmed = ['confirmed', 'ready_for_dispatch'].includes(o.status);
      const hasDispatchOrder = o.dispatch_orders && o.dispatch_orders.length > 0;
      return isConfirmed && !hasDispatchOrder;
    });
    
    return [...dispatchPending, ...readymadePending.map((o: any) => ({
      id: o.id,
      order_id: o.id,
      dispatch_number: null,
      dispatch_date: o.order_date,
      status: o.status,
      courier_name: null,
      tracking_number: null,
      delivery_address: null,
      estimated_delivery: o.expected_delivery_date,
      actual_delivery: null,
      orders: {
        order_number: o.order_number,
        customers: o.customers
      },
      is_readymade: true
    }))];
  }, [orders, readymadeOrders]);

  // Completed: dispatch_orders with shipped/delivered status OR readymade orders that have been dispatched
  const completedOrders = useMemo(() => {
    const dispatchCompleted = (orders || []).filter((o: any) => ['shipped','delivered'].includes(o.status));
    
    // Readymade orders that have dispatch_orders
    const readymadeCompleted = (readymadeOrders || []).filter((o: any) => {
      return o.dispatch_orders && o.dispatch_orders.length > 0;
    }).map((o: any) => {
      const latestDispatch = o.dispatch_orders[0]; // Get the most recent dispatch
      return {
        id: latestDispatch.id,
        order_id: o.id,
        dispatch_number: latestDispatch.dispatch_number,
        dispatch_date: latestDispatch.dispatch_date,
        status: latestDispatch.status || 'dispatched',
        courier_name: latestDispatch.courier_name,
        tracking_number: latestDispatch.tracking_number,
        delivery_address: latestDispatch.delivery_address,
        estimated_delivery: latestDispatch.estimated_delivery,
        actual_delivery: latestDispatch.actual_delivery,
        orders: {
          order_number: o.order_number,
          customers: o.customers
        },
        is_readymade: true
      };
    });
    
    return [...dispatchCompleted, ...readymadeCompleted];
  }, [orders, readymadeOrders]);

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
                              {d.is_readymade && <Badge className="mt-1 bg-blue-100 text-blue-800 text-xs">Readymade</Badge>}
                            </div>
                            <Badge className="bg-yellow-100 text-yellow-800 capitalize">{String(d.status).replace('_',' ')}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {d.dispatch_number ? (
                              <>
                                <div>Dispatch No: {d.dispatch_number}</div>
                                <div>Dispatch Date: {new Date(d.dispatch_date).toLocaleString()}</div>
                                {d.courier_name && <div>Courier: {d.courier_name}</div>}
                                {d.tracking_number && <div>Tracking: {d.tracking_number}</div>}
                              </>
                            ) : (
                              <>
                                <div>Order Date: {new Date(d.dispatch_date || d.orders?.order_date).toLocaleString()}</div>
                                {d.estimated_delivery && <div>Expected Delivery: {new Date(d.estimated_delivery).toLocaleDateString()}</div>}
                                <div className="text-muted-foreground mt-1">Ready to dispatch</div>
                              </>
                            )}
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
                              {d.is_readymade && <Badge className="mt-1 bg-blue-100 text-blue-800 text-xs">Readymade</Badge>}
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