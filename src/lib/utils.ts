// Import the main Supabase client to avoid multiple instances
import { supabase } from '@/integrations/supabase/client';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs.filter(Boolean)))
}

/**
 * Calculate lifetime value for a customer
 * @param invoices - Array of invoice objects with total_amount
 * @param orders - Array of order objects with final_amount
 * @returns The calculated lifetime value
 */
export function calculateLifetimeValue(invoices: any[] = [], orders: any[] = []): number {
  // Calculate from invoices if available (most accurate)
  const invoiceTotal = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  if (invoiceTotal > 0) return invoiceTotal;
  
  // Fallback to orders if no invoices
  const orderTotal = orders.reduce((sum, order) => sum + (order.final_amount || 0), 0);
  return orderTotal;
}

/**
 * Format currency amount with proper Indian Rupee formatting
 * @param amount - The amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a plain number using Indian digit grouping (1,23,45,678)
 */
export function formatIndianNumber(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calendar date as YYYY-MM-DD in the user's local timezone.
 * Use for Postgres DATE columns — avoids UTC shifts from toISOString().
 */
export function formatLocalDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a Postgres DATE (or DATE serialized as midnight UTC) as a local calendar day.
 * `new Date("2026-04-12")` / midnight UTC is interpreted as UTC, which shows as the 11th in US timezones;
 * this keeps the calendar day aligned with what was stored (12).
 */
export function parseBusinessDateLocal(input: string | null | undefined): Date | null {
  if (input == null || typeof input !== 'string') return null;
  const s = input.trim();
  const datePart = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const y = Number(datePart.slice(0, 4));
  const mo = Number(datePart.slice(5, 7));
  const day = Number(datePart.slice(8, 10));
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;

  if (s.length === 10) {
    return new Date(y, mo - 1, day);
  }

  const rest = s.slice(10);
  if (/^T00:00:00(\.\d+)?(Z|[+-]00:00)?$/i.test(rest)) {
    return new Date(y, mo - 1, day);
  }

  return new Date(s);
}

/** Format a DATE / date-only API value for `toLocaleDateString` without UTC shift. */
export function formatLocaleDateFromApi(
  dateInput: string | null | undefined,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';
  const d = parseBusinessDateLocal(dateInput);
  if (!d) return '';
  return d.toLocaleDateString(locales, options);
}

/**
 * Format date in Indian format (dd-mmm-yy)
 * @param dateString - The date string to format
 * @returns Formatted date string in dd-mmm-yy format
 */
export function formatDateIndian(dateInput?: string | Date): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') return '';

  let date: Date | null;
  if (dateInput instanceof Date) {
    date = isNaN(dateInput.getTime()) ? null : dateInput;
  } else {
    date = parseBusinessDateLocal(dateInput);
  }
  if (!date) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  
  return `${day}-${month}-${year}`;
}

/**
 * Format date and time in Indian format (dd-mmm-yy hh:mm AM/PM)
 * @param dateString - The date string to format
 * @returns Formatted date and time string
 */
export function formatDateTimeIndian(dateString?: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${day}-${month}-${year} ${displayHours}:${minutes} ${ampm}`;
}

/**
 * Format due date in Indian format (dd-mmm-yy) - no time component
 * @param dateString - The date string to format
 * @returns Formatted due date string in dd-mmm-yy format
 */
export function formatDueDateIndian(dateString?: string): string {
  if (!dateString) return '';

  const date = parseBusinessDateLocal(dateString);
  if (!date) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  
  return `${day}-${month}-${year}`;
}
