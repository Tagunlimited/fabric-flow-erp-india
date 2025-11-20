import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatDateIndian } from '@/lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Download, Printer, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
}

interface Customer {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
}

export default function ReceiptPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const location = useLocation();
  const navState: any = location.state as any;
  const prefill: any = navState?.prefill;
  const initialTab: 'view' | 'create' = navState?.tab === 'create' ? 'create' : 'view';

  // Customer selection
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState<string>('');

  // Reference selection (dependent on customer)
  const [refSearch, setRefSearch] = useState('');
  const [results, setResults] = useState<ReferenceResult[]>([]);
  const [selected, setSelected] = useState<ReferenceResult | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);
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
  
  // Credit order state
  const [isCreditOrder, setIsCreditOrder] = useState(false);

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
  }, []);

  useEffect(() => {
    const prefillFromQuotation = async () => {
      if (!prefill || prefill.type !== 'order' || !prefill.id) return;
      try {
        // Fetch order and customer to prefill
        const { data: ord } = await supabase
          .from('orders')
          .select('id, order_number, order_date, customer_id, final_amount, balance_amount')
          .eq('id', prefill.id)
          .single();
        if (!ord) return;
        const { data: cust } = await supabase
          .from('customers')
          .select('*')
          .eq('id', ord.customer_id)
          .single();
        setCustomer((cust || null) as Customer | null);
        setCustomerId(ord.customer_id);
        const sel = {
          id: ord.id,
          type: 'order' as const,
          number: ord.order_number,
          date: ord.order_date,
          customer_id: ord.customer_id,
          customer_name: cust?.company_name,
          total_amount: ord.final_amount,
          balance_amount: ord.balance_amount,
        };
        setSelected(sel);
        setReceiptReference(ord.order_number);
        setAmount(String(prefill.amount ?? ord.final_amount ?? ''));
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
        .select('id, created_at, receipt_number, reference_number, reference_type, amount, payment_mode, payment_type, customer_id, customers(company_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      let resp: any = customerId ? await query.eq('customer_id', customerId) : await query;
      if (resp.error) {
        // Fallback: older schema without status or relationship
        console.warn('Receipts select with join/status failed, falling back:', resp.error.message);
        let fallback = supabase
          .from('receipts')
          .select('id, created_at, receipt_number, reference_number, reference_type, amount, payment_mode, payment_type, customer_id')
          .order('created_at', { ascending: false })
          .limit(50);
        resp = customerId ? await fallback.eq('customer_id', customerId) : await fallback;
      }
      if (resp.error) throw resp.error;
      let rows = resp.data || [];
      // If customer join is missing, enrich with a lookup
      const needsLookup = rows.some((r: any) => !r.customers?.company_name);
      if (needsLookup && rows.length > 0) {
        const ids = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean)));
        if (ids.length > 0) {
          const { data: custs } = await supabase
            .from('customers')
            .select('id, company_name')
            .in('id', ids);
          const idToName: Record<string, string> = {};
          (custs || []).forEach((c: any) => { idToName[c.id] = c.company_name; });
          rows = rows.map((r: any) => ({
            ...r,
            customer_name: idToName[r.customer_id] || r.customer_name,
          }));
        }
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
          .select('id, order_number, customer_id, order_date, final_amount, balance_amount')
          .eq('customer_id', customer.id)
          .limit(20);
        if (refSearch) {
          ordersQuery = ordersQuery.ilike('order_number', `%${refSearch}%`);
        }
        const { data: orders } = await ordersQuery;
        if (orders) {
          orders.forEach((o: any) => res.push({
            id: o.id,
            type: 'order',
            number: o.order_number,
            date: o.order_date,
            customer_id: o.customer_id,
            customer_name: customer.company_name,
            total_amount: o.final_amount,
            balance_amount: o.balance_amount,
          }));
        }

        setResults(res);
      } catch (e) {
        setResults([]);
      }
    };
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [customer, refSearch]);

  const handleGenerate = async (isCredit: boolean = false) => {
    if (!selected || (!amount && !isCredit)) {
      toast.error('Please select an order and enter amount');
      return;
    }

    try {
      setGeneratingReceipt(true);
      console.log('Starting receipt generation with:', { selected, amount, customer });

      // Validate amount doesn't exceed order total
      if (selected.type === 'order') {
        console.log('Validating order amount...');
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount')
          .eq('order_number', selected.number)
          .single();

        if (orderError) {
          console.error('Error fetching order:', orderError);
          toast.error('Failed to fetch order details');
          return;
        }

        if (order) {
          console.log('Order found:', order);
          // Calculate total existing receipts for this order
          const { data: existingReceipts, error: receiptsError } = await supabase
            .from('receipts')
            .select('amount')
            .eq('reference_number', selected.number)
            .eq('reference_type', 'order');

          if (receiptsError) {
            console.error('Error fetching existing receipts:', receiptsError);
            toast.error('Failed to validate existing receipts');
            return;
          }

          const totalExistingReceipts = (existingReceipts || []).reduce((sum, r) => sum + Number(r.amount), 0);
          const totalWithNewReceipt = totalExistingReceipts + Number(amount || 0);

          console.log('Receipt validation:', {
            totalExistingReceipts,
            newAmount: Number(amount || 0),
            totalWithNewReceipt,
            orderAmount: Number(order.final_amount),
            isCredit
          });

          // Skip overpayment validation for credit orders (₹0 amount)
          if (!isCredit && totalWithNewReceipt > Number(order.final_amount)) {
            toast.error(`Total receipts (${formatCurrency(totalWithNewReceipt)}) cannot exceed order amount (${formatCurrency(Number(order.final_amount))})`);
            return;
          }
        } else {
          console.warn('Order not found for validation');
        }
      }

      // Receipt number will be auto-generated by database trigger
      console.log('Receipt number will be auto-generated by database...');

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

      console.log('Creating receipt with payload:', payload);

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

      console.log('Receipt created successfully:', newReceipt);

      // Update order balance if reference is order
      if (selected.type === 'order') {
        console.log('Updating order balance...');
        const { data: order, error: orderUpdateError } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount, order_type, status')
          .eq('order_number', selected.number)
          .single();

        if (orderUpdateError) {
          console.error('Error fetching order for balance update:', orderUpdateError);
        } else if (order) {
          // Calculate total receipts for this order (including the new one)
          const { data: allReceipts, error: receiptsError } = await supabase
            .from('receipts')
            .select('amount')
            .eq('reference_number', selected.number)
            .eq('reference_type', 'order');

          if (receiptsError) {
            console.error('Error fetching receipts for balance calculation:', receiptsError);
          } else {
            const totalReceipts = (allReceipts || []).reduce((sum, r) => sum + Number(r.amount), 0);
            const newBalance = Number(order.final_amount) - totalReceipts;
            
            console.log('Balance calculation:', {
              finalAmount: Number(order.final_amount),
              totalReceipts,
              newBalance
            });

            // Prepare update object
            const updateData: any = { balance_amount: newBalance };
            
            // For readymade orders, update status from 'pending' to 'confirmed' when receipt is created
            if (order.order_type === 'readymade' && order.status === 'pending') {
              updateData.status = 'confirmed';
              console.log('Updating readymade order status from pending to confirmed');
            }

            const { error: balanceUpdateError } = await supabase
              .from('orders')
              .update(updateData)
              .eq('id', order.id);

            if (balanceUpdateError) {
              console.error('Error updating order balance:', balanceUpdateError);
            } else {
              console.log('Order balance updated successfully');
              if (updateData.status === 'confirmed') {
                console.log('Order status updated to confirmed');
              }
            }
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
      setOpenPreview(true);

      // Refresh order data to update UI
      await refreshOrderData(selected.number);

      // Clear form
      setAmount('');
      setReferenceId('');
      setVerifiedBy('');
      setNotes('');
      setSelected(null);

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
      // Wait for images to load before printing
      const images = printRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map((img) => {
        return new Promise((resolve) => {
          if (img.complete) {
            resolve(true);
          } else {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(true); // Resolve even if image fails
          }
        });
      });
      await Promise.all(imagePromises);
      
      // Create a print window with the exact same content and styling as PDF export
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups to print');
        return;
      }

      const printContent = printRef.current.innerHTML;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt ${receiptNumber}</title>
            <meta charset="utf-8">
            <style>
              @page { 
                size: A5 landscape; 
                margin: 3mm; 
              }
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body { 
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                margin: 0; 
                padding: 0; 
                color: #000;
                background: #fff;
              }
              .bg-white {
                background-color: #fff;
              }
              .flex {
                display: flex;
              }
              .justify-between {
                justify-content: space-between;
              }
              .items-start {
                align-items: flex-start;
              }
              .items-center {
                align-items: center;
              }
              .items-end {
                align-items: flex-end;
              }
              .text-right {
                text-align: right;
              }
              .border-b {
                border-bottom: 1px solid #e5e7eb;
              }
              .border {
                border: 1px solid #e5e7eb;
              }
              .rounded {
                border-radius: 0.25rem;
              }
              .grid {
                display: grid;
              }
              .grid-cols-2 {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .gap-3 {
                gap: 0.75rem;
              }
              .gap-4 {
                gap: 1rem;
              }
              .pb-3 {
                padding-bottom: 0.75rem;
              }
              .mb-3 {
                margin-bottom: 0.75rem;
              }
              .mb-4 {
                margin-bottom: 1rem;
              }
              .mt-2 {
                margin-top: 0.5rem;
              }
              .mt-4 {
                margin-top: 1rem;
              }
              .mt-8 {
                margin-top: 2rem;
              }
              .p-3 {
                padding: 0.75rem;
              }
              .p-4 {
                padding: 1rem;
              }
              .space-y-1 > * + * {
                margin-top: 0.25rem;
              }
              .text-2xl {
                font-size: 1.5rem;
                line-height: 2rem;
              }
              .text-xl {
                font-size: 1.25rem;
                line-height: 1.75rem;
              }
              .text-lg {
                font-size: 1.125rem;
                line-height: 1.75rem;
              }
              .text-base {
                font-size: 1rem;
                line-height: 1.5rem;
              }
              .text-sm {
                font-size: 0.875rem;
                line-height: 1.25rem;
              }
              .text-xs {
                font-size: 0.75rem;
                line-height: 1rem;
              }
              .font-bold {
                font-weight: 700;
              }
              .font-semibold {
                font-weight: 600;
              }
              .font-medium {
                font-weight: 500;
              }
              .text-muted-foreground {
                color: #6b7280;
              }
              .object-contain {
                object-fit: contain;
              }
              .mx-auto {
                margin-left: auto;
                margin-right: auto;
              }
              .w-12 {
                width: 3rem;
              }
              .w-16 {
                width: 4rem;
              }
              .h-12 {
                height: 3rem;
              }
              .h-16 {
                height: 4rem;
              }
              .max-w-32 {
                max-width: 8rem;
              }
              .max-h-16 {
                max-height: 4rem;
              }
              .w-40 {
                width: 10rem;
              }
              .receipt-print-container { 
                width: 210mm; 
                min-height: 148mm; 
                padding: 3mm; 
                margin: 0 auto;
                background: #fff;
              }
              img {
                max-width: 100%;
                height: auto;
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Wait for window to fully load before printing
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          // Don't close immediately - let user interact with print dialog
          // Window will close when print dialog is dismissed
        }, 100);
      };
      
      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (printWindow.document.readyState === 'complete') {
          printWindow.focus();
          printWindow.print();
        }
      }, 500);
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
          .single();

        if (order) {
          // Calculate total receipts for this order (excluding current receipt)
          const { data: existingReceipts } = await supabase
            .from('receipts')
            .select('amount')
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
          .single();

        if (order) {
          // Calculate total receipts for this order (excluding current receipt, then add new amount)
          const { data: existingReceipts } = await supabase
            .from('receipts')
            .select('amount')
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
      // Mark receipt as cancelled
      const { error } = await supabase
        .from('receipts')
        .delete()
        .eq('id', r.id);
      if (error) throw error;

      // Attempt to restore order balance if reference is order
      if (r.reference_type === 'order') {
        // Fetch order id by reference_number if needed
        const { data: ord } = await supabase
          .from('orders')
          .select('id, final_amount, balance_amount')
          .eq('order_number', r.reference_number)
          .single();
        if (ord) {
          // Calculate total receipts for this order (excluding the cancelled receipt)
          const { data: remainingReceipts } = await supabase
            .from('receipts')
            .select('amount')
            .eq('reference_number', r.reference_number)
            .eq('reference_type', 'order')
            .neq('id', r.id);

          const totalRemainingReceipts = (remainingReceipts || []).reduce((sum, receipt) => sum + Number(receipt.amount), 0);
          const newBalance = Number(ord.final_amount) - totalRemainingReceipts;

          console.log('Cancel balance calculation:', {
            finalAmount: Number(ord.final_amount),
            cancelledAmount: Number(r.amount),
            totalRemainingReceipts,
            newBalance
          });

          await supabase
            .from('orders')
            .update({ balance_amount: newBalance })
            .eq('id', ord.id);
        }
        // Customer pending will be recalculated by trigger if migration applied
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
      if (r.reference_type === 'order' && r.reference_number) {
        const { data } = await supabase
          .from('orders')
          .select('id, customer_id, order_number, order_date, final_amount, balance_amount')
          .eq('order_number', r.reference_number)
          .single();
        ord = data;
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
        setSelected({
          id: ord.id,
          type: 'order',
          number: ord.order_number,
          date: ord.order_date,
          customer_id: ord.customer_id,
          customer_name: customer?.company_name,
          total_amount: ord.final_amount,
          balance_amount: ord.balance_amount,
        });
      } else {
        setSelected({
          id: '',
          type: 'order',
          number: r.reference_number || '',
          date: r.created_at,
          customer_id: r.customer_id,
          customer_name: customer?.company_name,
          total_amount: Number(r.amount) || 0,
          balance_amount: undefined,
        });
      }
      setOpenPreview(true);
    } catch (e) {
      setOpenPreview(true);
    }
  };

  // Refresh order data to update UI state
  const refreshOrderData = async (orderNumber: string) => {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, customer_id, order_date, final_amount, balance_amount')
        .eq('order_number', orderNumber)
        .single();

      if (order && selected && selected.number === orderNumber) {
        // Update the selected order with fresh data
        setSelected({
          ...selected,
          total_amount: order.final_amount,
          balance_amount: order.balance_amount,
        });

        // Also update the results array to reflect the new balance
        setResults(prevResults => 
          prevResults.map(r => 
            r.number === orderNumber 
              ? { ...r, total_amount: order.final_amount, balance_amount: order.balance_amount }
              : r
          )
        );
      }
    } catch (error) {
      console.error('Error refreshing order data:', error);
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList>
            <TabsTrigger value="view">View Txn</TabsTrigger>
            <TabsTrigger value="create">Create Receipt</TabsTrigger>
          </TabsList>

          {/* View Txn */}
          <TabsContent value="view">
            <Card>
              <CardHeader>
                <CardTitle>Receipt Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted-foreground">{loadingTxns ? 'Loading...' : `${txns.length} recent receipts`}</div>
                    <Button variant="outline" onClick={fetchReceipts}>Refresh</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left border">Date</th>
                          <th className="p-2 text-left border">Receipt #</th>
                          <th className="p-2 text-left border">Customer</th>
                          <th className="p-2 text-left border">Reference</th>
                          <th className="p-2 text-left border">Type</th>
                          <th className="p-2 text-right border">Amount</th>
                          <th className="p-2 text-left border">Mode</th>
                          <th className="p-2 text-left border">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txns.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={async () => { await handleOpenReceipt(r); }}>
                            <td className="p-2 border">{formatDateIndian(r.created_at)}</td>
                            <td className="p-2 border font-medium">
                              {r.receipt_number}
                              {(r.payment_mode === 'Credit' || r.payment_type === 'Credit' || Number(r.amount) === 0) && (
                                <Badge className="ml-2 bg-orange-100 text-orange-700 border-orange-300">CREDIT</Badge>
                              )}
                            </td>
                            <td className="p-2 border">{r.customers?.company_name || r.customer_name || '-'}</td>
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
                        {!loadingTxns && txns.length === 0 && (
                          <tr>
                            <td className="p-4 text-center text-muted-foreground" colSpan={8}>No receipts found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Create Receipt */}
          <TabsContent value="create">
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
                                <CommandItem key={`order-${r.id}`} onSelect={() => { setSelected(r); setRefOpen(false); }} className="flex items-center gap-2">
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
                  <div className="text-xs text-muted-foreground mt-1">
                    Pending Amount: <span className="font-semibold text-amber-700">{formatCurrency(selected.balance_amount ?? 0)}</span>
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
          </TabsContent>
        </Tabs>

        {/* Preview Dialog */}
        <Dialog open={openPreview} onOpenChange={setOpenPreview}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Receipt Preview — {receiptNumber}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={handleExportPDF}><Download className="w-4 h-4 mr-1" /> Export PDF</Button>
            </div>
            <div ref={printRef} className="bg-white receipt-print-container" style={{ width: '210mm', minHeight: '148mm', padding: '3mm', margin: '0 auto' }}>
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
                    width: 210mm !important;
                    min-height: 148mm !important;
                    padding: 3mm !important;
                    margin: 0 !important;
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
                  <div><span className="font-medium">Payment Mode:</span> {paymentMode}</div>
                  <div><span className="font-medium">Payment Type:</span> {paymentType}</div>
                </div>
                <div className="space-y-1 text-right">
                  <div><span className="font-medium">Amount:</span> {formatCurrency(receiptAmount)}</div>
                  {referenceId && <div><span className="font-medium">Reference ID:</span> {referenceId}</div>}
                  {verifiedBy && <div><span className="font-medium">Verified By:</span> {verifiedBy}</div>}
                </div>
              </div>

              {/* Acknowledgement */}
              <div className="border rounded p-4 text-base">
                Received a sum of <span className="font-semibold">{formatCurrency(receiptAmount)}</span> from
                {' '}<span className="font-semibold">{customer?.company_name || 'Customer'}</span> towards
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


