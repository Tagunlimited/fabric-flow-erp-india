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
        .select('*')
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
      const canvas = await html2canvas(printRef.current);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`invoice-${invoiceNumber}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
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
        {/* Back Button */}
        <div className="flex items-center">
          <Button variant="outline" onClick={() => navigate('/accounts/invoices')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Invoices
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Invoice for Order #{order.order_number}</CardTitle>
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
          </CardHeader>
          <CardContent>
            {/* Print View */}
            <div ref={printRef} className="bg-white p-8">
              <div className="max-w-4xl mx-auto">
                {/* Company Header */}
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold">{company?.company_name || 'Company Name'}</h1>
                  <p className="text-muted-foreground">{company?.address || 'Company Address'}</p>
                  <p className="text-muted-foreground">
                    {company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}
                  </p>
                  <p className="text-muted-foreground">GSTIN: {company?.gstin || 'GSTIN'}</p>
                </div>

                {/* Invoice Header */}
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-bold">INVOICE</h2>
                    <p className="text-muted-foreground">Invoice #: {invoiceNumber}</p>
                    <p className="text-muted-foreground">Date: {formatDateIndian(new Date().toISOString())}</p>
                    <p className="text-muted-foreground">Due Date: {formatDateIndian(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}</p>
                  </div>
                  <div className="text-right">
                    <h3 className="font-semibold">Bill To:</h3>
                    <p className="text-sm">{customer.company_name}</p>
                    <p className="text-sm">{customer.contact_person}</p>
                    <p className="text-sm">{customer.address}</p>
                    <p className="text-sm">
                      {customer.city}, {customer.state} - {customer.pincode}
                    </p>
                    <p className="text-sm">GSTIN: {customer.gstin}</p>
                  </div>
                </div>

                {/* Order Reference */}
                <div className="mb-6">
                  <p className="text-sm">
                    <strong>Order Reference:</strong> {order.order_number}
                  </p>
                  <p className="text-sm">
                    <strong>Order Date:</strong> {formatDateIndian(order.order_date)}
                  </p>
                  {salesManager && (
                    <p className="text-sm">
                      <strong>Sales Manager:</strong> {salesManager.full_name}
                    </p>
                  )}
                </div>

                {/* Dispatched Items */}
                {dispatchItems.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold mb-2">Dispatched Items:</h3>
                    <div className="grid grid-cols-4 gap-4">
                      {dispatchItems.map((item, index) => (
                        <div key={index} className="border rounded p-2 text-center">
                          <div className="text-sm font-medium">{item.size_name}</div>
                          <div className="text-lg font-bold">{item.quantity}</div>
                          <div className="text-xs text-gray-500">pieces</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Items Table */}
                <div className="mb-6">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-4 py-2 text-left">Item</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">Description</th>
                        <th className="border border-gray-300 px-4 py-2 text-center">Qty</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Rate</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-4 py-2">
                            {productCategories[item.product_category_id]?.category_name || 'N/A'}
                          </td>
                          <td className="border border-gray-300 px-4 py-2">
                            {item.product_description}
                            {item.color && <div className="text-sm text-gray-600">Color: {item.color}</div>}
                            {item.gsm && <div className="text-sm text-gray-600">GSM: {item.gsm}</div>}
                            {fabrics[item.fabric_id] && (
                              <div className="text-sm text-gray-600">Fabric: {fabrics[item.fabric_id].name}</div>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-center">{item.quantity}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{formatCurrency(item.unit_price)}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-80">
                    <div className="flex justify-between py-2">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span>GST ({gstRate}%):</span>
                      <span>{formatCurrency(gstAmount)}</span>
                    </div>
                    {additionalChargesTotal > 0 && (
                      <div className="flex justify-between py-2">
                        <span>Additional Charges:</span>
                        <span>{formatCurrency(additionalChargesTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-t font-bold text-lg">
                      <span>Total:</span>
                      <span>{formatCurrency(grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-12 text-center text-sm text-muted-foreground">
                  <p>Thank you for your business!</p>
                  <p className="mt-4">Payment due within 30 days</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
}