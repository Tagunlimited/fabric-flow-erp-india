import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { ErpLayout } from "@/components/ErpLayout";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { PaymentRecordDialog } from '@/components/orders/PaymentRecordDialog';
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

interface OrderActivity {
  id: string;
  order_id: string;
  activity_type: string;
  activity_description: string;
  old_values?: any;
  new_values?: any;
  metadata?: any;
  performed_at: string;
  performed_by?: string;
  user_email?: string;
  user_name?: string;
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
  const [searchParams] = useSearchParams();
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
  const [orderActivities, setOrderActivities] = useState<OrderActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Handle back navigation based on referrer
  const handleBackNavigation = () => {
    const from = searchParams.get('from');
    if (from === 'production') {
      navigate('/production');
    } else {
      navigate('/orders');
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchOrderActivities();
    }
  }, [id]);

  const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        if (!id) {
          toast.error('Missing order id');
          return;
        }
        
        // Fetch order details
        const { data: orderData, error: orderError } = await (supabase as any)
          .from('orders')
          .select('*')
          .eq('id', id as string)
          .single();

        if (orderError) throw orderError;
        if (!orderData) throw new Error('Order not found');
        setOrder(orderData as unknown as Order);

        // Fetch customer details
        const { data: customerData, error: customerError } = await (supabase as any)
          .from('customers')
          .select('*')
          .eq('id', (orderData as any).customer_id)
          .single();

        if (customerError) throw customerError;
        setCustomer(customerData as unknown as Customer);

        // Fetch sales manager if exists
        if ((orderData as any).sales_manager) {
          const { data: salesManagerData } = await (supabase as any)
            .from('employees')
            .select('id, full_name')
            .eq('id', (orderData as any).sales_manager)
            .single();
          
          setSalesManager((salesManagerData as unknown as SalesManager) || null);
        }

        // Fetch employees for edit dropdown (only Sales Department)
        const { data: employeesData } = await (supabase as any)
          .from('employees')
          .select('id, full_name, department')
          .order('full_name');
        
        // Filter to only show employees from Sales Department
        const salesEmployees = (employeesData || []).filter((emp: any) => 
          emp.department && emp.department.toLowerCase().includes('sales')
        );
        setEmployees((salesEmployees as unknown as SalesManager[]) || []);

        // Fetch order items
        const { data: itemsData, error: itemsError } = await (supabase as any)
          .from('order_items')
          .select('*')
          .eq('order_id', id as string);

        if (itemsError) throw itemsError;
        setOrderItems((itemsData as unknown as OrderItem[]) || []);

        // Fetch fabric details for all items
        if (itemsData && (itemsData as any[]).length > 0) {
          const fabricIds = ((itemsData || []) as any[]).map((item: any) => item.fabric_id).filter(Boolean);
          const categoryIds = ((itemsData || []) as any[]).map((item: any) => item.product_category_id).filter(Boolean);
        
        if (fabricIds.length > 0) {
          const { data: fabricsData } = await supabase
            .from('fabric_master')
            .select('id, fabric_name')
            .in('id', fabricIds);
          
          if (fabricsData) {
            const fabricsMap = (fabricsData as any[]).reduce((acc: { [key: string]: Fabric }, fabric: any) => {
              acc[fabric.id] = fabric as Fabric;
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
            const categoriesMap = (categoriesData as any[]).reduce((acc: { [key: string]: ProductCategory }, category: any) => {
              acc[category.id] = category as ProductCategory;
              return acc;
            }, {} as { [key: string]: ProductCategory });
            setProductCategories(categoriesMap);
          }
        }
      }

    } catch (error) {
      console.error('Error fetching order details:', error);
      toast.error('Failed to load order details');
      handleBackNavigation();
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderActivities = async () => {
    try {
      setLoadingActivities(true);
      if (!id) {
        toast.error('Missing order id');
        return;
      }
      
      const { data: activitiesData, error: activitiesError } = await (supabase as any)
        .from('order_lifecycle_view')
        .select('*')
        .eq('order_id', id as string)
        .order('performed_at', { ascending: false });

      if (activitiesError) throw activitiesError;
      setOrderActivities((activitiesData as unknown as OrderActivity[]) || []);
      
    } catch (error) {
      console.error('Error fetching order activities:', error);
      toast.error('Failed to load order activities');
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    try {
      setCancellingOrder(true);
      
      const { error } = await (supabase as any)
        .from('orders')
        .update({ status: 'cancelled' as Database['public']['Enums']['order_status'] } as Database['public']['Tables']['orders']['Update'])
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Order cancelled successfully');
      setOrder({ ...order, status: 'cancelled' });
      await fetchOrderActivities();
      
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
          (supabase as any)
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

      const { error: orderUpdateError } = await (supabase as any)
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
      await fetchOrderActivities();
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

      const { error: updErr } = await (supabase as any).from('order_items').update({ specifications: updatedSpecs }).eq('id', orderItemId);
      if (updErr) throw updErr;
      
      // Log file upload activity for each uploaded file
      for (const url of uploadedUrls) {
        const fileName = url.split('/').pop() || 'Unknown file';
        await supabase.rpc('log_file_upload_activity', {
          p_order_id: order?.id,
          p_file_type: type === 'mockup' ? 'Mockup Image' : 'Reference Image',
          p_file_name: fileName,
          p_file_url: url,
          p_item_id: orderItemId
        });
      }
      
      toast.success(`${type === 'mockup' ? 'Mockup' : 'Reference'} image${uploadedUrls.length > 1 ? 's' : ''} uploaded`);
      await fetchOrderDetails();
      await fetchOrderActivities();
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
      const { error } = await (supabase as any).from('order_items').update({ specifications: updatedSpecs }).eq('id', orderItemId);
      if (error) throw error;
      
      // Log file removal activity
      await supabase.rpc('log_custom_order_activity', {
        p_order_id: order?.id,
        p_activity_type: 'file_removed',
        p_activity_description: `File removed: ${url.split('/').pop() || 'Unknown file'}`,
        p_metadata: {
          file_url: url,
          item_id: orderItemId
        }
      });
      
      toast.success('Image removed');
      await fetchOrderDetails();
      await fetchOrderActivities();
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
      case 'designing_done': return 'bg-teal-100 text-teal-800';
      case 'under_procurement': return 'bg-amber-100 text-amber-800';
      case 'under_cutting': return 'bg-orange-100 text-orange-800';
      case 'under_stitching': return 'bg-indigo-100 text-indigo-800';
      case 'under_qc': return 'bg-pink-100 text-pink-800';
      case 'ready_for_dispatch': return 'bg-green-100 text-green-800';
      case 'rework': return 'bg-red-100 text-red-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'order_created': return '📋';
      case 'order_updated': return '✏️';
      case 'status_changed': return '🔄';
      case 'delivery_date_updated': return '📅';
      case 'amount_updated': return '💰';
      case 'sales_manager_changed': return '👤';
      case 'item_added': return '➕';
      case 'item_updated': return '✏️';
      case 'quantity_updated': return '📊';
      case 'price_updated': return '💰';
      case 'specifications_updated': return '📋';
      case 'item_removed': return '➖';
      case 'payment_received': return '💳';
      case 'file_uploaded': return '📎';
      case 'order_deleted': return '🗑️';
      default: return '📝';
    }
  };

  const getActivityColor = (activityType: string) => {
    switch (activityType) {
      case 'order_created': return 'bg-green-100 text-green-800 border-green-200';
      case 'order_updated': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'status_changed': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'delivery_date_updated': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'amount_updated': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'sales_manager_changed': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'item_added': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'item_updated': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'quantity_updated': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'price_updated': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'specifications_updated': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'item_removed': return 'bg-red-100 text-red-800 border-red-200';
      case 'payment_received': return 'bg-green-100 text-green-800 border-green-200';
      case 'file_uploaded': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'order_deleted': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Safe JSON parser for lifecycle fields that may be strings
  const parseMaybeJson = (value: any) => {
    if (value && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  const formatDateTimeSafe = (value: any, options?: Intl.DateTimeFormatOptions) => {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleString('en-GB', options || {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return 'N/A';
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
            <Button onClick={handleBackNavigation}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to {searchParams.get('from') === 'production' ? 'Production' : 'Orders'}
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
              onClick={handleBackNavigation}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to {searchParams.get('from') === 'production' ? 'Production' : 'Orders'}
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
                  
                  {order.balance_amount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setPaymentDialogOpen(true)}
                    >
                      💳 Record Payment
                    </Button>
                  )}
                  
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
    <CardTitle className="flex items-center justify-between text-base sm:text-lg">
      <div className="flex items-center">
        <Calendar className="w-5 h-5 mr-2" />
        Order Lifecycle
      </div>
      <Badge variant="outline" className="text-xs whitespace-nowrap">
        {orderActivities.length} activities
      </Badge>
    </CardTitle>
  </CardHeader>
  <CardContent className="overflow-x-hidden">
    {loadingActivities ? (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    ) : orderActivities.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">
        <p>No activities recorded yet</p>
      </div>
    ) : (
      <div className="space-y-4 max-h-96 overflow-y-auto overflow-x-hidden pr-1 sm:pr-2">
        {orderActivities.map((activity, index) => (
          <div key={activity.id} className="relative">
            {/* Timeline connector */}
            {index < orderActivities.length - 1 && (
              <div className="absolute left-[0.875rem] sm:left-[1.125rem] top-6 sm:top-7 w-0.5 h-6 sm:h-7 bg-gray-200"></div>
            )}
            
            <div className="flex items-start gap-3 sm:gap-3">
              {/* Activity icon */}
              <div className={`flex-shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center text-sm sm:text-base ${getActivityColor(activity.activity_type)}`}>
                {getActivityIcon(activity.activity_type)}
              </div>
              
              {/* Activity content */}
              <div className="flex-1 min-w-0">
                <div className="w-full rounded-lg border bg-muted/10 p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1">
                    <h4 className="font-semibold text-xs sm:text-sm break-words break-all leading-snug">
                      {activity.activity_description}
                    </h4>
                    <span className="text-[11px] sm:text-xs text-muted-foreground sm:max-w-[65%] whitespace-normal sm:whitespace-normal break-words break-all sm:text-right">
                      {formatDateTimeSafe(activity.performed_at)}
                    </span>
                  </div>
                
                  {/* User info */}
                  {activity.user_name && (
                    <p className="text-[11px] sm:text-xs text-muted-foreground mb-2 break-words">
                      By: {activity.user_name} {activity.user_email ? `(${activity.user_email})` : ''}
                    </p>
                  )}
                
                  {/* Activity details */}
                  {activity.metadata && (
                    <div className="bg-muted/30 rounded-lg p-3 mt-2 text-[11px] sm:text-xs">
                    {activity.activity_type === 'payment_received' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Amount:</span>
                          <span className="font-medium">{formatCurrency(parseMaybeJson(activity.metadata)?.payment_amount)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>Method:</span>
                          <span className="font-medium">{parseMaybeJson(activity.metadata)?.payment_type}</span>
                        </div>
                        {parseMaybeJson(activity.metadata)?.payment_reference && (
                          <div className="flex justify-between text-xs">
                            <span>Reference:</span>
                            <span className="font-medium">{parseMaybeJson(activity.metadata)?.payment_reference}</span>
                          </div>
                        )}
                        {parseMaybeJson(activity.metadata)?.notes && (
                          <div className="text-xs mt-1">
                            <span className="text-muted-foreground">Notes:</span> {parseMaybeJson(activity.metadata)?.notes}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {activity.activity_type === 'file_uploaded' && (
                      <div className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:justify-between text-xs">
                          <span>File:</span>
                          <span className="font-medium break-words break-all sm:max-w-[65%]">{parseMaybeJson(activity.metadata)?.file_name}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>Type:</span>
                          <span className="font-medium">{parseMaybeJson(activity.metadata)?.file_type}</span>
                        </div>
                        {parseMaybeJson(activity.metadata)?.file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-6 text-[10px] sm:text-xs"
                            onClick={() => window.open(parseMaybeJson(activity.metadata)?.file_url, '_blank')}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    )}
                    
                    {activity.activity_type === 'status_changed' && activity.old_values && activity.new_values && (
                      <div className="space-y-1 text-[11px] sm:text-xs">
                        <div className="flex justify-between text-xs">
                          <span>From:</span>
                          <Badge variant="outline" className="text-xs">
                            {parseMaybeJson(activity.old_values)?.status?.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>To:</span>
                          <Badge variant="outline" className="text-xs">
                            {parseMaybeJson(activity.new_values)?.status?.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    )}
                    
                    {activity.activity_type === 'amount_updated' && activity.old_values && activity.new_values && (
                      <div className="space-y-1 text-[11px] sm:text-xs">
                        <div className="flex justify-between text-xs">
                          <span>From:</span>
                          <span className="font-medium">{formatCurrency(parseMaybeJson(activity.old_values)?.final_amount)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>To:</span>
                          <span className="font-medium">{formatCurrency(parseMaybeJson(activity.new_values)?.final_amount)}</span>
                        </div>
                      </div>
                    )}
                    
                    {activity.activity_type === 'delivery_date_updated' && activity.old_values && activity.new_values && (
                      <div className="space-y-1 text-[11px] sm:text-xs">
                        <div className="flex justify-between text-xs">
                          <span>From:</span>
                          <span className="font-medium">
                            {formatDateTimeSafe(parseMaybeJson(activity.old_values)?.expected_delivery_date, { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>To:</span>
                          <span className="font-medium">
                            {formatDateTimeSafe(parseMaybeJson(activity.new_values)?.expected_delivery_date, { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                  {/* Show changes for other activity types */}
                  {activity.old_values && activity.new_values && !['status_changed', 'amount_updated', 'delivery_date_updated'].includes(activity.activity_type) && (
                    <div className="bg-muted/30 rounded-lg p-3 mt-2">
                      <div className="text-xs text-muted-foreground mb-2">Changes made:</div>
                      <div className="space-y-2">
                        {(() => {
                          const oldObj: any = parseMaybeJson(activity.old_values) || {};
                          const newObj: any = parseMaybeJson(activity.new_values) || {};
                          const keys = Object.keys(newObj);
                          const toArray = (v: any): string[] => Array.isArray(v) ? v : [];
                          const fileName = (url: string) => {
                            try { return (url || '').split('/').pop() || url; } catch { return String(url); }
                          };
                          return keys.map((key) => {
                            const oldV: any = oldObj[key];
                            const newV: any = newObj[key];
                            if (JSON.stringify(oldV) === JSON.stringify(newV)) return null;

                            if (["attachments", "mockup_images", "reference_images"].includes(key)) {
                              const oldArr = toArray(oldV);
                              const newArr = toArray(newV);
                              const added = newArr.filter(u => !oldArr.includes(u));
                              const removed = oldArr.filter(u => !newArr.includes(u));
                              return (
                                <div key={key} className="text-xs">
                                  <div className="font-medium capitalize mb-1">{key.replace('_', ' ')}:</div>
                                  {removed.length > 0 && (
                                    <div className="mb-1">
                                      <span className="text-red-600 mr-1">Removed:</span>
                                      <ul className="ml-4 list-disc space-y-0.5 break-all">
                                        {removed.map((u) => (
                                          <li key={`rm-${u}`}>
                                            <a className="underline text-red-700" href={u} target="_blank" rel="noreferrer">
                                              {fileName(u)}
                                            </a>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {added.length > 0 && (
                                    <div>
                                      <span className="text-green-600 mr-1">Added:</span>
                                      <ul className="ml-4 list-disc space-y-0.5 break-all">
                                        {added.map((u) => (
                                          <li key={`ad-${u}`}>
                                            <a className="underline text-green-700" href={u} target="_blank" rel="noreferrer">
                                              {fileName(u)}
                                            </a>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {(added.length === 0 && removed.length === 0) && (
                                    <div className="text-muted-foreground">No link changes</div>
                                  )}
                                </div>
                              );
                            }

                            if (key === 'specifications' && typeof newV === 'object') {
                              const o = (typeof oldV === 'object' && oldV) ? oldV : {};
                              const n = (typeof newV === 'object' && newV) ? newV : {};
                              const specKeys = Object.keys(n).filter(k => !["attachments", "mockup_images", "reference_images"].includes(k));
                              const changed = specKeys.filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
                              if (changed.length === 0) return null;
                              return (
                                <div key={key} className="text-xs">
                                  <div className="font-medium mb-1">Specifications:</div>
                                  <div className="space-y-1">
                                    {changed.map(k => (
                                      <div key={k} className="flex justify-between">
                                        <span className="capitalize mr-2">{k.replace('_', ' ')}:</span>
                                        <div className="text-right max-w-[100%] sm:max-w-[70%] break-words break-all">
                                          <div className="line-through text-red-600">
                                            {typeof o[k] === 'object' ? JSON.stringify(o[k]) : String(o[k] ?? 'N/A')}
                                          </div>
                                          <div className="text-green-600 font-medium">
                                            {typeof n[k] === 'object' ? JSON.stringify(n[k]) : String(n[k] ?? 'N/A')}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }

                            // Generic fallback
                            return (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="capitalize">{key.replace('_', ' ')}:</span>
                                <div className="text-right max-w-[100%] sm:max-w-[70%] break-words break-all">
                                  <div className="line-through text-red-600">
                                    {typeof oldV === 'object' ? JSON.stringify(oldV) : String(oldV ?? 'N/A')}
                                  </div>
                                  <div className="text-green-600 font-medium">
                                    {typeof newV === 'object' ? JSON.stringify(newV) : String(newV ?? 'N/A')}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>

            </div>
          </div>
        </div>
      </div>
      
      {/* Payment Record Dialog */}
      <PaymentRecordDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        orderId={order.id}
        orderNumber={order.order_number}
        balanceAmount={order.balance_amount}
        onPaymentRecorded={() => {
          fetchOrderDetails();
          fetchOrderActivities();
        }}
      />
    </ErpLayout>
  );
}