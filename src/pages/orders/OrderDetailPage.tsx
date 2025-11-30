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
  ChevronDown,
  Trash2,
  Receipt,
  ScrollText,
  Plus
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { ErpLayout } from "@/components/ErpLayout";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { useAuth } from "@/components/auth/AuthProvider";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { sortSizesQuantities, SizeType, sortSizesByMasterOrder } from '@/utils/sizeSorting';
import { calculateSizeBasedTotal, calculateOrderSummary } from '@/utils/priceCalculation';
import { ProductCustomizationModal } from "@/components/orders/ProductCustomizationModal";
import { CustomizationColorChips } from "@/components/common/CustomizationColorChips";
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
  order_type?: string;
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
  avatar_url?: string;
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

// calculateOrderSummary is now imported from '@/utils/priceCalculation'

// 2. Add a function to calculate GST rates breakdown
function calculateGSTRatesBreakdown(orderItems: any[], order: Order | null) {
  const gstRatesMap = new Map<number, number>();
  
  orderItems.forEach(item => {
    let amount = 0;
    // Check if size-based pricing is available (new format)
    if (item.size_prices && item.sizes_quantities) {
      // New format: size-wise pricing
      amount = calculateSizeBasedTotal(
        item.sizes_quantities,
        item.size_prices,
        item.unit_price
      );
    } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
      // Also check in specifications (for backward compatibility)
      amount = calculateSizeBasedTotal(
        item.specifications.sizes_quantities,
        item.specifications.size_prices,
        item.unit_price
      );
    } else {
      // Old format: single unit_price (backward compatibility)
      amount = item.quantity * item.unit_price;
    }
    
    // Try to get GST rate from item.gst_rate first, then from specifications, then from order
    const gstRate = item.gst_rate ?? 
                   (item.specifications?.gst_rate) ?? 
                   (order?.gst_rate ?? 0);
    
    if (gstRate > 0) {
      const gstAmount = (amount * gstRate) / 100;
      const currentAmount = gstRatesMap.get(gstRate) || 0;
      gstRatesMap.set(gstRate, currentAmount + gstAmount);
    }
  });
  
  return Array.from(gstRatesMap.entries())
    .map(([rate, amount]) => ({ rate, amount }))
    .sort((a, b) => a.rate - b.rate);
}

