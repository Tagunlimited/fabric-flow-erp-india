import { useCallback, useEffect, useState } from "react";
import { fetchAllActiveOrderReceiptLinks } from "@/lib/fetchActiveOrderReceiptLinks";
import { fetchOrdersForReceiptLinks } from "@/lib/fetchOrdersForReceiptLinks";
import { measureAsync } from "@/lib/perf";

export type { OrderReceiptLink as ReceiptLink } from "@/lib/fetchActiveOrderReceiptLinks";

export interface OrdersWithReceiptsOptions {
  /** Include readymade orders (needed for Design & Printing queues). */
  includeReadymade?: boolean;
}

export interface OrdersWithReceiptsResult<T = any> {
  orders: T[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrdersWithReceipts<T = any>(
  options?: OrdersWithReceiptsOptions
): OrdersWithReceiptsResult<T> {
  const includeReadymade = options?.includeReadymade ?? false;
  const [orders, setOrders] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const validReceipts = await measureAsync(
        "useOrdersWithReceipts.receipts",
        fetchAllActiveOrderReceiptLinks
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
        fetchOrdersForReceiptLinks(orderIds, orderNumbers, { includeReadymade })
      );

      setOrders(ordersData as unknown as T[]);
    } catch (err) {
      console.error("useOrdersWithReceipts: failed to fetch", err);
      setOrders([]);
      setError(err instanceof Error ? err.message : "Failed to load orders with receipts");
    } finally {
      setLoading(false);
    }
  }, [includeReadymade]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders };
}
