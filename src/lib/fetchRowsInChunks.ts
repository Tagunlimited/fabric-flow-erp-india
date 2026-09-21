import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';

const DEFAULT_IN_CHUNK = 80;
const PAGE_SIZE = 1000;

/** Fetch rows with `.in(column, ids)` in chunks to avoid PostgREST URL limits. */
export async function fetchRowsInChunks(
  table: string,
  select: string,
  column: string,
  ids: string[],
  chunkSize = DEFAULT_IN_CHUNK,
  applyFilters?: (q: any) => any
): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];

  const rows: any[] = [];
  for (const batch of chunkArray(unique, chunkSize)) {
    let from = 0;
    for (;;) {
      let q = supabase
        .from(table as any)
        .select(select)
        .in(column, batch as any)
        .range(from, from + PAGE_SIZE - 1);
      if (applyFilters) q = applyFilters(q);
      const { data, error } = await q;
      if (error) throw error;
      if (data?.length) rows.push(...data);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return rows;
}
