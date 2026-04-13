/**
 * Resolve SN/OF cutting rates for an order line: line columns override order_assignments defaults.
 */

export type OrderAssignmentRateDefaults = {
  cutting_price_single_needle?: number | null;
  cutting_price_overlock_flatlock?: number | null;
};

export type OrderItemRateFields = {
  id?: string;
  cutting_price_single_needle?: number | null;
  cutting_price_overlock_flatlock?: number | null;
};

export function resolveCuttingRatesForOrderItem(
  item: OrderItemRateFields | null | undefined,
  orderDefaults: OrderAssignmentRateDefaults | null | undefined
): { sn: number; of: number } {
  const defSn = Math.max(0, Number(orderDefaults?.cutting_price_single_needle) || 0);
  const defOf = Math.max(0, Number(orderDefaults?.cutting_price_overlock_flatlock) || 0);
  const lineSn = item?.cutting_price_single_needle;
  const lineOf = item?.cutting_price_overlock_flatlock;
  const sn =
    lineSn != null && lineSn !== '' && Number.isFinite(Number(lineSn))
      ? Math.max(0, Number(lineSn))
      : defSn;
  const of =
    lineOf != null && lineOf !== '' && Number.isFinite(Number(lineOf))
      ? Math.max(0, Number(lineOf))
      : defOf;
  return { sn, of };
}

/** Map order_item.id -> resolved rates for all lines on an order. */
export function buildLineRatesMapFromOrderItems(
  orderItems: OrderItemRateFields[],
  orderDefaults: OrderAssignmentRateDefaults | null | undefined
): Record<string, { sn: number; of: number }> {
  const out: Record<string, { sn: number; of: number }> = {};
  for (const it of orderItems) {
    const id = it?.id != null ? String(it.id) : '';
    if (!id) continue;
    out[id] = resolveCuttingRatesForOrderItem(it, orderDefaults);
  }
  return out;
}
