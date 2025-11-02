import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function DispatchChallanPrint() {
  const { id } = useParams(); // dispatch_order_id
  const [data, setData] = useState<any | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data: order } = await (supabase as any)
        .from('dispatch_orders')
        .select(`
          id, dispatch_number, dispatch_date, courier_name, tracking_number,
          orders:orders ( order_number, customers:customers ( company_name, address, city, state, pincode ) )
        `)
        .eq('id', id)
        .maybeSingle();
      const { data: lines } = await (supabase as any)
        .from('dispatch_order_items')
        .select('size_name, quantity')
        .eq('dispatch_order_id', id);
      setData({ order, lines: lines || [] });
    };
    load();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (!data) return null;

  return (
    <ErpLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Dispatch Challan</h1>
          <Button onClick={handlePrint}>Print</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Challan #{data.order?.dispatch_number}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="font-medium">Order</div>
                  <div>#{data.order?.orders?.order_number}</div>
                </div>
                <div>
                  <div className="font-medium">Date</div>
                  <div>{new Date(data.order?.dispatch_date).toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-medium">Customer</div>
                  <div>{data.order?.orders?.customers?.company_name}</div>
                  <div className="text-muted-foreground">
                    {data.order?.orders?.customers?.address}, {data.order?.orders?.customers?.city}, {data.order?.orders?.customers?.state} - {data.order?.orders?.customers?.pincode}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Courier</div>
                  <div>{data.order?.courier_name || '-'}</div>
                  <div className="font-medium mt-2">Tracking</div>
                  <div>{data.order?.tracking_number || '-'}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="font-medium mb-2">Items</div>
                <table className="w-full text-sm border">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-2 border text-left">Size</th>
                      <th className="p-2 border text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.lines || []).map((l: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2 border">{l.size_name === 'Total' ? 'Total Quantity' : (l.size_name || '-')}</td>
                        <td className="p-2 border text-right">{l.quantity}</td>
                      </tr>
                    ))}
                    {data.lines?.length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-2 border text-center text-muted-foreground">No items</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
}


