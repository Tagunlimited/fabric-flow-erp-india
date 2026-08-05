import { supabase } from '@/integrations/supabase/client';
import { chunkArray } from '@/lib/chunkArray';

const DEFAULT_IN_CHUNK = 80;

/** Fetch rows with `.in(column, ids)` in chunks to avoid PostgREST URL limits. */
export async function fetchRowsInChunks(
  table: string,
  select: string,
  column: string,
  ids: string[],
  chunkSize = DEFAULT_IN_CHUNK,
  applyFilters?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>
): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];

  const rows: any[] = [];
  for (const batch of chunkArray(unique, chunkSize)) {
    let q = supabase.from(table as any).select(select).in(column, batch as any);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}
