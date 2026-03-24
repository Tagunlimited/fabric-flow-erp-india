export function sortOrderLines<T extends { id: string; created_at?: string | null }>(lines: T[]): T[] {
  return [...(lines || [])].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function lineProductIndex(sortedLines: { id: string }[], lineId: string): number {
  const i = sortedLines.findIndex(l => l.id === lineId);
  return i >= 0 ? i + 1 : 1;
}

export function bomNumberForOrderLine(
  orderNumber: string,
  sortedLines: { id: string }[],
  lineId: string
): string {
  return `BOM-${orderNumber}-P${lineProductIndex(sortedLines, lineId)}`;
}
