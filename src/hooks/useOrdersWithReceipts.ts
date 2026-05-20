import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrdersForReceiptLinks } from "@/lib/fetchOrdersForReceiptLinks";
import { measureAsync } from "@/lib/perf";
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
  error: string | null;
  refetch: () => Promise<void>;
}

/** Cap linked orders returned to keep design/production queues responsive. */
const MAX_ORDERS_WITH_RECEIPTS = 400;

function isActiveOrderReceipt(row: ReceiptLink): boolean {
  const referenceType = String(row.reference_type || "").trim().toLowerCase();
  const status = String(row.status || "").trim().toLowerCase();
  const hasLink = !!(row.reference_id || String(row.reference_number || "").trim());
  return referenceType === "order" && status === "active" && hasLink;
}

export function useOrdersWithReceipts<T = any>(): OrdersWithReceiptsResult<T> {
  const [orders, setOrders] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let { data: receipts, error: receiptsError } = await measureAsync(
        "useOrdersWithReceipts.receipts",
        async () =>
          supabase
            .from("receipts")
            .select("reference_id, reference_number, reference_type, status")
            .eq("is_deleted", false)
            .or("reference_type.eq.order,reference_type.eq.ORDER")
      );

      if (receiptsError && shouldRetryReadWithoutIsDeletedFilter(receiptsError)) {
        const r2 = await supabase
          .from("receipts")
          .select("reference_id, reference_number, reference_type, status")
          .or("reference_type.eq.order,reference_type.eq.ORDER");
        receipts = r2.data;
        receiptsError = r2.error;
      }

      if (receiptsError) throw receiptsError;

      const validReceipts: ReceiptLink[] = ((receipts || []) as ReceiptLink[]).filter(
        isActiveOrderReceipt
      );

      if (validReceipts.length === 0) {
        setOrders([]);
        return;
      }

      const orderIds = Array.from(
        new Set(
          validReceipts
            .map((r) => (r.reference_id ? String(r.reference_id) : null))
            .filter(Boolean) as string[]
        )
      );
      const orderNumbers = Array.from(
        new Set(
          validReceipts
            .map((r) => (r.reference_number ? String(r.reference_number).trim() : null))
            .filter(Boolean) as string[]
        )
      );

      const ordersData = await measureAsync("useOrdersWithReceipts.orders", async () =>
        fetchOrdersForReceiptLinks(orderIds, orderNumbers)
      );

      const capped =
        ordersData.length > MAX_ORDERS_WITH_RECEIPTS
          ? ordersData.slice(0, MAX_ORDERS_WITH_RECEIPTS)
          : ordersData;

      setOrders(capped as unknown as T[]);
    } catch (err) {
      console.error("useOrdersWithReceipts: failed to fetch", err);
      setOrders([]);
      setError(err instanceof Error ? err.message : "Failed to load orders with receipts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
}
