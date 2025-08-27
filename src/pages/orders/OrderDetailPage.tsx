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
import { formatCurrency } from "@/lib/utils";
import { ErpLayout } from "@/components/ErpLayout";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
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
  const [employees, setEmployees] = useState<SalesManager[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editDraft, setEditDraft] = useState<{ 
    order_date: string; 
    expected_delivery_date: string; 
    sales_manager: string | null; 
    gst_rate: number; 
    payment_channel: string | null; 
    reference_id: string | null; 
    notes: string | null; 
  } | null>(null);
  const [editItems, setEditItems] = useState<Array<{ id: string; product_description: string; quantity: number; unit_price: number; gst_rate: number }>>([]);

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

      // Fetch employees for edit dropdown
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, full_name')
        .order('full_name');
      setEmployees(employeesData || []);

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

  const openEditDialog = () => {
    if (!order) return;
    setEditDraft({
      order_date: order.order_date ? order.order_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      expected_delivery_date: order.expected_delivery_date ? order.expected_delivery_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      sales_manager: order.sales_manager || null,
      gst_rate: order.gst_rate ?? 0,
      payment_channel: order.payment_channel || '',
      reference_id: order.reference_id || '',
      notes: order.notes || ''
    });
    const itemsDraft = orderItems.map(it => ({
      id: it.id,
      product_description: it.product_description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      gst_rate: it.gst_rate ?? (order.gst_rate ?? 0)
    }));
    setEditItems(itemsDraft);
    setEditOpen(true);
  };

  const computeDraftTotals = () => {
    let subtotal = 0;
    let gstTotal = 0;
    editItems.forEach(it => {
      const amount = it.quantity * it.unit_price;
      subtotal += amount;
      const rate = isNaN(it.gst_rate) ? 0 : it.gst_rate;
      gstTotal += (amount * rate) / 100;
    });
    return { subtotal, gstTotal, grandTotal: subtotal + gstTotal };
  };

  const handleSaveEdit = async () => {
    if (!order || !editDraft) return;
    try {
      setSavingEdit(true);
      // Update order items
      await Promise.all(
        editItems.map(it =>
          supabase
            .from('order_items')
            .update({
              quantity: it.quantity,
              unit_price: it.unit_price,
              total_price: it.quantity * it.unit_price,
              gst_rate: it.gst_rate,
            })
            .eq('id', it.id)
        )
      );

      const { subtotal, gstTotal, grandTotal } = computeDraftTotals();
      const balanceAmount = grandTotal - (order.advance_amount || 0);

      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          order_date: new Date(editDraft.order_date).toISOString(),
          expected_delivery_date: new Date(editDraft.expected_delivery_date).toISOString(),
          sales_manager: editDraft.sales_manager,
          gst_rate: editDraft.gst_rate,
          payment_channel: editDraft.payment_channel,
          reference_id: editDraft.reference_id,
          notes: editDraft.notes,
          total_amount: subtotal,
          tax_amount: gstTotal,
          final_amount: grandTotal,
          balance_amount: balanceAmount
        })
        .eq('id', order.id);
      if (orderUpdateError) throw orderUpdateError;

      toast.success('Order updated successfully');
      setEditOpen(false);
      // Refresh
      await fetchOrderDetails();
    } catch (e: any) {
      console.error('Update failed', e);
      toast.error(`Failed to update order: ${e?.message || 'Unknown error'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Image upload handlers for mockup/reference images stored within order_items.specifications
  const handleUploadImage = (orderItemId: string, type: 'mockup' | 'reference', file: File) => uploadImages(orderItemId, type, [file]);
  const handleUploadImages = (orderItemId: string, type: 'mockup' | 'reference', files: FileList | File[]) => uploadImages(orderItemId, type, Array.from(files || []));

  const uploadImages = async (orderItemId: string, type: 'mockup' | 'reference', files: File[]) => {
    if (!files || files.length === 0) return;
    try {
      setUploadingImage(true);
      const bucket = 'order-images';
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const path = `${order?.id}/${type}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file);
        if (error) throw error;
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        uploadedUrls.push(pub?.publicUrl || path);
      }

      // Update specifications JSON on the specific order_item
      const target = orderItems.find(i => i.id === orderItemId);
      if (!target) throw new Error('Order item not found');
      const specs = typeof target.specifications === 'string' ? (JSON.parse(target.specifications || '{}') || {}) : (target.specifications || {});
      const key = type === 'mockup' ? 'mockup_images' : 'reference_images';
      const baseList: string[] = Array.isArray(specs[key]) ? specs[key] : [];
      const updatedList: string[] = [...baseList, ...uploadedUrls];
      const updatedSpecs = { ...specs, [key]: updatedList };

      const { error: updErr } = await supabase.from('order_items').update({ specifications: updatedSpecs }).eq('id', orderItemId);
      if (updErr) throw updErr;
      toast.success(`${type === 'mockup' ? 'Mockup' : 'Reference'} image${uploadedUrls.length > 1 ? 's' : ''} uploaded`);
      await fetchOrderDetails();
    } catch (e: any) {
      console.error('Upload failed', e);
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async (orderItemId: string, type: 'mockup' | 'reference', url: string) => {
    try {
      const target = orderItems.find(i => i.id === orderItemId);
      if (!target) throw new Error('Order item not found');
      const specs = typeof target.specifications === 'string' ? (JSON.parse(target.specifications || '{}') || {}) : (target.specifications || {});
      const key = type === 'mockup' ? 'mockup_images' : 'reference_images';
      const currentList: string[] = Array.isArray(specs[key]) ? specs[key] : [];
      const updatedList = currentList.filter((p: string) => p !== url);
      const updatedSpecs = { ...specs, [key]: updatedList };
      const { error } = await supabase.from('order_items').update({ specifications: updatedSpecs }).eq('id', orderItemId);
      if (error) throw error;
      toast.success('Image removed');
      await fetchOrderDetails();
    } catch (e: any) {
      console.error('Remove failed', e);
      toast.error(e?.message || 'Remove failed');
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
        `💰 *Total Amount:* ${formatCurrency(grandTotal)}\n` +
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
        `💰 *Amount:* ${formatCurrency(grandTotal)}\n` +
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
        `• Total Amount: ${formatCurrency(grandTotal)}\n` +
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
        `• Total Amount: ${formatCurrency(order.final_amount)}\n` +
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
              {/* <Button variant="outline" onClick={openEditDialog}>
                Edit
              </Button> */}
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
                                <div className="aspect-[3/3.5] w-full overflow-hidden rounded-lg border shadow-md">
                                  <img 
                                    src={item.category_image_url} 
                                    alt="Category"
                                    className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                    onClick={() => {
                                      const modal = document.createElement('div');
                                      modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                      modal.innerHTML = `
                                        <div class="relative max-w-4xl max-h-full">
                                          <img src="${item.category_image_url}" alt="Category" class="max-w-full max-h-ful object-contain rounded-lg" />
                                          <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <line x1="18" y1="6" x2="6" y2="18"></line>
                                              <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                          </button>
       </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Order Date</Label>
                  <Input type="date" value={editDraft.order_date} onChange={e => setEditDraft({ ...editDraft, order_date: e.target.value })} />
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <Input type="date" value={editDraft.expected_delivery_date} onChange={e => setEditDraft({ ...editDraft, expected_delivery_date: e.target.value })} />
                </div>
                <div>
                  <Label>GST Rate (%)</Label>
                  <Input type="number" value={editDraft.gst_rate} onChange={e => setEditDraft({ ...editDraft, gst_rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Sales Manager</Label>
                  <Select value={editDraft.sales_manager || ''} onValueChange={(v) => setEditDraft({ ...editDraft, sales_manager: v || null })}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Input value={editDraft.payment_channel || ''} onChange={e => setEditDraft({ ...editDraft, payment_channel: e.target.value })} />
                </div>
                <div>
                  <Label>Reference ID</Label>
                  <Input value={editDraft.reference_id || ''} onChange={e => setEditDraft({ ...editDraft, reference_id: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <Label>Notes</Label>
                  <Input value={editDraft.notes || ''} onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Items</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border">
                    <thead className="bg-muted/50 text-sm">
                      <tr>
                        <th className="p-2 border text-left">Product</th>
                        <th className="p-2 border">Qty</th>
                        <th className="p-2 border">Unit Price</th>
                        <th className="p-2 border">GST %</th>
                        <th className="p-2 border">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((it, idx) => {
                        const amount = it.quantity * it.unit_price;
                        return (
                          <tr key={it.id} className="text-sm">
                            <td className="p-2 border text-left">{it.product_description}</td>
                            <td className="p-2 border w-24">
                              <Input type="number" value={it.quantity} onChange={e => {
                                const v = parseInt(e.target.value) || 0;
                                setEditItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: v } : p));
                              }} />
                            </td>
                            <td className="p-2 border w-32">
                              <Input type="number" value={it.unit_price} onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                setEditItems(prev => prev.map((p, i) => i === idx ? { ...p, unit_price: v } : p));
                              }} />
                            </td>
                            <td className="p-2 border w-24">
                              <Input type="number" value={it.gst_rate} onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                setEditItems(prev => prev.map((p, i) => i === idx ? { ...p, gst_rate: v } : p));
                              }} />
                            </td>
                            <td className="p-2 border text-right">{formatCurrency(amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const { subtotal, gstTotal, grandTotal } = computeDraftTotals();
                  return (
                    <div className="text-right space-y-1 text-sm">
                      <div>Subtotal: {formatCurrency(subtotal)}</div>
                      <div>GST Total: {formatCurrency(gstTotal)}</div>
                      <div className="font-semibold">Grand Total: {formatCurrency(grandTotal)}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={savingEdit}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                                    <span className="font-medium">{formatCurrency(item.unit_price)}</span>
                                  </div>
                                  <div className="bg-muted/30 rounded-lg p-3">
                                    <span className="text-xs text-muted-foreground block">Total Price</span>
                                    <span className="font-medium text-primary">{formatCurrency(item.total_price)}</span>
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

                                {/* Upload Controls for Mockup / Reference Images */}
                                <div className="flex gap-3">
                                  {(() => {
                                    const mockupInputId = `mockup-${item.id}`;
                                    const refInputId = `reference-${item.id}`;
                                    return (
                                      <>
                                        <input id={mockupInputId} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files && e.target.files.length) handleUploadImages(item.id, 'mockup', e.target.files); }} />
                                        <Button type="button" variant="outline" size="sm" disabled={uploadingImage} onClick={() => document.getElementById(mockupInputId)?.click()}>
                                          <Image className="w-4 h-4 mr-1" />
                                          {uploadingImage ? 'Uploading...' : 'Upload Mockup'}
                                        </Button>
                                        <input id={refInputId} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files && e.target.files.length) handleUploadImages(item.id, 'reference', e.target.files); }} />
                                        <Button type="button" variant="outline" size="sm" disabled={uploadingImage} onClick={() => document.getElementById(refInputId)?.click()}>
                                          <Image className="w-4 h-4 mr-1" />
                                          {uploadingImage ? 'Uploading...' : 'Upload Reference'}
                                        </Button>
                                      </>
                                    );
                                  })()}
                                </div>

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
                         <div className="flex flex-nowrap justify-center gap-6">
  {(() => {
    const { mockup_images, reference_images } = extractImagesFromSpecifications(item.specifications);

    // First column: either Mockup or Reference (if Mockup missing)
    const firstBlock = mockup_images && mockup_images.length > 0
      ? {
          title: "Mockup Images",
          images: mockup_images,
          selected: selectedMockupImages,
          setSelected: setSelectedMockupImages
        }
      : reference_images && reference_images.length > 0
        ? {
            title: "Reference Images",
            images: reference_images,
            selected: selectedReferenceImages,
            setSelected: setSelectedReferenceImages
          }
        : null;

    // Second column: only shown if both types are available
    const secondBlock =
      mockup_images && mockup_images.length > 0 && reference_images && reference_images.length > 0
        ? {
            title: "Reference Images",
            images: reference_images,
            selected: selectedReferenceImages,
            setSelected: setSelectedReferenceImages
          }
        : null;

    // Render a block
    const renderImageBlock = (block: any, blockIndex: number) => (
      <div key={blockIndex} className="flex-none w-[40%] ">
        <p className="text-sm font-medium text-muted-foreground mb-3 justify-content-center">{block.title}:</p>
        <div className="space-y-3">
          {/* Main large image */}
          <div className="aspect-square w-full overflow-hidden rounded-lg border shadow-md">
            <img
              src={block.images[block.selected[index] || 0]}
              alt={block.title}
              className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
              onClick={() => {
                const currentImage = block.images[block.selected[index] || 0];
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                modal.innerHTML = `
                  <div class="relative max-w-4xl max-h-full">
                    <img src="${currentImage}" alt="${block.title}" class="max-w-full max-h-full object-contain rounded-lg" />
                    <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                `;
                modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
                document.body.appendChild(modal);
              }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>

          {/* Thumbnails */}
          {block.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {block.images.map((url: string, idx: number) => (
                <div key={idx} className="aspect-square overflow-hidden rounded-lg border shadow-sm relative group">
                  <img
                    src={url}
                    alt={`${block.title} ${idx + 1}`}
                    className={`w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300 ${
                      (block.selected[index] || 0) === idx ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => {
                      block.setSelected(prev => ({ ...prev, [index]: idx }));
                    }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <button
                    className="absolute top-1 right-1 hidden group-hover:block bg-white/90 hover:bg-white rounded px-1 text-[10px]"
                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleRemoveImage(item.id, block.title.includes('Mockup') ? 'mockup' : 'reference', url); }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      
    );

    return (
      <>
        {firstBlock && renderImageBlock(firstBlock, 1)}
        {secondBlock && renderImageBlock(secondBlock, 2)}
      </>
    );
  })()}
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
                                  <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(item.unit_price)}</td>
                                  <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(amount)}</td>
                                 <td className="border border-gray-300 px-3 py-2 text-sm">{gstRate}%</td>
                                  <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(gstAmt)}</td>
                                  <td className="border border-gray-300 px-3 py-2 text-sm font-medium">{formatCurrency(total)}</td>
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
                           <div className="text-lg font-semibold">Subtotal: {formatCurrency(subtotal)}</div>
                           <div className="text-lg font-semibold">GST Total: {formatCurrency(gstAmount)}</div>
                           <div className="text-2xl font-bold text-primary">Grand Total: {formatCurrency(grandTotal)}</div>
                         </div>
                       );
                     })()}
                   </div>
                 </CardContent>
               </Card>

               {/* Order Lifecycle */}
               

               

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
                    <span>{formatCurrency(order.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST ({order.gst_rate}%)</span>
                    <span>{formatCurrency(order.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Advance Paid</span>
                    <span className="text-green-600">{formatCurrency(order.advance_amount)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Amount</span>
                    <span>{formatCurrency(order.final_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance Due</span>
                    <span className={order.balance_amount > 0 ? "text-orange-600" : "text-green-600"}>
                      {formatCurrency(order.balance_amount)}
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
          </div>
        </div>
      </div>
    </ErpLayout>
  );
}