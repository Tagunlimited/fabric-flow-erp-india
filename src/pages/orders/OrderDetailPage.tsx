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
  Image
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ErpLayout } from "@/components/ErpLayout";
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
  sizes_quantities: any;
  specifications: any;
  remarks: string;
  category_image_url?: string;
  reference_images?: string[];
  mockup_images?: string[];
  attachments?: string[];
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [fabrics, setFabrics] = useState<{ [key: string]: Fabric }>({});
  const [productCategories, setProductCategories] = useState<{ [key: string]: ProductCategory }>({});
  const [loading, setLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState(false);

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
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 30;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Order-${order?.order_number}.pdf`);
      
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Failed to export PDF');
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

        {/* Printable Content */}
        <div ref={printRef} className="print:shadow-none space-y-6">
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

                            {/* Mockup Images with better layout */}
                            {item.mockup_images && item.mockup_images.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-3">Mockup Images:</p>
                                <div className="grid grid-cols-1 gap-3">
                                  {item.mockup_images.map((url: string, idx: number) => (
                                    <div key={idx} className="aspect-[13/10] w-full overflow-hidden rounded-lg border shadow-sm">
                                      <img 
                                        src={url} 
                                        alt={`Mockup ${idx + 1}`}
                                        className="w-full h-full object-contain bg-muted cursor-pointer hover:scale-105 transition-transform duration-300"
                                        onClick={() => {
                                          const modal = document.createElement('div');
                                          modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
                                          modal.innerHTML = `
                                            <div class="relative max-w-4xl max-h-full">
                                              <img src="${url}" alt="Mockup ${idx + 1}" class="max-w-full max-h-full object-contain rounded-lg" />
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
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Reference Images */}
                            {item.reference_images && item.reference_images.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-3">Reference Images:</p>
                                <div className="grid grid-cols-2 gap-3">
                                  {item.reference_images.slice(0, 4).map((imgUrl: string, idx: number) => (
                                    <div key={idx} className="aspect-square overflow-hidden rounded-lg border shadow-sm">
                                      <img 
                                        src={imgUrl} 
                                        alt={`Reference ${idx + 1}`}
                                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                        onClick={() => window.open(imgUrl, '_blank')}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
                                {item.specifications && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-3">Branding Details:</p>
                                    <div className="space-y-3">
                                      {JSON.parse(item.specifications).branding_items?.map((branding: any, idx: number) => (
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
                                )}
                                
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

              {/* Quick Actions */}
              {order.status !== 'cancelled' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button className="w-full" variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      Generate Invoice
                    </Button>
                    <Button className="w-full" variant="outline">
                      <Truck className="w-4 h-4 mr-2" />
                      Schedule Dispatch
                    </Button>
                    <Button className="w-full" variant="outline">
                      <Package className="w-4 h-4 mr-2" />
                      Update Status
                    </Button>
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