// Component to display readymade order form with existing order data
function ReadymadeOrderFormView({ orderId, order, customer, orderItems, sizeTypes }: { orderId: string; order: Order; customer: Customer | null; orderItems: OrderItem[]; sizeTypes: SizeType[] }) {
  const [formData, setFormData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [orderActivities, setOrderActivities] = useState<OrderActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [totalReceipts, setTotalReceipts] = useState<number>(0);

  useEffect(() => {
    const loadOrderData = async () => {
      try {
        if (!order || !customer) return;

        // Parse order items to extract product data
        const products = orderItems.map((item: OrderItem) => {
          const specs = typeof item.specifications === 'string' 
            ? JSON.parse(item.specifications) 
            : item.specifications || {};
          
            return {
            product_master_id: specs.product_master_id || '',
            product_id: specs.product_id || '',
            product_name: specs.product_name || item.product_description || '',
            class: specs.class || '',
            size: specs.size || '',
            color: specs.color || '',
            category: specs.category || '',
            quantity: item.quantity || 0,
            sizes_quantities: specs.sizes_quantities || {},
            unit_price: item.unit_price || 0,
            gst_rate: item.gst_rate || order.gst_rate || 0,
            total_price: item.total_price || 0,
            class_image: specs.class_image || null, // Include class image
            reference_images: specs.reference_images || [],
            mockup_images: specs.mockup_images || [],
            attachments: specs.attachments || [],
            branding_items: specs.branding_items || []
          };
        });

        setFormData({
          order_date: new Date(order.order_date),
          expected_delivery_date: new Date(order.expected_delivery_date),
          customer_id: order.customer_id,
          sales_manager: order.sales_manager || '',
          products: products,
          payment_channel: order.payment_channel || '',
          reference_id: order.reference_id || '',
          advance_amount: order.advance_amount || 0,
          notes: order.notes || '',
          additional_charges: []
        });
      } catch (error) {
        console.error('Error loading order data:', error);
        toast.error('Failed to load order data');
      } finally {
        setLoading(false);
      }
    };

    loadOrderData();
  }, [order, customer, orderItems]);

  // Fetch sales manager
  useEffect(() => {
    const fetchSalesManager = async () => {
      if (order?.sales_manager) {
        try {
          const { data: salesManagerData } = await supabase
            .from('employees')
            .select('id, full_name, avatar_url')
            .eq('id', order.sales_manager)
            .single();
          
          if (salesManagerData) {
            setSalesManager(salesManagerData as unknown as SalesManager);
          }
        } catch (error) {
          console.error('Error fetching sales manager:', error);
        }
      }
    };
    
    fetchSalesManager();
  }, [order?.sales_manager]);

  // Fetch order activities
  useEffect(() => {
    const fetchOrderActivities = async () => {
      if (!orderId) return;
      
      try {
        setLoadingActivities(true);
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('order_lifecycle_view')
          .select('*')
          .eq('order_id', orderId)
          .order('performed_at', { ascending: false });
        
        if (activitiesError) throw activitiesError;
        setOrderActivities((activitiesData as unknown as OrderActivity[]) || []);
      } catch (error) {
        console.error('Error fetching order activities:', error);
      } finally {
        setLoadingActivities(false);
      }
    };
    
    fetchOrderActivities();
  }, [orderId]);

  // Fetch total receipts
  useEffect(() => {
    const fetchTotalReceipts = async () => {
      if (!order?.order_number) return;
      
      try {
        const { data: receiptsData, error: receiptsError } = await supabase
          .from('receipts')
          .select('amount')
          .eq('reference_number', order.order_number)
          .eq('reference_type', 'order');
        
        if (receiptsError) throw receiptsError;
        
        const total = (receiptsData || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
        setTotalReceipts(total);
      } catch (error) {
        console.error('Error fetching receipts:', error);
      }
    };
    
    fetchTotalReceipts();
  }, [order?.order_number]);

  // Helper functions for activities
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
      case 'order_dispatched': return '🚚';
      case 'order_cancelled': return '❌';
      default: return '📝';
    }
  };

  const getActivityColor = (activityType: string) => {
    switch (activityType) {
      case 'order_created': return 'bg-blue-100 border-blue-300 text-blue-700';
      case 'order_updated': return 'bg-yellow-100 border-yellow-300 text-yellow-700';
      case 'status_changed': return 'bg-purple-100 border-purple-300 text-purple-700';
      case 'payment_received': return 'bg-green-100 border-green-300 text-green-700';
      case 'order_dispatched': return 'bg-indigo-100 border-indigo-300 text-indigo-700';
      case 'order_cancelled': return 'bg-red-100 border-red-300 text-red-700';
      default: return 'bg-gray-100 border-gray-300 text-gray-700';
    }
  };

  const parseMaybeJson = (value: any) => {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  const humanizeStatus = (status?: string | null) => {
    if (!status) return 'Status Updated';
    return status
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const getActivityTitle = (activity: OrderActivity) => {
    if (activity.activity_type === 'status_changed') {
      const newObj: any = parseMaybeJson(activity.new_values) || {};
      return humanizeStatus(newObj.status);
    }

    switch (activity.activity_type) {
      case 'order_created':
        return 'Order Created';
      case 'order_updated':
        return 'Order Updated';
      case 'payment_received':
        return 'Payment Received';
      case 'order_dispatched':
        return 'Order Dispatched';
      default:
        return activity.activity_description;
    }
  };

  const getActivitySubtitle = (activity: OrderActivity) => {
    if (activity.activity_type === 'status_changed') {
      const oldObj: any = parseMaybeJson(activity.old_values) || {};
      const newObj: any = parseMaybeJson(activity.new_values) || {};
      const newStatus = String(newObj.status || '').toLowerCase();

      switch (newStatus) {
        case 'designing_done':
          return 'Mockups approved and uploaded to Order Detail page.';
        case 'confirmed':
          return 'Advance payment received, order confirmed.';
        case 'under_procurement':
          return 'Materials planned and sent for procurement.';
        case 'under_cutting':
          return 'Cutting process started for this order.';
        case 'under_stitching':
          return 'Stitching in progress for this order.';
        case 'under_qc':
          return 'Order is under quality check.';
        case 'ready_for_dispatch':
          return 'Order packed and ready for dispatch.';
        case 'partial_dispatched':
          return 'Order partially dispatched to customer.';
        case 'dispatched':
          return 'Order fully dispatched to customer.';
        case 'rework':
          return 'Order sent back to production for rework.';
        default:
          if (oldObj.status && newObj.status) {
            return `Status changed from ${humanizeStatus(oldObj.status)} to ${humanizeStatus(
              newObj.status
            )}.`;
          }
          return activity.activity_description;
      }
    }

    // Non-status activities: keep existing description
    return activity.activity_description;
  };

  const formatDateTimeSafe = (value: any, options?: Intl.DateTimeFormatOptions) => {
    if (!value) return 'N/A';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      return date.toLocaleString('en-IN', options || {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(value);
    }
  };

  // Calculate order totals
  const { subtotal, gstAmount, grandTotal } = calculateOrderSummary(orderItems, order);
  const gstBreakdown = calculateGSTRatesBreakdown(orderItems, order);

  if (loading || !formData) {
    return <div className="text-center py-8">Loading order data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          {/* Customer & Order Details */}
          <Card>
        <CardHeader>
          <CardTitle>Customer & Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Input value={customer?.company_name || ''} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input value={new Date(order.order_date).toLocaleDateString()} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Expected Delivery Date</Label>
              <Input value={new Date(order.expected_delivery_date).toLocaleDateString()} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Order Number</Label>
              <Input value={order.order_number} readOnly className="bg-muted" />
            </div>
            {order.reference_id && (
              <div className="space-y-2">
                <Label>Reference ID</Label>
                <Input value={order.reference_id} readOnly className="bg-muted" />
              </div>
            )}
            {order.notes && (
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Input value={order.notes} readOnly className="bg-muted" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.products.map((product: any, index: number) => {
            // Get product image from order items - prioritize class_image from specifications
            const orderItem = orderItems.find((item: OrderItem) => {
              const specs = typeof item.specifications === 'string' 
                ? JSON.parse(item.specifications) 
                : item.specifications || {};
              return specs.product_id === product.product_id || specs.product_master_id === product.product_master_id;
            });
            
            // Get class image from specifications first (this is the image shown when selecting class)
            let productImage = null;
            if (orderItem) {
              const specs = typeof orderItem.specifications === 'string' 
                ? JSON.parse(orderItem.specifications) 
                : orderItem.specifications || {};
              // Prioritize class_image (the image shown when selecting class)
              productImage = specs.class_image || getOrderItemDisplayImage(orderItem, order);
            }
            
            return (
            <div key={index} className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">Product {index + 1}</h4>
              </div>

              {/* Product Image and Fields in Single Row */}
              <div className="flex items-start gap-4">
                {productImage && (
                  <img 
                    src={productImage} 
                    alt={product.product_name || 'Product'} 
                    className="w-24 h-24 object-cover rounded-lg border flex-shrink-0"
                  />
                )}
                <div className="flex items-center gap-4 flex-wrap flex-1">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Input value={product.class || ''} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Input value={product.product_name || ''} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Input value={product.color || ''} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input value={product.category || ''} readOnly className="bg-muted" />
                  </div>
                </div>
              </div>

              {/* Size-wise Quantities */}
              {product.sizes_quantities && Object.keys(product.sizes_quantities).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Size-wise Quantities</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 border rounded-lg bg-muted/30">
                    {sortSizesQuantities(
                      product.sizes_quantities,
                      (product as any).size_type_id,
                      sizeTypes
                    ).map(([size, qty]) => (
                      <div key={size} className="space-y-1">
                        <Label className="text-sm font-medium">{size}</Label>
                        <Input
                          type="number"
                          value={qty as number}
                          readOnly
                          className="bg-background text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Quantity: <span className="font-semibold">{product.quantity}</span>
                  </div>
                </div>
              )}

              {(!product.sizes_quantities || Object.keys(product.sizes_quantities).length === 0) && (
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input value={product.quantity} readOnly className="bg-muted" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Unit Price</Label>
                  <Input value={formatCurrency(product.unit_price)} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>GST Rate</Label>
                  <Input value={`${product.gst_rate}%`} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Total Price</Label>
                  <Input value={formatCurrency(product.total_price)} readOnly className="bg-muted" />
                </div>
              </div>

              {/* Images and Branding */}
              {(product.reference_images?.length > 0 || product.mockup_images?.length > 0 || product.attachments?.length > 0 || product.branding_items?.length > 0) && (
                <div className="space-y-4 mt-4 border-t pt-4">
                  {product.reference_images?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Reference Images</Label>
                      <div className="flex gap-2 flex-wrap">
                        {product.reference_images.map((url: string, idx: number) => (
                          <img key={idx} src={url} alt={`Reference ${idx + 1}`} className="w-20 h-20 object-cover rounded border" />
                        ))}
                      </div>
                    </div>
                  )}
                  {product.mockup_images?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Mockup Images</Label>
                      <div className="flex gap-2 flex-wrap">
                        {product.mockup_images.map((url: string, idx: number) => (
                          <img key={idx} src={url} alt={`Mockup ${idx + 1}`} className="w-20 h-20 object-cover rounded border" />
                        ))}
                      </div>
                    </div>
                  )}
                  {product.attachments?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Attachments</Label>
                      <div className="space-y-1">
                        {product.attachments.map((url: string, idx: number) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block">
                            Attachment {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.branding_items?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Branding Details</Label>
                      <div className="space-y-2">
                        {product.branding_items.map((branding: any, idx: number) => (
                          <div key={idx} className="p-3 border rounded bg-muted/30">
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><strong>Type:</strong> {branding.branding_type}</div>
                              <div><strong>Placement:</strong> {branding.placement}</div>
                              <div><strong>Measurement:</strong> {branding.measurement}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </CardContent>
      </Card>

        </div>

        {/* Sidebar Cards */}
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
                <Label className="text-sm text-muted-foreground">Order Date</Label>
                {isEditing && editDraft ? (
                  <Input 
                    type="date" 
                    value={editDraft.order_date} 
                    onChange={e => setEditDraft({ ...editDraft, order_date: e.target.value })} 
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium">
                    {new Date(order.order_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Expected Delivery</Label>
                {isEditing && editDraft ? (
                  <Input 
                    type="date" 
                    value={editDraft.expected_delivery_date} 
                    onChange={e => setEditDraft({ ...editDraft, expected_delivery_date: e.target.value })} 
                    className="mt-1"
                  />
                ) : (
                  order.expected_delivery_date && (
                    <p className="font-medium">
                      {new Date(order.expected_delivery_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  )
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Sales Manager</Label>
                {isEditing && editDraft ? (
                  <Select 
                    value={editDraft.sales_manager || 'none'} 
                    onValueChange={(v) => setEditDraft({ ...editDraft, sales_manager: v === 'none' ? null : v })}
                    className="mt-1"
                  >
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  salesManager && (
                    <div className="flex items-center gap-2">
                      {salesManager.avatar_url ? (
                        <img
                          src={salesManager.avatar_url}
                          alt={salesManager.full_name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <p className="font-medium">{salesManager.full_name}</p>
                    </div>
                  )
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Payment Method</Label>
                {isEditing && editDraft ? (
                  <Input 
                    value={editDraft.payment_channel || ''} 
                    onChange={e => setEditDraft({ ...editDraft, payment_channel: e.target.value })} 
                    className="mt-1"
                    placeholder="Payment method"
                  />
                ) : (
                  order.payment_channel && (
                    <p className="font-medium">{order.payment_channel}</p>
                  )
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Reference ID</Label>
                {isEditing && editDraft ? (
                  <Input 
                    value={editDraft.reference_id || ''} 
                    onChange={e => setEditDraft({ ...editDraft, reference_id: e.target.value })} 
                    className="mt-1"
                    placeholder="Reference ID"
                  />
                ) : (
                  order.reference_id && (
                    <p className="font-medium">{order.reference_id}</p>
                  )
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Notes</Label>
                {isEditing && editDraft ? (
                  <Textarea 
                    value={editDraft.notes || ''} 
                    onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })} 
                    className="mt-1"
                    placeholder="Notes"
                    rows={3}
                  />
                ) : (
                  order.notes && (
                    <p className="font-medium text-sm">{order.notes}</p>
                  )
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">GST Rate (%)</Label>
                {isEditing && editDraft ? (
                  <Input 
                    type="number" 
                    value={editDraft.gst_rate} 
                    onChange={e => setEditDraft({ ...editDraft, gst_rate: parseFloat(e.target.value) || 0 })} 
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium">{order.gst_rate || 0}%</p>
                )}
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Advance Amount</Label>
                {isEditing && editDraft ? (
                  <Input 
                    type="number" 
                    value={editDraft.advance_amount} 
                    onChange={e => setEditDraft({ ...editDraft, advance_amount: parseFloat(e.target.value) || 0 })} 
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium">{formatCurrency(order.advance_amount || 0)}</p>
                )}
              </div>
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
              {isEditing && editDraft ? (
                <div>
                  <Label className="text-sm text-muted-foreground">Customer</Label>
                  <Select 
                    value={editDraft.customer_id || 'none'} 
                    onValueChange={(v) => setEditDraft({ ...editDraft, customer_id: v === 'none' ? null : v })}
                    className="mt-1"
                  >
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customers.map(cust => (
                        <SelectItem key={cust.id} value={cust.id}>
                          {cust.company_name} {cust.contact_person ? `(${cust.contact_person})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-semibold text-lg">{customer?.company_name}</p>
                    <p className="text-muted-foreground">{customer?.contact_person}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{customer?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{customer?.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">
                      {customer?.address}, {customer?.city}, {customer?.state} - {customer?.pincode}
                    </p>
                  </div>
                  {customer?.gstin && (
                    <div>
                      <p className="text-sm text-muted-foreground">GSTIN</p>
                      <p className="font-medium">{customer.gstin}</p>
                    </div>
                  )}
                </>
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
              {(() => {
                if (gstBreakdown.length === 0) {
                  return (
                    <div className="flex justify-between">
                      <span>GST (0%)</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                  );
                } else if (gstBreakdown.length === 1) {
                  return (
                    <div className="flex justify-between">
                      <span>GST ({gstBreakdown[0].rate}%)</span>
                      <span>{formatCurrency(gstBreakdown[0].amount)}</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="space-y-1">
                      {gstBreakdown.map((gst, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>GST ({gst.rate}%)</span>
                          <span>{formatCurrency(gst.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-medium border-t pt-1">
                        <span>Total GST</span>
                        <span>{formatCurrency(gstBreakdown.reduce((sum, gst) => sum + gst.amount, 0))}</span>
                      </div>
                    </div>
                  );
                }
              })()}
              <div className="flex justify-between">
                <span>Amount Paid</span>
                <span className="text-green-600">{formatCurrency(totalReceipts)}</span>
              </div>
              <hr />
              <div className="flex justify-between font-bold text-lg">
                <span>Total Amount</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance Due</span>
                <span className={grandTotal - totalReceipts > 0 ? "text-orange-600" : "text-green-600"}>
                  {formatCurrency(grandTotal - totalReceipts)}
                </span>
              </div>
              
              {order.reference_id && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reference ID</span>
                  <span>{order.reference_id}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Lifecycle */}
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
                              <h4 className="font-semibold text-xs sm:text-sm break-words break-all leading-snug text-blue-700">
                                {getActivityTitle(activity)}
                              </h4>
                              <span className="text-[11px] sm:text-xs text-blue-600 sm:max-w-[65%] whitespace-normal sm:whitespace-normal break-words break-all sm:text-right">
                                {formatDateTimeSafe(activity.performed_at)}
                              </span>
                            </div>

                            {/* Subtitle / description */}
                            <p className="text-[11px] sm:text-xs text-muted-foreground mb-2 break-words">
                              {getActivitySubtitle(activity)}
                            </p>

                            {/* User info */}
                            <p className="text-[11px] sm:text-xs text-muted-foreground mb-2 break-words">
                              By:{' '}
                              {activity.user_name ||
                                activity.user_email ||
                                'System'}
                            </p>
                          
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
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const { profile, user } = useAuth();
  
  // Determine if we should hide pricing/order summary/lifecycle sections
  // Hide if: user is NOT admin (admins should always see all sections)
  const isAdmin = profile?.role === 'admin';
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const shouldHideSections = !isAdmin;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [fabrics, setFabrics] = useState<{ [key: string]: Fabric }>({});
  const [productCategories, setProductCategories] = useState<{ [key: string]: ProductCategory }>({});
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [selectedMockupImages, setSelectedMockupImages] = useState<{ [key: number]: number }>({});
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<{ [key: number]: number }>({});
  const [employees, setEmployees] = useState<SalesManager[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editDraft, setEditDraft] = useState<{ 
    order_date: string; 
    expected_delivery_date: string; 
    sales_manager: string | null; 
    customer_id: string | null;
    gst_rate: number; 
    payment_channel: string | null; 
    reference_id: string | null; 
    notes: string | null;
    advance_amount: number;
  } | null>(null);
  const [editItems, setEditItems] = useState<Array<{ 
    id: string; 
    product_description: string; 
    fabric_id: string;
    fabric_base_id?: string;
    color: string;
    gsm: string;
    product_category_id: string;
    size_type_id: string;
    quantity: number; 
    unit_price: number; 
    price: number; // base price
    size_prices?: Record<string, number>;
    gst_rate: number;
    sizes_quantities: Record<string, number>;
    remarks: string;
    customizations?: any[];
    branding_items?: any[];
  }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; company_name: string; contact_person: string }>>([]);
  const [additionalCharges, setAdditionalCharges] = useState<Array<{
    particular: string;
    rate: number;
    gst_percentage: number;
    amount_incl_gst: number;
  }>>([]);
  const [customizationModalOpen, setCustomizationModalOpen] = useState(false);
  const [activeCustomizationIndex, setActiveCustomizationIndex] = useState<number | null>(null);
  const [editingCustomizationIndex, setEditingCustomizationIndex] = useState<number | null>(null);
  const [orderActivities, setOrderActivities] = useState<OrderActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [totalReceipts, setTotalReceipts] = useState<number>(0);
  const [hasCuttingMaster, setHasCuttingMaster] = useState<boolean>(false);

  // Handle back navigation based on referrer and order type
  const handleBackNavigation = () => {
    const from = searchParams.get('from');
    // Check if this is a readymade order
    if (order?.order_type === 'readymade') {
      navigate('/orders/readymade', { state: { refreshOrders: true } });
      return;
    }
    if (from === 'production') {
      navigate('/production', { state: { refreshOrders: true } });
    } else {
      navigate('/orders', { state: { refreshOrders: true } });
    }
  };

  // Map logged-in user -> employee_id so we can restrict edit access
  useEffect(() => {
    const loadEmployeeMapping = async () => {
      try {
        if (!user?.id) return;

        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, personal_email, user_id');

        if (!employeesData) return;

        // Fetch profiles once to support email-based mapping if needed
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('user_id, email');

        let matchedEmployeeId: string | null = null;

        for (const emp of employeesData as any[]) {
          if (emp.user_id && emp.user_id === user.id) {
            matchedEmployeeId = emp.id;
            break;
          }
        }

        // Fallback: match via email if we didn't find a direct user_id match
        if (!matchedEmployeeId && allProfiles && profile?.email) {
          const matchingProfile = allProfiles.find((p: any) => p.email === profile.email);
          if (matchingProfile) {
            const emp = (employeesData as any[]).find(
              (e: any) => e.user_id === matchingProfile.user_id || e.personal_email === matchingProfile.email
            );
            if (emp) {
              matchedEmployeeId = emp.id;
            }
          }
        }

        if (matchedEmployeeId) {
          setCurrentEmployeeId(matchedEmployeeId);
        }
      } catch (error) {
        console.error('Error mapping user to employee:', error);
      }
    };

    loadEmployeeMapping();
  }, [user?.id, profile?.email]);

  const canEditOrder = !!order && !hasCuttingMaster && (isAdmin || (currentEmployeeId && order.sales_manager === currentEmployeeId));

  const handleDeleteOrder = async () => {
    if (!order) return;
    
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete order ${order.order_number}?\n\nThis action cannot be undone and will delete all related data including:\n- Order items\n- Customizations\n- Activities\n- All associated records`
    );
    
    if (!confirmed) {
      console.log('Order deletion cancelled by user');
      return;
    }
    
    try {
      console.log('Attempting to delete order:', order.id, order.order_number);
      
      // Try final delete function first (handles trigger conflicts properly)
      const { data: finalData, error: finalError } = await supabase
        .rpc('safe_delete_order_final', { order_uuid: order.id });
      
      if (finalError) {
        console.error('Error calling safe_delete_order_final:', finalError);
        
        // Fallback to manual deletion if the function doesn't exist
        console.log('Falling back to manual deletion...');
        
        // Try manual deletion with better error handling
        const { error: manualError } = await supabase
          .from('orders')
          .delete()
          .eq('id', order.id as any);
        
        if (manualError) {
          console.error('Manual deletion also failed:', manualError);
          
          if (manualError.code === '409') {
            toast.error('Cannot delete order: It may be referenced by other records. Please contact support.');
          } else if (manualError.code === '23503') {
            toast.error('Cannot delete order: Related records still exist. Please try again.');
          } else {
            toast.error(`Failed to delete order: ${manualError.message}`);
          }
          return;
        }
      } else if (finalData === 0) {
        toast.error('Order not found or already deleted');
      } else if (finalData === 1) {
        toast.success('Order deleted successfully');
      } else if (finalData === -1) {
        toast.error('Error occurred during deletion');
      }

      // Always navigate back to orders list after any deletion attempt
      // (whether successful, failed, or order not found)
      // Check if this was a readymade order
      if (order?.order_type === 'readymade') {
        navigate('/orders/readymade', { state: { refreshOrders: true } });
      } else {
        const from = searchParams.get('from');
        if (from === 'production') {
          navigate('/production', { state: { refreshOrders: true } });
        } else {
          navigate('/orders', { state: { refreshOrders: true } });
        }
      }
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('An unexpected error occurred while deleting the order');
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchOrderActivities();
    } else {
      toast.error('Invalid order ID');
      handleBackNavigation();
    }
  }, [id]);

  useEffect(() => {
    if (order?.order_number) {
      fetchTotalReceipts();
    }
  }, [order?.order_number]);

  // DISABLED: Refresh receipts on focus - prevents unwanted auto-refresh
  // Receipts will only refresh when explicitly needed (e.g., after creating a receipt)
  // Removed focus-based auto-refresh to prevent page refreshes on tab switch

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

        if (orderError) {
          if (orderError.code === 'PGRST116') {
            // Order not found
            toast.error('Order not found or has been deleted');
            handleBackNavigation();
            return;
          }
          throw orderError;
        }
        if (!orderData) {
          toast.error('Order not found or has been deleted');
          handleBackNavigation();
          return;
        }
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
          try {
            const { data: salesManagerData, error: salesManagerError } = await (supabase as any)
              .from('employees')
              .select('id, full_name, avatar_url')
              .eq('id', (orderData as any).sales_manager)
              .single();
            
            if (salesManagerError) {
              console.error('Error fetching sales manager:', salesManagerError);
            } else {
              setSalesManager((salesManagerData as unknown as SalesManager) || null);
            }
          } catch (error) {
            console.error('Error fetching sales manager:', error);
          }
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

        // Fetch size types for sorting
        const { data: sizeTypesData } = await (supabase as any)
          .from('size_types')
          .select('*');
        
        if (sizeTypesData) {
          setSizeTypes(sizeTypesData as SizeType[]);
        }

        // Fetch order items
        const { data: itemsData, error: itemsError } = await (supabase as any)
          .from('order_items')
          .select('*, mockup_images, specifications, category_image_url')
          .eq('order_id', id as string);

        if (itemsError) {
          console.error('Error fetching order items:', itemsError);
          throw itemsError;
        }
        
        setOrderItems((itemsData as unknown as OrderItem[]) || []);

        // Check if order has cutting master assigned
        try {
          const { data: assignmentData, error: assignmentError } = await supabase
            .from('order_assignments')
            .select('cutting_master_id')
            .eq('order_id', id as string)
            .maybeSingle();
          
          if (!assignmentError) {
            setHasCuttingMaster(!!assignmentData?.cutting_master_id);
          } else {
            setHasCuttingMaster(false);
          }
        } catch (error) {
          console.error('Error checking cutting master assignment:', error);
          setHasCuttingMaster(false);
        }

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
              acc[fabric.id] = {
                id: fabric.id,
                name: fabric.fabric_name  // Map fabric_name to name
              } as Fabric;
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
      
      // Check if it's a "not found" error
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
        toast.error('Order not found or has been deleted');
      } else {
        toast.error('Failed to load order details');
      }
      
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

  const fetchTotalReceipts = async () => {
    try {
      if (!order?.order_number) return;
      
      const { data: receiptsData, error: receiptsError } = await (supabase as any)
        .from('receipts')
        .select('amount')
        .eq('reference_number', order.order_number)
        .eq('reference_type', 'order');

      if (receiptsError) {
        console.error('Error fetching receipts:', receiptsError);
        return;
      }

      const total = (receiptsData || []).reduce((sum: number, receipt: any) => sum + Number(receipt.amount), 0);
      setTotalReceipts(total);
      
    } catch (error) {
      console.error('Error calculating total receipts:', error);
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

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;

    try {
      const { error } = await (supabase as any)
        .from('orders')
        .update({ status: newStatus as Database['public']['Enums']['order_status'] } as Database['public']['Tables']['orders']['Update'])
        .eq('id', order.id);

      if (error) throw error;

      toast.success(`Order status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      setOrder({ ...order, status: newStatus });
      await fetchOrderActivities();
      
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const startEditing = async () => {
    if (!order) return;
    
    // Fetch customers list
    try {
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, company_name, contact_person')
        .order('company_name');
      if (customersData) {
        setCustomers(customersData);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
    
    setEditDraft({
      order_date: order.order_date ? order.order_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      expected_delivery_date: order.expected_delivery_date ? order.expected_delivery_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      sales_manager: order.sales_manager || null,
      customer_id: order.customer_id || null,
      gst_rate: order.gst_rate ?? 0,
      payment_channel: order.payment_channel || '',
      reference_id: order.reference_id || '',
      notes: order.notes || '',
      advance_amount: order.advance_amount || 0
    });
    
    // Fetch additional charges if any
    try {
      const { data: chargesData } = await supabase
        .from('order_additional_charges')
        .select('*')
        .eq('order_id', order.id);
      if (chargesData) {
        setAdditionalCharges(chargesData.map((c: any) => ({
          particular: c.particular || '',
          rate: c.rate || 0,
          gst_percentage: c.gst_percentage || 0,
          amount_incl_gst: c.amount_incl_gst || 0
        })));
      }
    } catch (error) {
      console.error('Error fetching additional charges:', error);
    }
    
    const itemsDraft = orderItems.map(it => {
      const specs = typeof it.specifications === 'string' ? JSON.parse(it.specifications) : (it.specifications || {});
      const sizePrices = specs.size_prices || it.size_prices || {};
      const basePrice = it.unit_price || (sizePrices && Object.values(sizePrices).length > 0 ? Math.min(...Object.values(sizePrices) as number[]) : 0);
      
      return {
        id: it.id,
        product_description: it.product_description || '',
        fabric_id: it.fabric_id || '',
        fabric_base_id: specs.fabric_base_id || it.fabric_base_id || '',
        color: it.color || '',
        gsm: it.gsm || '',
        product_category_id: it.product_category_id || '',
        size_type_id: specs.size_type_id || it.size_type_id || '',
        quantity: it.quantity,
        unit_price: it.unit_price,
        price: basePrice,
        size_prices: sizePrices,
        gst_rate: it.gst_rate ?? (order.gst_rate ?? 0),
        sizes_quantities: it.sizes_quantities || specs.sizes_quantities || {},
        remarks: it.remarks || specs.remarks || '',
        customizations: specs.customizations || [],
        branding_items: specs.branding_items || []
      };
    });
    setEditItems(itemsDraft);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditDraft(null);
    setEditItems([]);
    setAdditionalCharges([]);
    setCustomizationModalOpen(false);
    setActiveCustomizationIndex(null);
    setEditingCustomizationIndex(null);
  };

  // Computed display items - use edited items when editing, otherwise use original items
  const displayItems = useMemo(() => {
    if (isEditing && editItems.length > 0) {
      return editItems;
    }
    return orderItems;
  }, [isEditing, editItems, orderItems]);

  // Helper function to calculate item total using size-based pricing
  const calculateItemTotal = (item: typeof editItems[0]) => {
    if (item.size_prices && Object.keys(item.sizes_quantities || {}).length > 0) {
      // Use size-based pricing
      return calculateSizeBasedTotal(
        item.sizes_quantities || {},
        item.size_prices,
        item.price || item.unit_price || 0
      );
    } else {
      // Fallback to quantity * unit_price
      return item.quantity * (item.unit_price || item.price || 0);
    }
  };

  // Memoized totals calculation that recalculates when dependencies change
  const draftTotals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    editItems.forEach(it => {
      const amount = calculateItemTotal(it);
      subtotal += amount;
      const rate = isNaN(it.gst_rate) ? 0 : it.gst_rate;
      gstTotal += (amount * rate) / 100;
    });
    const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + charge.amount_incl_gst, 0);
    const grandTotal = subtotal + gstTotal + additionalChargesTotal;
    const balance = grandTotal - (editDraft?.advance_amount || 0);
    return { subtotal, gstTotal, additionalChargesTotal, grandTotal, balance };
  }, [editItems, additionalCharges, editDraft?.advance_amount]);

  const handleRemoveCustomization = (itemIdx: number, customizationIdx: number) => {
    setEditItems(prev =>
      prev.map((item, index) =>
        index === itemIdx
          ? {
              ...item,
              customizations: (item.customizations || []).filter((_, i) => i !== customizationIdx),
            }
          : item
      )
    );
    // Clear editing index if we removed the one being edited
    setEditingCustomizationIndex(prev => (prev === customizationIdx ? null : prev));
  };

  // Computed order summary - use draft totals when editing, otherwise calculate from orderItems
  const orderSummary = useMemo(() => {
    if (isEditing && editItems.length > 0) {
      return draftTotals;
    }
    if (!order) {
      // Return default values when order is not loaded yet
      return {
        subtotal: 0,
        gstTotal: 0,
        additionalChargesTotal: 0,
        grandTotal: 0,
        balance: 0
      };
    }
    const summary = calculateOrderSummary(orderItems, order);
    const additionalChargesTotal = isEditing ? additionalCharges.reduce((sum, charge) => sum + charge.amount_incl_gst, 0) : 0;
    return {
      subtotal: summary.subtotal,
      gstTotal: summary.gstAmount,
      additionalChargesTotal,
      grandTotal: summary.grandTotal + additionalChargesTotal,
      balance: summary.grandTotal + additionalChargesTotal - (isEditing ? (editDraft?.advance_amount || 0) : (order?.advance_amount || 0))
    };
  }, [isEditing, editItems, orderItems, order, draftTotals, additionalCharges, editDraft?.advance_amount]);

  // Computed GST breakdown - use displayItems
  const gstBreakdown = useMemo(() => {
    if (!order) return [];
    return calculateGSTRatesBreakdown(displayItems, order);
  }, [displayItems, order]);

  const handleSaveEdit = async () => {
    if (!order || !editDraft) return;
    try {
      setSavingEdit(true);
      // Update order items
      await Promise.all(
        editItems.map(async (it) => {
          // Get existing specifications to preserve other fields
          const { data: existingItem } = await supabase
            .from('order_items')
            .select('specifications')
            .eq('id', it.id)
            .single();
          
          const existingSpecs = existingItem?.specifications 
            ? (typeof existingItem.specifications === 'string' 
                ? JSON.parse(existingItem.specifications) 
                : existingItem.specifications)
            : {};
          
          // Calculate item total using size-based pricing if available
          let itemTotal = 0;
          if (it.size_prices && Object.keys(it.sizes_quantities || {}).length > 0) {
            Object.entries(it.sizes_quantities || {}).forEach(([size, qty]) => {
              const sizePrice = it.size_prices?.[size] ?? it.price ?? it.unit_price;
              itemTotal += (qty || 0) * sizePrice;
            });
          } else {
            itemTotal = it.quantity * (it.unit_price || it.price || 0);
          }
          
          // Merge all fields into specifications
          const updatedSpecs = {
            ...existingSpecs,
            sizes_quantities: it.sizes_quantities,
            size_prices: it.size_prices,
            size_type_id: it.size_type_id,
            remarks: it.remarks,
            customizations: it.customizations,
            branding_items: it.branding_items,
            fabric_base_id: it.fabric_base_id
          };
          
          return (supabase as any)
            .from('order_items')
            .update({
              product_description: it.product_description,
              fabric_id: it.fabric_id || null,
              color: it.color || null,
              gsm: it.gsm || null,
              product_category_id: it.product_category_id || null,
              quantity: it.quantity,
              unit_price: it.price || it.unit_price,
              total_price: itemTotal,
              gst_rate: it.gst_rate,
              sizes_quantities: it.sizes_quantities,
              remarks: it.remarks,
              specifications: updatedSpecs,
            })
            .eq('id', it.id);
        })
      );

      // Save/Update additional charges
      if (additionalCharges.length > 0) {
        // Delete existing charges
        await supabase
          .from('order_additional_charges')
          .delete()
          .eq('order_id', order.id);
        
        // Insert new charges
        await supabase
          .from('order_additional_charges')
          .insert(
            additionalCharges
              .filter(c => c.particular && c.rate > 0)
              .map(charge => ({
                order_id: order.id,
                particular: charge.particular,
                rate: charge.rate,
                gst_percentage: charge.gst_percentage,
                amount_incl_gst: charge.amount_incl_gst
              }))
          );
      } else {
        // Delete all charges if none exist
        await supabase
          .from('order_additional_charges')
          .delete()
          .eq('order_id', order.id);
      }

      const { subtotal, gstTotal, grandTotal, balance: balanceAmount } = draftTotals;

      const { error: orderUpdateError } = await (supabase as any)
        .from('orders')
        .update({
          order_date: new Date(editDraft.order_date).toISOString(),
          expected_delivery_date: new Date(editDraft.expected_delivery_date).toISOString(),
          sales_manager: editDraft.sales_manager,
          customer_id: editDraft.customer_id,
          gst_rate: editDraft.gst_rate,
          payment_channel: editDraft.payment_channel,
          reference_id: editDraft.reference_id,
          notes: editDraft.notes,
          advance_amount: editDraft.advance_amount || 0,
          total_amount: subtotal,
          tax_amount: gstTotal,
          final_amount: grandTotal,
          balance_amount: balanceAmount
        })
        .eq('id', order.id);
      if (orderUpdateError) throw orderUpdateError;

      toast.success('Order updated successfully');
      setIsEditing(false);
      setEditDraft(null);
      setEditItems([]);
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
    generateOrderEmail: (customer: any, orderNumber: string, grandTotal: number, orderDate: string, status: string, salesManagerName?: string, companyName?: string) => {
      const companyInfo = companyName ? `\n${companyName}` : '';
      
      // Only include sales manager info if we have actual data
      const salesManagerInfo = salesManagerName ? `• Sales Manager: ${salesManagerName}\n` : '';
      const signature = salesManagerName ? `${salesManagerName}${companyInfo}` : companyName || 'Sales Team';
      
      return encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Thank you for your order. Please find below the order details:\n\n` +
        `ORDER DETAILS:\n` +
        `• Order Number: ${orderNumber}\n` +
        `• Order Date: ${new Date(orderDate).toLocaleDateString('en-IN')}\n` +
        `• Total Amount: ${formatCurrency(grandTotal)}\n` +
        `• Current Status: ${status.replace('_', ' ').toUpperCase()}\n` +
        `${salesManagerInfo}` +
        `We will keep you updated on the progress of your order.\n\n` +
        `Thank you for choosing us.\n\n` +
        `Best regards,\n` +
        `${signature}`
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
      salesManager?.full_name || 'Sales Team',
      company?.company_name
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
      const companyInfo = company?.company_name ? `\n${company.company_name}` : '';
      
      // Only include sales manager info if we have actual data
      const salesManagerInfo = salesManager?.full_name ? `• Sales Manager: ${salesManager.full_name}\n` : '';
      const signature = salesManager?.full_name ? `${salesManager.full_name}${companyInfo}` : company?.company_name || 'Sales Team';
      
      const body = encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Please find attached the detailed order PDF for your reference.\n\n` +
        `Order Details:\n` +
        `• Order Number: ${order.order_number}\n` +
        `• Total Amount: ${formatCurrency(order.final_amount)}\n` +
        `• Status: ${order.status.replace('_', ' ').toUpperCase()}\n` +
        `• Date: ${new Date(order.order_date).toLocaleDateString('en-IN')}\n` +
        `${salesManagerInfo}` +
        `Note: The PDF file has been downloaded. Please attach it before sending.\n\n` +
        `Thank you for your business.\n\n` +
        `Best regards,\n` +
        `${signature}`
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

  const humanizeStatus = (status?: string | null) => {
    if (!status) return 'Status Updated';
    return status
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const getActivityTitle = (activity: OrderActivity) => {
    if (activity.activity_type === 'status_changed') {
      const newObj: any = parseMaybeJson(activity.new_values) || {};
      return humanizeStatus(newObj.status);
    }

    switch (activity.activity_type) {
      case 'order_created':
        return 'Order Created';
      case 'order_updated':
        return 'Order Updated';
      case 'payment_received':
        return 'Payment Received';
      case 'order_dispatched':
        return 'Order Dispatched';
      default:
        return activity.activity_description;
    }
  };

  const getActivitySubtitle = (activity: OrderActivity) => {
    if (activity.activity_type === 'status_changed') {
      const oldObj: any = parseMaybeJson(activity.old_values) || {};
      const newObj: any = parseMaybeJson(activity.new_values) || {};
      const newStatus = String(newObj.status || '').toLowerCase();

      switch (newStatus) {
        case 'designing_done':
          return 'Mockups approved and uploaded to Order Detail page.';
        case 'confirmed':
          return 'Advance payment received, order confirmed.';
        case 'under_procurement':
          return 'Materials planned and sent for procurement.';
        case 'under_cutting':
          return 'Cutting process started for this order.';
        case 'under_stitching':
          return 'Stitching in progress for this order.';
        case 'under_qc':
          return 'Order is under quality check.';
        case 'ready_for_dispatch':
          return 'Order packed and ready for dispatch.';
        case 'partial_dispatched':
          return 'Order partially dispatched to customer.';
        case 'dispatched':
          return 'Order fully dispatched to customer.';
        case 'rework':
          return 'Order sent back to production for rework.';
        default:
          if (oldObj.status && newObj.status) {
            return `Status changed from ${humanizeStatus(oldObj.status)} to ${humanizeStatus(
              newObj.status
            )}.`;
          }
          return activity.activity_description;
      }
    }

    // Non-status activities: keep existing description
    return activity.activity_description;
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
              Back to {order?.order_type === 'readymade' ? 'Readymade Orders' : (searchParams.get('from') === 'production' ? 'Production' : 'Orders')}
            </Button>
          </div>
        </div>
      </ErpLayout>
    );
  }

  // For readymade orders, show the form with order data
  if (order.order_type === 'readymade') {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={handleBackNavigation}
                className="flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Readymade Orders
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Readymade Order Details</h1>
                <p className="text-muted-foreground">Order #{order.order_number}</p>
              </div>
            </div>
          </div>
          
          {/* Show Readymade Order Form with all fields */}
          <ReadymadeOrderFormView orderId={id || ''} order={order} customer={customer} orderItems={orderItems} sizeTypes={sizeTypes} />
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
            <div className="flex items-center space-x-3">
              <Badge className={getStatusColor(order.status)}>
                {order.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {/* View Quotation Button */}
              <Button 
                variant="outline" 
                onClick={() => navigate(`/accounts/quotations/${order.id}`)}
              >
                <ScrollText className="w-4 h-4 mr-2" />
                View Quotation
              </Button>
              
              {/* Create Receipt Button */}
              <Button 
                variant="outline" 
                onClick={() => navigate('/accounts/receipts', {
                  state: {
                    prefill: {
                      type: 'order',
                      id: order.id,
                      number: order.order_number,
                      date: order.order_date,
                      customer_id: order.customer_id,
                      amount: order.final_amount,
                    },
                    tab: 'create'
                  }
                })}
              >
                <Receipt className="w-4 h-4 mr-2" />
                Create Receipt
              </Button>
              
              {order.status !== 'completed' && order.status !== 'cancelled' && (
                <Button 
                  variant="default" 
                  onClick={() => handleStatusChange('completed')}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  ✅ Mark as Completed
                </Button>
              )}
              
              {/* Print/Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Printer className="w-4 h-4 mr-1" />
                    Print/Export
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {canEditOrder && !isEditing && (
                <Button variant="outline" onClick={startEditing}>
                  Edit Order
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" onClick={cancelEditing} disabled={savingEdit}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Order</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete order #{order.order_number}? This action cannot be undone.
                    </AlertDialogDescription>
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-2">This will permanently delete:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>The order and all its details</li>
                        <li>All order items and their specifications</li>
                        <li>Order activities and history</li>
                        <li>Any customizations associated with this order</li>
                      </ul>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteOrder}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete Order
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Share Dropdown (Email + WhatsApp) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Share className="w-4 h-4 mr-1" />
                    Share
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Share Order</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  {/* Email Options */}
                  <DropdownMenuItem onClick={handleSendOrderEmail}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Order Summary
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={handleSendOrderPDFEmail}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email with PDF
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  {/* WhatsApp Options */}
                  <DropdownMenuItem onClick={handleShareOrderSummary}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp Summary
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={handleShareOrderPDF}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp PDF
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
                  {isEditing && editItems.length > 0 ? (
                    <div className="space-y-6">
                      {editItems.map((it, itemIdx) => {
                        const amount = calculateItemTotal(it);
                        const sortedSizes = sortSizesQuantities(
                          it.sizes_quantities || {},
                          it.size_type_id,
                          sizeTypes
                        );
                        return (
                          <div key={it.id} className="border rounded-lg p-4 space-y-4 bg-muted/10">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {/* Product Category */}
                              <div>
                                <Label>Product Category</Label>
                                <Select 
                                  value={it.product_category_id || 'none'} 
                                  onValueChange={(v) => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, product_category_id: v === 'none' ? '' : v } : p))}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {Object.values(productCategories).map(cat => (
                                      <SelectItem key={cat.id} value={cat.id}>{cat.category_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Product Description */}
                              <div>
                                <Label>Product Description</Label>
                                <Input 
                                  value={it.product_description} 
                                  onChange={e => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, product_description: e.target.value } : p))}
                                />
                              </div>
                              
                              {/* Size Type */}
                              <div>
                                <Label>Size Type</Label>
                                <Select 
                                  value={it.size_type_id || 'none'} 
                                  onValueChange={(v) => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, size_type_id: v === 'none' ? '' : v } : p))}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select size type" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {sizeTypes.map(st => (
                                      <SelectItem key={st.id} value={st.id}>{st.size_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Fabric */}
                              <div>
                                <Label>Fabric</Label>
                                <Select 
                                  value={it.fabric_id || 'none'} 
                                  onValueChange={(v) => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, fabric_id: v === 'none' ? '' : v } : p))}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select fabric" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {Object.values(fabrics).map(fabric => (
                                      <SelectItem key={fabric.id} value={fabric.id}>{fabric.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Color */}
                              <div>
                                <Label>Color</Label>
                                <Input 
                                  value={it.color || ''} 
                                  onChange={e => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, color: e.target.value } : p))}
                                />
                              </div>
                              
                              {/* GSM */}
                              <div>
                                <Label>GSM</Label>
                                <Input 
                                  value={it.gsm || ''} 
                                  onChange={e => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, gsm: e.target.value } : p))}
                                />
                              </div>
                              
                              {/* Base Price */}
                              <div>
                                <Label>Base Price</Label>
                                <Input 
                                  type="number" 
                                  value={it.price || 0} 
                                  onChange={e => {
                                    const v = parseFloat(e.target.value) || 0;
                                    setEditItems(prev => prev.map((p, i) => {
                                      if (i === itemIdx) {
                                        return { ...p, price: v, unit_price: v };
                                      }
                                      return p;
                                    }));
                                  }}
                                />
                              </div>
                              
                              {/* Quantity */}
                              <div>
                                <Label>Total Quantity</Label>
                                <Input 
                                  type="number" 
                                  value={it.quantity} 
                                  onChange={e => {
                                    const v = parseInt(e.target.value) || 0;
                                    setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, quantity: v } : p));
                                  }}
                                />
                              </div>
                              
                              {/* GST Rate */}
                              <div>
                                <Label>GST Rate (%)</Label>
                                <Input 
                                  type="number" 
                                  value={it.gst_rate} 
                                  onChange={e => {
                                    const v = parseFloat(e.target.value) || 0;
                                    setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, gst_rate: v } : p));
                                  }}
                                />
                              </div>
                              
                              {/* Remarks */}
                              <div className="md:col-span-2 lg:col-span-3">
                                <Label>Remarks</Label>
                                <Textarea 
                                  value={it.remarks || ''} 
                                  onChange={e => setEditItems(prev => prev.map((p, i) => i === itemIdx ? { ...p, remarks: e.target.value } : p))}
                                  rows={2}
                                />
                              </div>
                              
                              {/* Customizations */}
                              <div className="md:col-span-2 lg:col-span-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>Customizations</Label>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!it.product_category_id}
                                    onClick={() => {
                                      setActiveCustomizationIndex(itemIdx);
                                      setEditingCustomizationIndex(null);
                                      setCustomizationModalOpen(true);
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-1" />
                                    {(it.customizations && it.customizations.length > 0) ? 'Add More' : 'Add Customization'}
                                  </Button>
                                </div>
                                
                                {(it.customizations && it.customizations.length > 0) && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {it.customizations.map((customization: any, cIdx: number) => (
                                      <div
                                        key={`${customization.partId || cIdx}-${cIdx}`}
                                        className="relative p-3 border rounded-lg bg-white shadow-sm cursor-pointer"
                                        onClick={() => {
                                          setActiveCustomizationIndex(itemIdx);
                                          setEditingCustomizationIndex(cIdx);
                                          setCustomizationModalOpen(true);
                                        }}
                                      >
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="xs"
                                          className="absolute top-2 right-2 h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => handleRemoveCustomization(itemIdx, cIdx)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                        <div className="flex items-start gap-2">
                                          {customization.selectedAddonImageUrl && (
                                            <img 
                                              src={customization.selectedAddonImageUrl} 
                                              alt={customization.selectedAddonImageAltText || customization.selectedAddonName}
                                              className="w-8 h-8 object-cover rounded border flex-shrink-0"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                              }}
                                            />
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-xs truncate" title={customization.partName}>
                                              {customization.partName}
                                            </div>
                                            {customization.partType === 'dropdown' && (customization.selectedAddonName || customization.selectedAddonId) && (
                                              <div className="text-xs text-muted-foreground truncate" title={customization.selectedAddonName}>
                                                {customization.selectedAddonName}
                                              </div>
                                            )}
                                            {customization.partType === 'number' && customization.quantity && customization.quantity > 0 && (
                                              <div className="text-xs text-muted-foreground">
                                                Qty: {customization.quantity}
                                              </div>
                                            )}
                                            {customization.priceImpact !== undefined && customization.priceImpact !== null && customization.priceImpact !== 0 && (
                                              <div className="text-xs font-medium text-green-600">
                                                ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                                              </div>
                                            )}
                                            {/* Display Colors */}
                                            {customization.colors && customization.colors.length > 0 && (
                                              <div className="mt-2">
                                                <CustomizationColorChips colors={customization.colors} />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {!it.product_category_id && (
                                  <p className="text-xs text-muted-foreground">
                                    Select a product category to enable customizations
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {/* Size-wise Quantities */}
                            {it.size_type_id && sortedSizes.length > 0 && (
                              <div className="space-y-2 border-t pt-4">
                                <Label className="text-sm font-semibold">Size-wise Quantities</Label>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {sortedSizes.map(([size, qty]) => (
                                    <div key={size} className="flex flex-col space-y-1 flex-shrink-0 min-w-[80px]">
                                      <Label className="text-xs text-center">{size}</Label>
                                      <Input
                                        type="number"
                                        value={qty}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value) || 0;
                                          setEditItems(prev => prev.map((p, i) => {
                                            if (i === itemIdx) {
                                              const newSizes = { ...p.sizes_quantities, [size]: v };
                                              return { ...p, sizes_quantities: newSizes };
                                            }
                                            return p;
                                          }));
                                        }}
                                        className="w-full text-center text-sm"
                                      />
                                    </div>
                                  ))}
                                  <div className="flex flex-col space-y-1 flex-shrink-0 min-w-[80px]">
                                    <Label className="text-xs text-center">Add</Label>
                                    <Input 
                                      placeholder="Size"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.currentTarget.value) {
                                          const newSize = e.currentTarget.value.trim();
                                          if (!it.sizes_quantities[newSize]) {
                                            setEditItems(prev => prev.map((p, i) => {
                                              if (i === itemIdx) {
                                                const newSizes = { ...p.sizes_quantities, [newSize]: 0 };
                                                return { ...p, sizes_quantities: newSizes };
                                              }
                                              return p;
                                            }));
                                            e.currentTarget.value = '';
                                          }
                                        }
                                      }}
                                      className="w-full text-center text-sm"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Size-wise Prices */}
                            {it.size_type_id && sortedSizes.length > 0 && it.size_prices && (
                              <div className="space-y-2 border-t pt-4">
                                <Label className="text-sm font-semibold">Size-wise Prices (Custom prices, leave empty to use base price)</Label>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {sortedSizes.map(([size]) => {
                                    const sizePrice = it.size_prices?.[size];
                                    const isCustom = sizePrice !== undefined && sizePrice !== it.price;
                                    return (
                                      <div key={size} className="flex flex-col space-y-1 flex-shrink-0 min-w-[80px]">
                                        <Label className="text-xs text-center">{size}</Label>
                                        <Input
                                          type="number"
                                          value={sizePrice !== undefined ? sizePrice : it.price}
                                          onChange={(e) => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setEditItems(prev => prev.map((p, i) => {
                                              if (i === itemIdx) {
                                                const currentSizePrices = p.size_prices || {};
                                                const updatedSizePrices = { ...currentSizePrices };
                                                if (v === p.price) {
                                                  delete updatedSizePrices[size];
                                                } else {
                                                  updatedSizePrices[size] = v;
                                                }
                                                return { 
                                                  ...p, 
                                                  size_prices: Object.keys(updatedSizePrices).length > 0 ? updatedSizePrices : undefined
                                                };
                                              }
                                              return p;
                                            }));
                                          }}
                                          className={`w-full text-center text-sm ${isCustom ? 'border-blue-500 bg-blue-50' : ''}`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            <div className="text-right text-sm font-medium border-t pt-2">
                              Item Total: {formatCurrency(amount)}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Additional Charges */}
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-sm font-semibold">Additional Charges</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAdditionalCharges(prev => [...prev, { particular: '', rate: 0, gst_percentage: 0, amount_incl_gst: 0 }])}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Charge
                          </Button>
                        </div>
                        {additionalCharges.map((charge, chargeIdx) => (
                          <div key={chargeIdx} className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded-lg p-3">
                            <Input
                              placeholder="Particular"
                              value={charge.particular}
                              onChange={(e) => setAdditionalCharges(prev => prev.map((c, i) => i === chargeIdx ? { ...c, particular: e.target.value } : c))}
                            />
                            <Input
                              type="number"
                              placeholder="Rate"
                              value={charge.rate}
                              onChange={(e) => {
                                const rate = parseFloat(e.target.value) || 0;
                                const gst = charge.gst_percentage || 0;
                                const amountInclGst = rate * (1 + gst / 100);
                                setAdditionalCharges(prev => prev.map((c, i) => i === chargeIdx ? { ...c, rate, amount_incl_gst: amountInclGst } : c));
                              }}
                            />
                            <Input
                              type="number"
                              placeholder="GST %"
                              value={charge.gst_percentage}
                              onChange={(e) => {
                                const gst = parseFloat(e.target.value) || 0;
                                const rate = charge.rate || 0;
                                const amountInclGst = rate * (1 + gst / 100);
                                setAdditionalCharges(prev => prev.map((c, i) => i === chargeIdx ? { ...c, gst_percentage: gst, amount_incl_gst: amountInclGst } : c));
                              }}
                            />
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                placeholder="Amount"
                                value={charge.amount_incl_gst}
                                disabled
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setAdditionalCharges(prev => prev.filter((_, i) => i !== chargeIdx))}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="text-right space-y-1 text-sm border-t pt-4">
                        <div>Subtotal: {formatCurrency(draftTotals.subtotal)}</div>
                        <div>GST Total: {formatCurrency(draftTotals.gstTotal)}</div>
                        {draftTotals.additionalChargesTotal > 0 && (
                          <div>Additional Charges: {formatCurrency(draftTotals.additionalChargesTotal)}</div>
                        )}
                        <div className="font-semibold text-lg">Grand Total: {formatCurrency(draftTotals.grandTotal)}</div>
                        {editDraft && (
                          <>
                            <div>Advance Amount: {formatCurrency(editDraft.advance_amount || 0)}</div>
                            <div className="font-medium">Balance Due: {formatCurrency(draftTotals.balance)}</div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {displayItems.map((item, index) => {
                      // Define proper size order using master configuration
                      const getSizeOrder = (sizes: string[]) => {
                        // Get size_type_id from item if available
                        const sizeTypeId = item.size_type_id || 
                          (item.specifications && typeof item.specifications === 'object' && item.specifications.size_type_id) || 
                          null;
                        
                        // Sort sizes using master order
                        return sortSizesByMasterOrder(sizes, sizeTypeId, sizeTypes);
                      };

                      return (
                        <div key={index} className="border rounded-lg p-4 space-y-4">
                          <div className="flex flex-col xl:flex-row gap-6">
                            {/* Product Images Section - Better aspect ratio and space utilization */}
                            <div className="xl:w-2/5 space-y-6">
                              {/* Product Image - Only show mockup images, not category images */}
                              {(() => {
                                const displayImage = getOrderItemDisplayImage(item, order);
                                const { mockup_images } = extractImagesFromSpecifications(item.specifications);
                                const isReadymadeOrder = order?.order_type === 'readymade';
                                const hasMockup = !isReadymadeOrder && ((item.mockup_images && item.mockup_images.length > 0) || 
                                                 (mockup_images && mockup_images.length > 0));
                                
                                // Only show image if it's a mockup (not category image)
                                // For custom orders, getOrderItemDisplayImage now returns null if no mockup
                                return displayImage && hasMockup ? (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-3">
                                      Product Image (Mockup)
                                    </p>
                                    <div className="aspect-[3/3.5] w-full overflow-hidden rounded-lg border shadow-md">
                                      <img 
                                        src={displayImage} 
                                        alt="Product Mockup"
                                        className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                        onClick={() => {
                                          const modal = document.createElement('div');
                                          modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                          modal.innerHTML = `
                                            <div class="relative max-w-4xl max-h-full">
                                              <img src="${displayImage}" alt="Product Mockup" class="max-w-full max-h-full object-contain rounded-lg" />
                                              <button class="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 text-black" onclick="this.closest('.fixed').remove()">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                              </button>
                                            </div>
                                          `;
                                          document.body.appendChild(modal);
                                          modal.onclick = (e) => {
                                            if (e.target === modal) {
                                              document.body.removeChild(modal);
                                            }
                                          };
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : null;
                              })()}

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
                                  {!shouldHideSections && (
                                    <>
                                      <div className="bg-muted/30 rounded-lg p-3">
                                        <span className="text-xs text-muted-foreground block">Unit Price</span>
                                        <span className="font-medium">{formatCurrency((item as any).unit_price || (item as any).price || 0)}</span>
                                      </div>
                                      <div className="bg-muted/30 rounded-lg p-3">
                                        <span className="text-xs text-muted-foreground block">Total Price</span>
                                        <span className="font-medium text-primary">{formatCurrency(
                                          isEditing && editItems.some(ei => ei.id === item.id)
                                            ? calculateItemTotal(editItems.find(ei => ei.id === item.id)!)
                                            : (item.total_price || 0)
                                        )}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                {/* Size Breakdown with proper ordering */}
                                {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-3">Size Breakdown:</p>
                                    <div className="bg-muted/20 rounded-lg p-4">
                                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        {sortSizesQuantities(
                                          item.sizes_quantities as Record<string, number> | null,
                                          isEditing && editItems.some(ei => ei.id === item.id)
                                            ? editItems.find(ei => ei.id === item.id)?.size_type_id
                                            : (item as any).size_type_id,
                                          sizeTypes
                                        ).map(([size, qty]) => (
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
                                
                                {/* Customizations */}
                                {item.specifications && (() => {
                                  try {
                                    const parsed = typeof item.specifications === 'string' ? JSON.parse(item.specifications) : item.specifications;
                                    const customizations = parsed.customizations || [];
                                    
                                    return customizations.length > 0 ? (
                                      <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-3">Customizations:</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                          {customizations.map((customization: any, idx: number) => (
                                            <div key={idx} className="relative p-2 border rounded-lg bg-gray-50 min-w-0">
                                              <div className="pr-6 flex items-start gap-2">
                                                {customization.selectedAddonImageUrl && (
                                                  <img 
                                                    src={customization.selectedAddonImageUrl} 
                                                    alt={customization.selectedAddonImageAltText || customization.selectedAddonName}
                                                    className="w-8 h-8 object-cover rounded border flex-shrink-0"
                                                    onError={(e) => {
                                                      e.currentTarget.style.display = 'none';
                                                    }}
                                                  />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-medium text-xs truncate" title={customization.partName}>
                                                    {customization.partName}
                                                  </div>
                                                  {customization.partType === 'dropdown' && (customization.selectedAddonName || customization.selectedAddonId) && (
                                                    <div className="text-xs text-muted-foreground truncate" title={customization.selectedAddonName}>
                                                      {customization.selectedAddonName}
                                                    </div>
                                                  )}
                                                  {/* Only show quantity for number type parts, never for dropdown */}
                                                  {customization.partType !== 'dropdown' && customization.partType === 'number' && customization.quantity && customization.quantity > 0 && (
                                                    <div className="text-xs text-muted-foreground">
                                                      Qty: {customization.quantity}
                                                    </div>
                                                  )}
                                                  {!shouldHideSections && customization.priceImpact !== undefined && customization.priceImpact !== null && customization.priceImpact !== 0 && (
                                                    <div className="text-xs font-medium text-green-600">
                                                      ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                                                    </div>
                                                  )}
                                                  {/* Display Colors */}
                                                  {customization.colors && customization.colors.length > 0 && (
                                                    <div className="mt-2">
                                                      <CustomizationColorChips colors={customization.colors} />
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null;
                                  } catch (error) {
                                    console.error('Error parsing customizations:', error);
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
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                 </CardContent>
               </Card>

               {/* Order Summary Table (Product-wise) - Hidden for non-admin or Accounts access */}
               {!shouldHideSections && (
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
                               <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Customizations</th>
                               <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Remarks</th>
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
                              // When editing, prefer values from the draft item for live updates
                              const draftItem = isEditing
                                ? editItems.find((ei) => ei.id === item.id)
                                : null;

                              // Use draft or original item as the primary source for display
                              const displayItem: any = draftItem || item;

                              // Calculate amount using size-based pricing where available
                              let amount = 0;
                              if (draftItem && draftItem.size_prices && Object.keys(draftItem.sizes_quantities || {}).length > 0) {
                                amount = calculateSizeBasedTotal(
                                  draftItem.sizes_quantities || {},
                                  draftItem.size_prices,
                                  draftItem.price || draftItem.unit_price || 0
                                );
                              } else if (item.size_prices && item.sizes_quantities) {
                                amount = calculateSizeBasedTotal(
                                  item.sizes_quantities,
                                  item.size_prices,
                                  item.unit_price
                                );
                              } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                                amount = calculateSizeBasedTotal(
                                  item.specifications.sizes_quantities,
                                  item.specifications.size_prices,
                                  item.unit_price
                                );
                              } else {
                                amount = displayItem.quantity * (displayItem.unit_price || displayItem.price || 0);
                              }

                              // GST rate: prefer draft item, then item.specifications, then order-level
                              const gstRate = (draftItem?.gst_rate ?? 
                                              item.gst_rate ?? 
                                              item.specifications?.gst_rate ?? 
                                              (order?.gst_rate ?? 0));
                              const gstAmt = (amount * gstRate) / 100;
                              const total = amount + gstAmt;
                               return (
                                 <tr key={index} className="hover:bg-gray-50">
                                   <td className="border border-gray-300 px-3 py-2">
                                     {(() => {
                                       const displayImage = getOrderItemDisplayImage(item, order);
                                       const { mockup_images } = extractImagesFromSpecifications(item.specifications);
                                       const isReadymadeOrder = order?.order_type === 'readymade';
                                       const hasMockup = !isReadymadeOrder && ((item.mockup_images && item.mockup_images.length > 0) || 
                                                        (mockup_images && mockup_images.length > 0));
                                       // Only show image if it's a mockup (not category image)
                                       return displayImage && hasMockup ? (
                                         <img
                                           src={displayImage}
                                           alt="Product"
                                           className="w-20 h-20 object-cover rounded"
                                         />
                                       ) : null;
                                     })()}
                                   </td>
                                  <td className="border border-gray-300 px-3 py-2">
                                    <div className="text-sm">
                                      <div className="text-gray-600 text-xs font-medium">
                                        {fabrics[displayItem.fabric_id || item.fabric_id]?.name} - {displayItem.color || item.color}, {displayItem.gsm || item.gsm} GSM
                                      </div>
                                      <div className="font-medium">{displayItem.product_description || item.product_description}</div>
                                      <div className="text-gray-600 text-xs">
                                        {productCategories[displayItem.product_category_id || item.product_category_id]?.category_name}
                                      </div>
                                    </div>
                                  </td>
                                   <td className="border border-gray-300 px-3 py-2 text-sm">
                                     <div className="max-w-xs">
                                       {(() => {
                                         try {
                                          // Prefer customizations from draft item if available
                                          const customizations = draftItem?.customizations 
                                            || (() => {
                                                 const parsed = typeof item.specifications === 'string' ? JSON.parse(item.specifications) : item.specifications;
                                                 return parsed?.customizations || [];
                                               })();
                                           
                                           if (customizations.length === 0) {
                                             return <span className="text-gray-500">-</span>;
                                           }
                                           
                                           return (
                                             <div className="space-y-1">
                                               {customizations.slice(0, 3).map((customization: any, idx: number) => (
                                                 <div key={idx} className="text-xs bg-gray-100 rounded px-2 py-1 flex items-start gap-2">
                                                   {customization.selectedAddonImageUrl && (
                                                     <img 
                                                       src={customization.selectedAddonImageUrl} 
                                                       alt={customization.selectedAddonImageAltText || customization.selectedAddonName}
                                                       className="w-6 h-6 object-cover rounded border flex-shrink-0"
                                                       onError={(e) => {
                                                         e.currentTarget.style.display = 'none';
                                                       }}
                                                     />
                                                   )}
                                                   <div className="flex-1 min-w-0">
                                                     <div className="font-medium truncate">{customization.partName}</div>
                                                     {customization.partType === 'dropdown' && (customization.selectedAddonName || customization.selectedAddonId) && (
                                                       <div className="text-gray-600 truncate">{customization.selectedAddonName}</div>
                                                     )}
                                                     {/* Only show quantity for number type parts, never for dropdown */}
                                                     {customization.partType !== 'dropdown' && customization.partType === 'number' && customization.quantity && customization.quantity > 0 && (
                                                       <div className="text-gray-600">Qty: {customization.quantity}</div>
                                                     )}
                                                     {/* Display Colors */}
                                                     {customization.colors && customization.colors.length > 0 && (
                                                       <div className="mt-1">
                                                         <CustomizationColorChips colors={customization.colors} />
                                                       </div>
                                                     )}
                                                   </div>
                                                 </div>
                                               ))}
                                               {customizations.length > 3 && (
                                                 <div className="text-xs text-gray-500">+{customizations.length - 3} more</div>
                                               )}
                                             </div>
                                           );
                                         } catch (error) {
                                           return <span className="text-gray-500">-</span>;
                                         }
                                       })()}
                                     </div>
                                   </td>
                                   <td className="border border-gray-300 px-3 py-2 text-sm">
                                     <div className="max-w-xs">
                                       <span className="text-sm text-gray-700 break-words">
                                        {displayItem.remarks || item.remarks || '-'}
                                       </span>
                                     </div>
                                   </td>
                                   <td className="border border-gray-300 px-3 py-2 text-sm">
                                    <div>{displayItem.quantity} Pcs</div>
                                     {(() => {
                                       // Get size_prices and sizes_quantities
                                       let sizePrices: { [size: string]: number } | undefined = undefined;
                                       let sizesQuantities: { [size: string]: number } | undefined = undefined;
                                       
                                      if (draftItem && draftItem.size_prices && draftItem.sizes_quantities) {
                                        sizePrices = draftItem.size_prices;
                                        sizesQuantities = draftItem.sizes_quantities;
                                      } else if (item.size_prices && item.sizes_quantities) {
                                        sizePrices = item.size_prices;
                                        sizesQuantities = item.sizes_quantities;
                                      } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                                        sizePrices = item.specifications.size_prices;
                                        sizesQuantities = item.specifications.sizes_quantities;
                                       }
                                       
                                       // Group sizes by price for display
                                       const sizePriceGroups: { [price: string]: { sizes: string[], qty: number } } = {};
                                      if (sizesQuantities) {
                                         Object.entries(sizesQuantities).forEach(([size, qty]) => {
                                           if (qty > 0) {
                                            const basePrice = draftItem?.price || draftItem?.unit_price || item.unit_price;
                                            const sizePrice = sizePrices?.[size] ?? basePrice;
                                             const priceKey = sizePrice.toFixed(2);
                                             if (!sizePriceGroups[priceKey]) {
                                               sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
                                             }
                                             sizePriceGroups[priceKey].sizes.push(size);
                                             sizePriceGroups[priceKey].qty += qty;
                                           }
                                         });
                                       }
                                       
                                       // Sort sizes within each group and then sort groups by price
                                       const sortedPriceGroups = Object.entries(sizePriceGroups)
                                         .map(([price, data]) => ({
                                           price: parseFloat(price),
                                           sizes: sortSizesQuantities(
                                             data.sizes.reduce((acc, s) => ({ ...acc, [s]: 1 }), {}),
                                             (item as any).size_type_id,
                                             sizeTypes
                                           ).map(([s]) => s),
                                           qty: data.qty
                                         }))
                                         .sort((a, b) => a.price - b.price);
                                       
                                       return sortedPriceGroups.length > 0 ? (
                                         <div className="text-xs text-gray-600 space-y-1 mt-1">
                                           {sortedPriceGroups.map((group, groupIndex) => (
                                             <div key={groupIndex}>
                                               {group.sizes.join(', ')}: {group.qty} @ ₹{group.price.toFixed(2)}
                                             </div>
                                           ))}
                                         </div>
                                       ) : (
                                         displayItem.sizes_quantities && typeof displayItem.sizes_quantities === 'object' && (
                                           <div className="text-xs text-gray-600">
                                             {sortSizesQuantities(
                                              displayItem.sizes_quantities as Record<string, number>,
                                              (displayItem as any).size_type_id || (item as any).size_type_id,
                                               sizeTypes
                                             )
                                               .filter(([_, qty]) => qty > 0)
                                               .map(([size, qty]) => `${size}-${qty}`)
                                               .join(', ')}
                                           </div>
                                         )
                                       );
                                     })()}
                                   </td>
                                   <td className="border border-gray-300 px-3 py-2 text-sm">
                                     {(() => {
                                       // Get size_prices and sizes_quantities
                                       let sizePrices: { [size: string]: number } | undefined = undefined;
                                       let sizesQuantities: { [size: string]: number } | undefined = undefined;
                                       
                                      if (draftItem && draftItem.size_prices && draftItem.sizes_quantities) {
                                        sizePrices = draftItem.size_prices;
                                        sizesQuantities = draftItem.sizes_quantities;
                                      } else if (item.size_prices && item.sizes_quantities) {
                                        sizePrices = item.size_prices;
                                        sizesQuantities = item.sizes_quantities;
                                      } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                                        sizePrices = item.specifications.size_prices;
                                        sizesQuantities = item.specifications.sizes_quantities;
                                       }
                                       
                                       // Group sizes by price for display
                                       const sizePriceGroups: { [price: string]: { sizes: string[], qty: number } } = {};
                                      if (sizesQuantities) {
                                         Object.entries(sizesQuantities).forEach(([size, qty]) => {
                                           if (qty > 0) {
                                            const basePrice = draftItem?.price || draftItem?.unit_price || item.unit_price;
                                            const sizePrice = sizePrices?.[size] ?? basePrice;
                                             const priceKey = sizePrice.toFixed(2);
                                             if (!sizePriceGroups[priceKey]) {
                                               sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
                                             }
                                             sizePriceGroups[priceKey].sizes.push(size);
                                             sizePriceGroups[priceKey].qty += qty;
                                           }
                                         });
                                       }
                                       
                                       // Sort sizes within each group and then sort groups by price
                                       const sortedPriceGroups = Object.entries(sizePriceGroups)
                                         .map(([price, data]) => ({
                                           price: parseFloat(price),
                                           sizes: sortSizesQuantities(
                                             data.sizes.reduce((acc, s) => ({ ...acc, [s]: 1 }), {}),
                                             (item as any).size_type_id,
                                             sizeTypes
                                           ).map(([s]) => s),
                                           qty: data.qty
                                         }))
                                         .sort((a, b) => a.price - b.price);
                                       
                                       return sortedPriceGroups.length > 0 ? (
                                         <div className="text-xs text-gray-700 space-y-1">
                                           {sortedPriceGroups.map((group, groupIndex) => (
                                             <div key={groupIndex}>
                                               ₹{group.price.toFixed(2)}
                                             </div>
                                           ))}
                                         </div>
                                      ) : (
                                        formatCurrency(draftItem?.price || draftItem?.unit_price || item.unit_price)
                                      );
                                     })()}
                                   </td>
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
                       <div className="text-right space-y-1">
                         <div className="text-lg font-semibold">Subtotal: {formatCurrency(orderSummary.subtotal)}</div>
                         <div className="text-lg font-semibold">GST Total: {formatCurrency(orderSummary.gstTotal)}</div>
                         {orderSummary.additionalChargesTotal > 0 && (
                           <div className="text-lg font-semibold">Additional Charges: {formatCurrency(orderSummary.additionalChargesTotal)}</div>
                         )}
                         <div className="text-2xl font-bold text-primary">Grand Total: {formatCurrency(orderSummary.grandTotal)}</div>
                       </div>
                     </div>
                   </CardContent>
                 </Card>
               )}

              {/* Order Lifecycle */}
              

              

            </div>

            {/* Customization Modal (for editing/adding item customizations) */}
            {isEditing && customizationModalOpen && activeCustomizationIndex !== null && editItems[activeCustomizationIndex] && (
              <ProductCustomizationModal
                productIndex={activeCustomizationIndex}
                productCategoryId={editItems[activeCustomizationIndex].product_category_id || ''}
                isOpen={customizationModalOpen}
                fabricColor={editItems[activeCustomizationIndex]?.color}
                initialCustomizations={
                  editingCustomizationIndex !== null
                    ? [editItems[activeCustomizationIndex].customizations?.[editingCustomizationIndex]].filter(Boolean) as any
                    : []
                }
                onClose={() => {
                  setCustomizationModalOpen(false);
                  setEditingCustomizationIndex(null);
                }}
                onSave={(customizations) => {
                  setEditItems(prev =>
                    prev.map((item, index) => {
                      if (index !== activeCustomizationIndex) return item;
                      const existing = item.customizations || [];
                      if (editingCustomizationIndex !== null) {
                        // Replace the customization at the editing index with the first returned customization
                        const updated = [...existing];
                        if (customizations[0]) {
                          updated[editingCustomizationIndex] = customizations[0];
                        }
                        return { ...item, customizations: updated };
                      }
                      // Add mode - append all new customizations
                      return { ...item, customizations: [...existing, ...customizations] };
                    })
                  );
                  setCustomizationModalOpen(false);
                  setEditingCustomizationIndex(null);
                  toast.success(
                    editingCustomizationIndex !== null
                      ? 'Customization updated'
                      : `${customizations.length} customization(s) added`
                  );
                }}
              />
            )}

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
                      {new Date(isEditing && editDraft ? editDraft.order_date : order.order_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  {(isEditing && editDraft ? editDraft.expected_delivery_date : order.expected_delivery_date) && (
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Delivery</p>
                      <p className="font-medium">
                        {new Date(isEditing && editDraft ? editDraft.expected_delivery_date : order.expected_delivery_date).toLocaleDateString('en-GB', {
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
                      <div className="flex items-center gap-2">
                        {salesManager.avatar_url ? (
                          <img
                            src={salesManager.avatar_url}
                            alt={salesManager.full_name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <p className="font-medium">{salesManager.full_name}</p>
                      </div>
                    </div>
                  )}
                  {(isEditing && editDraft ? editDraft.notes : order.notes) && (
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium text-sm">{isEditing && editDraft ? editDraft.notes : order.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Information - Hidden for non-admin or Accounts access */}
              {!shouldHideSections && (
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
              )}

              {/* Order Summary - Hidden for non-admin or Accounts access */}
              {!shouldHideSections && (
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
                      <span>{formatCurrency(orderSummary.subtotal)}</span>
                    </div>
                    {(() => {
                      if (gstBreakdown.length === 0) {
                        return (
                          <div className="flex justify-between">
                            <span>GST (0%)</span>
                            <span>{formatCurrency(0)}</span>
                          </div>
                        );
                      } else if (gstBreakdown.length === 1) {
                        return (
                          <div className="flex justify-between">
                            <span>GST ({gstBreakdown[0].rate}%)</span>
                            <span>{formatCurrency(gstBreakdown[0].amount)}</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="space-y-1">
                          {gstBreakdown.map((gst, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span>GST ({gst.rate}%)</span>
                              <span>{formatCurrency(gst.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-medium border-t pt-1">
                            <span>Total GST</span>
                            <span>{formatCurrency(gstBreakdown.reduce((sum, gst) => sum + gst.amount, 0))}</span>
                          </div>
                        </div>
                      );
                    }
                  })()}
                    {orderSummary.additionalChargesTotal > 0 && (
                      <div className="flex justify-between">
                        <span>Additional Charges</span>
                        <span>{formatCurrency(orderSummary.additionalChargesTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Amount Paid</span>
                      <span className="text-green-600">{formatCurrency(isEditing ? (editDraft?.advance_amount || 0) : totalReceipts)}</span>
                    </div>
                    <hr />
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total Amount</span>
                      <span>{formatCurrency(orderSummary.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance Due</span>
                      <span className={(() => {
                        const balance = orderSummary.grandTotal - (isEditing ? (editDraft?.advance_amount || 0) : totalReceipts);
                        return balance > 0 ? "text-orange-600" : "text-green-600";
                      })()}>
                        {formatCurrency(orderSummary.grandTotal - (isEditing ? (editDraft?.advance_amount || 0) : totalReceipts))}
                      </span>
                    </div>
                    
                    {(() => {
                      const balance = orderSummary.grandTotal - (isEditing ? (editDraft?.advance_amount || 0) : totalReceipts);
                      return balance > 0;
                    })() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => navigate('/accounts/receipts', { 
                          state: { 
                            prefill: { 
                              type: 'order', 
                              id: order.id, 
                              number: order.order_number, 
                              date: order.order_date, 
                              customer_id: order.customer_id, 
                              amount: orderSummary.grandTotal - (isEditing ? (editDraft?.advance_amount || 0) : totalReceipts)
                            }, 
                            tab: 'create' 
                          } 
                        })}
                      >
                        💳 Create Receipt
                      </Button>
                    )}
                    
                    {(isEditing && editDraft ? editDraft.payment_channel : order.payment_channel) && (
                      <div className="pt-2 border-t">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Payment Method</span>
                          <span>{isEditing && editDraft ? editDraft.payment_channel : order.payment_channel}</span>
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
              )}
{/* Order Lifecycle - Hidden for non-admin or Accounts access */}
{!shouldHideSections && (
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
                    <h4 className="font-semibold text-xs sm:text-sm break-words break-all leading-snug text-blue-700">
                      {getActivityTitle(activity)}
                    </h4>
                    <span className="text-[11px] sm:text-xs text-blue-600 sm:max-w-[65%] whitespace-normal sm:whitespace-normal break-words break-all sm:text-right">
                      {formatDateTimeSafe(activity.performed_at)}
                    </span>
                  </div>

                  {/* Subtitle / description */}
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-2 break-words">
                    {getActivitySubtitle(activity)}
                  </p>

                  {/* User info */}
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-2 break-words">
                    By:{' '}
                    {activity.user_name ||
                      activity.user_email ||
                      'System'}
                  </p>
                
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
)}

            </div>
          </div>
        </div>
      </div>

    </ErpLayout>
  );
}