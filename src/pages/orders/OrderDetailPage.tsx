import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Package, 
  User, 
  Calendar, 
  DollarSign, 
  Truck, 
  FileText, 
  Download, 
  Printer, 
  X,
  AlertTriangle,
  Image,
  Mail,
  MessageCircle,
  Share,
  Send,
  ChevronDown
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ErpLayout } from "@/components/ErpLayout";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  sales_manager: string;
  status: string;
  total_amount: number;
  tax_amount: number;
  final_amount: number;
  advance_amount: number;
  balance_amount: number;
  gst_rate: number;
  payment_channel: string;
  reference_id: string;
  notes: string;
}

interface SalesManager {
  id: string;
  full_name: string;
}

interface Fabric {
  id: string;
  name: string;
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

interface ProductCategory {
  id: string;
  category_name: string;
}

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
  gst_rate?: number;
  sizes_quantities: any;
  specifications: any;
  remarks: string;
  category_image_url?: string;
  reference_images?: string[];
  mockup_images?: string[];
  attachments?: string[];
}

// Helper function to extract images from specifications
const extractImagesFromSpecifications = (specifications: any) => {
  if (!specifications) return { reference_images: [], mockup_images: [], attachments: [] };
  
  try {
    const parsed = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    return {
      reference_images: parsed.reference_images || [],
      mockup_images: parsed.mockup_images || [],
      attachments: parsed.attachments || []
    };
  } catch (error) {
    console.error('Error parsing specifications:', error);
    return { reference_images: [], mockup_images: [], attachments: [] };
  }
};

