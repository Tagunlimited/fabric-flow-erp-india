import { supabase } from '@/integrations/supabase/client';

const INVOICE_SUFFIX_RE = /\/(\d{1,})$/;
const MAX_INSERT_ATTEMPTS = 8;

/** Indian financial year string for invoice prefix, e.g. `2026-27`. */
export function getInvoiceFinancialYear(date: Date = new Date()): string {
  const startYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
  const endYearShort = String(startYear + 1).slice(-2);
  return `${startYear}-${endYearShort}`;
}

/**
 * Next invoice number: `TUC/{FY}/TI/0001`.
 * Uses max numeric suffix (not latest created_at) and includes soft-deleted rows
 * because `invoices_invoice_number_key` is unique across all rows.
 */
export async function generateInvoiceNumber(referenceDate: Date = new Date()): Promise<string> {
  const fy = getInvoiceFinancialYear(referenceDate);
  const prefix = `TUC/${fy}/TI/`;
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .ilike('invoice_number', `${prefix}%`);

  if (error) throw error;

  let maxSeq = 0;
  for (const row of data || []) {
    const invoiceNumber = row?.invoice_number as string | undefined;
    if (!invoiceNumber) continue;
    const match = invoiceNumber.match(INVOICE_SUFFIX_RE);
    if (match) maxSeq = Math.max(maxSeq, Number.parseInt(match[1], 10));
  }

  const next = maxSeq + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function isInvoiceNumberConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === '23505' &&
    String(e.message || '').toLowerCase().includes('invoice_number')
  );
}

/** Insert with fresh invoice numbers; retries on duplicate `invoice_number` (race / stale preview). */
export async function insertInvoiceWithGeneratedNumber<T extends Record<string, unknown>>(
  buildPayload: (invoiceNumber: string) => T
): Promise<{ data: Record<string, unknown> | null; error: unknown | null }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const invoiceNumber = await generateInvoiceNumber();
    const result = await supabase
      .from('invoices')
      .insert(buildPayload(invoiceNumber) as never)
      .select()
      .single();

    if (!result.error && result.data) {
      return { data: result.data as Record<string, unknown>, error: null };
    }

    lastError = result.error;
    if (!isInvoiceNumberConflict(result.error) || attempt === MAX_INSERT_ATTEMPTS - 1) {
      return { data: null, error: result.error };
    }
  }

  return { data: null, error: lastError };
}
