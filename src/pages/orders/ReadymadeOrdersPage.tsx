import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shirt, Plus, Eye, Package, Clock, CheckCircle, Search, Filter, RefreshCw, Truck } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReadymadeOrderForm } from "@/components/orders/ReadymadeOrderForm";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePersistentTabState } from "@/hooks/usePersistentTabState";
import { cn, formatDateIndian, formatLocaleDateFromApi, parseBusinessDateLocal } from "@/lib/utils";
import { fetchOrderIdsWithActiveCreditReceipt } from "@/utils/orderFinancials";
import { CreditOrderBadge } from '@/components/orders/CreditOrderBadge';
import { playOrderStatusChangeSound } from '@/utils/orderStatusSound';
import {
  fetchEmployeeRowsWithSelectFallbacks,
  workEmailFromEmployeeRow,
} from '@/lib/employeesSchemaCompat';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  sales_manager: string;
  sales_manager_details?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
  payment_due_date?: string | null;
  has_credit_receipt?: boolean;
}

type ReadymadeColumnFilters = {
  order_number: string;
  customer: string;
  sales_manager: string;
  order_date: string;
  expected_delivery: string;
  status: string;
  amount: string;
  balance: string;
};

const EMPTY_COLUMN_FILTERS: ReadymadeColumnFilters = {
  order_number: '',
  customer: '',
  sales_manager: '',
  order_date: '',
  expected_delivery: '',
  status: '',
  amount: '',
  balance: '',
};

type ReadymadeFilterColumnKey = keyof ReadymadeColumnFilters;

const COLUMN_FILTER_DIALOG_META: Record<
  ReadymadeFilterColumnKey,
  { title: string; description: string; placeholder: string }
> = {
  order_number: {
    title: 'Filter by order number',
    description: 'Match order number text.',
    placeholder: 'e.g. TUC/26-',
  },
  customer: {
    title: 'Filter by customer',
    description: 'Match customer name.',
    placeholder: 'e.g. Rajiv',
  },
  sales_manager: {
    title: 'Filter by sales manager',
    description: 'Match sales manager name.',
    placeholder: 'e.g. Monika',
  },
  order_date: {
    title: 'Filter by order date',
    description: 'Match visible order date.',
    placeholder: 'e.g. 17 Apr',
  },
  expected_delivery: {
    title: 'Filter by expected delivery',
    description: 'Match visible delivery date.',
    placeholder: 'e.g. 25 Apr',
  },
  status: {
    title: 'Filter by status',
    description: 'Match status text.',
    placeholder: 'e.g. confirmed',
  },
  amount: {
    title: 'Filter by amount',
    description: 'Match amount text.',
    placeholder: 'e.g. 13014',
  },
  balance: {
    title: 'Filter by balance',
    description: 'Match balance text.',
    placeholder: 'e.g. 5000',
  },
};

function colCellIncludes(filterRaw: string, cellHaystack: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return cellHaystack.toLowerCase().includes(f);
}

function ReadymadeColumnFilterTrigger({
  active,
  ariaLabel,
  onOpen,
}: {
  active: boolean;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'h-7 w-7 shrink-0 rounded-full transition-all duration-200 ease-out',
        active
          ? 'bg-primary/20 text-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.45),0_4px_14px_-4px_hsl(var(--primary)/0.45)] ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:bg-primary/28 hover:ring-primary/65'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      )}
    >
      <Filter
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200 ease-out',
          active && 'scale-110 fill-primary text-primary [filter:drop-shadow(0_0_5px_hsl(var(--primary)/0.55))]'
        )}
        strokeWidth={active ? 2.5 : 2}
        aria-hidden
      />
    </Button>
  );
}

const ReadymadeOrdersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesManagers, setSalesManagers] = useState<{ [key: string]: { id: string; full_name: string; avatar_url?: string } }>({});
  const [loading, setLoading] = useState(true);
  const { activeTab, setActiveTab } = usePersistentTabState({
    pageKey: 'readymadeOrders',
    defaultValue: 'list'
  });
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [myOrdersFilterValue, setMyOrdersFilterValue] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<ReadymadeColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<ReadymadeFilterColumnKey | null>(null);
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);
  const filterDialogMeta = filterDialogColumn ? COLUMN_FILTER_DIALOG_META[filterDialogColumn] : null;

  useEffect(() => {
    if (activeTab === "list") {
      fetchOrders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.refreshOrders && activeTab === "list") {
      fetchOrders(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, activeTab, navigate, location.pathname]);

  const resolveMyOrdersFilterValue = async (): Promise<string> => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      const userEmail = authData?.user?.email || null;
      if (!userId) return "";

      const employeeRows = await fetchEmployeeRowsWithSelectFallbacks(supabase, 'readymade-my-orders');
      const employees = employeeRows as Array<{ id: string; user_id?: string | null }>;
      let matchedEmployee = employees.find((e) => e.user_id === userId);

      if (!matchedEmployee) {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, user_id, email');
        const matchingProfile = (allProfiles || []).find((p: any) => p.user_id === userId || (userEmail && p.email === userEmail));
        if (matchingProfile) {
          matchedEmployee = employees.find(
            (e) =>
              e.user_id === matchingProfile.user_id ||
              (!!matchingProfile.email && workEmailFromEmployeeRow(e as Record<string, unknown>) === matchingProfile.email)
          );
        }
      }

      if (!matchedEmployee && userEmail) {
        matchedEmployee = employees.find(
          (e) => workEmailFromEmployeeRow(e as Record<string, unknown>) === userEmail
        );
      }

      if (matchedEmployee?.id) return matchedEmployee.id;
      const fallbackName = (authData?.user as any)?.user_metadata?.full_name;
      if (typeof fallbackName === "string" && fallbackName.trim()) return fallbackName.trim();
      return userEmail || "";
    } catch {
      return "";
    }
  };

  useEffect(() => {
    const load = async () => {
      const marker = await resolveMyOrdersFilterValue();
      if (marker) setMyOrdersFilterValue(marker);
    };
    load();
  }, []);

  const fetchOrders = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      if (forceRefresh) {
        setOrders([]);
        setSalesManagers({});
      }
      
      // Fetch only readymade orders
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(company_name)
        `)
        .eq('is_deleted', false)
        .eq('order_type', 'readymade' as any)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const raw = (data as any[]) || [];
      const orderIds = raw.map((o) => o.id).filter(Boolean);
      const creditSet =
        orderIds.length > 0 ? await fetchOrderIdsWithActiveCreditReceipt(orderIds) : new Set<string>();
      const withFlags = raw.map((o) => ({
        ...o,
        has_credit_receipt: creditSet.has(o.id),
      }));

      if (withFlags.length > 0) {
        const salesManagerIds = withFlags
          .map((order: any) => order.sales_manager)
          .filter(Boolean)
          .filter((value: any, index: number, self: any[]) => self.indexOf(value) === index);

        if (salesManagerIds.length > 0) {
          const { data: employeesData, error: employeesError } = await supabase
            .from('employees')
            .select('id, full_name, avatar_url')
            .in('id', salesManagerIds);

          if (!employeesError && employeesData) {
            const managersMap = (employeesData as any[]).reduce((acc: any, emp: any) => {
              acc[emp.id] = emp;
              return acc;
            }, {} as { [key: string]: { id: string; full_name: string; avatar_url?: string } });
            setSalesManagers(managersMap);
          }
        }
      }

      setOrders(withFlags);
    } catch (error) {
      console.error('Error fetching readymade orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any } as any)
        .eq('id', orderId as any);

      if (error) throw error;

      playOrderStatusChangeSound();
      toast.success(`Order status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'ready_for_dispatch': return 'bg-green-100 text-green-800';
      case 'dispatched': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const [myOrdersOnly, setMyOrdersOnly] = useState(false);
  const handleToggleMyOrders = async () => {
    if (myOrdersOnly) {
      setMyOrdersOnly(false);
      return;
    }

    let marker = myOrdersFilterValue;
    if (!marker) {
      marker = await resolveMyOrdersFilterValue();
      if (marker) setMyOrdersFilterValue(marker);
    }
    if (!marker) {
      toast.error('Unable to resolve your sales-manager profile.');
      return;
    }
    setMyOrdersOnly(true);
  };

  const filteredOrders = useMemo(() => {
    return orders
    .filter(order => {
      if (!myOrdersOnly || !myOrdersFilterValue) return true;
      const marker = myOrdersFilterValue.trim().toLowerCase();
      const managerName = (salesManagers[order.sales_manager]?.full_name || "").toLowerCase();
      return order.sales_manager?.toLowerCase?.() === marker || managerName.includes(marker);
    })
    .filter(order => !filterStatus || order.status === filterStatus)
    .filter(order => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(term) ||
        order.customer?.company_name?.toLowerCase().includes(term) ||
        order.status?.toLowerCase().includes(term) ||
        (order.order_date &&
          (() => {
            const d = parseBusinessDateLocal(order.order_date);
            return d ? format(d, 'dd-MMM-yy').toLowerCase().includes(term) : false;
          })()) ||
        (order.final_amount !== undefined && order.final_amount.toString().toLowerCase().includes(term)) ||
        (order.balance_amount !== undefined && order.balance_amount.toString().toLowerCase().includes(term))
      );
    })
    .filter((order) => {
      const manager = salesManagers[order.sales_manager]?.full_name || 'N/A';
      const orderDateText = order.order_date
        ? formatLocaleDateFromApi(order.order_date, 'en-GB', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
          })
        : '';
      const expectedDeliveryText = order.expected_delivery_date
        ? formatLocaleDateFromApi(order.expected_delivery_date, 'en-GB', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
          })
        : 'N/A';
      const amountText = `${order.final_amount?.toFixed(2) || '0.00'} ₹${order.final_amount?.toFixed(2) || '0.00'}`;
      const balanceText = `${order.balance_amount?.toFixed(2) || '0.00'} ${(order.has_credit_receipt ? 'credit' : '')} ${order.payment_due_date ? formatDateIndian(order.payment_due_date) : ''}`;
      return (
        colCellIncludes(columnFilters.order_number, order.order_number || '') &&
        colCellIncludes(columnFilters.customer, order.customer?.company_name || '') &&
        colCellIncludes(columnFilters.sales_manager, manager) &&
        colCellIncludes(columnFilters.order_date, orderDateText) &&
        colCellIncludes(columnFilters.expected_delivery, expectedDeliveryText) &&
        colCellIncludes(columnFilters.status, order.status || '') &&
        colCellIncludes(columnFilters.amount, amountText) &&
        colCellIncludes(columnFilters.balance, balanceText)
      );
    })
    .sort((a, b) => {
      if (sortBy === "date_asc") {
        return (
          (parseBusinessDateLocal(a.order_date)?.getTime() ?? new Date(a.order_date).getTime()) -
          (parseBusinessDateLocal(b.order_date)?.getTime() ?? new Date(b.order_date).getTime())
        );
      } else if (sortBy === "date_desc") {
        return (
          (parseBusinessDateLocal(b.order_date)?.getTime() ?? new Date(b.order_date).getTime()) -
          (parseBusinessDateLocal(a.order_date)?.getTime() ?? new Date(a.order_date).getTime())
        );
      } else if (sortBy === "amount_asc") {
        return (a.final_amount || 0) - (b.final_amount || 0);
      } else if (sortBy === "amount_desc") {
        return (b.final_amount || 0) - (a.final_amount || 0);
      }
      return 0;
    });
  }, [orders, myOrdersOnly, myOrdersFilterValue, filterStatus, searchTerm, sortBy, salesManagers, columnFilters]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Readymade Orders Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage readymade product orders from creation to dispatch
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{orders.length}</span>
                <Shirt className="w-5 h-5 text-blue-700" />
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

          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Confirmed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'confirmed').length}
                </span>
                <Package className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-purple-100 text-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Dispatched
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'dispatched').length}
                </span>
                <Truck className="w-5 h-5 text-purple-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-green-100 text-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Ready to Dispatch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'ready_for_dispatch').length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="list">Orders List</TabsTrigger>
              <TabsTrigger value="create">Create Order</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="list" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <CardTitle>All Readymade Orders</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleToggleMyOrders}
                      className={cn(
                        "rounded-full border border-yellow-500 bg-yellow-300 text-black text-sm font-semibold px-4 py-2 transition-all duration-300 shadow-[0_0_0_0_black] hover:-translate-y-1 hover:-translate-x-0.5 hover:shadow-[2px_5px_0_0_black] active:translate-y-0.5 active:translate-x-0.5 active:shadow-[0_0_0_0_black]",
                        myOrdersOnly && "bg-black text-white border-black"
                      )}
                    >
                      My Orders
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowSearch(v => !v)}>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Filter className="w-4 h-4 mr-2" />
                          Filter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFilterStatus(null)} className={!filterStatus ? 'bg-accent/20 font-semibold' : ''}>All Statuses</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("pending")} className={filterStatus === "pending" ? 'bg-accent/20 font-semibold' : ''}>Pending</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("confirmed")} className={filterStatus === "confirmed" ? 'bg-accent/20 font-semibold' : ''}>Confirmed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("ready_for_dispatch")} className={filterStatus === "ready_for_dispatch" ? 'bg-accent/20 font-semibold' : ''}>Ready for Dispatch</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("dispatched")} className={filterStatus === "dispatched" ? 'bg-accent/20 font-semibold' : ''}>Dispatched</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("completed")} className={filterStatus === "completed" ? 'bg-accent/20 font-semibold' : ''}>Completed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("cancelled")} className={filterStatus === "cancelled" ? 'bg-accent/20 font-semibold' : ''}>Cancelled</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                    <Button variant="outline" size="sm" onClick={() => fetchOrders(true)} disabled={loading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Force Refresh
                    </Button>
                    {hasActiveColumnFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}
                      >
                        Clear column filters
                      </Button>
                    )}
                    <Button onClick={() => setActiveTab("create")}> <Plus className="w-4 h-4 mr-2" /> New Order </Button>
                  </div>
                </div>
                {showSearch && (
                  <div className="mt-2">
                    <Input
                      autoFocus
                      placeholder="Search by order number or customer name..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[600px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Order Number
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.order_number.trim()}
                                ariaLabel="Filter by order number"
                                onOpen={() => setFilterDialogColumn('order_number')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Customer
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.customer.trim()}
                                ariaLabel="Filter by customer"
                                onOpen={() => setFilterDialogColumn('customer')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Sales Manager
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.sales_manager.trim()}
                                ariaLabel="Filter by sales manager"
                                onOpen={() => setFilterDialogColumn('sales_manager')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Order Date
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.order_date.trim()}
                                ariaLabel="Filter by order date"
                                onOpen={() => setFilterDialogColumn('order_date')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Expected Delivery
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.expected_delivery.trim()}
                                ariaLabel="Filter by expected delivery"
                                onOpen={() => setFilterDialogColumn('expected_delivery')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Status
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.status.trim()}
                                ariaLabel="Filter by status"
                                onOpen={() => setFilterDialogColumn('status')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Amount
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.amount.trim()}
                                ariaLabel="Filter by amount"
                                onOpen={() => setFilterDialogColumn('amount')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              Balance
                              <ReadymadeColumnFilterTrigger
                                active={!!columnFilters.balance.trim()}
                                ariaLabel="Filter by balance"
                                onOpen={() => setFilterDialogColumn('balance')}
                              />
                            </div>
                          </TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.map((order) => (
                          <TableRow 
                            key={order.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            <TableCell className="font-medium">{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={salesManagers[order.sales_manager]?.avatar_url} alt={salesManagers[order.sales_manager]?.full_name} />
                                  <AvatarFallback className="text-xs">
                                    {salesManagers[order.sales_manager]?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'SM'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{salesManagers[order.sales_manager]?.full_name || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatLocaleDateFromApi(order.order_date, 'en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: '2-digit'
                              })}
                            </TableCell>
                            <TableCell>
                              {order.expected_delivery_date
                                ? formatLocaleDateFromApi(order.expected_delivery_date, 'en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: '2-digit'
                                  })
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Select 
                                  value={order.status} 
                                  onValueChange={(newStatus) => handleStatusChange(order.id, newStatus)}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                                    <SelectItem value="dispatched">Dispatched</SelectItem>
                                    <SelectItem value="completed" className="text-green-600 font-semibold">✅ Completed</SelectItem>
                                    <SelectItem value="cancelled" className="text-red-600">Cancelled</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Badge className={getStatusColor(order.status)}>
                                  {order.status.replace('_', ' ').toUpperCase()}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>₹{order.final_amount?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div>₹{order.balance_amount?.toFixed(2) || '0.00'}</div>
                                {(order.has_credit_receipt ||
                                  (!!order.payment_due_date && (order.balance_amount ?? 0) > 0)) && (
                                  <div className="flex flex-wrap gap-1">
                                    {order.has_credit_receipt && <CreditOrderBadge />}
                                    {order.payment_due_date && (order.balance_amount ?? 0) > 0 && (
                                      <Badge variant="outline" className="text-[10px] font-normal px-1 py-0">
                                        Due {formatDateIndian(order.payment_due_date)}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/orders/${order.id}`);
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
                        No readymade orders found
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={filterDialogColumn !== null}
              onOpenChange={(open) => {
                if (!open) setFilterDialogColumn(null);
              }}
            >
              <DialogContent className="sm:max-w-md">
                {filterDialogColumn && filterDialogMeta && (
                  <>
                    <DialogHeader>
                      <DialogTitle>{filterDialogMeta.title}</DialogTitle>
                      <DialogDescription>{filterDialogMeta.description}</DialogDescription>
                    </DialogHeader>
                    <Input
                      autoFocus
                      placeholder={filterDialogMeta.placeholder}
                      value={columnFilters[filterDialogColumn]}
                      onChange={(e) =>
                        setColumnFilters((p) => ({ ...p, [filterDialogColumn]: e.target.value }))
                      }
                    />
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setColumnFilters((p) => ({ ...p, [filterDialogColumn]: '' }))
                        }
                      >
                        Clear this filter
                      </Button>
                      <Button type="button" onClick={() => setFilterDialogColumn(null)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <ReadymadeOrderForm 
              onOrderCreated={async () => {
                setActiveTab("list");
                setTimeout(async () => {
                  await fetchOrders();
                }, 100);
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
};

export default ReadymadeOrdersPage;

