import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://tqqhqxfvxgrxxqtcjacl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxcWhxeGZ2eGdyeHhxdGNqYWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MDg0OTksImV4cCI6MjA2ODE4NDQ5OX0.AVcWnpKBCpVaCoCkJs84BobwXEgR1mthJXheroQcYHU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
 * Format date in Indian format (dd-mmm-yy)
 * @param dateString - The date string to format
 * @returns Formatted date string in dd-mmm-yy format
 */
export function formatDateIndian(dateString?: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
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
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  
  return `${day}-${month}-${year}`;
}
