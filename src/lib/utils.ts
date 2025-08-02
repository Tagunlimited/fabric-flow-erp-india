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
  return `₹${amount.toLocaleString()}`;
}
