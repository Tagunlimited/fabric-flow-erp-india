import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { shouldRetryReadWithoutIsDeletedFilter } from "@/lib/supabaseSoftDeleteCompat";

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
      let { data: receipts, error: receiptsError } = await supabase
        .from("receipts")
        .select("reference_id, reference_number, reference_type")
        .eq("is_deleted", false)
        .or('reference_type.eq.order,reference_type.eq.ORDER');

      if (receiptsError && shouldRetryReadWithoutIsDeletedFilter(receiptsError)) {
        const r2 = await supabase
          .from("receipts")
          .select("reference_id, reference_number, reference_type")
          .or('reference_type.eq.order,reference_type.eq.ORDER');
        receipts = r2.data;
        receiptsError = r2.error;
      }

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
      const buildOrdersQuery = (withDeletedFilter: boolean) => {
        let q: any = supabase
          .from("orders")
          .select(`*, customer:customers(company_name), order_type`) as any;
        if (withDeletedFilter) q = q.eq("is_deleted", false);
        if (orderIds.length && orderNumbers.length) {
          const idsList = orderIds.join(",");
          const numsList = orderNumbers.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(",");
          q = q.or(`id.in.(${idsList}),order_number.in.(${numsList})`);
        } else if (orderIds.length) {
          q = q.in("id", orderIds);
        } else if (orderNumbers.length) {
          q = q.in("order_number", orderNumbers);
        }
        return q;
      };

      let ordersData: any[] | null = null;
      try {
        const resp: any = await buildOrdersQuery(true);
        if (resp.error && shouldRetryReadWithoutIsDeletedFilter(resp.error)) {
          const resp0: any = await buildOrdersQuery(false);
          if (resp0.error) throw resp0.error;
          ordersData = (resp0.data || []).filter((o: any) => !o?.is_deleted);
        } else {
          if (resp.error) throw resp.error;
          ordersData = resp.data || [];
        }
      } catch (primaryErr) {
        // Fallback 1: drop join if FK/permissions cause errors
        try {
          const buildBare = (withDeletedFilter: boolean) => {
            let q: any = supabase.from("orders").select("*");
            if (withDeletedFilter) q = q.eq("is_deleted", false);
            if (orderIds.length && orderNumbers.length) {
              const idsList = orderIds.join(",");
              const numsList = orderNumbers.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(",");
              q = q.or(`id.in.(${idsList}),order_number.in.(${numsList})`);
            } else if (orderIds.length) {
              q = q.in("id", orderIds);
            } else if (orderNumbers.length) {
              q = q.in("order_number", orderNumbers);
            }
            return q;
          };
          const resp2: any = await buildBare(true);
          if (resp2.error && shouldRetryReadWithoutIsDeletedFilter(resp2.error)) {
            const resp2b: any = await buildBare(false);
            if (resp2b.error) throw resp2b.error;
            ordersData = (resp2b.data || []).filter((o: any) => !o?.is_deleted);
          } else {
            if (resp2.error) throw resp2.error;
            ordersData = resp2.data || [];
          }
        } catch (fallbackErr) {
          // Fallback 2: fetch all and filter locally (last resort, but robust)
          let resp3: any = await supabase.from("orders").select("*").eq("is_deleted", false);
          if (resp3.error && shouldRetryReadWithoutIsDeletedFilter(resp3.error)) {
            resp3 = await supabase.from("orders").select("*");
          }
          const all = (resp3.data || []) as any[];
          const byId = orderIds.length ? all.filter(o => orderIds.includes(String(o.id)) && !o?.is_deleted) : [];
          const byNum = orderNumbers.length ? all.filter(o => orderNumbers.includes(String(o.order_number)) && !o?.is_deleted) : [];
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


