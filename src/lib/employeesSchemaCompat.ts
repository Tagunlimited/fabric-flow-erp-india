import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * PostgREST returns 400 if any requested column is missing from the exposed schema.
 * Historically `employees` was created by different migrations (email vs personal_email,
 * optional user_id). Try progressively smaller / alternate column sets.
 */
export const EMPLOYEE_ROW_SELECT_FALLBACKS = [
  // Start with wildcard to avoid hard failures on schema drift.
  '*',
  'id, full_name, personal_email',
  'id, full_name, email',
  'id, full_name',
  'id',
] as const;

export function logPostgrestEmployeesError(context: string, selectUsed: string, error: unknown): void {
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const payload = {
    message: e?.message,
    details: e?.details,
    hint: e?.hint,
    code: e?.code,
  };
  if (import.meta.env.DEV) {
    console.warn(`[employees ${context}] select="${selectUsed}"`, payload, error);
  }
}

/** Load employee rows for auth / sales-manager matching; returns [] if every attempt fails. */
export async function fetchEmployeeRowsWithSelectFallbacks(
  supabase: SupabaseClient,
  context = 'auth-link'
): Promise<Record<string, unknown>[]> {
  for (const sel of EMPLOYEE_ROW_SELECT_FALLBACKS) {
    const { data, error } = await (supabase.from('employees') as any).select(sel);
    if (!error) {
      if (import.meta.env.DEV && sel !== EMPLOYEE_ROW_SELECT_FALLBACKS[0]) {
        console.info(`[employees ${context}] using select: ${sel}`);
      }
      return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    }
    logPostgrestEmployeesError(context, sel, error);
  }
  console.error(`[employees ${context}] all select fallbacks failed`);
  return [];
}

export function workEmailFromEmployeeRow(e: Record<string, unknown>): string | null {
  const pe = e.personal_email;
  if (typeof pe === 'string' && pe.trim()) return pe.trim();
  const em = e.email;
  if (typeof em === 'string' && em.trim()) return em.trim();
  return null;
}
