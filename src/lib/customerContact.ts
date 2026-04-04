/**
 * Customer mobile for documents and lists.
 * Uses `mobile` when present; otherwise `phone` (many tenants store the cell number in `phone`).
 */
export function getCustomerMobile(
  customer: { phone?: string | null; mobile?: string | null } | null | undefined
): string {
  if (!customer) return '';
  const m = (customer as { mobile?: string | null }).mobile?.toString().trim();
  const p = customer.phone?.toString().trim();
  return (m || p || '').trim();
}
