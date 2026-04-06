/**
 * Parses `[line:<order_item_uuid>]` from `order_batch_assignments.notes`
 * (same convention as batch distribution / stitching job cards).
 */
export function parseLineOrderItemIdFromNotes(notes: unknown): string | null {
  if (notes == null) return null;
  const raw = typeof notes === "string" ? notes : String(notes);
  const m = raw.match(/\[line:([0-9a-f-]{36})\]/i);
  return m ? m[1] : null;
}
