import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';

type ManualQuotationHeader = {
  id: string;
  quotation_number: string;
  quotation_date: string;
  status: string;
  customer_id: string | null;
  sales_manager: string | null;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  balance_amount: number;
  converted_order_id: string | null;
  customer?: { company_name?: string; phone?: string } | null;
  employee?: { full_name?: string } | null;
};

function formatCompanyName(name?: string | null): string {
  if (!name) return 'Company';
  return name;
}

function numberToWordsIndian(amount: number): string {
  const num = Math.floor(Number(amount || 0));
  if (!Number.isFinite(num) || num <= 0) return 'Zero Only/-';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const toWords = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${toWords(n % 100)}` : ''}`;
    return '';
  };
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  const parts = [
    crore ? `${toWords(crore)} Crore` : '',
    lakh ? `${toWords(lakh)} Lakh` : '',
    thousand ? `${toWords(thousand)} Thousand` : '',
    rest ? toWords(rest) : '',
  ].filter(Boolean);
  return `${parts.join(' ')} Only/-`;
}

export default function ManualQuotationDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<ManualQuotationHeader | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [fabricNameById, setFabricNameById] = useState<Record<string, string>>({});

  const canConvert = useMemo(() => {
    if (!header) return false;
    return !header.converted_order_id;
  }, [header]);

  const computedItems = useMemo(() => {
    return items.map((row) => {
      const qty = Number(row.quantity || 0);
      const unitPrice = Number(row.unit_price || 0);
      const amount = Number(row.total_price || qty * unitPrice || 0);
      const gstRate = Number(row.gst_rate || 0);
      const gstAmount = (amount * gstRate) / 100;
      const lineTotal = amount + gstAmount;
      return {
        ...row,
        qty,
        unitPrice,
        amount,
        gstRate,
        gstAmount,
        lineTotal,
      };
    });
  }, [items]);

  const subtotal = useMemo(
    () => computedItems.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [computedItems]
  );
  const gstTotal = useMemo(
    () => computedItems.reduce((sum, row) => sum + Number(row.gstAmount || 0), 0),
    [computedItems]
  );
  const additionalChargesTotal = useMemo(
    () => charges.reduce((sum, c) => sum + Number(c.amount_incl_gst || 0), 0),
    [charges]
  );
  const grandTotal = subtotal + gstTotal + additionalChargesTotal;

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data: h, error: hErr } = await supabase
        .from('manual_quotations' as any)
        .select('*')
        .eq('id', id)
        .single();
      if (hErr) throw hErr;

      const [customerRes, employeeRes, itemRes, chargeRes] = await Promise.all([
        h?.customer_id
          ? supabase.from('customers').select('company_name, phone').eq('id', h.customer_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        h?.sales_manager
          ? supabase.from('employees').select('full_name').eq('id', h.sales_manager).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from('manual_quotation_items' as any)
          .select('*')
          .eq('manual_quotation_id', id)
          .order('item_order', { ascending: true }),
        supabase
          .from('manual_quotation_additional_charges' as any)
          .select('*')
          .eq('manual_quotation_id', id)
          .order('created_at', { ascending: true }),
      ]);

      setHeader({
        ...(h as ManualQuotationHeader),
        customer: customerRes?.data || null,
        employee: employeeRes?.data || null,
      });
      const loadedItems = (itemRes.data as any[]) || [];
      setItems(loadedItems);
      setCharges((chargeRes.data as any[]) || []);

      const fabricIds = Array.from(new Set(loadedItems.map((row) => row.fabric_id).filter(Boolean)));
      if (fabricIds.length > 0) {
        const { data: fabricsData } = await supabase
          .from('fabric_master')
          .select('id, fabric_name')
          .in('id', fabricIds as any);
        const map: Record<string, string> = {};
        (fabricsData || []).forEach((fabric: any) => {
          if (fabric?.id) map[fabric.id] = fabric.fabric_name || '';
        });
        setFabricNameById(map);
      } else {
        setFabricNameById({});
      }
    } catch (error) {
      console.error('Failed to load manual quotation detail', error);
      toast.error('Failed to load manual quotation detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [id]);

  const handleConvertToOrder = async () => {
    if (!id || !canConvert) return;
    navigate('/orders', {
      state: {
        openCreateFromManualQuotationId: id,
      },
    });
  };

  const downloadQuotationPdf = async () => {
    if (!printRef.current || !header) throw new Error('Print reference not available');
    try {
      const element = printRef.current;
      const originalStyles = {
        position: element.style.position,
        left: element.style.left,
        top: element.style.top,
        visibility: element.style.visibility,
        display: element.style.display,
        height: element.style.height,
        width: element.style.width,
        maxWidth: element.style.maxWidth,
        zIndex: element.style.zIndex,
      };
      const originalClasses = element.className;

      element.className = element.className.replace('print-only', '').trim();
      element.style.position = 'fixed';
      element.style.left = '-9999px';
      element.style.top = '0';
      element.style.visibility = 'visible';
      element.style.display = 'block';
      element.style.height = 'auto';
      element.style.width = '210mm';
      element.style.maxWidth = '210mm';
      element.style.zIndex = '9999';
      element.style.opacity = '1';
      element.style.pointerEvents = 'none';
      await new Promise((resolve) => setTimeout(resolve, 200));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        imageTimeout: 0,
        backgroundColor: '#ffffff',
        removeContainer: false,
        width: element.scrollWidth || element.offsetWidth || 794,
        height: element.scrollHeight || element.offsetHeight || 1123,
        windowWidth: element.scrollWidth || element.offsetWidth || 794,
        windowHeight: element.scrollHeight || element.offsetHeight || 1123,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 1;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = pdfHeight - margin * 2;
      const aspect = canvas.width / Math.max(canvas.height, 1);
      let outWidth = contentWidth;
      let outHeight = outWidth / aspect;
      if (outHeight > contentHeight) {
        outHeight = contentHeight;
        outWidth = outHeight * aspect;
      }
      const x = margin + (contentWidth - outWidth) / 2;
      const y = margin + (contentHeight - outHeight) / 2;
      pdf.addImage(imgData, 'JPEG', x, y, outWidth, outHeight);
      pdf.save(`Quotation-${header.quotation_number || 'manual'}.pdf`);
      element.className = originalClasses;
      element.style.position = originalStyles.position || '';
      element.style.left = originalStyles.left || '';
      element.style.top = originalStyles.top || '';
      element.style.visibility = originalStyles.visibility || '';
      element.style.display = originalStyles.display || '';
      element.style.height = originalStyles.height || '';
      element.style.width = originalStyles.width || '';
      element.style.maxWidth = originalStyles.maxWidth || '';
      element.style.zIndex = originalStyles.zIndex || '';
      element.style.opacity = '';
      element.style.pointerEvents = '';
    } catch (error) {
      throw error;
    }
  };

  const handleExportPdf = async () => {
    try {
      toast.loading('Generating PDF...');
      await downloadQuotationPdf();
      toast.dismiss();
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('Failed to export manual quotation PDF', error);
      toast.dismiss();
      toast.error('Failed to export PDF');
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold">Quotation</h1>
            <p className="text-muted-foreground mt-1">Read-only quotation details and conversion workflow</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} disabled={!header}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={!header}>
              <Download className="w-4 h-4 mr-1" /> Export PDF
            </Button>
            {header && !header.converted_order_id && (
              <Button variant="outline" onClick={() => navigate(`/accounts/manual-quotations/${header.id}/edit`)}>
                Edit
              </Button>
            )}
            <Button onClick={handleConvertToOrder} disabled={!canConvert}>
              Convert to Order
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {loading ? 'Loading...' : `Quotation #${header?.quotation_number || '-'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-6">
              <div><span className="text-muted-foreground">Customer:</span> {header?.customer?.company_name || '-'}</div>
              <div><span className="text-muted-foreground">Mobile:</span> {header?.customer?.phone || '-'}</div>
              <div><span className="text-muted-foreground">Sales Manager:</span> {header?.employee?.full_name || '-'}</div>
              <div><span className="text-muted-foreground">Date:</span> {header?.quotation_date || '-'}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary">{header?.status || '-'}</Badge></div>
              <div><span className="text-muted-foreground">Source:</span> <Badge variant="outline">manual</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Fabric</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={6}>No items found.</TableCell></TableRow>
                  ) : (
                    items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.product_description || '-'}</TableCell>
                        <TableCell>{(row.fabric_id && fabricNameById[row.fabric_id]) || '-'}</TableCell>
                        <TableCell>{row.color || '-'}</TableCell>
                        <TableCell className="text-right">{Number(row.quantity || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(row.unit_price || 0))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(row.total_price || 0))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Subtotal: {formatCurrency(Number(header?.subtotal || 0))}</div>
            <div>Tax: {formatCurrency(Number(header?.tax_amount || 0))}</div>
            {charges.map((c) => (
              <div key={c.id}>{c.particular}: {formatCurrency(Number(c.amount_incl_gst || 0))}</div>
            ))}
            <div className="font-semibold">Grand Total: {formatCurrency(Number(header?.total_amount || 0))}</div>
            <div>Balance: {formatCurrency(Number(header?.balance_amount || 0))}</div>
          </CardContent>
        </Card>

        <style>{`
          .print-only {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 1mm 1mm 1mm 1mm;
          }
          @media print {
            body * { visibility: hidden !important; }
            #quotation-print, #quotation-print * { visibility: visible !important; }
            #quotation-print {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              padding: 2mm !important;
              margin: 0 !important;
              font-size: 12px !important;
              line-height: 1.4 !important;
              background: white !important;
              box-sizing: border-box !important;
            }
            .print-only {
              display: block !important;
              visibility: visible !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
            }
            #quotation-print table {
              font-size: 10px !important;
              border-collapse: collapse !important;
              width: 100% !important;
            }
            #quotation-print th,
            #quotation-print td {
              border: 1px solid #9ca3af !important;
              padding: 3px 5px !important;
              font-size: 10px !important;
            }
          }
        `}</style>
        <div
          id="quotation-print"
          ref={printRef}
          className="bg-white print-only"
          aria-hidden="true"
          style={{
            padding: '2mm',
            width: '210mm',
            maxWidth: '210mm',
            margin: '0',
            position: 'absolute',
            left: '0',
            top: '0',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxWidth: '100%' }}>
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-3">
              <div className="flex items-center space-x-4">
                {company?.logo_url && (
                  <img src={company.logo_url} alt="Company Logo" className="w-24 h-24 object-contain" />
                )}
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">{formatCompanyName(company?.company_name)}</h1>
                  <p className="text-sm text-gray-600">{company?.address || 'Company Address'}</p>
                  {company?.contact_email && <p className="text-sm text-gray-600">Email: {company.contact_email}</p>}
                  {company?.contact_phone && <p className="text-sm text-gray-600">Phone: {company.contact_phone}</p>}
                  <p className="text-sm text-gray-600">{company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}</p>
                  {company?.gstin && <p className="text-sm text-gray-600">GSTIN: {company.gstin}</p>}
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-bold text-gray-800">QUOTATION</h2>
                <p className="text-sm text-gray-600">Quotation #: {header?.quotation_number || '-'}</p>
                <p className="text-sm text-gray-600">Date: {header?.quotation_date ? new Date(header.quotation_date).toLocaleDateString('en-IN') : '-'}</p>
                <p className="text-sm text-gray-600">Valid Until: {header?.quotation_date ? new Date(new Date(header.quotation_date).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN') : '-'}</p>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Bill To:</h3>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="font-semibold text-gray-800">{header?.customer?.company_name || 'Client Name'}</p>
                  <p className="text-sm text-gray-600">Mobile: {header?.customer?.phone || '—'}</p>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Details:</h3>
                <div className="bg-gray-50 p-4 rounded space-y-2">
                  <div><strong>Order Number:</strong> {header?.quotation_number || 'N/A'}</div>
                  <div><strong>Order Date:</strong> {header?.quotation_date ? new Date(header.quotation_date).toLocaleDateString('en-IN') : 'N/A'}</div>
                  <div><strong>Expected Delivery:</strong> {header?.quotation_date ? new Date(header.quotation_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                  <div><strong>Sales Manager:</strong> {header?.employee?.full_name || 'N/A'}</div>
                  <div><strong>Payment Terms:</strong> As per agreement</div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">ORDER SUMMARY</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-400 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Product Details</th>
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Qty</th>
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Price</th>
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Amount</th>
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">GST</th>
                      <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedItems.map((row) => (
                      <tr key={`print-${row.id}`}>
                        <td className="border border-gray-400 px-3 py-2">
                          <div className="font-extrabold text-sm text-gray-800">
                            {(row.fabric_id && fabricNameById[row.fabric_id]) || 'Fabric'} - {row.color || '-'}
                          </div>
                          <div className="text-sm text-gray-900">{row.product_description || '-'}</div>
                        </td>
                        <td className="border border-gray-400 px-3 py-2 text-sm">
                          <div className="font-semibold">{row.qty} Pcs</div>
                        </td>
                        <td className="border border-gray-400 px-3 py-2 text-sm">{formatCurrency(row.unitPrice)}</td>
                        <td className="border border-gray-400 px-3 py-2 text-right">{formatCurrency(row.amount)}</td>
                        <td className="border border-gray-400 px-3 py-2 text-center">
                          <div className="text-sm">{row.gstRate}%</div>
                          <div className="text-sm">{formatCurrency(row.gstAmount)}</div>
                        </td>
                        <td className="border border-gray-400 px-3 py-2 text-right font-semibold">{formatCurrency(row.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 border-t-2 border-gray-800 pt-4">
              <div className="flex justify-end">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span>GST Total:</span><span>{formatCurrency(gstTotal)}</span></div>
                  {charges.map((charge) => (
                    <div key={`charge-${charge.id}`} className="flex justify-between">
                      <span>{charge.particular}:</span><span>{formatCurrency(Number(charge.amount_incl_gst || 0))}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-400 pt-2 flex justify-between font-bold text-lg">
                    <span>GRAND TOTAL:</span><span>{formatCurrency(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between"><span>Amount Received:</span><span>{formatCurrency(Number(header?.total_amount || 0) - Number(header?.balance_amount || 0))}</span></div>
                  <div className="flex justify-between"><span>Pending Amount:</span><span>{formatCurrency(Number(header?.balance_amount || 0))}</span></div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">Amount in words:</div>
              <div className="text-lg font-semibold text-gray-800">{numberToWordsIndian(grandTotal)}</div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="col-span-1 border border-gray-300 rounded p-3">
                <h3 className="text-sm font-bold text-gray-800 mb-2">Terms & Conditions:</h3>
                <div className="space-y-1 text-xs text-gray-700">
                  <div>• Payment: 50% advance, 50% on delivery</div>
                  <div>• Delivery: As mutually agreed</div>
                  <div>• Prices inclusive of GST</div>
                  <div>• Subject to change without notice</div>
                </div>
              </div>
              <div className="col-span-1 border border-gray-300 rounded p-3">
                <div className="text-sm font-semibold mb-1">Bank Details:</div>
                <div className="space-y-1 text-xs text-gray-700">
                  <div>Bank Name: {(company as any)?.bank_details?.bank_name || '-'}</div>
                  <div>A/C Number: {(company as any)?.bank_details?.account_number || '-'}</div>
                  <div>IFSC: {(company as any)?.bank_details?.ifsc_code || '-'}</div>
                  <div>Branch: {(company as any)?.bank_details?.branch_name || '-'}</div>
                </div>
              </div>
              <div className="col-span-1 border border-gray-300 rounded p-3 text-center">
                {(company as any)?.payment_qr_url ? (
                  <img src={(company as any).payment_qr_url} alt="Scan to Pay" className="w-24 h-24 object-contain mx-auto" />
                ) : (
                  <div className="w-24 h-24 border border-gray-300 mx-auto flex items-center justify-center text-xs text-gray-500">No QR</div>
                )}
                <div className="text-xs text-gray-500 mt-1">Scan to Pay</div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-end">
              <div className="text-center">
                <div className="border-t border-gray-400 w-40 mt-16 pt-2 text-sm text-gray-600">Customer Signature</div>
              </div>
              <div className="text-center">
                <div className="mb-2">
                  {(company as any)?.authorized_signatory_url ? (
                    <img src={(company as any).authorized_signatory_url} alt="Authorized Signatory" className="w-28 h-20 object-contain mx-auto" />
                  ) : (
                    <div className="w-28 h-20 border border-gray-300 mx-auto flex items-center justify-center text-xs text-gray-400">Signature</div>
                  )}
                </div>
                <div className="border-b border-gray-400 w-40 mb-2"></div>
                <div className="text-sm text-gray-600">Authorized Signatory</div>
                <div className="text-xs text-gray-500 mt-1">{formatCompanyName(company?.company_name)}</div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-gray-400 text-right text-xs text-gray-600">
              <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
            </div>
          </div>
        </div>
      </div>
    </ErpLayout>
  );
}
