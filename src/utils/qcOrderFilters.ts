/** Picked units on bench not yet recorded as approved in qc_reviews (includes replacement picks after partial QC). */
export function orderNeedsQcVerification(order: {
  picked_quantity: number;
  approved_quantity: number;
}): boolean {
  const p = Number(order.picked_quantity) || 0;
  const a = Number(order.approved_quantity) || 0;
  return p > a;
}
