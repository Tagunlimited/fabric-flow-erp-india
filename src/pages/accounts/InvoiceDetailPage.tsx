import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, Printer, Download, Mail, MessageCircle, Share, FileText, Send, ChevronDown, ArrowLeft, CreditCard } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDateIndian } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Add sales manager to Order interface
interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  status: string;
  final_amount: number;
  sales_manager?: string;
  gst_rate?: number;
}
interface Customer {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
}
// Add OrderItem interface
interface OrderItem {
  id: string;
  order_id: string;
  product_category_id: string;
  product_description: string;
  fabric_id: string;
  color: string;
  gsm: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sizes_quantities: any;
  specifications: any;
  remarks: string;
  category_image_url?: string;
}
// Add ProductCategory and Fabric interfaces
interface ProductCategory { id: string; category_name: string; }
interface Fabric { id: string; name: string; }
// Add additional charges state
interface AdditionalCharge {
  particular: string;
  rate: number;
  gst_percentage: number;
  amount_incl_gst: number;
}
// Add SalesManager interface
interface SalesManager { id: string; full_name: string; }

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productCategories, setProductCategories] = useState<{ [key: string]: ProductCategory }>({});
  const [fabrics, setFabrics] = useState<{ [key: string]: Fabric }>({});
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [dispatchItems, setDispatchItems] = useState<Array<{size_name: string; quantity: number}>>([]);
  const [isInvoiceId, setIsInvoiceId] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    if (id) fetchData(id);
  }, [id]);

  const fetchData = async (id: string) => {
    try {
      setLoading(true);
      
      let orderData: any = null;
      let orderId: string = '';

      // First, check if this is an invoice ID by trying to fetch from invoices table
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, order:orders(*)')
        .eq('id', id as any)
        .single();

      if (!invoiceError && invoiceData) {
        // This is an invoice ID, get the order from the invoice
        setIsInvoiceId(true);
        orderData = (invoiceData as any).order;
        orderId = (invoiceData as any).order_id;
        setInvoiceNumber((invoiceData as any).invoice_number);
      } else {
        // This is an order ID, fetch the order directly
        setIsInvoiceId(false);
        const { data: orderDataResult, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', id as any)
          .single();

        if (orderError) throw orderError;
        orderData = orderDataResult;
        orderId = id;
        
        // Generate invoice number for new invoices
        setInvoiceNumber(`INV-${Date.now()}`);
      }

      setOrder(orderData as any);

      // Fetch customer
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', orderData.customer_id)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData as any);

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*, mockup_images, specifications, category_image_url')
        .eq('order_id', orderId as any);

      if (itemsError) throw itemsError;
      setOrderItems((itemsData as any) || []);

      // Fetch product categories
      const categoryIds = Array.from(new Set(((itemsData as any) || []).map((item: any) => item.product_category_id).filter(Boolean)));
      if (categoryIds.length > 0) {
        const { data: categoriesData } = await supabase
          .from('product_categories')
          .select('*')
          .in('id', categoryIds as any);
        
        const categoriesMap: { [key: string]: ProductCategory } = {};
        ((categoriesData as any) || []).forEach((cat: any) => {
          categoriesMap[cat.id] = cat;
        });
        setProductCategories(categoriesMap);
      }

      // Fetch fabrics
      const fabricIds = Array.from(new Set(((itemsData as any) || []).map((item: any) => item.fabric_id).filter(Boolean)));
      if (fabricIds.length > 0) {
        const { data: fabricsData } = await supabase
          .from('fabrics')
          .select('*')
          .in('id', fabricIds as any);
        
        const fabricsMap: { [key: string]: Fabric } = {};
        ((fabricsData as any) || []).forEach((fabric: any) => {
          fabricsMap[fabric.id] = fabric;
        });
        setFabrics(fabricsMap);
      }

      // Fetch sales manager
      if ((orderData as any).sales_manager) {
        const { data: salesManagerData } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('id', (orderData as any).sales_manager)
          .single();
        
        if (salesManagerData) {
          setSalesManager(salesManagerData as any);
        }
      }

      // Load dispatch items for this order
      const { data: items } = await supabase
        .from('dispatch_order_items')
        .select('size_name, quantity')
        .eq('order_id', orderId as any);
      
      if (items) {
        // Aggregate by size
        const aggregated: Record<string, number> = {};
        items.forEach((item: any) => {
          const size = item.size_name;
          aggregated[size] = (aggregated[size] || 0) + Number(item.quantity || 0);
        });
        
        const itemsList = Object.entries(aggregated).map(([size_name, quantity]) => ({
          size_name,
          quantity
        }));
        setDispatchItems(itemsList);
      }

      // Fetch receipts/payments for this order
      const { data: receiptsData } = await supabase
        .from('receipts')
        .select('*')
        .or(`reference_id.eq.${orderId},reference_number.eq.${orderData.order_number}`)
        .order('entry_date', { ascending: false });
      
      if (receiptsData) {
        setReceipts(receiptsData);
        const paid = receiptsData.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
        setTotalPaid(paid);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch order data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!printRef.current) return;

    try {
      // Show loading toast
      toast.loading('Generating PDF...');
      
      // Small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Optimize html2canvas settings to match print output exactly
      const canvas = await html2canvas(printRef.current, {
        scale: 2, // Lower scale for smaller file and faster generation
        useCORS: true,
        logging: false,
        imageTimeout: 0,
        backgroundColor: '#ffffff',
        width: 794, // A4 width in pixels at 96 DPI (210mm)
        windowWidth: 794,
        removeContainer: true, // Clean up faster
        async: true, // Async rendering for better performance
      });
      
      // Use JPEG with compression for smaller file size
      const imgData = canvas.toDataURL('image/jpeg', 0.8); // 80% quality
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm - MATCH PRINT MARGINS EXACTLY
      const pdfWidth = 210;
      const pdfHeight = 297;
      const marginLeft = 15; // Same as @page margin
      const marginRight = 15; // Same as @page margin
      const marginTop = 10; // Same as @page margin
      const marginBottom = 10; // Same as @page margin
      
      // Calculate content area (excluding margins)
      const contentWidth = pdfWidth - marginLeft - marginRight; // 180mm
      const contentHeight = pdfHeight - marginTop - marginBottom; // 277mm
      
      // Calculate image dimensions to fit content area
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let yPosition = marginTop;

      // Add first page with proper margins (matching print)
      pdf.addImage(imgData, 'JPEG', marginLeft, yPosition, imgWidth, Math.min(imgHeight, contentHeight));
      heightLeft -= contentHeight;

      // Add additional pages if content is longer
      while (heightLeft > 0) {
        pdf.addPage();
        yPosition = marginTop - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'JPEG', marginLeft, yPosition, imgWidth, imgHeight);
        heightLeft -= contentHeight;
      }

      pdf.save(`invoice-${invoiceNumber}.pdf`);
      
      // Dismiss loading and show success
      toast.dismiss();
      toast.success('PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.dismiss();
      toast.error('Failed to generate PDF');
    }
  };

  const handleCreateInvoice = async () => {
    if (!order || !customer) return;

    // If we're already viewing an invoice, don't create another one
    if (isInvoiceId) {
      toast.info('This order already has an invoice');
      return;
    }

    try {
      // Calculate due date (30 days from today)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          order_id: order.id,
          customer_id: customer.id,
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          subtotal: order.final_amount,
          tax_amount: (order.final_amount * (order.gst_rate || 18)) / 100,
          total_amount: order.final_amount + (order.final_amount * (order.gst_rate || 18)) / 100,
          status: 'draft',
          notes: `Invoice for dispatched order ${order.order_number}`,
          terms_and_conditions: 'Payment due within 30 days',
        } as any)
        .select()
        .single();

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        toast.error('Failed to create invoice');
        return;
      }

      // Update order status to completed
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({ status: 'completed' } as any)
        .eq('id', order.id as any);

      if (orderUpdateError) {
        console.error('Error updating order status:', orderUpdateError);
        toast.warning('Invoice created but failed to update order status');
      } else {
        toast.success('Invoice created successfully and order marked as completed');
      }

      // Refresh the page to show the invoice view
      // This is necessary to reload the invoice data after creation
      window.location.reload();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    }
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ErpLayout>
    );
  }

  if (!order || !customer) {
    return (
      <ErpLayout>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold text-muted-foreground">Order not found</h2>
          <Button onClick={() => navigate('/accounts/invoices')} className="mt-4">
            Back to Invoices
          </Button>
        </div>
      </ErpLayout>
    );
  }

  // Calculate totals
  const subtotal = orderItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const gstRate = order.gst_rate || 18;
  const gstAmount = (subtotal * gstRate) / 100;
  const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + charge.amount_incl_gst, 0);
  const grandTotal = subtotal + gstAmount + additionalChargesTotal;

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Back Button and Actions - Hidden when printing */}
        <div className="print:hidden flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/accounts/invoices')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Invoices
          </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-1" /> Print
                </Button>
                
                <Button variant="outline" onClick={handlePrint}>
                  <Download className="w-4 h-4 mr-1" /> Export PDF
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate('/accounts/invoices')}
                >
                  <Eye className="w-4 h-4 mr-1" /> View All Invoices
                </Button>
                
                {!isInvoiceId && (
                  <Button onClick={handleCreateInvoice} className="bg-blue-600 hover:bg-blue-700">
                    <FileText className="w-4 h-4 mr-1" /> Create Invoice
                  </Button>
                )}
              </div>
                </div>

        {/* Print View - Full width for A4 */}
        <div ref={printRef} className="bg-white p-8 print:px-5 print:py-4 print:m-0 print:w-full print:max-w-none" style={{ width: '210mm', maxWidth: '210mm' }}>
          <div className="print:max-w-none max-w-4xl mx-auto print:mx-0 print:w-full print:p-0" style={{ maxWidth: '100%' }}>
                {/* Company Header - Compact left-aligned */}
                <div className="flex items-start gap-3 mb-3 pb-2 border-b-2 border-gray-300">
                  {/* Company Logo */}
                  {company?.logo_url && (
                    <div className="flex-shrink-0">
                      <img 
                        src={company.logo_url} 
                        alt={company.company_name} 
                        className="h-12 w-auto object-contain"
                        style={{ maxWidth: '50px' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                  </div>
                  )}
                  {/* Company Details */}
                  <div className="flex-1">
                    <h1 className="text-lg font-bold mb-1">{company?.company_name || 'Company Name'}</h1>
                    <p className="text-xs text-gray-700 leading-relaxed break-words">{company?.address || 'Company Address'}</p>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}
                    </p>
                    <p className="text-xs text-gray-700 font-medium mt-0.5">GSTIN: {company?.gstin || 'GSTIN'}</p>
                  </div>
                </div>

                {/* Invoice Header - Compact */}
                <div className="flex justify-between items-start mb-4 gap-4">
                  <div className="flex-1 max-w-[55%]">
                    <h2 className="text-2xl font-bold mb-2">INVOICE</h2>
                    <div className="space-y-0.5">
                      <p className="text-xs text-gray-700"><span className="font-semibold">Invoice #:</span> {invoiceNumber}</p>
                      <p className="text-xs text-gray-700"><span className="font-semibold">Date:</span> {formatDateIndian(new Date().toISOString())}</p>
                      <p className="text-xs text-gray-700"><span className="font-semibold">Due Date:</span> {formatDateIndian(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}</p>
                      <p className="text-xs text-gray-700 break-words">
                        <span className="font-semibold">Order Ref:</span> {order.order_number} | <span className="font-semibold">Date:</span> {formatDateIndian(order.order_date)}
                  </p>
                  {salesManager && (
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">Sales Manager:</span> {salesManager.full_name}
                    </p>
                  )}
                    </div>
                  </div>
                  <div className="text-right flex-1 max-w-[40%]">
                    <h3 className="font-bold text-sm mb-1 border-b pb-1">Bill To:</h3>
                    <div className="space-y-0.5 mt-1">
                      <p className="text-xs font-semibold break-words">{customer.company_name}</p>
                      <p className="text-xs text-gray-700 break-words">{customer.contact_person}</p>
                      <p className="text-xs text-gray-700 break-words leading-relaxed">{customer.address}</p>
                      <p className="text-xs text-gray-700">
                        {customer.city}, {customer.state} - {customer.pincode}
                      </p>
                      <p className="text-xs text-gray-700 font-medium">GSTIN: {customer.gstin}</p>
                    </div>
                  </div>
                </div>

                {/* Dispatched Items - Compact */}
                {dispatchItems.length > 0 && (
                  <div className="mb-3 pb-2 border-b">
                    <h3 className="text-sm font-semibold mb-2">Dispatched Items:</h3>
                    <div className="grid grid-cols-8 gap-1.5" style={{ gridAutoFlow: 'dense' }}>
                      {dispatchItems.map((item, index) => (
                        <div key={index} className="border border-gray-300 rounded p-1.5 text-center bg-gray-50">
                          <div className="text-xs font-semibold text-gray-700">{item.size_name}</div>
                          <div className="text-base font-bold text-gray-900">{item.quantity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Items Table - Compact with proper column widths */}
                <div className="mb-4">
                  <table className="w-full border-collapse border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '15%' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-2 py-1 text-left text-xs font-semibold">Item</th>
                        <th className="border border-gray-300 px-2 py-1 text-left text-xs font-semibold">Description</th>
                        <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold">Qty</th>
                        <th className="border border-gray-300 px-2 py-1 text-right text-xs font-semibold">Rate</th>
                        <th className="border border-gray-300 px-2 py-1 text-right text-xs font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-2 py-1 align-top">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const displayImage = getOrderItemDisplayImage(item, order);
                                return displayImage ? (
                                  <img
                                    src={displayImage}
                                    alt="Product"
                                    className="w-10 h-10 object-cover rounded flex-shrink-0"
                                  />
                                ) : null;
                              })()}
                              <div className="flex-1 text-xs font-medium break-words">
                                {productCategories[item.product_category_id]?.category_name || 'N/A'}
                              </div>
                            </div>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-xs align-top">
                            <div className="break-words">
                              <div className="font-medium mb-0.5">{item.product_description}</div>
                              {item.color && <div className="text-gray-600">Color: {item.color}</div>}
                              {item.gsm && <div className="text-gray-600">GSM: {item.gsm}</div>}
                            {fabrics[item.fabric_id] && (
                                <div className="text-gray-600">Fabric: {fabrics[item.fabric_id].name}</div>
                            )}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center text-xs align-top font-medium">{item.quantity}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-xs align-top font-medium whitespace-nowrap">{formatCurrency(item.unit_price)}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-xs align-top font-semibold whitespace-nowrap">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals - Compact */}
                <div className="flex justify-end">
                  <div className="w-64">
                    <div className="flex justify-between py-1 text-sm">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-sm">
                      <span>GST ({gstRate}%):</span>
                      <span>{formatCurrency(gstAmount)}</span>
                    </div>
                    {additionalChargesTotal > 0 && (
                      <div className="flex justify-between py-1 text-sm">
                        <span>Additional Charges:</span>
                        <span>{formatCurrency(additionalChargesTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-t font-bold text-base">
                      <span>Total:</span>
                      <span>{formatCurrency(grandTotal)}</span>
                    </div>
                    
                    {/* Payment Records Section */}
                    {receipts.length > 0 && (
                      <>
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs font-semibold mb-1">Payment Records:</div>
                          {receipts.map((receipt, idx) => (
                            <div key={receipt.id} className="flex justify-between py-0.5 text-xs text-muted-foreground">
                              <span>
                                {formatDateIndian(receipt.entry_date)} - {receipt.payment_mode}
                              </span>
                              <span className="text-green-600 font-medium">{formatCurrency(receipt.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between py-1 mt-1 border-t text-sm font-semibold">
                            <span>Total Paid:</span>
                            <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                          </div>
                        </div>
                      </>
                    )}
                    
                    {/* Balance/Fully Paid Status */}
                    {(() => {
                      const balance = grandTotal - totalPaid;
                      if (balance > 0) {
                        return (
                          <div className="flex justify-between py-1 border-t font-bold text-base text-red-600">
                            <span>Balance Payable:</span>
                            <span>{formatCurrency(balance)}</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex items-center justify-center py-2 mt-1 border-t bg-green-50 rounded">
                            <span className="text-green-600 text-sm font-bold flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                              Fully Paid
                            </span>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>

                {/* Authorized Signatory Section - Compact */}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex justify-between items-end">
                    {/* Customer Signature */}
                    <div className="text-center">
                      <div className="border-b border-gray-400 w-32 mb-1"></div>
                      <div className="text-xs text-gray-600">Customer Signature</div>
                    </div>
                    
                    {/* Company Authorized Signatory */}
                    <div className="text-center">
                      <div className="mb-2">
                        {company?.authorized_signatory_url ? (
                          <img 
                            src={company.authorized_signatory_url} 
                            alt="Authorized Signatory" 
                            className="w-16 h-12 object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-16 h-12 border border-gray-300 mx-auto flex items-center justify-center">
                            <span className="text-xs text-gray-400">Sign</span>
                          </div>
                        )}
                      </div>
                      <div className="border-b border-gray-400 w-32 mb-1"></div>
                      <div className="text-xs text-gray-600">Authorized Signatory</div>
                      <div className="text-xs text-gray-500">{company?.company_name || 'Company Name'}</div>
                    </div>
                  </div>
                </div>

                {/* Footer - Compact */}
                <div className="mt-4 text-center text-xs text-muted-foreground">
                  <p>Thank you for your business!</p>
                </div>
              </div>
            </div>
      </div>
    </ErpLayout>
  );
}