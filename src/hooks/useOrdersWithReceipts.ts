import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReceiptLink {
  reference_id: string | null;
  reference_number: string | null;
  reference_type?: string | null;
  status?: string | null;
}

export interface OrdersWithReceiptsResult<T = any> {
  orders: T[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useOrdersWithReceipts<T = any>(): OrdersWithReceiptsResult<T> {
  const [orders, setOrders] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);

      // 1) Fetch receipts that point to orders (case-insensitive), ignore cancelled
      const { data: receipts, error: receiptsError } = await supabase
        .from("receipts")
        .select("reference_id, reference_number, reference_type")
        .or('reference_type.eq.order,reference_type.eq.ORDER');

      if (receiptsError) throw receiptsError;

      const validReceipts: ReceiptLink[] = (receipts || []) as any;

      if (validReceipts.length === 0) {
        setOrders([]);
        return;
      }

      const orderIds = Array.from(
        new Set(
          validReceipts
            .map(r => (r.reference_id ? String(r.reference_id) : null))
            .filter(Boolean) as string[]
        )
      );
      const orderNumbers = Array.from(
        new Set(
          validReceipts
            .map(r => (r.reference_number ? String(r.reference_number).trim() : null))
            .filter(Boolean) as string[]
        )
      );

      // 2) Single robust server-side filter using OR when possible; fall back to single IN
      let ordersQuery: any = supabase
        .from("orders")
        .select(`*, customer:customers(company_name), order_type`) as any;

      if (orderIds.length && orderNumbers.length) {
        const idsList = orderIds.join(",");
        const numsList = orderNumbers.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(",");
        ordersQuery = ordersQuery.or(`id.in.(${idsList}),order_number.in.(${numsList})`);
      } else if (orderIds.length) {
        ordersQuery = ordersQuery.in("id", orderIds);
      } else if (orderNumbers.length) {
        ordersQuery = ordersQuery.in("order_number", orderNumbers);
      }

      let ordersData: any[] | null = null;
      try {
        const resp: any = await ordersQuery; // avoid server-side ordering that might fail if column missing
        if (resp.error) throw resp.error;
        ordersData = resp.data || [];
      } catch (primaryErr) {
        // Fallback 1: drop join if FK/permissions cause errors
        try {
          let q: any = supabase.from("orders").select("*");
          if (orderIds.length && orderNumbers.length) {
            const idsList = orderIds.join(",");
            const numsList = orderNumbers.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(",");
            q = q.or(`id.in.(${idsList}),order_number.in.(${numsList})`);
          } else if (orderIds.length) {
            q = q.in("id", orderIds);
          } else if (orderNumbers.length) {
            q = q.in("order_number", orderNumbers);
          }
          const resp2: any = await q;
          if (resp2.error) throw resp2.error;
          ordersData = resp2.data || [];
        } catch (fallbackErr) {
          // Fallback 2: fetch all and filter locally (last resort, but robust)
          const resp3: any = await supabase.from("orders").select("*");
          const all = (resp3.data || []) as any[];
          const byId = orderIds.length ? all.filter(o => orderIds.includes(String(o.id))) : [];
          const byNum = orderNumbers.length ? all.filter(o => orderNumbers.includes(String(o.order_number))) : [];
          const merged = [...byId, ...byNum];
          ordersData = Array.from(new Map(merged.map(o => [o.id, o])).values());
        }
      }

      const sorted = (ordersData || []).sort(
        (a: any, b: any) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      );
      setOrders((sorted as unknown) as T[]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("useOrdersWithReceipts: failed to fetch", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}


