import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditOrderBadge } from '@/components/orders/CreditOrderBadge';
import { cn, formatCurrency, formatDateIndian } from '@/lib/utils';
import { getCustomerMobile } from '@/lib/customerContact';
import { getOrderCalculatedTotals, fetchOrderIdsWithActiveCreditReceipt } from '@/utils/orderFinancials';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Download, Printer, Search, Filter } from 'lucide-react';
import '../OrdersPageViewSwitch.css';
import { playOrderStatusChangeSound } from '@/utils/orderStatusSound';

type ReferenceType = 'order';

interface ReferenceResult {
  id: string;
  type: ReferenceType;
  number: string;
  date: string;
  customer_id: string;
  customer_name?: string;
  total_amount?: number;
  balance_amount?: number;
  /** Populated for orders; used in UI / receipt preview */
  additional_charges?: Array<{ particular: string; amount_incl_gst: number }>;
  payment_due_date?: string | null;
  has_credit_receipt?: boolean;
}

interface Customer {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  mobile?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
}

type ReceiptColumnFilters = {
  date: string;
  receipt_number: string;
  customer: string;
  mobile: string;
  reference: string;
  type: string;
  amount: string;
  mode: string;
};
const EMPTY_COLUMN_FILTERS: ReceiptColumnFilters = {
  date: '',
  receipt_number: '',
  customer: '',
  mobile: '',
  reference: '',
  type: '',
  amount: '',
  mode: '',
};
type ReceiptFilterColumnKey = keyof ReceiptColumnFilters;
const FILTER_META: Record<ReceiptFilterColumnKey, { title: string; description: string; placeholder: string }> = {
  date: { title: 'Filter by date', description: 'Match date text.', placeholder: 'e.g. 20 Apr' },
  receipt_number: { title: 'Filter by receipt #', description: 'Match receipt number.', placeholder: 'e.g. RCP' },
  customer: { title: 'Filter by customer', description: 'Match customer name.', placeholder: 'e.g. Rajiv' },
  mobile: { title: 'Filter by mobile', description: 'Match customer phone/mobile.', placeholder: 'e.g. 98' },
  reference: { title: 'Filter by reference', description: 'Match order/reference number.', placeholder: 'e.g. TUC/' },
  type: { title: 'Filter by type', description: 'Match reference type.', placeholder: 'e.g. order' },
  amount: { title: 'Filter by amount', description: 'Match amount text.', placeholder: 'e.g. 12000' },
  mode: { title: 'Filter by mode', description: 'Match payment mode.', placeholder: 'e.g. UPI' },
};
function includesFilter(filterRaw: string, value: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return value.toLowerCase().includes(f);
}
function ColumnFilterTrigger({
  active,
  ariaLabel,
  onOpen,
}: {
  active: boolean;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'h-7 w-7 shrink-0 rounded-full transition-all duration-200 ease-out',
        active
          ? 'bg-primary/20 text-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.45),0_4px_14px_-4px_hsl(var(--primary)/0.45)] ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:bg-primary/28 hover:ring-primary/65'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      )}
    >
      <Filter
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200 ease-out',
          active && 'scale-110 fill-primary text-primary [filter:drop-shadow(0_0_5px_hsl(var(--primary)/0.55))]'
        )}
        strokeWidth={active ? 2.5 : 2}
        aria-hidden
      />
    </Button>
  );
}

function defaultCreditDueDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

