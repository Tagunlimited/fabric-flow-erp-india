import { supabase } from "@/integrations/supabase/client";

export type OrderBatchPickEventSource = "picker_dialog" | "qc_review";

export async function insertOrderBatchPickEventRows(
  rows: Array<{
    order_batch_assignment_id: string;
    size_name: string;
    quantity_delta: number;
    source: OrderBatchPickEventSource;
  }>
): Promise<void> {
  const filtered = rows.filter((r) => r.quantity_delta !== 0);
  if (filtered.length === 0) return;

  const { data: userData } = await supabase.auth.getUser();
  const picked_by = userData.user?.id ?? null;
  const picked_at = new Date().toISOString();

  const { error } = await (supabase as any).from("order_batch_pick_events").insert(
    filtered.map((r) => ({
      order_batch_assignment_id: r.order_batch_assignment_id,
      size_name: r.size_name,
      quantity_delta: r.quantity_delta,
      source: r.source,
      picked_by,
      picked_at,
    }))
  );

  if (error) {
    console.error("order_batch_pick_events insert failed", error);
  }
}