// 1. Add a function to calculate per-product and overall totals
function calculateOrderSummary(orderItems: any[], order: Order | null) {
  let subtotal = 0;
  let gstAmount = 0;
  orderItems.forEach(item => {
    const amount = item.quantity * item.unit_price;
    subtotal += amount;
    // Try to get GST rate from item.gst_rate first, then from specifications, then from order
    const gstRate = item.gst_rate ?? 
                   (item.specifications?.gst_rate) ?? 
                   (order?.gst_rate ?? 0);
    gstAmount += (amount * gstRate) / 100;
  });
  return { subtotal, gstAmount, grandTotal: subtotal + gstAmount };
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [fabrics, setFabrics] = useState<{ [key: string]: Fabric }>({});
  const [productCategories, setProductCategories] = useState<{ [key: string]: ProductCategory }>({});
  const [loading, setLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [selectedMockupImages, setSelectedMockupImages] = useState<{ [key: number]: number }>({});
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<{ [key: number]: number }>({});

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
    }
  }, [id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      // Fetch customer details
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', orderData.customer_id)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData);

      // Fetch sales manager if exists
      if (orderData.sales_manager) {
        const { data: salesManagerData } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('id', orderData.sales_manager)
          .single();
        
        setSalesManager(salesManagerData);
      }

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', id);

      if (itemsError) throw itemsError;
      setOrderItems(itemsData || []);

      // Fetch fabric details for all items
      if (itemsData && itemsData.length > 0) {
        const fabricIds = itemsData.map(item => item.fabric_id).filter(Boolean);
        const categoryIds = itemsData.map(item => item.product_category_id).filter(Boolean);
        
        if (fabricIds.length > 0) {
          const { data: fabricsData } = await supabase
            .from('fabrics')
            .select('id, name')
            .in('id', fabricIds);
          
          if (fabricsData) {
            const fabricsMap = fabricsData.reduce((acc, fabric) => {
              acc[fabric.id] = fabric;
              return acc;
            }, {} as { [key: string]: Fabric });
            setFabrics(fabricsMap);
          }
        }

        if (categoryIds.length > 0) {
          const { data: categoriesData } = await supabase
            .from('product_categories')
            .select('id, category_name')
            .in('id', categoryIds);
          
          if (categoriesData) {
            const categoriesMap = categoriesData.reduce((acc, category) => {
              acc[category.id] = category;
              return acc;
            }, {} as { [key: string]: ProductCategory });
            setProductCategories(categoriesMap);
          }
        }
      }

    } catch (error) {
      console.error('Error fetching order details:', error);
      toast.error('Failed to load order details');
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    try {
      setCancellingOrder(true);
      
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Order cancelled successfully');
      setOrder({ ...order, status: 'cancelled' });
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;

    try {
      toast.info('Generating PDF...');
      
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: printRef.current.scrollWidth,
        height: printRef.current.scrollHeight,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 0; // No margin since we added padding in the content
      
      // Calculate dimensions
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(
        (pdfWidth - 2 * margin) / (imgWidth / 2), // Divide by 2 because scale is 2
        (pdfHeight - 2 * margin) / (imgHeight / 2)
      );
      
      const finalWidth = (imgWidth / 2) * ratio;
      const finalHeight = (imgHeight / 2) * ratio;
      
      // Center the content
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      pdf.save(`Order-${order?.order_number}.pdf`);
      
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Failed to export PDF');
    }
  };

  // WhatsApp Sharing Functions for Orders
  const WhatsAppSharing = {
    formatPhoneNumber: (phone: string) => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 10 && !cleaned.startsWith('91')) {
        cleaned = '91' + cleaned;
      }
      return cleaned;
    },

    generateOrderMessage: (customer: any, orderNumber: string, grandTotal: number, orderDate: string, status: string) => {
      return encodeURIComponent(
        `🏢 *Order Update*\n\n` +
        `Dear ${customer.company_name},\n\n` +
        `Your order details:\n\n` +
        `📋 *Order No:* ${orderNumber}\n` +
        `💰 *Total Amount:* ₹${grandTotal.toLocaleString()}\n` +
        `📅 *Order Date:* ${new Date(orderDate).toLocaleDateString('en-IN')}\n` +
        `📦 *Status:* ${status.replace('_', ' ').toUpperCase()}\n\n` +
        `We appreciate your business!\n\n` +
        `*Reply for any queries.*`
      );
    },

    generateOrderPDFMessage: (customer: any, orderNumber: string, grandTotal: number, status: string) => {
      return encodeURIComponent(
        `🏢 *Order Details - PDF Ready*\n\n` +
        `Dear ${customer.company_name},\n\n` +
        `Your detailed order PDF is ready!\n\n` +
        `📋 *Order:* ${orderNumber}\n` +
        `💰 *Amount:* ₹${grandTotal.toLocaleString()}\n` +
        `📦 *Status:* ${status.replace('_', ' ').toUpperCase()}\n\n` +
        `📎 *PDF downloaded to your device.*\n` +
        `Please attach it to share complete order details.\n\n` +
        `Thank you for your business! 🙏`
      );
    },

    openWhatsApp: (phone: string, message: string) => {
      const formattedPhone = WhatsAppSharing.formatPhoneNumber(phone);
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  // Email Sharing Functions for Orders
  const EmailSharing = {
    generateOrderEmail: (customer: any, orderNumber: string, grandTotal: number, orderDate: string, status: string, salesManagerName: string) => {
      return encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Thank you for your order. Please find below the order details:\n\n` +
        `ORDER DETAILS:\n` +
        `• Order Number: ${orderNumber}\n` +
        `• Order Date: ${new Date(orderDate).toLocaleDateString('en-IN')}\n` +
        `• Total Amount: ₹${grandTotal.toLocaleString()}\n` +
        `• Current Status: ${status.replace('_', ' ').toUpperCase()}\n` +
        `• Sales Manager: ${salesManagerName || 'Sales Team'}\n\n` +
        `We will keep you updated on the progress of your order.\n\n` +
        `Thank you for choosing us.\n\n` +
        `Best regards,\n` +
        `${salesManagerName || 'Sales Team'}`
      );
    },

    openEmail: (email: string, subject: string, body: string) => {
      const emailUrl = `mailto:${email}?subject=${subject}&body=${body}`;
      window.open(emailUrl, '_blank');
    }
  };

  // Order sharing handlers
  const handleShareOrderSummary = () => {
    if (!customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const message = WhatsAppSharing.generateOrderMessage(
      customer, 
      order.order_number, 
      order.final_amount, 
      order.order_date, 
      order.status
    );

    WhatsAppSharing.openWhatsApp(customer.phone, message);
    toast.success('WhatsApp opened with order summary');
  };

  const handleShareOrderPDF = async () => {
    if (!customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    try {
      // Generate and download PDF first
      await handleExportPDF();
      
      // Then open WhatsApp with PDF message
      const message = WhatsAppSharing.generateOrderPDFMessage(
        customer, 
        order.order_number, 
        order.final_amount, 
        order.status
      );
      
      WhatsAppSharing.openWhatsApp(customer.phone, message);
      
      toast.success('PDF downloaded! WhatsApp opened with instructions.');
    } catch (error) {
      console.error('Error sharing order PDF:', error);
      toast.error('Failed to share order PDF');
    }
  };

  const handleSendOrderEmail = () => {
    if (!customer?.email) {
      toast.error('Customer email not available');
      return;
    }

    const subject = `Order ${order.order_number} - Order Details`;
    const body = EmailSharing.generateOrderEmail(
      customer,
      order.order_number,
      order.final_amount,
      order.order_date,
      order.status,
      salesManager?.full_name || 'Sales Team'
    );

    EmailSharing.openEmail(customer.email, subject, body);
    toast.success('Email client opened with order details');
  };

  const handleSendOrderPDFEmail = async () => {
    if (!customer?.email) {
      toast.error('Customer email not available');
      return;
    }

    try {
      // Generate and download PDF first
      await handleExportPDF();
      
      // Then open email with PDF instructions
      const subject = `Order ${order.order_number} - Order Details (PDF Attached)`;
      const body = encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Please find attached the detailed order PDF for your reference.\n\n` +
        `Order Details:\n` +
        `• Order Number: ${order.order_number}\n` +
        `• Total Amount: ₹${order.final_amount.toLocaleString()}\n` +
        `• Status: ${order.status.replace('_', ' ').toUpperCase()}\n` +
        `• Date: ${new Date(order.order_date).toLocaleDateString('en-IN')}\n\n` +
        `Note: The PDF file has been downloaded. Please attach it before sending.\n\n` +
        `Thank you for your business.\n\n` +
        `Best regards,\n` +
        `${salesManager?.full_name || 'Sales Team'}`
      );

      EmailSharing.openEmail(customer.email, subject, body);
      
      toast.success('PDF downloaded! Email client opened.');
    } catch (error) {
      console.error('Error sending order PDF email:', error);
      toast.error('Failed to send order PDF email');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-orange-100 text-orange-800';
      case 'quality_check': return 'bg-purple-100 text-purple-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </ErpLayout>
    );
  }

  if (!order || !customer) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">The requested order could not be found.</p>
            <Button onClick={() => navigate('/orders')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Orders
            </Button>
          </div>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/orders')}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Orders
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Order Details</h1>
              <p className="text-muted-foreground">Order #{order.order_number}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge className={getStatusColor(order.status)}>
              {order.status.replace('_', ' ').toUpperCase()}
            </Badge>
            
            <div className="flex space-x-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              
              <Button variant="outline" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>

              {/* Enhanced Email Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Mail className="w-4 h-4 mr-1" />
                    Email
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Send via Email</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={handleSendOrderEmail}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Order Details
                    <span className="ml-auto text-xs text-muted-foreground">Summary</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={handleSendOrderPDFEmail}>
                    <FileText className="w-4 h-4 mr-2" />
                    Send with PDF
                    <span className="ml-auto text-xs text-muted-foreground">Detailed</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Enhanced WhatsApp Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MessageCircle className="w-4 h-4 mr-1" />
                    WhatsApp
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Send via WhatsApp</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={handleShareOrderSummary}>
                    <Share className="w-4 h-4 mr-2" />
                    Share Order Summary
                    <span className="ml-auto text-xs text-muted-foreground">Quick</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={handleShareOrderPDF}>
                    <FileText className="w-4 h-4 mr-2" />
                    Share PDF
                    <span className="ml-auto text-xs text-muted-foreground">Detailed</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {order.status === 'pending' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2 text-destructive" />
                        Cancel Order
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel order #{order.order_number}? 
                        This action cannot be undone and will change the order status to cancelled.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Order</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleCancelOrder}
                        disabled={cancellingOrder}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        {cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>

        {/* Printable Content - Optimized for A4 */}
        <div ref={printRef} className="bg-white print:shadow-none" style={{ padding: '15mm 25mm 15mm 15mm', minHeight: '297mm', width: '210mm', margin: '0 auto', fontSize: '10px', lineHeight: '1.3' }}>
          <style jsx>{`
            @media print {
              .print\\:hidden { display: none !important; }
              header, nav, .header, .navigation { display: none !important; }
              .print-content { display: block !important; }
            }
          `}</style>
          {/* Company Header with Logo */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
            <div className="flex items-center space-x-4">
              {(company as any)?.logo_url && (
                <img 
                  src={(company as any).logo_url} 
                  alt="Company Logo" 
                  className="w-16 h-16 object-contain"
                  style={{ maxWidth: '60px', maxHeight: '60px' }}
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-1">Order Confirmation</h1>
                <div className="text-sm text-gray-600">
                  Order #{order.order_number} | Date: {new Date(order.order_date).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="bg-primary text-white px-4 py-2 rounded">
                <h2 className="text-xl font-bold">ORDER</h2>
              </div>
            </div>
          </div>

          {/* Document Title and Crucial Details */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">ORDER DETAILS</h2>
              <div className="text-sm space-y-1">
                <div><strong>Order Number:</strong> {order.order_number}</div>
                <div><strong>Order Date:</strong> {new Date(order.order_date).toLocaleDateString('en-IN')}</div>
                <div><strong>Expected Delivery:</strong> {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                <div><strong>Status:</strong> <span className="capitalize font-medium">{order.status.replace('_', ' ')}</span></div>
              </div>
            </div>
            <div className="text-right">
              <div className="border-2 border-gray-800 p-3 bg-gray-50">
                <div className="font-bold text-lg">₹{order.final_amount.toLocaleString()}</div>
                <div className="text-sm text-gray-600">Total Amount</div>
                {order.balance_amount > 0 && (
                  <div className="text-sm text-orange-600 mt-1">
                    Balance: ₹{order.balance_amount.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Customer and Order Information */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            {/* Customer Details */}
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-2 border-b border-gray-400 pb-1">Customer Details:</h3>
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-sm">{customer.company_name}</div>
                <div>{customer.contact_person}</div>
                <div>{customer.address}</div>
                <div>{customer.city}, {customer.state} - {customer.pincode}</div>
                <div><strong>Phone:</strong> {customer.phone}</div>
                <div><strong>Email:</strong> {customer.email}</div>
                {customer.gstin && <div><strong>GSTIN:</strong> {customer.gstin}</div>}
              </div>
            </div>

            {/* Order Summary */}
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-2 border-b border-gray-400 pb-1">Payment Summary:</h3>
              <div className="space-y-1 text-xs">
                <div><strong>Subtotal:</strong> ₹{order.total_amount.toLocaleString()}</div>
                <div><strong>GST ({order.gst_rate}%):</strong> ₹{order.tax_amount.toLocaleString()}</div>
                <div><strong>Total Amount:</strong> ₹{order.final_amount.toLocaleString()}</div>
                <div><strong>Advance Paid:</strong> <span className="text-green-600">₹{order.advance_amount.toLocaleString()}</span></div>
                <div><strong>Balance Due:</strong> <span className={order.balance_amount > 0 ? "text-orange-600" : "text-green-600"}>₹{order.balance_amount.toLocaleString()}</span></div>
                <div><strong>Sales Manager:</strong> {salesManager?.full_name || 'N/A'}</div>
                {order.payment_channel && <div><strong>Payment Method:</strong> {order.payment_channel}</div>}
              </div>
            </div>
          </div>

          {/* Order Items Table for PDF */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-400 pb-1">Order Items</h3>
            <table className="w-full border-collapse border border-gray-400 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Image</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Product Details</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Qty</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Rate</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Amount</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">GST</th>
                  <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, index) => {
                  const amount = item.quantity * item.unit_price;
                  const gstRate = item.gst_rate ?? 
                                 (item.specifications?.gst_rate) ?? 
                                 (order?.gst_rate ?? 0);
                  const gstAmt = (amount * gstRate) / 100;
                  const total = amount + gstAmt;
                  
                  return (
                    <tr key={index}>
                      <td className="border border-gray-400 px-2 py-1 align-top">
                        {item.category_image_url && (
                          <img 
                            src={item.category_image_url} 
                            alt="Product" 
                            className="w-12 h-12 object-cover" 
                          />
                        )}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 align-top">
                        <div className="font-semibold">{item.product_description}</div>
                        <div className="text-xs text-gray-600">{productCategories[item.product_category_id]?.category_name}</div>
                        <div className="text-xs text-gray-600">{fabrics[item.fabric_id]?.name} - {item.color}, {item.gsm}GSM</div>
                        {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                          <div className="text-xs text-gray-600 mt-1">
                            Sizes: {Object.entries(item.sizes_quantities)
                              .filter(([_, qty]) => (qty as number) > 0)
                              .map(([size, qty]) => `${size}(${qty})`)
                              .join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 align-top text-center">
                        <div className="font-semibold">{item.quantity}</div>
                        <div className="text-xs">Pcs</div>
                      </td>
                      <td className="border border-gray-400 px-2 py-1 align-top text-right">₹{item.unit_price}</td>
                      <td className="border border-gray-400 px-2 py-1 align-top text-right">₹{amount.toLocaleString()}</td>
                      <td className="border border-gray-400 px-2 py-1 align-top text-center">
                        <div>{gstRate}%</div>
                        <div className="text-xs">₹{gstAmt.toLocaleString()}</div>
                      </td>
                      <td className="border border-gray-400 px-2 py-1 align-top text-right font-semibold">₹{total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PDF Totals Summary */}
          <div className="mt-6 border-t-2 border-gray-800 pt-4">
            <div className="flex justify-end">
              <div className="w-80 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>₹{order.total_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>GST ({order.gst_rate}%):</span>
                  <span>₹{order.tax_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600">
                  <span>Advance Paid:</span>
                  <span>₹{order.advance_amount.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-400 pt-2 mt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>FINAL AMOUNT:</span>
                    <span>₹{order.final_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-orange-600 mt-1">
                    <span>Balance Due:</span>
                    <span>₹{order.balance_amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Order Footer */}
          <div className="mt-6 pt-4 border-t border-gray-400">
            <div className="flex justify-between items-end">
              <div>
                <div className="text-xs font-medium">Order Terms:</div>
                <div className="text-xs text-gray-600 mt-2 space-y-1">
                  <div>• Expected delivery: {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                  <div>• Payment: {order.payment_channel || 'As per agreement'}</div>
                  <div>• Quality assurance included</div>
                  <div>• Warranty: 1 year from delivery</div>
                </div>
              </div>
              <div className="text-right text-xs text-gray-600">
                <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
                <div>Sales Manager: {salesManager?.full_name || 'N/A'}</div>
                <div>Status: <span className="capitalize font-medium">{order.status.replace('_', ' ')}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Regular UI Content (not printed) */}
        <div className="print:hidden space-y-6">
          {/* Order Items with Images */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-6">
              {/* Order Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Order Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {orderItems.map((item, index) => {
                      // Define proper size order
                      const getSizeOrder = (sizes: string[]) => {
                        const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 
                                           '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
                                           '0-2 Yrs', '3-4 Yrs', '5-6 Yrs', '7-8 Yrs', '9-10 Yrs', '11-12 Yrs', '13-14 Yrs', '15-16 Yrs'];
                        
                        return sizes.sort((a, b) => {
                          const indexA = sizeOrder.indexOf(a);
                          const indexB = sizeOrder.indexOf(b);
                          
                          if (indexA !== -1 && indexB !== -1) {
                            return indexA - indexB;
                          }
                          if (indexA !== -1) return -1;
                          if (indexB !== -1) return 1;
                          
                          const numA = parseInt(a);
                          const numB = parseInt(b);
                          if (!isNaN(numA) && !isNaN(numB)) {
                            return numA - numB;
                          }
                          
                          return a.localeCompare(b);
                        });
                      };

                      return (
                      <div key={index} className="border rounded-lg p-4 space-y-4">
                        <div className="flex flex-col xl:flex-row gap-6">
                          {/* Product Images Section - Better aspect ratio and space utilization */}
                          <div className="xl:w-2/5 space-y-6">
                            {/* Category Image with 1.3:1.5 aspect ratio */}
                            {item.category_image_url && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-3">Category Image:</p>
                                <div className="aspect-[13/15] w-full overflow-hidden rounded-lg border shadow-md">
                                  <img 
                                    src={item.category_image_url} 
                                    alt="Category"
                                    className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                    onClick={() => {
                                      const modal = document.createElement('div');
                                      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                      modal.innerHTML = `
                                        <div class="relative max-w-4xl max-h-full">
                                          <img src="${item.category_image_url}" alt="Category" class="max-w-full max-h-full object-contain rounded-lg" />
                                          <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <line x1="18" y1="6" x2="6" y2="18"></line>
                                              <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                          </button>
                                        </div>
                                      `;
                                      modal.onclick = (e) => {
                                        if (e.target === modal) {
                                          document.body.removeChild(modal);
                                        }
                                      };
                                      document.body.appendChild(modal);
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                                                         {/* Mockup Images - Amazon Style Layout */}
                             {(() => {
                               const { mockup_images } = extractImagesFromSpecifications(item.specifications);
                               return mockup_images && mockup_images.length > 0 ? (
                                 <div>
                                   <p className="text-sm font-medium text-muted-foreground mb-3">Mockup Images:</p>
                                   <div className="space-y-3">
                                     {/* Main large image */}
                                     <div className="aspect-[13/15] w-full overflow-hidden rounded-lg border shadow-md">
                                       <img 
                                         src={mockup_images[selectedMockupImages[index] || 0]} 
                                         alt="Main Mockup"
                                         className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                         onClick={() => {
                                           const currentImage = mockup_images[selectedMockupImages[index] || 0];
                                           const modal = document.createElement('div');
                                           modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                           modal.innerHTML = `
                                             <div class="relative max-w-4xl max-h-full">
                                               <img src="${currentImage}" alt="Main Mockup" class="max-w-full max-h-full object-contain rounded-lg" />
                                               <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                   <line x1="18" y1="6" x2="6" y2="18"></line>
                                                   <line x1="6" y1="6" x2="18" y2="18"></line>
                                                 </svg>
                                               </button>
                                             </div>
                                           `;
                                           modal.onclick = (e) => {
                                             if (e.target === modal) {
                                               document.body.removeChild(modal);
                                             }
                                           };
                                           document.body.appendChild(modal);
                                         }}
                                         onError={(e) => {
                                           e.currentTarget.style.display = 'none';
                                         }}
                                       />
                                     </div>
                                     
                                     {/* Thumbnail images */}
                                     {mockup_images.length > 1 && (
                                       <div className="grid grid-cols-4 gap-2">
                                         {mockup_images.map((url: string, idx: number) => (
                                           <div key={idx} className="aspect-square overflow-hidden rounded-lg border shadow-sm">
                                             <img 
                                               src={url} 
                                               alt={`Mockup ${idx + 1}`}
                                               className={`w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300 ${
                                                 (selectedMockupImages[index] || 0) === idx ? 'ring-2 ring-primary' : ''
                                               }`}
                                               onClick={() => {
                                                 setSelectedMockupImages(prev => ({
                                                   ...prev,
                                                   [index]: idx
                                                 }));
                                               }}
                                               onError={(e) => {
                                                 e.currentTarget.style.display = 'none';
                                               }}
                                             />
                                           </div>
                                         ))}
                                       </div>
                                     )}
                                   </div>
                                 </div>
                               ) : null;
                             })()}

                             {/* Reference Images - Amazon Style Layout */}
                             {(() => {
                               const { reference_images } = extractImagesFromSpecifications(item.specifications);
                               return reference_images && reference_images.length > 0 ? (
                                 <div>
                                   <p className="text-sm font-medium text-muted-foreground mb-3">Reference Images:</p>
                                   <div className="space-y-3">
                                     {/* Main large image */}
                                     <div className="aspect-[13/15] w-full overflow-hidden rounded-lg border shadow-md">
                                       <img 
                                         src={reference_images[selectedReferenceImages[index] || 0]} 
                                         alt="Main Reference"
                                         className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                         onClick={() => {
                                           const currentImage = reference_images[selectedReferenceImages[index] || 0];
                                           const modal = document.createElement('div');
                                           modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                           modal.innerHTML = `
                                             <div class="relative max-w-4xl max-h-full">
                                               <img src="${currentImage}" alt="Main Reference" class="max-w-full max-h-full object-contain rounded-lg" />
                                               <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                   <line x1="18" y1="6" x2="6" y2="18"></line>
                                                   <line x1="6" y1="6" x2="18" y2="18"></line>
                                                 </svg>
                                               </button>
                                             </div>
                                           `;
                                           modal.onclick = (e) => {
                                             if (e.target === modal) {
                                               document.body.removeChild(modal);
                                             }
                                           };
                                           document.body.appendChild(modal);
                                         }}
                                         onError={(e) => {
                                           e.currentTarget.style.display = 'none';
                                         }}
                                       />
                                     </div>
                                     
                                     {/* Thumbnail images */}
                                     {reference_images.length > 1 && (
                                       <div className="grid grid-cols-4 gap-2">
                                         {reference_images.map((imgUrl: string, idx: number) => (
                                           <div key={idx} className="aspect-square overflow-hidden rounded-lg border shadow-sm">
                                             <img 
                                               src={imgUrl} 
                                               alt={`Reference ${idx + 1}`}
                                               className={`w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300 ${
                                                 (selectedReferenceImages[index] || 0) === idx ? 'ring-2 ring-primary' : ''
                                               }`}
                                               onClick={() => {
                                                 setSelectedReferenceImages(prev => ({
                                                   ...prev,
                                                   [index]: idx
                                                 }));
                                               }}
                                               onError={(e) => {
                                                 e.currentTarget.style.display = 'none';
                                               }}
                                             />
                                           </div>
                                         ))}
                                       </div>
                                     )}
                                   </div>
                                 </div>
                               ) : null;
                             })()}

                            {/* Attachments */}
                            {(() => {
                              const { attachments } = extractImagesFromSpecifications(item.specifications);
                              return attachments && attachments.length > 0 ? (
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground mb-3">Attachments:</p>
                                  <div className="space-y-2">
                                    {attachments.map((attachmentUrl: string, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border">
                                        <div className="flex items-center space-x-3">
                                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                            <FileText className="w-4 h-4 text-primary" />
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium">Attachment {idx + 1}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {attachmentUrl.split('/').pop() || 'File'}
                                            </p>
                                          </div>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(attachmentUrl, '_blank')}
                                        >
                                          <Download className="w-4 h-4 mr-1" />
                                          Download
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                          </div>

                          {/* Product Details Section */}
                          <div className="xl:w-3/5 space-y-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 space-y-4">
                                {/* Product Category Name */}
                                {productCategories[item.product_category_id] && (
                                  <p className="text-sm font-medium text-muted-foreground">
                                    {productCategories[item.product_category_id].category_name}
                                  </p>
                                )}
                                <h3 className="font-semibold text-xl">{item.product_description}</h3>
                                
                                {/* Product Information Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Fabric</span>
                                    <span className="font-medium">{fabrics[item.fabric_id]?.name || 'N/A'}</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Color</span>
                                    <span className="font-medium">{item.color}</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">GSM</span>
                                    <span className="font-medium">{item.gsm}</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Total Quantity</span>
                                    <span className="font-medium">{item.quantity} pcs</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Unit Price</span>
                                    <span className="font-medium">₹{item.unit_price.toLocaleString()}</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Total Price</span>
                                    <span className="font-medium text-primary">₹{item.total_price.toLocaleString()}</span>
                                  </div>
                                </div>
                                
                                {/* Size Breakdown with proper ordering */}
                                {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-3">Size Breakdown:</p>
                                    <div className="bg-muted/20 rounded-lg p-4">
                                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        {Object.entries(item.sizes_quantities as Record<string, number>)
                                          .sort(([a], [b]) => {
                                            // Custom sorting for sizes (XS, S, M, L, XL, XXL, etc.)
                                            const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
                                            const aIndex = sizeOrder.indexOf(a);
                                            const bIndex = sizeOrder.indexOf(b);
                                            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                                            if (aIndex !== -1) return -1;
                                            if (bIndex !== -1) return 1;
                                            return a.localeCompare(b);
                                          })
                                          .map(([size, qty]) => (
                                            <div key={size} className="bg-background rounded border text-center p-2">
                                              <div className="text-xs font-medium text-muted-foreground">{size}</div>
                                              <div className="text-sm font-bold">{String(qty)}</div>
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Branding Details */}
                                {item.specifications && (() => {
                                  try {
                                    const parsed = typeof item.specifications === 'string' ? JSON.parse(item.specifications) : item.specifications;
                                    const brandingItems = parsed.branding_items || [];
                                    
                                    return brandingItems.length > 0 ? (
                                      <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-3">Branding Details:</p>
                                        <div className="space-y-3">
                                          {brandingItems.map((branding: any, idx: number) => (
                                            <div key={idx} className="bg-muted/20 rounded-lg p-4 border">
                                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div>
                                                  <span className="text-xs text-muted-foreground block">Type</span>
                                                  <span className="font-medium">{branding.branding_type}</span>
                                                </div>
                                                <div>
                                                  <span className="text-xs text-muted-foreground block">Placement</span>
                                                  <span className="font-medium">{branding.placement}</span>
                                                </div>
                                                <div>
                                                  <span className="text-xs text-muted-foreground block">Size</span>
                                                  <span className="font-medium">{branding.measurement}</span>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null;
                                  } catch (error) {
                                    console.error('Error parsing branding items:', error);
                                    return null;
                                  }
                                })()}
                                
                                                                 {item.remarks && (
                                   <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                     <p className="text-sm">
                                       <span className="font-semibold text-amber-800">Remarks:</span>
                                       <span className="ml-2 text-amber-700">{item.remarks}</span>
                                     </p>
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>
                         </div>
                       </div>
                       );
                     })}
                   </div>
                 </CardContent>
               </Card>

               {/* Order Summary Table (Product-wise) */}
               <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-xl">
                 <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
                   <CardTitle className="text-primary">ORDER SUMMARY</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                   <div className="space-y-4">
                     <div className="overflow-x-auto">
                       <table className="w-full border-collapse border border-gray-300">
                         <thead>
                           <tr className="bg-gray-100">
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Product Image</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Product Name</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Total Qty</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Price</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Amount</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">GST Rate</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">GST Amt</th>
                             <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Total</th>
                           </tr>
                         </thead>
                         <tbody>
                           {orderItems.map((item, index) => {
                             const amount = item.quantity * item.unit_price;
                             // Try to get GST rate from item.gst_rate first, then from specifications, then from order
                             const gstRate = item.gst_rate ?? 
                                           (item.specifications?.gst_rate) ?? 
                                           (order?.gst_rate ?? 0);
                             const gstAmt = (amount * gstRate) / 100;
                             const total = amount + gstAmt;
                             return (
                               <tr key={index} className="hover:bg-gray-50">
                                 <td className="border border-gray-300 px-3 py-2">
                                   {item.category_image_url && (
                                     <img
                                       src={item.category_image_url}
                                       alt="Product"
                                       className="w-20 h-20 object-cover rounded"
                                     />
                                   )}
                                 </td>
                                 <td className="border border-gray-300 px-3 py-2">
                                   <div className="text-sm">
                                     <div className="font-medium">{item.product_description}</div>
                                     <div className="text-gray-600 text-xs">
                                       {productCategories[item.product_category_id]?.category_name}
                                     </div>
                                     <div className="text-gray-600 text-xs">
                                       {fabrics[item.fabric_id]?.name} - {item.color}, {item.gsm} GSM
                                     </div>
                                   </div>
                                 </td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">
                                   <div>{item.quantity} Pcs</div>
                                   <div className="text-xs text-gray-600">
                                     {item.sizes_quantities && typeof item.sizes_quantities === 'object' &&
                                       Object.entries(item.sizes_quantities)
                                         .filter(([_, qty]) => (qty as number) > 0)
                                         .map(([size, qty]) => `${size}-${qty}`)
                                         .join(', ')}
                                   </div>
                                 </td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">₹{item.unit_price}</td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">₹{amount.toLocaleString()}</td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">{gstRate}%</td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">₹{gstAmt.toLocaleString()}</td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm font-medium">₹{total.toLocaleString()}</td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                     {/* Subtotal, GST, Grand Total */}
                     {(() => {
                       const { subtotal, gstAmount, grandTotal } = calculateOrderSummary(orderItems, order);
                       return (
                         <div className="text-right space-y-1">
                           <div className="text-lg font-semibold">Subtotal: ₹{subtotal.toLocaleString()}</div>
                           <div className="text-lg font-semibold">GST Total: ₹{gstAmount.toLocaleString()}</div>
                           <div className="text-2xl font-bold text-primary">Grand Total: ₹{grandTotal.toLocaleString()}</div>
                         </div>
                       );
                     })()}
                   </div>
                 </CardContent>
               </Card>

               {/* Order Lifecycle */}
               <Card>
                 <CardHeader>
                   <CardTitle className="flex items-center">
                     <Calendar className="w-5 h-5 mr-2" />
                     Order Lifecycle
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     <div className="flex items-center space-x-4">
                       <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                       <div>
                         <p className="font-semibold">Order Placed</p>
                         <p className="text-sm text-muted-foreground">
                           {new Date(order.order_date).toLocaleDateString('en-GB', {
                             day: '2-digit',
                             month: 'long',
                             year: 'numeric'
                           })}
                         </p>
                       </div>
                     </div>
                     
                     {order.status !== 'pending' && order.status !== 'cancelled' && (
                       <div className="flex items-center space-x-4">
                         <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                         <div>
                           <p className="font-semibold">Order Confirmed</p>
                           <p className="text-sm text-muted-foreground">Processing started</p>
                         </div>
                       </div>
                     )}
                     
                     {order.expected_delivery_date && (
                       <div className="flex items-center space-x-4">
                         <div className={`w-4 h-4 rounded-full ${order.status === 'delivered' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                         <div>
                           <p className="font-semibold">
                             {order.status === 'delivered' ? 'Delivered' : 'Expected Delivery'}
                           </p>
                           <p className="text-sm text-muted-foreground">
                             {new Date(order.expected_delivery_date).toLocaleDateString('en-GB', {
                               day: '2-digit',
                               month: 'long',
                               year: 'numeric'
                             })}
                           </p>
                         </div>
                       </div>
                     )}

                     {order.status === 'cancelled' && (
                       <div className="flex items-center space-x-4">
                         <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                         <div>
                           <p className="font-semibold text-red-600">Order Cancelled</p>
                           <p className="text-sm text-muted-foreground">Order has been cancelled</p>
                         </div>
                       </div>
                     )}
                   </div>
                 </CardContent>
               </Card>

               

             </div>

            <div className="xl:col-span-1 space-y-6">
              {/* Order Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Order Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Order Date</p>
                    <p className="font-medium">
                      {new Date(order.order_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  {order.expected_delivery_date && (
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Delivery</p>
                      <p className="font-medium">
                        {new Date(order.expected_delivery_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {salesManager && (
                    <div>
                      <p className="text-sm text-muted-foreground">Sales Manager</p>
                      <p className="font-medium">{salesManager.full_name}</p>
                    </div>
                  )}
                  {order.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium text-sm">{order.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="font-semibold text-lg">{customer.company_name}</p>
                    <p className="text-muted-foreground">{customer.contact_person}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{customer.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{customer.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">
                      {customer.address}, {customer.city}, {customer.state} - {customer.pincode}
                    </p>
                  </div>
                  {customer.gstin && (
                    <div>
                      <p className="text-sm text-muted-foreground">GSTIN</p>
                      <p className="font-medium">{customer.gstin}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Order Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DollarSign className="w-5 h-5 mr-2" />
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{order.total_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST ({order.gst_rate}%)</span>
                    <span>₹{order.tax_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Advance Paid</span>
                    <span className="text-green-600">₹{order.advance_amount.toLocaleString()}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Amount</span>
                    <span>₹{order.final_amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance Due</span>
                    <span className={order.balance_amount > 0 ? "text-orange-600" : "text-green-600"}>
                      ₹{order.balance_amount.toLocaleString()}
                    </span>
                  </div>
                  
                  {order.payment_channel && (
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Payment Method</span>
                        <span>{order.payment_channel}</span>
                      </div>
                    </div>
                  )}
                  
                  {order.reference_id && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reference ID</span>
                      <span>{order.reference_id}</span>
                    </div>
                  )}
                </CardContent>
              </Card>


            </div>
          </div>
        </div>
      </div>
    </ErpLayout>
  );
}