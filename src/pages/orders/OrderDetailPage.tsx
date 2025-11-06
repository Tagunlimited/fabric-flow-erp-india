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
  Trash2
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
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

// 2. Add a function to calculate GST rates breakdown
function calculateGSTRatesBreakdown(orderItems: any[], order: Order | null) {
  const gstRatesMap = new Map<number, number>();
  
  orderItems.forEach(item => {
    const amount = item.quantity * item.unit_price;
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
function ReadymadeOrderFormView({ orderId, order, customer, orderItems }: { orderId: string; order: Order; customer: Customer | null; orderItems: OrderItem[] }) {
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
                    {(() => {
                      // Sort sizes in order: S, M, L, XL, 2XL
                      const sizeOrder = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
                      const sortedSizes = Object.entries(product.sizes_quantities).sort(([sizeA], [sizeB]) => {
                        const indexA = sizeOrder.indexOf(sizeA);
                        const indexB = sizeOrder.indexOf(sizeB);
                        // If both sizes are in the order, sort by their position
                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        // If only A is in order, it comes first
                        if (indexA !== -1) return -1;
                        // If only B is in order, it comes first
                        if (indexB !== -1) return 1;
                        // If neither is in order, sort alphabetically
                        return sizeA.localeCompare(sizeB);
                      });
                      
                      return sortedSizes.map(([size, qty]) => (
                        <div key={size} className="space-y-1">
                          <Label className="text-sm font-medium">{size}</Label>
                          <Input
                            type="number"
                            value={qty as number}
                            readOnly
                            className="bg-background text-center"
                          />
                        </div>
                      ));
                    })()}
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
  const { profile } = useAuth();
  
  // Determine if we should hide pricing/order summary/lifecycle sections
  // Hide if: user is NOT admin OR if coming from Accounts sidebar
  const [fromAccounts, setFromAccounts] = useState(false);
  
  useEffect(() => {
    // Check if user came from Accounts sidebar
    const from = searchParams.get('from');
    const referrer = document.referrer || '';
    
    // Check if referrer contains any Accounts route
    const isFromAccounts = from === 'accounts' || 
                           referrer.includes('/accounts/quotations') ||
                           referrer.includes('/accounts/invoices') ||
                           referrer.includes('/accounts/receipts') ||
                           referrer.includes('/accounts/payments') ||
                           referrer.includes('/accounts/');
    
    setFromAccounts(isFromAccounts);
  }, [searchParams]);
  
  const isAdmin = profile?.role === 'admin';
  const shouldHideSections = !isAdmin || fromAccounts;
  
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
  const [totalReceipts, setTotalReceipts] = useState<number>(0);

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

  // Refresh receipts when page regains focus (e.g., after creating a receipt)
  useEffect(() => {
    const handleFocus = () => {
      if (order?.order_number) {
        fetchTotalReceipts();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [order?.order_number]);

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
          <ReadymadeOrderFormView orderId={id || ''} order={order} customer={customer} orderItems={orderItems} />
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
              <div className="flex items-center space-x-2">
                <Label htmlFor="status-select" className="text-sm font-medium">Status:</Label>
                <Select 
                  value={order.status} 
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="designing_done">Designing Done</SelectItem>
                    <SelectItem value="under_procurement">Under Procurement</SelectItem>
                    <SelectItem value="in_production">In Production</SelectItem>
                    <SelectItem value="under_cutting">Under Cutting</SelectItem>
                    <SelectItem value="under_stitching">Under Stitching</SelectItem>
                    <SelectItem value="under_qc">Under QC</SelectItem>
                    <SelectItem value="quality_check">Quality Check</SelectItem>
                    <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                    <SelectItem value="rework">Rework</SelectItem>
                    <SelectItem value="partial_dispatched">Partial Dispatched</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="completed" className="text-green-600 font-semibold">✅ Completed</SelectItem>
                    <SelectItem value="cancelled" className="text-red-600">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Badge className={getStatusColor(order.status)}>
                {order.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex space-x-2">
              {/* <Button variant="outline" onClick={openEditDialog}>
                Edit
              </Button> */}
              
              {order.status !== 'completed' && order.status !== 'cancelled' && (
                <Button 
                  variant="default" 
                  onClick={() => handleStatusChange('completed')}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  ✅ Mark as Completed
                </Button>
              )}
              
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              
              <Button variant="outline" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              
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
                              {/* Product Image with priority: mockup > category */}
                              {(() => {
                                const displayImage = getOrderItemDisplayImage(item, order);
                                const { mockup_images } = extractImagesFromSpecifications(item.specifications);
                                const isReadymadeOrder = order?.order_type === 'readymade';
                                const hasMockup = !isReadymadeOrder && ((item.mockup_images && item.mockup_images.length > 0) || 
                                                 (mockup_images && mockup_images.length > 0));
                                
                                return displayImage ? (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-3">
                                      {hasMockup ? 'Product Image (Mockup)' : 'Category Image'}
                                    </p>
                                    <div className="aspect-[3/3.5] w-full overflow-hidden rounded-lg border shadow-md">
                                      <img 
                                        src={displayImage} 
                                        alt={hasMockup ? "Product Mockup" : "Category"}
                                        className="w-full h-full object-contain bg-background cursor-pointer hover:scale-105 transition-transform duration-300"
                                        onClick={() => {
                                          const modal = document.createElement('div');
                                          modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                          modal.innerHTML = `
                                            <div class="relative max-w-4xl max-h-full">
                                              <img src="${displayImage}" alt="${hasMockup ? 'Product Mockup' : 'Category'}" class="max-w-full max-h-full object-contain rounded-lg" />
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
                                        <span className="font-medium">{formatCurrency(item.unit_price)}</span>
                                      </div>
                                      <div className="bg-muted/30 rounded-lg p-3">
                                        <span className="text-xs text-muted-foreground block">Total Price</span>
                                        <span className="font-medium text-primary">{formatCurrency(item.total_price)}</span>
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
                                                  {customization.partType === 'dropdown' && (
                                                    <div className="text-xs text-muted-foreground truncate" title={customization.selectedAddonName}>
                                                      {customization.selectedAddonName}
                                                    </div>
                                                  )}
                                                  {customization.partType === 'number' && (
                                                    <div className="text-xs text-muted-foreground">
                                                      Qty: {customization.quantity}
                                                    </div>
                                                  )}
                                                  {!shouldHideSections && customization.priceImpact && customization.priceImpact !== 0 && (
                                                    <div className="text-xs font-medium text-green-600">
                                                      ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
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
                                     {(() => {
                                       const displayImage = getOrderItemDisplayImage(item, order);
                                       return displayImage ? (
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
                                         {fabrics[item.fabric_id]?.name} - {item.color}, {item.gsm} GSM
                                       </div>
                                       <div className="font-medium">{item.product_description}</div>
                                       <div className="text-gray-600 text-xs">
                                         {productCategories[item.product_category_id]?.category_name}
                                       </div>
                                     </div>
                                   </td>
                                   <td className="border border-gray-300 px-3 py-2 text-sm">
                                     <div className="max-w-xs">
                                       {(() => {
                                         try {
                                           const parsed = typeof item.specifications === 'string' ? JSON.parse(item.specifications) : item.specifications;
                                           const customizations = parsed.customizations || [];
                                           
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
                                                     {customization.partType === 'dropdown' && (
                                                       <div className="text-gray-600 truncate">{customization.selectedAddonName}</div>
                                                     )}
                                                     {customization.partType === 'number' && (
                                                       <div className="text-gray-600">Qty: {customization.quantity}</div>
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
                                         {item.remarks || '-'}
                                       </span>
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
               )}

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
                  {order.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium text-sm">{order.notes}</p>
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
                      <span>{formatCurrency(order.total_amount)}</span>
                    </div>
                    {(() => {
                      const gstBreakdown = calculateGSTRatesBreakdown(orderItems, order);
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
                      <span>{formatCurrency(calculateOrderSummary(orderItems, order).grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance Due</span>
                      <span className={(() => {
                        const calculatedTotal = calculateOrderSummary(orderItems, order).grandTotal;
                        const balance = calculatedTotal - totalReceipts;
                        return balance > 0 ? "text-orange-600" : "text-green-600";
                      })()}>
                        {formatCurrency(calculateOrderSummary(orderItems, order).grandTotal - totalReceipts)}
                      </span>
                    </div>
                    
                    {(() => {
                      const calculatedTotal = calculateOrderSummary(orderItems, order).grandTotal;
                      const balance = calculatedTotal - totalReceipts;
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
                              amount: calculateOrderSummary(orderItems, order).grandTotal - totalReceipts 
                            }, 
                            tab: 'create' 
                          } 
                        })}
                      >
                        💳 Create Receipt
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
)}

            </div>
          </div>
        </div>
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
      
    </ErpLayout>
  );
}