import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./OrdersPageViewSwitch.css";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Eye, CheckCircle, Filter, X, Printer } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useOrdersWithReceipts } from "@/hooks/useOrdersWithReceipts";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { isDesignWorkComplete, getDesignOrderStatusColor } from '@/lib/designOrderStage';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  status: string;
  final_amount: number;
  order_type?: string;
  printing_completed_at?: string | null;
  order_items?: Array<{
    id: string;
    specifications: unknown;
    mockup_images?: string[];
    category_image_url?: string | null;
  }>;
}

const DesignPrintingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    const tab = (location.state as any)?.defaultTab;
    if (tab === 'completed' || tab === 'pending') {
      setActiveTab(tab);
    }
  }, [location.state]);

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

        const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('id, order_id, specifications, mockup_images, category_image_url')
          .eq('is_deleted', false)
          .in('order_id', orderIds);

        if (itemsError) throw itemsError;

        const itemsByOrderId: { [key: string]: unknown[] } = {};
        (orderItems || []).forEach((item: any) => {
          if (!itemsByOrderId[item.order_id]) {
            itemsByOrderId[item.order_id] = [];
          }
          itemsByOrderId[item.order_id].push(item);
        });

        const enrichedOrders = ordersWithReceipts.map((order: any) => ({
          ...order,
          order_items: itemsByOrderId[order.id] || []
        }));

        setOrders(enrichedOrders);
      } catch (error) {
        console.error('Error fetching order items:', error);
        setOrders(ordersWithReceipts as Order[]);
      } finally {
        setLoading(false);
      }
    };

    if (!ordersLoading) {
      fetchOrdersWithItems();
    }
  }, [ordersWithReceipts, ordersLoading]);

  const fetchOrders = async () => { await refetch(); };

  const designCompleteOrders = orders.filter((o) => isDesignWorkComplete(o));
  const pendingPrinting = designCompleteOrders.filter((o) => !o.printing_completed_at);
  const completedPrinting = designCompleteOrders.filter((o) => !!o.printing_completed_at);

  const markPrintingCompleted = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletingId(orderId);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('orders')
        .update({ printing_completed_at: now, updated_at: now })
        .eq('id', orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, printing_completed_at: now } : o))
      );
      toast.success('Printing marked completed');
      await refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Could not update order');
    } finally {
      setCompletingId(null);
    }
  };

  const currentTabOrders = activeTab === "completed" ? completedPrinting : pendingPrinting;
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

  const goToOrder = (order: Order) => {
    navigate(`/orders/${order.id}`, {
      state: { from: 'printing', printingTab: activeTab },
    });
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Printing
          </h1>
          <p className="text-muted-foreground mt-1">
            After design is done — track print run and mark printing completed
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Design done (queue)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{designCompleteOrders.length}</span>
                <ShoppingCart className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-erp-md bg-amber-100 text-amber-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Printing pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{pendingPrinting.length}</span>
                <Printer className="w-5 h-5 text-amber-800" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-erp-md bg-green-100 text-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Printing completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{completedPrinting.length}</span>
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div
              className="orders-view-switch"
              aria-label="Switch between pending and completed printing"
              role="tablist"
            >
              <button
                type="button"
                className={cn("orders-view-switch-tab", activeTab === "pending" && "is-active")}
                role="tab"
                aria-selected={activeTab === "pending"}
                onClick={() => setActiveTab("pending")}
              >
                Pending ({pendingPrinting.length})
              </button>
              <button
                type="button"
                className={cn("orders-view-switch-tab", activeTab === "completed" && "is-active")}
                role="tab"
                aria-selected={activeTab === "completed"}
                onClick={() => setActiveTab("completed")}
              >
                Completed ({completedPrinting.length})
              </button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <CardTitle>
                  {activeTab === "pending"
                    ? "Pending printing (design completed)"
                    : "Printing completed"}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {hasActiveColumnFilters && (
                    <Button variant="outline" size="sm" onClick={() => setColumnFilters({ order_number: "", customer: "", date: "", status: "" })}>
                      <X className="w-4 h-4 mr-2" />
                      Clear Filters
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">Sort</Button>
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
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
                        {activeTab === "completed" && <TableHead>Printed on</TableHead>}
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => goToOrder(order)}
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
                            <Badge className={getDesignOrderStatusColor(order.status)}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </TableCell>
                          {activeTab === "completed" && (
                            <TableCell className="text-sm text-muted-foreground">
                              {order.printing_completed_at
                                ? format(new Date(order.printing_completed_at), "dd-MMM-yy HH:mm")
                                : '—'}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  goToOrder(order);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {activeTab === "pending" && (
                                <Button
                                  size="sm"
                                  disabled={completingId === order.id}
                                  onClick={(e) => markPrintingCompleted(order.id, e)}
                                >
                                  {completingId === order.id ? 'Saving…' : 'Mark printing completed'}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredOrders.length === 0 && !loading && (
                    <div className="text-center py-8 text-muted-foreground">
                      {activeTab === "pending"
                        ? 'No orders waiting for printing. Complete design work on the Designs tab first.'
                        : 'No completed printing yet.'}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
      </div>
    </ErpLayout>
  );
};

export default DesignPrintingPage;
