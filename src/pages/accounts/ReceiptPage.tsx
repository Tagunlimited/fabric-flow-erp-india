import { useEffect, useMemo, useRef, useState } from 'react';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentType, setPaymentType] = useState('Advance');
  const [amount, setAmount] = useState<string>('');
  const [referenceId, setReferenceId] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [txns, setTxns] = useState<any[]>([]);
  const [loadingTxns, setLoadingTxns] = useState<boolean>(false);

  // When customerId changes, load basic customer details
  useEffect(() => {
    const run = async () => {
      if (!customerId) { setCustomer(null); return; }
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      setCustomer((data || null) as Customer | null);
      setSelected(null);
      setRefSearch('');
      fetchReceipts();
    };
    run();
  }, [customerId]);

  const fetchReceipts = async () => {
    try {
      setLoadingTxns(true);
      // First try: full select with status and join to customers
      let query = supabase
        .from('receipts')
        .select('id, created_at, receipt_number, reference_number, reference_type, amount, payment_mode, payment_type, status, customer_id, customers(company_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      let resp = customerId ? await query.eq('customer_id', customerId) : await query;
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

  const handleGenerate = async () => {
    if (!selected || !amount) {
      toast.error('Please select a reference and enter amount');
      return;
    }

    // Generate receipt number: RCP/YY-YY/MON/SEQ
    const now = new Date();
    const fyStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    const fyEnd = fyStart + 1;
    const fyStr = `${fyStart.toString().slice(-2)}-${fyEnd.toString().slice(-2)}`;
    const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    let seq = 1;
    try {
      const { data } = await supabase
        .from('receipts')
        .select('receipt_number')
        .ilike('receipt_number', `RCP/${fyStr}/${month}/%`)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const m = data[0].receipt_number.match(/(\d+)$/);
        if (m) seq = parseInt(m[1]) + 1;
      }
    } catch {}
    const seqStr = seq.toString().padStart(3, '0');
    const newReceiptNumber = `RCP/${fyStr}/${month}/${seqStr}`;
    setReceiptNumber(newReceiptNumber);

    // Persist receipt and update balances
    const receiptAmount = Number(amount);
    try {
      const payload: any = {
        receipt_number: newReceiptNumber,
        reference_type: selected.type,
        reference_id: selected.id,
        reference_number: selected.number,
        customer_id: selected.customer_id,
        payment_mode: paymentMode,
        payment_type: paymentType,
        amount: receiptAmount,
        reference_txn_id: referenceId || null,
        entry_date: date.toISOString(),
        verified_by: verifiedBy || null,
        notes: notes || null,
      };
      const { error: insertErr } = await supabase.from('receipts').insert(payload);
      if (insertErr) console.warn('Receipts insert warning:', insertErr.message);

      // Decrease order balance_amount
      if (selected.type === 'order') {
        const newOrderBalance = Math.max((selected.balance_amount || 0) - receiptAmount, 0);
        const { error: updErr } = await supabase
          .from('orders')
          .update({ balance_amount: newOrderBalance })
          .eq('id', selected.id);
        if (updErr) console.warn('Order balance update warning:', updErr.message);
        // Reflect updated pending in UI
        setSelected({ ...selected, balance_amount: newOrderBalance });
      }

      // Decrease customer's total pending (if a field exists like customers.pending_amount)
      try {
        const { data: custData } = await supabase
          .from('customers')
          .select('pending_amount')
          .eq('id', selected.customer_id)
          .single();
        if (custData && typeof custData.pending_amount === 'number') {
          const newCustPending = Math.max(custData.pending_amount - receiptAmount, 0);
          await supabase.from('customers').update({ pending_amount: newCustPending }).eq('id', selected.customer_id);
        }
      } catch {}
    } catch (e) {
      // ignore errors if table or columns are missing
    }

    setOpenPreview(true);
    // Refresh txn list (debounced to let DB commit)
    setTimeout(() => { fetchReceipts(); }, 300);
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a5'); // A5 landscape
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const targetWidth = pdfWidth - margin * 2;
      const targetHeight = pdfHeight - margin * 2;
      const imgAspect = canvas.width / canvas.height;
      let outWidth = targetWidth;
      let outHeight = outWidth / imgAspect;
      if (outHeight > targetHeight) {
        outHeight = targetHeight;
        outWidth = outHeight * imgAspect;
      }
      const x = (pdfWidth - outWidth) / 2;
      const y = (pdfHeight - outHeight) / 2;
      pdf.addImage(imgData, 'PNG', x, y, outWidth, outHeight);
      pdf.save(`Receipt-${selected?.number}.pdf`);
      toast.success('Receipt PDF exported');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  };

  // Edit and Cancel handlers
  const handleEditReceipt = async (r: any) => {
    // Basic inline edit example: reopen preview with values
    setReceiptNumber(r.receipt_number);
    setAmount(String(r.amount));
    setPaymentMode(r.payment_mode);
    setPaymentType(r.payment_type);
    setReferenceId(r.reference_txn_id || '');
    setVerifiedBy(r.verified_by || '');
    setNotes(r.notes || '');
    setOpenPreview(true);
  };

  const handleCancelReceipt = async (r: any) => {
    try {
      const confirmCancel = window.confirm(`Cancel receipt ${r.receipt_number}? This will restore pending amount.`);
      if (!confirmCancel) return;
      // Mark receipt as cancelled
      const { error } = await supabase
        .from('receipts')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) throw error;

      // Attempt to restore order balance if reference is order
      if (r.reference_type === 'order') {
        // Fetch order id by reference_number if needed
        const { data: ord } = await supabase
          .from('orders')
          .select('id, balance_amount')
          .eq('order_number', r.reference_number)
          .single();
        if (ord) {
          await supabase
            .from('orders')
            .update({ balance_amount: (Number(ord.balance_amount) || 0) + Number(r.amount) })
            .eq('id', ord.id);
        }
        // Customer pending will be recalculated by trigger if migration applied
      }
      toast.success('Receipt cancelled');
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
      setPaymentMode(r.payment_mode || 'UPI');
      setPaymentType(r.payment_type || 'Advance');
      setReferenceId(r.reference_txn_id || '');
      setVerifiedBy(r.verified_by || '');
      setNotes(r.notes || '');
      setDate(new Date(r.created_at));
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

  return (
    <ErpLayout>
      <div className="space-y-6">
        <Tabs defaultValue="view" className="w-full">
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
                          <th className="p-2 text-left border">Status</th>
                          <th className="p-2 text-left border">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txns.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={async () => { await handleOpenReceipt(r); }}>
                            <td className="p-2 border">{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                            <td className="p-2 border font-medium">{r.receipt_number}</td>
                            <td className="p-2 border">{r.customers?.company_name || r.customer_name || '-'}</td>
                            <td className="p-2 border">{r.reference_number}</td>
                            <td className="p-2 border uppercase">{r.reference_type}</td>
                            <td className="p-2 border text-right">₹{Number(r.amount).toLocaleString()}</td>
                            <td className="p-2 border">{r.payment_mode}</td>
                            <td className="p-2 border capitalize">{r.status || 'active'}</td>
                            <td className="p-2 border space-x-2">
                              <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await handleEditReceipt(r); }}>Edit</Button>
                              <Button variant="outline" size="sm" className="text-destructive" onClick={async (e) => { e.stopPropagation(); await handleCancelReceipt(r); }}>Cancel</Button>
                            </td>
                          </tr>
                        ))}
                        {!loadingTxns && txns.length === 0 && (
                          <tr>
                            <td className="p-4 text-center text-muted-foreground" colSpan={6}>No receipts found.</td>
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
                                  <span className="ml-auto text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString('en-IN')}</span>
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
                    Pending Amount: <span className="font-semibold text-amber-700">₹{(selected.balance_amount ?? 0).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Entry date */}
              <div>
                <Label className="mb-1 block">Entry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" /> {date.toLocaleDateString('en-IN')}
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
                  <Button onClick={handleGenerate} disabled={!selected || !amount}>Generate Receipt</Button>
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
              <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={handleExportPDF}><Download className="w-4 h-4 mr-1" /> Export PDF</Button>
            </div>
            <div ref={printRef} className="bg-white" style={{ width: '210mm', minHeight: '148mm', padding: '10mm', margin: '0 auto' }}>
              <style>{`
                @page { size: A5 landscape; margin: 10mm; }
                @media print {
                  #receipt-print { width: 210mm !important; min-height: 148mm !important; }
                }
              `}</style>
              {/* Company header */}
              <div className="flex justify-between items-start border-b pb-3 mb-3">
                <div className="flex items-center gap-3">
                  {(company as any)?.logo_url && (
                    <img src={(company as any).logo_url} alt="Logo" className="w-12 h-12 object-contain" />
                  )}
                  <div>
                    <div className="text-xl font-bold">{company?.company_name || 'Our Company'}</div>
                    <div className="text-xs text-muted-foreground">{company?.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">RECEIPT</div>
                  <div className="text-xs text-muted-foreground">{date.toLocaleDateString('en-IN')}</div>
                </div>
              </div>

              {/* Receipt meta */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                <div className="space-y-1">
                  <div><span className="font-medium">Receipt No.:</span> {receiptNumber}</div>
                  <div><span className="font-medium">Reference:</span> {selected?.number} ({selected?.type})</div>
                  <div><span className="font-medium">Customer:</span> {customer?.company_name || '-'}</div>
                  <div><span className="font-medium">Payment Mode:</span> {paymentMode}</div>
                  <div><span className="font-medium">Payment Type:</span> {paymentType}</div>
                </div>
                <div className="space-y-1 text-right">
                  <div><span className="font-medium">Amount:</span> ₹{Number(amount || 0).toLocaleString()}</div>
                  {referenceId && <div><span className="font-medium">Reference ID:</span> {referenceId}</div>}
                  {verifiedBy && <div><span className="font-medium">Verified By:</span> {verifiedBy}</div>}
                </div>
              </div>

              {/* Acknowledgement */}
              <div className="border rounded p-3 text-sm">
                Received a sum of <span className="font-semibold">₹{Number(amount || 0).toLocaleString()}</span> from
                {' '}<span className="font-semibold">{customer?.company_name || 'Customer'}</span> towards
                {' '}<span className="font-semibold">{paymentType}</span> against reference
                {' '}<span className="font-semibold">{selected?.number}</span>.
                {notes && <div className="mt-1 text-xs text-muted-foreground">Note: {notes}</div>}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-end mt-8 text-xs">
                <div>
                  <div className="text-muted-foreground">Generated on {new Date().toLocaleDateString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">For {company?.company_name || 'Our Company'}</div>
                  <div className="mt-8 border-b w-40"></div>
                  <div className="text-muted-foreground">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}