export default function ReceiptPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const location = useLocation();
  const navState: any = location.state as any;
  const prefill: any = navState?.prefill;
  const initialTab: 'view' | 'create' = navState?.tab === 'create' ? 'create' : 'view';
  const [activeReceiptTab, setActiveReceiptTab] = useState<'view' | 'create'>(initialTab);
  const [showCompleted, setShowCompleted] = useState<'no' | 'yes'>('no');
  const [columnFilters, setColumnFilters] = useState<ReceiptColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<ReceiptFilterColumnKey | null>(null);
  const filterDialogMeta = filterDialogColumn ? FILTER_META[filterDialogColumn] : null;
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);

  useEffect(() => {
    const t = (location.state as { tab?: string } | null)?.tab === 'create' ? 'create' : 'view';
    setActiveReceiptTab(t);
  }, [location.key]);

  // Customer selection
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState<string>('');

  // Reference selection (dependent on customer)
  const [refSearch, setRefSearch] = useState('');
  const [results, setResults] = useState<ReferenceResult[]>([]);
  const [selected, setSelected] = useState<ReferenceResult | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);
  /** Snapshot for receipt preview after form clears `selected` */
  const [previewOrderSnapshot, setPreviewOrderSnapshot] = useState<ReferenceResult | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [receiptAmount, setReceiptAmount] = useState<number>(0);
  const [receiptReference, setReceiptReference] = useState<string>('');

  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentType, setPaymentType] = useState('Advance');
  const [amount, setAmount] = useState<string>('');
  const [referenceId, setReferenceId] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [txns, setTxns] = useState<any[]>([]);
  const [loadingTxns, setLoadingTxns] = useState<boolean>(false);
  const [editingReceipt, setEditingReceipt] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  // Edit form state
  const [editAmount, setEditAmount] = useState('');
  const [editPaymentMode, setEditPaymentMode] = useState('');
  const [editPaymentType, setEditPaymentType] = useState('');
  const [editReferenceId, setEditReferenceId] = useState('');
  const [editVerifiedBy, setEditVerifiedBy] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState<Date>(new Date());
  
  /** Required when using Credit Order (₹0); overwritten on each credit receipt per order. */
  const [creditPaymentDueDate, setCreditPaymentDueDate] = useState<Date>(() => defaultCreditDueDate());

  // When customerId changes, load basic customer details
  useEffect(() => {
    const run = async () => {
      if (!customerId) { 
        setCustomer(null); 
        // Load all receipts when no customer is selected
        fetchReceipts();
        return; 
      }
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      setCustomer((data || null) as Customer | null);
      // If selection already exists (from prefill), keep it
      // Otherwise, clear selection when switching customer
      setSelected(prev => (prev && prev.customer_id === customerId ? prev : null));
      setRefSearch('');
      fetchReceipts();
    };
    run();
  }, [customerId]);

  // Load receipts on initial page load and handle prefill from navigation
  useEffect(() => {
    fetchReceipts();
  }, [showCompleted]);

  useEffect(() => {
    const prefillFromQuotation = async () => {
      if (!prefill || prefill.type !== 'order' || !prefill.id) return;
      try {
        const { data: ord } = await supabase
          .from('orders')
          .select('id, order_number, order_date, customer_id, payment_due_date')
          .eq('id', prefill.id)
          .eq('is_deleted', false)
          .single();
        if (!ord) return;
        const { calculatedTotal, pendingAmount } = await getOrderCalculatedTotals(ord.id, ord.order_number);
        const { data: chRows } = await supabase
          .from('order_additional_charges')
          .select('particular, amount_incl_gst')
          .eq('order_id', ord.id);
        const prefillCharges = (chRows || []).map((r: any) => ({
          particular: String(r.particular || ''),
          amount_incl_gst: Number(r.amount_incl_gst || 0),
        }));
        const { data: cust } = await supabase
          .from('customers')
          .select('*')
          .eq('id', ord.customer_id)
          .single();
        const creditSet = await fetchOrderIdsWithActiveCreditReceipt([ord.id]);
        setCustomer((cust || null) as Customer | null);
        setCustomerId(ord.customer_id);
        setSelected({
          id: ord.id,
          type: 'order',
          number: ord.order_number,
          date: ord.order_date,
          customer_id: ord.customer_id,
          customer_name: cust?.company_name,
          total_amount: calculatedTotal,
          balance_amount: pendingAmount,
          additional_charges: prefillCharges.length > 0 ? prefillCharges : undefined,
          payment_due_date: (ord as { payment_due_date?: string | null }).payment_due_date ?? null,
          has_credit_receipt: creditSet.has(ord.id),
        });
        setReceiptReference(ord.order_number);
        setAmount(String(pendingAmount ?? ''));
      } catch (e) {
        // ignore prefill errors
      }
    };
    prefillFromQuotation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoadingTxns(true);
      // First try: full select with status and join to customers
      let query = supabase
        .from('receipts')
        .select('id, created_at, receipt_number, reference_id, reference_number, reference_type, amount, payment_mode, payment_type, customer_id, customers(company_name, phone)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);
      let resp: any = customerId ? await query.eq('customer_id', customerId) : await query;
      if (resp.error) {
        // Fallback: older schema without status or relationship
        console.warn('Receipts select with join/status failed, falling back:', resp.error.message);
        let fallback = supabase
          .from('receipts')
          .select('id, created_at, receipt_number, reference_id, reference_number, reference_type, amount, payment_mode, payment_type, customer_id')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(50);
        resp = customerId ? await fallback.eq('customer_id', customerId) : await fallback;
      }
      if (resp.error) throw resp.error;
      let rows = resp.data || [];
      if (showCompleted === 'no' && rows.length > 0) {
        const orderRefIds = Array.from(
          new Set(
            rows
              .filter((r: any) => r?.reference_type === 'order' && r?.reference_id)
              .map((r: any) => r.reference_id)
          )
        );
        const orderRefNumbers = Array.from(
          new Set(
            rows
              .filter((r: any) => r?.reference_type === 'order' && r?.reference_number)
              .map((r: any) => r.reference_number)
          )
        );
        const [ordersByIdResp, ordersByNumberResp] = await Promise.all([
          orderRefIds.length
            ? supabase.from('orders').select('id, status').in('id', orderRefIds as any)
            : Promise.resolve({ data: [] as any[] }),
          orderRefNumbers.length
            ? supabase.from('orders').select('order_number, status').in('order_number', orderRefNumbers as any)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const completedOrderIds = new Set(
          ((ordersByIdResp.data || []) as any[]).filter((o) => o.status === 'completed').map((o) => o.id)
        );
        const completedOrderNumbers = new Set(
          ((ordersByNumberResp.data || []) as any[])
            .filter((o) => o.status === 'completed')
            .map((o) => o.order_number)
        );
        rows = rows.filter((r: any) => {
          if (r?.reference_type !== 'order') return true;
          const byId = r?.reference_id && completedOrderIds.has(r.reference_id);
          const byNumber = r?.reference_number && completedOrderNumbers.has(r.reference_number);
          return !(byId || byNumber);
        });
      }
      const custIds = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean)));
      if (custIds.length > 0) {
        const { data: custs } = await supabase
          .from('customers')
          .select('id, company_name, phone')
          .in('id', custIds);
        const idToCust: Record<string, { company_name: string; phone: string | null }> = {};
        (custs || []).forEach((c: any) => {
          idToCust[c.id] = { company_name: c.company_name, phone: c.phone ?? null };
        });
        rows = rows.map((r: any) => ({
          ...r,
          customer_name: r.customer_name || idToCust[r.customer_id]?.company_name,
          customers: {
            company_name: r.customers?.company_name ?? idToCust[r.customer_id]?.company_name ?? '',
            phone: r.customers?.phone ?? idToCust[r.customer_id]?.phone ?? null,
          },
        }));
      }
      setTxns(rows);
    } catch (e) {
      setTxns([]);
    } finally {
      setLoadingTxns(false);
    }
  };

  // Reference search (dependent on selected customer)
  useEffect(() => {
    const run = async () => {
      if (!customer) { setResults([]); return; }
      if (refSearch.length > 0 && refSearch.length < 1) return;
      try {
        const res: ReferenceResult[] = [];

        // Orders for customer only
        let ordersQuery = supabase
          .from('orders')
          .select('id, order_number, customer_id, order_date, final_amount, balance_amount, gst_rate, payment_due_date')
          .eq('customer_id', customer.id)
          .eq('is_deleted', false)
          .limit(20);
        if (showCompleted === 'no') {
          ordersQuery = ordersQuery.neq('status', 'completed');
        }
        if (refSearch) {
          ordersQuery = ordersQuery.ilike('order_number', `%${refSearch}%`);
        }
        const { data: orders } = await ordersQuery;
        if (orders) {
          const orderIdList = (orders as any[]).map((o) => o.id).filter(Boolean);
          const chargesByOrder = new Map<string, Array<{ particular: string; amount_incl_gst: number }>>();
          if (orderIdList.length > 0) {
            const { data: chargeRows, error: chErr } = await supabase
              .from('order_additional_charges')
              .select('order_id, particular, amount_incl_gst')
              .in('order_id', orderIdList as any);
            if (!chErr && chargeRows) {
              for (const row of chargeRows as any[]) {
                if (!row?.order_id) continue;
                const list = chargesByOrder.get(row.order_id) || [];
                list.push({
                  particular: String(row.particular || ''),
                  amount_incl_gst: Number(row.amount_incl_gst || 0),
                });
                chargesByOrder.set(row.order_id, list);
              }
            }
          }

          const creditOrderIds = await fetchOrderIdsWithActiveCreditReceipt(orderIdList);

          for (const o of orders) {
            const { calculatedTotal, pendingAmount } = await getOrderCalculatedTotals(o.id, o.order_number);
            const extraLines = chargesByOrder.get(o.id) || [];
            res.push({
              id: o.id,
              type: 'order',
              number: o.order_number,
              date: o.order_date,
              customer_id: o.customer_id,
              customer_name: customer.company_name,
              total_amount: calculatedTotal,
              balance_amount: pendingAmount,
              additional_charges: extraLines.length > 0 ? extraLines : undefined,
              payment_due_date: (o as { payment_due_date?: string | null }).payment_due_date ?? null,
              has_credit_receipt: creditOrderIds.has(o.id),
            });
          }
        }

        setResults(res);
      } catch (e) {
        setResults([]);
      }
    };
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [customer, refSearch, showCompleted]);

  // Update amount field when order is selected
  useEffect(() => {
    if (selected && selected.type === 'order' && selected.balance_amount !== undefined) {
      setAmount(String(selected.balance_amount));
    }
  }, [selected]);

  const handleGenerate = async (isCredit: boolean = false) => {
    if (!selected || (!amount && !isCredit)) {
      toast.error('Please select an order and enter amount');
      return;
    }

    if (isCredit) {
      if (!creditPaymentDueDate || Number.isNaN(creditPaymentDueDate.getTime())) {
        toast.error('Please select payment due date for the credit order');
        return;
      }
    }

    try {
      setGeneratingReceipt(true);

      // Validate amount doesn't exceed order total
      if (selected.type === 'order') {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount, gst_rate')
          .eq('order_number', selected.number)
          .eq('is_deleted', false)
          .single();

        if (orderError) {
          toast.error('Failed to fetch order details');
          return;
        }

        if (order) {
          const { calculatedTotal, totalReceipts } = await getOrderCalculatedTotals(order.id, selected.number);
          const totalWithNewReceipt = totalReceipts + Number(amount || 0);

          if (!isCredit && totalWithNewReceipt > calculatedTotal) {
            toast.error(`Total receipts (${formatCurrency(totalWithNewReceipt)}) cannot exceed order amount (${formatCurrency(calculatedTotal)})`);
            return;
          }
        }
      }

      // Create receipt
      const payload = {
        receipt_number: null, // Let database trigger generate the proper sequential number
        reference_type: selected.type,
        reference_number: selected.number,
        reference_id: selected.id,
        customer_id: customer?.id,
        amount: isCredit ? 0 : Number(amount),
        payment_mode: isCredit ? 'Credit' : paymentMode,
        payment_type: isCredit ? 'Credit' : paymentType,
        reference_txn_id: isCredit ? null : (referenceId || null),
        verified_by: isCredit ? null : (verifiedBy || null),
        notes: isCredit ? 'Credit order - Payment pending' : (notes || null),
        entry_date: date.toISOString()
      };

      // Try to create receipt with retry logic for race conditions
      let newReceipt = null;
      let error = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries && !newReceipt) {
        try {
          const result = await supabase
            .from('receipts')
            .insert(payload)
            .select()
            .single();
          
          if (result.error) {
            error = result.error;
            // If it's a duplicate key error, retry after a short delay
            if (error.message.includes('duplicate key value violates unique constraint') && retryCount < maxRetries - 1) {
              retryCount++;
              console.warn(`Duplicate key error, retrying (${retryCount}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 100 * retryCount)); // Exponential backoff
              continue;
            }
          } else {
            newReceipt = result.data;
            error = null;
          }
        } catch (e) {
          error = e;
          if (retryCount < maxRetries - 1) {
            retryCount++;
            console.warn(`Error creating receipt, retrying (${retryCount}/${maxRetries})...`, e);
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            continue;
          }
        }
      }

      if (error) {
        console.error('Error creating receipt after retries:', error);
        toast.error(`Failed to create receipt: ${error.message}`);
        return;
      }

      // Update order balance if reference is order (use same calculated total as quotation)
      if (selected.type === 'order') {
        const { data: order, error: orderUpdateError } = await supabase
          .from('orders')
          .select('id, order_type, status')
          .eq('order_number', selected.number)
          .eq('is_deleted', false)
          .single();

        if (!orderUpdateError && order) {
          const { pendingAmount: newBalance } = await getOrderCalculatedTotals(order.id, selected.number);
          const updateData: Record<string, unknown> = { balance_amount: newBalance };
          if (order.order_type === 'readymade' && order.status === 'pending') {
            updateData.status = 'confirmed';
          }
          if (isCredit && creditPaymentDueDate) {
            updateData.payment_due_date = creditPaymentDueDate.toISOString().split('T')[0];
          }
          const { error: balanceUpdateError } = await supabase
            .from('orders')
            .update(updateData as any)
            .eq('id', order.id);
          if (balanceUpdateError) {
            console.error('Error updating order balance:', balanceUpdateError);
          } else if ('status' in updateData && updateData.status != null) {
            playOrderStatusChangeSound();
          }
        }
      }

      // Update customer pending amount if available (skip for credit orders)
      if (customer?.id && !isCredit) {
        console.log('Updating customer pending amount...');
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('pending_amount')
          .eq('id', customer.id)
          .single();

        if (customerError) {
          console.error('Error fetching customer for pending update:', customerError);
        } else if (customerData) {
          const newPending = (Number(customerData.pending_amount) || 0) - Number(amount);
          const { error: pendingUpdateError } = await supabase
            .from('customers')
            .update({ pending_amount: newPending })
            .eq('id', customer.id);

          if (pendingUpdateError) {
            console.error('Error updating customer pending amount:', pendingUpdateError);
          } else {
            console.log('Customer pending amount updated successfully');
          }
        }
      }

      if (isCredit) {
        toast.success(`Credit order created successfully! Order can now proceed to production. Receipt: ${newReceipt.receipt_number}`);
      } else {
      toast.success(`Receipt ${newReceipt.receipt_number} generated successfully`);
      }
      
      // Store the amount before clearing the form
      setReceiptAmount(isCredit ? 0 : Number(amount));
      setReceiptReference(selected.number);
      
      setReceiptNumber(newReceipt.receipt_number);
      const snap: ReferenceResult = {
        ...selected,
        ...(isCredit && creditPaymentDueDate
          ? { payment_due_date: creditPaymentDueDate.toISOString().split('T')[0], has_credit_receipt: true }
          : {}),
      };
      setPreviewOrderSnapshot(snap);
      setOpenPreview(true);

      // Refresh order data to update UI
      await refreshOrderData(selected.number);

      // Clear form
      setAmount('');
      setReferenceId('');
      setVerifiedBy('');
      setNotes('');
      setSelected(null);
      if (isCredit) setCreditPaymentDueDate(defaultCreditDueDate());

      // Refresh receipts list
      await fetchReceipts();
    } catch (error) {
      console.error('Error generating receipt:', error);
      toast.error(`Failed to generate receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const handlePrint = async () => {
    if (!printRef.current) return;

    try {
      const images = printRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve(true);
            else {
              img.onload = () => resolve(true);
              img.onerror = () => resolve(true);
            }
          })
      );
      await Promise.all(imagePromises);

      const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((el) => el.outerHTML)
        .join('\n');

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        toast.error('Failed to initialize print preview');
        return;
      }

      const printContent = printRef.current.outerHTML;
      doc.open();
      doc.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Receipt ${receiptNumber}</title>
            ${styleTags}
            <style>
              @page { size: A5 landscape; margin: 3mm; }
              html, body { margin: 0; padding: 0; background: #fff; }
              body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
              .receipt-print-container {
                box-sizing: border-box !important;
                width: 204mm !important;
                min-height: 142mm !important;
                height: 142mm !important;
                padding: 0 !important;
                margin: 0 !important;
                background: #fff !important;
                overflow: hidden !important;
                page-break-after: avoid !important;
                break-after: avoid-page !important;
              }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
      doc.close();

      const cleanup = () => {
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 400);
      };

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          cleanup();
        }
      }, 350);
    } catch (error) {
      console.error('Error printing:', error);
      toast.error('Failed to print receipt');
    }
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    try {
      toast.loading('Generating PDF...');
      
      // Wait for images to load
      const images = printRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map((img) => {
        return new Promise((resolve) => {
          if (img.complete) {
            resolve(true);
          } else {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(true);
          }
        });
      });
      await Promise.all(imagePromises);
      
      // Capture with higher scale for quality, but compress later
      const canvas = await html2canvas(printRef.current, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false
      });
      
      // Use JPEG with compression for smaller file size
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      
      const pdf = new jsPDF('l', 'mm', 'a5'); // A5 landscape
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm for A5 landscape
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 148mm for A5 landscape
      
      // Reduced margins for more content space
      const margin = 3;
      const targetWidth = pdfWidth - margin * 2;
      const targetHeight = pdfHeight - margin * 2;
      
      const imgAspect = canvas.width / canvas.height;
      let outWidth = targetWidth;
      let outHeight = outWidth / imgAspect;
      
      if (outHeight > targetHeight) {
        outHeight = targetHeight;
        outWidth = outHeight * imgAspect;
      }
      
      const x = margin;
      const y = margin;
      
      pdf.addImage(imgData, 'JPEG', x, y, outWidth, outHeight);
      
      // Compress PDF if needed
      let pdfBlob = pdf.output('blob');
      if (pdfBlob.size > 200 * 1024) {
        // If still too large, reduce image quality further
        const imgDataCompressed = canvas.toDataURL('image/jpeg', 0.75);
        const pdfCompressed = new jsPDF('l', 'mm', 'a5');
        pdfCompressed.addImage(imgDataCompressed, 'JPEG', x, y, outWidth, outHeight);
        pdfBlob = pdfCompressed.output('blob');
      }
      
      // Save the PDF
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Receipt-${receiptNumber || selected?.number || 'receipt'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Receipt PDF exported');
    } catch (e) {
      console.error('Error exporting PDF:', e);
      toast.error('Failed to export PDF');
    }
  };

  // Edit and Cancel handlers
  const handleEditReceipt = async (r: any) => {
    // Set editing receipt and populate form fields
    setEditingReceipt(r);
    setEditAmount(String(r.amount || ''));
    setEditPaymentMode(r.payment_mode || 'UPI');
    setEditPaymentType(r.payment_type || 'Advance');
    setEditReferenceId(r.reference_txn_id || '');
    setEditVerifiedBy(r.verified_by || '');
    setEditNotes(r.notes || '');
    setEditDate(new Date(r.created_at));
    setShowEditDialog(true);
  };

  const handleSaveReceipt = async () => {
    if (!editingReceipt) return;

    try {
      setSavingReceipt(true);
      
      const oldAmount = Number(editingReceipt.amount);
      const newAmount = Number(editAmount);
      const amountDifference = newAmount - oldAmount;

      // Validate amount doesn't exceed order total
      if (editingReceipt.reference_type === 'order') {
        const { data: order } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount')
          .eq('order_number', editingReceipt.reference_number)
          .eq('is_deleted', false)
          .single();

        if (order) {
          // Calculate total receipts for this order (excluding current receipt)
          const { data: existingReceipts } = await supabase
            .from('receipts')
            .select('amount')
            .eq('is_deleted', false)
            .eq('reference_number', editingReceipt.reference_number)
            .eq('reference_type', 'order')
            .neq('id', editingReceipt.id);

          const totalExistingReceipts = (existingReceipts || []).reduce((sum, r) => sum + Number(r.amount), 0);
          const totalWithNewAmount = totalExistingReceipts + newAmount;

          if (totalWithNewAmount > Number(order.final_amount)) {
            toast.error(`Total receipts (${formatCurrency(totalWithNewAmount)}) cannot exceed order amount (${formatCurrency(Number(order.final_amount))})`);
            return;
          }
        }
      }

      // Update receipt
      const { error: receiptError } = await supabase
        .from('receipts')
        .update({
          amount: newAmount,
          payment_mode: editPaymentMode,
          payment_type: editPaymentType,
          reference_txn_id: editReferenceId,
          verified_by: editVerifiedBy,
          notes: editNotes,
          entry_date: editDate.toISOString()
        })
        .eq('id', editingReceipt.id);

      if (receiptError) throw receiptError;

      // Update order balance if amount changed and reference is order
      if (amountDifference !== 0 && editingReceipt.reference_type === 'order') {
        const { data: order } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount')
          .eq('order_number', editingReceipt.reference_number)
          .eq('is_deleted', false)
          .single();

        if (order) {
          // Calculate total receipts for this order (excluding current receipt, then add new amount)
          const { data: existingReceipts } = await supabase
            .from('receipts')
            .select('amount')
            .eq('is_deleted', false)
            .eq('reference_number', editingReceipt.reference_number)
            .eq('reference_type', 'order')
            .neq('id', editingReceipt.id);

          const totalExistingReceipts = (existingReceipts || []).reduce((sum, r) => sum + Number(r.amount), 0);
          const totalReceipts = totalExistingReceipts + newAmount;
          const newBalance = Number(order.final_amount) - totalReceipts;

          console.log('Edit balance calculation:', {
            finalAmount: Number(order.final_amount),
            totalExistingReceipts,
            newAmount,
            totalReceipts,
            newBalance
          });

          await supabase
            .from('orders')
            .update({ balance_amount: newBalance })
            .eq('id', order.id);
        }
      }

      toast.success('Receipt updated successfully');
      setShowEditDialog(false);
      setEditingReceipt(null);
      
      // Refresh order data to update UI
      if (editingReceipt?.reference_type === 'order') {
        await refreshOrderData(editingReceipt.reference_number);
      }
      
      await fetchReceipts();
    } catch (error) {
      console.error('Error saving receipt:', error);
      toast.error('Failed to update receipt');
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleCancelReceipt = async (r: any) => {
    try {
      const confirmCancel = window.confirm(`Cancel receipt ${r.receipt_number}? This will restore pending amount.`);
      if (!confirmCancel) return;
      // Soft delete receipt to preserve recovery/audit trail.
      const { error } = await supabase
        .from('receipts')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: 'Cancelled from receipt page',
        } as any)
        .eq('id', r.id);
      if (error) throw error;

      // Recalculate order balance after cancel (receipt already deleted; use same calculated total as quotation)
      if (r.reference_type === 'order') {
        const { data: ord } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', r.reference_number)
          .eq('is_deleted', false)
          .single();
        if (ord) {
          const { pendingAmount: newBalance } = await getOrderCalculatedTotals(ord.id, r.reference_number);
          await supabase
            .from('orders')
            .update({ balance_amount: newBalance })
            .eq('id', ord.id);
        }
      }
      toast.success('Receipt cancelled');
      
      // Refresh order data to update UI
      if (r.reference_type === 'order') {
        await refreshOrderData(r.reference_number);
      }
      
      await fetchReceipts();
    } catch (e) {
      toast.error('Failed to cancel receipt');
    }
  };
  // Open existing receipt for preview
  const handleOpenReceipt = async (r: any) => {
    try {
      if (r.customer_id) {
        setCustomerId(r.customer_id);
        const { data: cust } = await supabase.from('customers').select('*').eq('id', r.customer_id).single();
        setCustomer((cust || null) as any);
      }
      let ord: any = null;
      if (r.reference_type === 'order') {
        if (r.reference_number) {
          const { data } = await supabase
            .from('orders')
            .select('id, customer_id, order_number, order_date, final_amount, balance_amount, payment_due_date')
            .eq('order_number', r.reference_number)
            .eq('is_deleted', false)
            .single();
          ord = data;
        }
        if (!ord && r.reference_id) {
          const { data } = await supabase
            .from('orders')
            .select('id, customer_id, order_number, order_date, final_amount, balance_amount, payment_due_date')
            .eq('id', r.reference_id)
            .eq('is_deleted', false)
            .single();
          ord = data;
        }
      }
      setReceiptNumber(r.receipt_number || '');
      setAmount(String(r.amount || ''));
      setReceiptAmount(Number(r.amount) || 0);
      setPaymentMode(r.payment_mode || 'UPI');
      setPaymentType(r.payment_type || 'Advance');
      setReferenceId(r.reference_txn_id || '');
      setVerifiedBy(r.verified_by || '');
      setNotes(r.notes || '');
      setDate(new Date(r.created_at));
      setReceiptReference(r.reference_number || '');
      if (ord) {
        const { calculatedTotal, pendingAmount } = await getOrderCalculatedTotals(ord.id, ord.order_number);
        const { data: chRows } = await supabase
          .from('order_additional_charges')
          .select('particular, amount_incl_gst')
          .eq('order_id', ord.id);
        const extraLines = (chRows || []).map((row: any) => ({
          particular: String(row.particular || ''),
          amount_incl_gst: Number(row.amount_incl_gst || 0),
        }));
        const creditSet = await fetchOrderIdsWithActiveCreditReceipt([ord.id]);
        const refRow: ReferenceResult = {
          id: ord.id,
          type: 'order',
          number: ord.order_number,
          date: ord.order_date,
          customer_id: ord.customer_id,
          customer_name: customer?.company_name,
          total_amount: calculatedTotal,
          balance_amount: pendingAmount,
          additional_charges: extraLines.length > 0 ? extraLines : undefined,
          payment_due_date: ord.payment_due_date ?? null,
          has_credit_receipt: creditSet.has(ord.id),
        };
        setSelected(refRow);
        setPreviewOrderSnapshot(refRow);
      } else {
        const fallbackRef: ReferenceResult = {
          id: '',
          type: 'order',
          number: r.reference_number || '',
          date: r.created_at,
          customer_id: r.customer_id,
          customer_name: customer?.company_name,
          total_amount: Number(r.amount) || 0,
          balance_amount: undefined,
        };
        setSelected(fallbackRef);
        setPreviewOrderSnapshot(fallbackRef);
      }
      setOpenPreview(true);
    } catch (e) {
      setOpenPreview(true);
    }
  };

  // Refresh order data to update UI state (use calculated total and pending to match quotation)
  const refreshOrderData = async (orderNumber: string) => {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, customer_id, order_date, payment_due_date')
        .eq('order_number', orderNumber)
        .eq('is_deleted', false)
        .single();

      if (!order) return;
      const { calculatedTotal, pendingAmount } = await getOrderCalculatedTotals(order.id, orderNumber);
      const creditSet = await fetchOrderIdsWithActiveCreditReceipt([order.id]);
      const patch = {
        total_amount: calculatedTotal,
        balance_amount: pendingAmount,
        payment_due_date: (order as { payment_due_date?: string | null }).payment_due_date ?? null,
        has_credit_receipt: creditSet.has(order.id),
      };

      if (selected && selected.number === orderNumber) {
        setSelected({
          ...selected,
          ...patch,
        });
      }
      setPreviewOrderSnapshot((prev) =>
        prev && prev.number === orderNumber ? { ...prev, ...patch } : prev
      );
      setResults(prevResults =>
        prevResults.map(r =>
          r.number === orderNumber
            ? { ...r, ...patch }
            : r
        ));
    } catch (error) {
      console.error('Error refreshing order data:', error);
    }
  };

  const receiptOrderContext = previewOrderSnapshot ?? selected;
  const filteredTxns = useMemo(() => {
    return txns.filter((r: any) => {
      const mobile = getCustomerMobile({ phone: r.customers?.phone, mobile: (r.customers as any)?.mobile }) || '—';
      return (
        includesFilter(columnFilters.date, formatDateIndian(r.created_at)) &&
        includesFilter(columnFilters.receipt_number, r.receipt_number || '') &&
        includesFilter(columnFilters.customer, r.customers?.company_name || r.customer_name || '') &&
        includesFilter(columnFilters.mobile, mobile) &&
        includesFilter(columnFilters.reference, r.reference_number || '') &&
        includesFilter(columnFilters.type, (r.reference_type || '').toString()) &&
        includesFilter(columnFilters.amount, formatCurrency(Number(r.amount || 0))) &&
        includesFilter(columnFilters.mode, r.payment_mode || '')
      );
    });
  }, [txns, columnFilters]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <label
            htmlFor="receipt-page-view-switch"
            className="orders-view-switch"
            aria-label="Switch between viewing transactions and creating a receipt"
          >
            <input
              id="receipt-page-view-switch"
              type="checkbox"
              role="switch"
              aria-checked={activeReceiptTab === 'create'}
              checked={activeReceiptTab === 'create'}
              onChange={(e) => setActiveReceiptTab(e.target.checked ? 'create' : 'view')}
            />
            <span>View Txn</span>
            <span>Create Receipt</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show completed</span>
            <Select value={showCompleted} onValueChange={(v: 'no' | 'yes') => setShowCompleted(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="No (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No (default)</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeReceiptTab === 'view' && (
            <Card>
              <CardHeader>
                <CardTitle>Receipt Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted-foreground">{loadingTxns ? 'Loading...' : `${filteredTxns.length} recent receipts`}</div>
                    <Button variant="outline" onClick={fetchReceipts}>Refresh</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Date<ColumnFilterTrigger active={!!columnFilters.date} ariaLabel="Filter by date" onOpen={() => setFilterDialogColumn('date')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Receipt #<ColumnFilterTrigger active={!!columnFilters.receipt_number} ariaLabel="Filter by receipt number" onOpen={() => setFilterDialogColumn('receipt_number')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Customer<ColumnFilterTrigger active={!!columnFilters.customer} ariaLabel="Filter by customer" onOpen={() => setFilterDialogColumn('customer')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Mobile<ColumnFilterTrigger active={!!columnFilters.mobile} ariaLabel="Filter by mobile" onOpen={() => setFilterDialogColumn('mobile')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Reference<ColumnFilterTrigger active={!!columnFilters.reference} ariaLabel="Filter by reference" onOpen={() => setFilterDialogColumn('reference')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Type<ColumnFilterTrigger active={!!columnFilters.type} ariaLabel="Filter by type" onOpen={() => setFilterDialogColumn('type')} /></div></th>
                          <th className="p-2 text-right border"><div className="flex items-center justify-end gap-1">Amount<ColumnFilterTrigger active={!!columnFilters.amount} ariaLabel="Filter by amount" onOpen={() => setFilterDialogColumn('amount')} /></div></th>
                          <th className="p-2 text-left border"><div className="flex items-center gap-1">Mode<ColumnFilterTrigger active={!!columnFilters.mode} ariaLabel="Filter by mode" onOpen={() => setFilterDialogColumn('mode')} /></div></th>
                          <th className="p-2 text-left border">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTxns.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={async () => { await handleOpenReceipt(r); }}>
                            <td className="p-2 border">{formatDateIndian(r.created_at)}</td>
                            <td className="p-2 border font-medium">
                              {r.receipt_number}
                              {(r.payment_mode === 'Credit' || r.payment_type === 'Credit' || Number(r.amount) === 0) && (
                                <Badge className="ml-2 bg-orange-100 text-orange-700 border-orange-300">CREDIT</Badge>
                              )}
                            </td>
                            <td className="p-2 border">{r.customers?.company_name || r.customer_name || '-'}</td>
                            <td className="p-2 border font-mono text-xs">
                              {getCustomerMobile({
                                phone: r.customers?.phone,
                                mobile: (r.customers as any)?.mobile,
                              }) || '—'}
                            </td>
                            <td className="p-2 border">{r.reference_number}</td>
                            <td className="p-2 border uppercase">{r.reference_type}</td>
                            <td className="p-2 border text-right">
                              {formatCurrency(Number(r.amount))}
                              {Number(r.amount) === 0 && (
                                <span className="text-xs text-orange-600 ml-1">(Pending)</span>
                              )}
                            </td>
                            <td className="p-2 border">{r.payment_mode}</td>
                            <td className="p-2 border space-x-2">
                              <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await handleEditReceipt(r); }}>Edit</Button>
                              <Button variant="outline" size="sm" className="text-destructive" onClick={async (e) => { e.stopPropagation(); await handleCancelReceipt(r); }}>Cancel</Button>
                            </td>
                          </tr>
                        ))}
                        {!loadingTxns && filteredTxns.length === 0 && (
                          <tr>
                            <td className="p-4 text-center text-muted-foreground" colSpan={9}>No receipts found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                {hasActiveColumnFilters && (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}>
                      Clear column filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
        )}

        {activeReceiptTab === 'create' && (
            <Card>
              <CardHeader>
                <CardTitle>Create Receipt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
            {/* Customer and Reference selectors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Customer selector */}
              <div className="md:col-span-1">
                <Label className="mb-1 block">Customer</Label>
                <CustomerSearchSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  onCustomerSelect={(c) => setCustomer((c as any) as Customer | null)}
                  placeholder="Search by phone, name, contact..."
                  cacheKey="customerSearchSelect-receipt"
                />
                {customer && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Mobile: <span className="font-mono text-foreground">{getCustomerMobile(customer) || '—'}</span>
                  </p>
                )}
              </div>

              {/* Reference selector - depends on customer (Orders only) */}
              <div className="md:col-span-1">
                <Label className="mb-1 block">Order</Label>
                <Popover open={refOpen} onOpenChange={setRefOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between" disabled={!customer}>
                      {selected ? `${selected.number}` : (customer ? 'Select order...' : 'Select customer first')}
                      <Search className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0">
                    <div className="border rounded-md">
                      <Command>
                        <CommandInput placeholder={customer ? 'Search order number' : 'Select customer first'} value={refSearch} onValueChange={setRefSearch} disabled={!customer} />
                        <CommandList>
                          <CommandEmpty>{customer ? 'No orders found.' : 'Select a customer.'}</CommandEmpty>
                          {customer && (
                            <CommandGroup heading="Orders">
                              {results.map((r) => (
                                <CommandItem key={`order-${r.id}`} onSelect={() => { 
                                  setSelected(r); 
                                  setAmount(String(r.balance_amount ?? '')); 
                                  setRefOpen(false); 
                                }} className="flex items-center gap-2">
                                  <span className="font-medium">{r.number}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">{formatDateIndian(r.date)}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </div>
                  </PopoverContent>
                </Popover>
                {selected && (
                  <div className="text-xs text-muted-foreground mt-1.5 space-y-1 rounded-md border bg-muted/30 p-2">
                    <div>
                      Order total:{' '}
                      <span className="font-semibold text-foreground">{formatCurrency(selected.total_amount ?? 0)}</span>
                    </div>
                    {selected.additional_charges && selected.additional_charges.length > 0 && (
                      <div className="space-y-0.5 pl-1 border-l-2 border-primary/30">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Additional charges</div>
                        {selected.additional_charges.map((c, i) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="truncate">{c.particular?.trim() || 'Charge'}</span>
                            <span className="font-mono shrink-0">{formatCurrency(c.amount_incl_gst)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      Pending:{' '}
                      <span className="font-semibold text-amber-700">{formatCurrency(selected.balance_amount ?? 0)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selected.has_credit_receipt && (
                        <CreditOrderBadge>Credit order</CreditOrderBadge>
                      )}
                      {selected.payment_due_date && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Due {formatDateIndian(selected.payment_due_date)}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Entry date */}
              <div>
                <Label className="mb-1 block">Entry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" /> {formatDateIndian(date)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="p-0">
                    <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
              <Label className="text-sm font-medium">Payment due date (for credit orders)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full max-w-xs justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDateIndian(creditPaymentDueDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={creditPaymentDueDate}
                    onSelect={(d) => d && setCreditPaymentDueDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Required when you use &quot;Credit Order (₹0)&quot;. Saves to the order as expected collection date.
              </p>
            </div>

            {/* Payment details */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Type</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Advance">Advance</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                    <SelectItem value="Full">Full</SelectItem>
                    <SelectItem value="Balance">Balance</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                    <SelectItem value="Refund">Refund</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹" />
              </div>
              <div>
                <Label>Reference / UTR / Txn ID</Label>
                <Input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="Optional" />
              </div>
              <div className="md:col-span-2">
                <Label>Verified By</Label>
                <Input value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Verifier name" />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>

                <div className="flex justify-end gap-2">
                  <Button 
                    onClick={() => handleGenerate(true)} 
                    disabled={!selected || generatingReceipt}
                    variant="outline"
                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                  >
                    Credit Order (₹0)
                  </Button>
                  <Button 
                    onClick={() => handleGenerate(false)} 
                    disabled={!selected || !amount || generatingReceipt}
                  >
                    Generate Receipt
                  </Button>
                </div>
              </CardContent>
            </Card>
        )}

        <Dialog
          open={filterDialogColumn !== null}
          onOpenChange={(open) => {
            if (!open) setFilterDialogColumn(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            {filterDialogColumn && filterDialogMeta && (
              <>
                <DialogHeader>
                  <DialogTitle>{filterDialogMeta.title}</DialogTitle>
                  <DialogDescription>{filterDialogMeta.description}</DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  placeholder={filterDialogMeta.placeholder}
                  value={columnFilters[filterDialogColumn]}
                  onChange={(e) =>
                    setColumnFilters((p) => ({ ...p, [filterDialogColumn]: e.target.value }))
                  }
                />
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setColumnFilters((p) => ({ ...p, [filterDialogColumn]: '' }))}
                  >
                    Clear this filter
                  </Button>
                  <Button type="button" onClick={() => setFilterDialogColumn(null)}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog
          open={openPreview}
          onOpenChange={(open) => {
            setOpenPreview(open);
            if (!open) setPreviewOrderSnapshot(null);
          }}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Receipt Preview — {receiptNumber}</DialogTitle>
              <DialogDescription>
                Review receipt details before printing or exporting PDF.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={handleExportPDF}><Download className="w-4 h-4 mr-1" /> Export PDF</Button>
            </div>
            <div
              ref={printRef}
              className="bg-white receipt-print-container"
              style={{
                width: '204mm',
                minHeight: '142mm',
                height: '142mm',
                padding: '0',
                margin: '0',
                overflow: 'hidden',
              }}
            >
              <style>{`
                @page { 
                  size: A5 landscape; 
                  margin: 3mm; 
                }
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  .receipt-print-container,
                  .receipt-print-container * {
                    visibility: visible;
                  }
                  .receipt-print-container {
                    position: absolute;
                    left: 0;
                    top: 0;
                    box-sizing: border-box !important;
                    width: 204mm !important;
                    min-height: 142mm !important;
                    height: 142mm !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    overflow: hidden !important;
                    page-break-after: avoid !important;
                    break-after: avoid-page !important;
                  }
                }
              `}</style>
              {/* Company header */}
              <div className="flex justify-between items-start border-b pb-3 mb-3">
                <div className="flex items-center gap-3">
                  {(company as any)?.logo_url && (
                    <img src={(company as any).logo_url} alt="Logo" className="w-16 h-16 object-contain" />
                  )}
                  <div>
                    <div className="text-2xl font-bold">{company?.company_name || 'Our Company'}</div>
                    <div className="text-sm text-muted-foreground">{company?.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">RECEIPT</div>
                  <div className="text-sm text-muted-foreground">{formatDateIndian(date)}</div>
                </div>
              </div>

              {/* Receipt meta */}
              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div className="space-y-1">
                  <div><span className="font-medium">Receipt No.:</span> {receiptNumber}</div>
                  <div><span className="font-medium">Reference:</span> {receiptReference}</div>
                  <div><span className="font-medium">Customer:</span> {customer?.company_name || '-'}</div>
                  <div>
                    <span className="font-medium">Mobile:</span>{' '}
                    <span className="font-mono">{getCustomerMobile(customer) || '—'}</span>
                  </div>
                  <div><span className="font-medium">Payment Mode:</span> {paymentMode}</div>
                  <div><span className="font-medium">Payment Type:</span> {paymentType}</div>
                </div>
                <div className="space-y-1 text-right">
                  <div><span className="font-medium">Amount:</span> {formatCurrency(receiptAmount)}</div>
                  {receiptOrderContext?.type === 'order' && receiptOrderContext?.total_amount != null && (
                    <>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {receiptOrderContext.has_credit_receipt && (
                          <CreditOrderBadge>Credit order</CreditOrderBadge>
                        )}
                        {receiptOrderContext.payment_due_date && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Due {formatDateIndian(receiptOrderContext.payment_due_date)}
                          </Badge>
                        )}
                      </div>
                      <div><span className="font-medium">Order Total:</span> {formatCurrency(receiptOrderContext.total_amount)}</div>
                      {receiptOrderContext.additional_charges && receiptOrderContext.additional_charges.length > 0 && (
                        <div className="text-left space-y-0.5 pt-1 border-t border-dashed">
                          <div className="font-medium text-xs text-muted-foreground">Additional charges</div>
                          {receiptOrderContext.additional_charges.map((c, i) => (
                            <div key={i} className="flex justify-between gap-2 text-sm">
                              <span className="truncate">{c.particular?.trim() || 'Charge'}</span>
                              <span>{formatCurrency(c.amount_incl_gst)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div><span className="font-medium">Pending Amount:</span> <span className="text-amber-700 font-semibold">{formatCurrency(receiptOrderContext.balance_amount ?? 0)}</span></div>
                    </>
                  )}
                  {referenceId && <div><span className="font-medium">Reference ID:</span> {referenceId}</div>}
                  {verifiedBy && <div><span className="font-medium">Verified By:</span> {verifiedBy}</div>}
                </div>
              </div>

              {/* Acknowledgement */}
              <div className="border rounded p-4 text-base">
                Received a sum of <span className="font-semibold">{formatCurrency(receiptAmount)}</span> from
                {' '}<span className="font-semibold">{customer?.company_name || 'Customer'}</span>
                {getCustomerMobile(customer) ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground">(Mobile: {getCustomerMobile(customer)})</span>
                  </>
                ) : null}{' '}
                towards
                {' '}<span className="font-semibold">{paymentType}</span> against reference
                {' '}<span className="font-semibold">{receiptReference}</span>.
                {notes && <div className="mt-2 text-sm text-muted-foreground">Note: {notes}</div>}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-end mt-8 text-sm">
                <div>
                  <div className="text-muted-foreground">Generated on {formatDateIndian(new Date())}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">For {company?.company_name || 'Our Company'}</div>
                  {(company as any)?.authorized_signatory_url && (
                    <div className="mt-4 mb-4">
                      <img 
                        src={(company as any).authorized_signatory_url} 
                        alt="Authorized Signatory" 
                        className="max-w-32 max-h-16 object-contain mx-auto" 
                      />
                    </div>
                  )}
                  <div className="mt-4">
                    <div className="border-b w-40 mx-auto"></div>
                    <div className="font-bold text-base mt-2">Authorized Signatory</div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Receipt Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Edit Receipt — {editingReceipt?.receipt_number}</DialogTitle>
              <DialogDescription>
                Update payment details and save changes to this receipt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Receipt Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Receipt Number</Label>
                  <Input value={editingReceipt?.receipt_number || ''} disabled />
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={editingReceipt?.reference_number || ''} disabled />
                </div>
                <div>
                  <Label>Customer</Label>
                  <Input value={editingReceipt?.customers?.company_name || editingReceipt?.customer_name || ''} disabled />
                </div>
                <div>
                  <Label>Entry Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" /> {formatDateIndian(editDate)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Calendar mode="single" selected={editDate} onSelect={(d) => d && setEditDate(d)} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input 
                    type="number" 
                    value={editAmount} 
                    onChange={(e) => setEditAmount(e.target.value)} 
                    placeholder="₹" 
                  />
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={editPaymentMode} onValueChange={setEditPaymentMode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Type</Label>
                  <Select value={editPaymentType} onValueChange={setEditPaymentType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Advance">Advance</SelectItem>
                      <SelectItem value="Partial">Partial</SelectItem>
                      <SelectItem value="Full">Full</SelectItem>
                      <SelectItem value="Balance">Balance</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                      <SelectItem value="Refund">Refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference / UTR / Txn ID</Label>
                  <Input 
                    value={editReferenceId} 
                    onChange={(e) => setEditReferenceId(e.target.value)} 
                    placeholder="Optional" 
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Verified By</Label>
                  <Input 
                    value={editVerifiedBy} 
                    onChange={(e) => setEditVerifiedBy(e.target.value)} 
                    placeholder="Verifier name" 
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Notes</Label>
                  <Input 
                    value={editNotes} 
                    onChange={(e) => setEditNotes(e.target.value)} 
                    placeholder="Optional notes" 
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditDialog(false)}
                  disabled={savingReceipt}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveReceipt} 
                  disabled={!editAmount || savingReceipt}
                >
                  {savingReceipt ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}


