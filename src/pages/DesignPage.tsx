import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./OrdersPageViewSwitch.css";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Eye, Package, Truck, Clock, CheckCircle, Filter, FileImage, X } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
  mockup_url?: string;
  order_type?: string;
  order_items?: Array<{
    id: string;
    specifications: any;
    mockup_images?: string[];
    category_image_url?: string | null;
  }>;
}

const DesignPage = () => {
  const navigate = useNavigate();
  const { config: company } = useCompanySettings();
  const { orders: ordersWithReceipts, loading: ordersLoading, refetch } = useOrdersWithReceipts<Order>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [columnFilters, setColumnFilters] = useState({
    order_number: "",
    customer: "",
    date: "",
    status: "",
  });
  const [filterDialogColumn, setFilterDialogColumn] = useState<null | "order_number" | "customer" | "date" | "status">(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch order items for each order to check mockup/branding
  useEffect(() => {
    const fetchOrdersWithItems = async () => {
      if (ordersWithReceipts.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const orderIds = ordersWithReceipts.map(o => o.id);
        
        // Fetch order items with specifications
        const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('id, order_id, specifications, mockup_images, category_image_url')
          .in('order_id', orderIds);

        if (itemsError) throw itemsError;

        // Group order items by order_id
        const itemsByOrderId: { [key: string]: any[] } = {};
        (orderItems || []).forEach((item: any) => {
          if (!itemsByOrderId[item.order_id]) {
            itemsByOrderId[item.order_id] = [];
          }
          itemsByOrderId[item.order_id].push(item);
        });

        // Enrich orders with order_items
        const enrichedOrders = ordersWithReceipts.map(order => ({
          ...order,
          order_items: itemsByOrderId[order.id] || []
        }));

        setOrders(enrichedOrders);
      } catch (error) {
        console.error('Error fetching order items:', error);
        setOrders(ordersWithReceipts);
      } finally {
        setLoading(false);
      }
    };

    if (!ordersLoading) {
      fetchOrdersWithItems();
    }
  }, [ordersWithReceipts, ordersLoading]);

  const fetchOrders = async () => { await refetch(); };

  // Check if order has mockup uploaded (for custom orders)
  const hasMockup = (order: Order): boolean => {
    if (getOrderMockupPreviewUrls(order).length > 0) return true;
    if (!order.order_items || order.order_items.length === 0) return false;
    
    return order.order_items.some((item: any) => {
      try {
        const specs = typeof item.specifications === 'string' 
          ? JSON.parse(item.specifications) 
          : item.specifications || {};
        
        const mockupImages = specs.mockup_images || [];
        return Array.isArray(mockupImages) && mockupImages.length > 0;
      } catch {
        return false;
      }
    });
  };

  // Collect one display mockup per product line for list preview.
  const getOrderMockupPreviewUrls = (order: Order): string[] => {
    if (!order.order_items || order.order_items.length === 0) return [];
    const seen = new Set<string>();
    const urls: string[] = [];

    order.order_items.forEach((item: any) => {
      const displayImage = getOrderItemDisplayImage(item, order);
      const normalized = (displayImage || '').trim();
      if (!normalized) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      urls.push(normalized);
    });

    return urls;
  };

  // Check if order has branding (for readymade orders)
  const hasBranding = (order: Order): boolean => {
    if (!order.order_items || order.order_items.length === 0) return false;
    
    return order.order_items.some((item: any) => {
      try {
        const specs = typeof item.specifications === 'string' 
          ? JSON.parse(item.specifications) 
          : item.specifications || {};
        
        const brandingItems = specs.branding_items || [];
        
        // Check if branding_items is an array with at least one valid item
        if (!Array.isArray(brandingItems) || brandingItems.length === 0) {
          return false;
        }
        
        // Check if at least one branding item has valid data (not just empty objects)
        return brandingItems.some((branding: any) => {
          // A valid branding item should have at least branding_type filled
          return branding && 
                 typeof branding === 'object' && 
                 branding.branding_type && 
                 branding.branding_type.trim() !== '';
        });
      } catch {
        return false;
      }
    });
  };

  // Check if order is completed based on criteria
  const isOrderCompleted = (order: Order): boolean => {
    // Check order_type from order or from order_items specifications
    let isReadymade = order.order_type === 'readymade';
    
    // If order_type is not set on order, check specifications
    if (!isReadymade && order.order_items && order.order_items.length > 0) {
      const firstItem = order.order_items[0];
      try {
        const specs = typeof firstItem.specifications === 'string' 
          ? JSON.parse(firstItem.specifications) 
          : firstItem.specifications || {};
        isReadymade = specs.order_type === 'readymade';
      } catch {
        // If parsing fails, assume it's not readymade
      }
    }
    
    if (isReadymade) {
      // Readymade: Has receipt AND has branding (with valid branding items)
      return hasBranding(order);
    } else {
      // Custom: Has receipt AND has mockup
      return hasMockup(order);
    }
  };

  // Separate orders into pending and completed
  const pendingOrders = orders.filter(order => !isOrderCompleted(order));
  const completedOrders = orders.filter(order => isOrderCompleted(order));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Upload functionality moved to OrderDetailPage

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
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
      pdf.save(`Order-${selectedOrder?.order_number}.pdf`);
      toast.success('Order PDF exported');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  };

  // Get current tab orders
  const currentTabOrders = activeTab === "completed" ? completedOrders : pendingOrders;
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);

  const filterDialogMeta = {
    order_number: { title: "Filter by order number", placeholder: "Type order number..." },
    customer: { title: "Filter by customer", placeholder: "Type customer name..." },
    date: { title: "Filter by date", placeholder: "e.g. 31-Mar-26 or 2026-03..." },
    status: { title: "Filter by status", placeholder: "e.g. pending, in production..." },
  } as const;

  const matchesFilters = (order: Order) => {
    const orderNo = (order.order_number || "").toLowerCase();
    const customer = (order.customer?.company_name || "").toLowerCase();
    const dateText = [
      order.order_date || "",
      order.order_date ? format(new Date(order.order_date), "dd-MMM-yy") : "",
      order.order_date ? new Date(order.order_date).toLocaleDateString("en-GB") : "",
    ]
      .join(" ")
      .toLowerCase();
    const statusText = [order.status || "", (order.status || "").replace(/_/g, " ")]
      .join(" ")
      .toLowerCase();
    const includes = (source: string, term: string) => source.includes(term.trim().toLowerCase());

    return (
      includes(orderNo, columnFilters.order_number) &&
      includes(customer, columnFilters.customer) &&
      includes(dateText, columnFilters.date) &&
      includes(statusText, columnFilters.status)
    );
  };

  const filteredOrders = useMemo(() => {
    const searched = currentTabOrders.filter(matchesFilters);
    return [...searched].sort((a, b) => {
      if (sortBy === "date_asc") return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
      if (sortBy === "date_desc") return new Date(b.order_date).getTime() - new Date(a.order_date).getTime();
      if (sortBy === "amount_asc") return (a.final_amount || 0) - (b.final_amount || 0);
      if (sortBy === "amount_desc") return (b.final_amount || 0) - (a.final_amount || 0);
      return 0;
    });
  }, [currentTabOrders, sortBy, columnFilters]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Design & Printing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage orders with receipts for design mockups and printing
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{orders.length}</span>
                <ShoppingCart className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-yellow-100 text-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'pending').length}
                </span>
                <Clock className="w-5 h-5 text-yellow-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-purple-100 text-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                In Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'in_production').length}
                </span>
                <Package className="w-5 h-5 text-purple-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-green-100 text-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {completedOrders.length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <label
              htmlFor="design-page-view-switch"
              className="orders-view-switch"
              aria-label="Switch between pending and completed design orders"
            >
              <input
                id="design-page-view-switch"
                type="checkbox"
                role="switch"
                aria-checked={activeTab === "completed"}
                checked={activeTab === "completed"}
                onChange={(e) => setActiveTab(e.target.checked ? "completed" : "pending")}
              />
              <span>Pending ({pendingOrders.length})</span>
              <span>Completed ({completedOrders.length})</span>
            </label>
          </div>

          {activeTab === "pending" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <CardTitle>Pending Orders (with Receipts)</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveColumnFilters && (
                  <Button variant="outline" size="sm" onClick={() => setColumnFilters({ order_number: "", customer: "", date: "", status: "" })}>
                    <X className="w-4 h-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSortBy("date_desc")} className={sortBy === "date_desc" ? 'bg-accent/20 font-semibold' : ''}>Newest First</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("date_asc")} className={sortBy === "date_asc" ? 'bg-accent/20 font-semibold' : ''}>Oldest First</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("amount_desc")} className={sortBy === "amount_desc" ? 'bg-accent/20 font-semibold' : ''}>Amount High-Low</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("amount_asc")} className={sortBy === "amount_asc" ? 'bg-accent/20 font-semibold' : ''}>Amount Low-High</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={fetchOrders} variant="outline">Refresh</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Order Number</span>
                          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("order_number")}>
                            <Filter className={`w-3.5 h-3.5 ${columnFilters.order_number ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Customer</span>
                          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("customer")}>
                            <Filter className={`w-3.5 h-3.5 ${columnFilters.customer ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Date</span>
                          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("date")}>
                            <Filter className={`w-3.5 h-3.5 ${columnFilters.date ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center justify-between gap-0.5">
                          <span>Status</span>
                          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("status")}>
                            <Filter className={`w-3.5 h-3.5 ${columnFilters.status ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead>Mockup/Branding</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow 
                        key={order.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          navigate(`/orders/${order.id}`, {
                            state: { from: 'design', tab: activeTab },
                          })
                        }
                      >
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{order.customer?.company_name}</TableCell>
                        <TableCell>
                          {new Date(order.order_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const mockupUrls = getOrderMockupPreviewUrls(order);
                            if (mockupUrls.length > 0) {
                              const visible = mockupUrls.slice(0, 4);
                              const remaining = mockupUrls.length - visible.length;
                              return (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {visible.map((url, imgIdx) => (
                                    <img
                                      key={`${order.id}-mockup-${imgIdx}`}
                                      src={url}
                                      alt={`Mockup ${imgIdx + 1}`}
                                      className="w-8 h-8 object-cover rounded border border-gray-200"
                                    />
                                  ))}
                                  {remaining > 0 && (
                                    <span className="text-[10px] font-medium text-gray-600">+{remaining}</span>
                                  )}
                                </div>
                              );
                            }

                            const hasBrandingOnly = order.order_type === 'readymade' && hasBranding(order);
                            if (hasBrandingOnly) {
                              return (
                                <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                                  <FileImage className="w-4 h-4 text-green-600" />
                                </div>
                              );
                            }

                            return (
                              <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                                <FileImage className="w-4 h-4 text-gray-400" />
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/orders/${order.id}`, {
                                  state: { from: 'design', tab: activeTab },
                                });
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* Upload moved to Order Detail page */}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                    {filteredOrders.length === 0 && !loading && (
                      <div className="text-center py-8 text-muted-foreground">
                        No pending orders found
                      </div>
                    )}
              </div>
            )}
          </CardContent>
        </Card>
          )}

          {activeTab === "completed" && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <CardTitle>Completed Orders (with Receipts)</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasActiveColumnFilters && (
                      <Button variant="outline" size="sm" onClick={() => setColumnFilters({ order_number: "", customer: "", date: "", status: "" })}>
                        <X className="w-4 h-4 mr-2" />
                        Clear Filters
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Sort
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSortBy("date_desc")} className={sortBy === "date_desc" ? 'bg-accent/20 font-semibold' : ''}>Newest First</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("date_asc")} className={sortBy === "date_asc" ? 'bg-accent/20 font-semibold' : ''}>Oldest First</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("amount_desc")} className={sortBy === "amount_desc" ? 'bg-accent/20 font-semibold' : ''}>Amount High-Low</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("amount_asc")} className={sortBy === "amount_asc" ? 'bg-accent/20 font-semibold' : ''}>Amount Low-High</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={fetchOrders} variant="outline">Refresh</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <div className="flex items-center justify-between gap-0.5">
                              <span>Order Number</span>
                              <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("order_number")}>
                                <Filter className={`w-3.5 h-3.5 ${columnFilters.order_number ? "text-primary" : "text-muted-foreground"}`} />
                              </Button>
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center justify-between gap-0.5">
                              <span>Customer</span>
                              <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("customer")}>
                                <Filter className={`w-3.5 h-3.5 ${columnFilters.customer ? "text-primary" : "text-muted-foreground"}`} />
                              </Button>
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center justify-between gap-0.5">
                              <span>Date</span>
                              <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("date")}>
                                <Filter className={`w-3.5 h-3.5 ${columnFilters.date ? "text-primary" : "text-muted-foreground"}`} />
                              </Button>
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center justify-between gap-0.5">
                              <span>Status</span>
                              <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0 p-0" onClick={() => setFilterDialogColumn("status")}>
                                <Filter className={`w-3.5 h-3.5 ${columnFilters.status ? "text-primary" : "text-muted-foreground"}`} />
                              </Button>
                            </div>
                          </TableHead>
                          <TableHead>Mockup/Branding</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => (
                          <TableRow 
                            key={order.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() =>
                              navigate(`/orders/${order.id}`, {
                                state: { from: 'design', tab: activeTab },
                              })
                            }
                          >
                            <TableCell className="font-medium">{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>
                              {new Date(order.order_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: '2-digit'
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const mockupUrls = getOrderMockupPreviewUrls(order);
                                if (mockupUrls.length > 0) {
                                  const visible = mockupUrls.slice(0, 4);
                                  const remaining = mockupUrls.length - visible.length;
                                  return (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {visible.map((url, imgIdx) => (
                                        <img
                                          key={`${order.id}-mockup-completed-${imgIdx}`}
                                          src={url}
                                          alt={`Mockup ${imgIdx + 1}`}
                                          className="w-8 h-8 object-cover rounded border border-gray-200"
                                        />
                                      ))}
                                      {remaining > 0 && (
                                        <span className="text-[10px] font-medium text-gray-600">+{remaining}</span>
                                      )}
                                    </div>
                                  );
                                }

                                const hasBrandingOnly = order.order_type === 'readymade' && hasBranding(order);
                                if (hasBrandingOnly) {
                                  return (
                                    <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                                      <FileImage className="w-4 h-4 text-green-600" />
                                    </div>
                                  );
                                }

                                return (
                                  <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                                    <FileImage className="w-4 h-4 text-gray-400" />
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/orders/${order.id}`, {
                                      state: { from: 'design', tab: activeTab },
                                    });
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredOrders.length === 0 && !loading && (
                      <div className="text-center py-8 text-muted-foreground">
                        No completed orders found
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={filterDialogColumn !== null} onOpenChange={(open) => !open && setFilterDialogColumn(null)}>
          <DialogContent className="max-w-md">
            {filterDialogColumn && (
              <>
                <DialogHeader>
                  <DialogTitle>{filterDialogMeta[filterDialogColumn].title}</DialogTitle>
                </DialogHeader>
                <Input
                  autoFocus
                  placeholder={filterDialogMeta[filterDialogColumn].placeholder}
                  value={columnFilters[filterDialogColumn]}
                  onChange={(e) =>
                    setColumnFilters((prev) => ({ ...prev, [filterDialogColumn]: e.target.value }))
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setColumnFilters((prev) => ({ ...prev, [filterDialogColumn]: "" }))
                    }
                  >
                    Clear
                  </Button>
                  <Button onClick={() => setFilterDialogColumn(null)}>Done</Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Print Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Print Order — {selectedOrder?.order_number}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="outline" onClick={() => window.print()}><FileImage className="w-4 h-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={handleExportPDF}><FileImage className="w-4 h-4 mr-1" /> Export PDF</Button>
            </div>
            <div ref={printRef} className="bg-white" style={{ padding: '15mm 25mm 15mm 15mm', minHeight: '297mm', width: '210mm', margin: '0 auto', fontSize: '10px', lineHeight: '1.3' }}>
              <style>{`
                @page { size: A4; margin: 15mm 25mm 15mm 15mm; }
                @media print {
                  .print:hidden { display: none !important; }
                  header, nav, .header, .navigation { display: none !important; }
                  .print-content { display: block !important; }
                }
              `}</style>
              
              {/* Company header */}
              <div className="flex justify-between items-start border-b pb-3 mb-3">
                <div className="flex items-center gap-3">
                  {(company as any)?.logo_url && (
                    <img src={(company as any).logo_url} alt="Logo" className="w-16 h-16 object-contain" style={{ maxWidth: '60px', maxHeight: '60px' }} />
                  )}
                  <div>
                    <div className="text-xl font-bold">{company?.company_name || 'Our Company'}</div>
                    <div className="text-xs text-muted-foreground">{company?.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">ORDER CONFIRMATION</div>
                  <div className="text-xs text-muted-foreground">Order #{selectedOrder?.order_number}</div>
                  <div className="text-xs text-muted-foreground">{selectedOrder?.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-IN') : ''}</div>
                </div>
              </div>

              {/* Customer and Order Info */}
              <div className="grid grid-cols-2 gap-8 mb-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Customer Details</div>
                  <div className="text-sm">
                    <div className="font-medium">{selectedOrder?.customer?.company_name || '-'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Order Details</div>
                  <div className="text-sm">
                    <div><span className="font-medium">Order #:</span> {selectedOrder?.order_number}</div>
                    <div><span className="font-medium">Date:</span> {selectedOrder?.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-IN') : '-'}</div>
                    <div><span className="font-medium">Status:</span> {selectedOrder?.status || 'pending'}</div>
                  </div>
                </div>
              </div>

              {/* Mockup Section */}
              {selectedOrder?.mockup_url && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Design Mockup</div>
                  <div className="border rounded p-2">
                    <img 
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/order-mockups/${selectedOrder.mockup_url}`}
                      alt="Order Mockup"
                      className="max-w-full h-auto"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-between items-end mt-8 text-xs">
                <div>
                  <div className="text-muted-foreground">Generated on {new Date().toLocaleDateString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">For {company?.company_name || 'Our Company'}</div>
                  <div className="mt-4 mb-2">
                    {company?.authorized_signatory_url ? (
                      <img 
                        src={company.authorized_signatory_url} 
                        alt="Authorized Signatory" 
                        className="w-16 h-12 object-contain mx-auto"
                      />
                    ) : (
                      <div className="w-16 h-12 border border-gray-300 mx-auto flex items-center justify-center">
                        <span className="text-[8px] text-gray-400">Signature</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 border-b w-40"></div>
                  <div className="text-muted-foreground">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default DesignPage;
