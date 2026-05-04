import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import "./OrdersPageViewSwitch.css";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Eye,
  Trash2,
  RefreshCw,
  X,
  Filter,
  ClipboardList,
  IndianRupee,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePersistentTabState } from "@/hooks/usePersistentTabState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderForm } from "@/components/orders/OrderForm";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calculateOrderSummary } from '@/utils/priceCalculation';
import { cn, formatDateIndian, formatLocaleDateFromApi, parseBusinessDateLocal } from '@/lib/utils';
import { buildActiveReceiptTotalLookup, fetchOrderIdsWithActiveCreditReceipt } from '@/utils/orderFinancials';
import { CreditOrderBadge } from '@/components/orders/CreditOrderBadge';
import { playOrderStatusChangeSound } from '@/utils/orderStatusSound';
import { Badge } from '@/components/ui/badge';
import { shouldRetryReadWithoutIsDeletedFilter } from '@/lib/supabaseSoftDeleteCompat';
import {
  fetchEmployeeRowsWithSelectFallbacks,
  workEmailFromEmployeeRow,
} from '@/lib/employeesSchemaCompat';
import { measureAsync } from '@/lib/perf';

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
  gst_rate?: number;
  calculatedAmount?: number;
  calculatedBalance?: number;
  payment_due_date?: string | null;
  has_credit_receipt?: boolean;
}

type OrdersColumnFilters = {
  order_number: string;
  customer: string;
  sales_manager: string;
  order_date: string;
  expected_delivery: string;
  status: string;
  amount: string;
  balance: string;
};

const EMPTY_COLUMN_FILTERS: OrdersColumnFilters = {
  order_number: '',
  customer: '',
  sales_manager: '',
  order_date: '',
  expected_delivery: '',
  status: '',
  amount: '',
  balance: '',
};

type OrdersFilterColumnKey = keyof OrdersColumnFilters;

const COLUMN_FILTER_DIALOG_META: Record<
  OrdersFilterColumnKey,
  { title: string; placeholder: string; description: string }
> = {
  order_number: {
    title: 'Filter by order number',
    placeholder: 'Type to match order number…',
    description: 'Shows rows whose order number contains this text (not case-sensitive).',
  },
  customer: {
    title: 'Filter by customer',
    placeholder: 'Company name…',
    description: 'Shows rows whose customer name contains this text.',
  },
  sales_manager: {
    title: 'Filter by sales manager',
    placeholder: 'Name or id…',
    description: 'Matches the assigned sales manager display name or id.',
  },
  order_date: {
    title: 'Filter by order date',
    placeholder: 'e.g. Mar 25, 2026-03-15…',
    description: 'Matches common date formats shown in the list.',
  },
  expected_delivery: {
    title: 'Filter by expected delivery',
    placeholder: 'Date or N/A…',
    description: 'Use N/A to find rows without an expected delivery date.',
  },
  status: {
    title: 'Filter by status',
    placeholder: 'e.g. pending, in production…',
    description: 'Matches status value or readable labels (underscores or spaces).',
  },
  amount: {
    title: 'Filter by amount',
    placeholder: 'Amount or ₹…',
    description: 'Matches the displayed order amount.',
  },
  balance: {
    title: 'Filter by balance',
    placeholder: 'Balance or ₹…',
    description: 'Matches the displayed balance.',
  },
};

function buildDateSearchText(raw: string | null | undefined): string {
  if (!raw) return '';
  const parts: string[] = [raw];
  try {
    const d = parseBusinessDateLocal(raw) ?? new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      parts.push(format(d, 'dd-MMM-yy'));
      parts.push(format(d, 'dd/MM/yyyy'));
      parts.push(format(d, 'yyyy-MM-dd'));
      parts.push(
        d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        })
      );
    }
  } catch {
    /* ignore */
  }
  return parts.join(' ').toLowerCase();
}

function buildNumberSearchText(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '';
  const num = Number(n);
  return [String(num), num.toFixed(2), num.toFixed(0), `₹${num.toFixed(2)}`, `₹${num.toFixed(0)}`]
    .join(' ')
    .toLowerCase();
}

function buildStatusSearchText(status: string | undefined): string {
  if (!status) return '';
  return [status, status.replace(/_/g, ' '), status.replace(/_/g, '-')]
    .join(' ')
    .toLowerCase();
}

function isOpenOrderStatus(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s !== 'completed' && s !== 'cancelled';
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatOrdersPageInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatOrdersPageInrCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(2)} K`;
  return formatOrdersPageInr(n);
}

function colCellIncludes(filterRaw: string, cellHaystack: string): boolean {
  const f = filterRaw.trim().toLowerCase();
  if (!f) return true;
  return cellHaystack.toLowerCase().includes(f);
}

function orderMatchesColumnFilters(
  order: Order,
  f: OrdersColumnFilters,
  salesManagers: { [key: string]: { id: string; full_name: string; avatar_url?: string } }
): boolean {
  if (!colCellIncludes(f.order_number, order.order_number || '')) return false;
  if (!colCellIncludes(f.customer, order.customer?.company_name || '')) return false;

  const smHay = [salesManagers[order.sales_manager]?.full_name, order.sales_manager].filter(Boolean).join(' ');
  if (!colCellIncludes(f.sales_manager, smHay)) return false;

  if (!colCellIncludes(f.order_date, buildDateSearchText(order.order_date))) return false;

  const expHay = order.expected_delivery_date
    ? buildDateSearchText(order.expected_delivery_date)
    : 'n/a';
  if (!colCellIncludes(f.expected_delivery, expHay)) return false;

  if (!colCellIncludes(f.status, buildStatusSearchText(order.status))) return false;

  const amtHay = [
    buildNumberSearchText(order.calculatedAmount ?? order.final_amount ?? order.total_amount),
    buildNumberSearchText(order.final_amount),
    buildNumberSearchText(order.total_amount),
  ].join(' ');
  if (!colCellIncludes(f.amount, amtHay)) return false;

  const balHay = [
    buildNumberSearchText(order.calculatedBalance ?? order.balance_amount),
    buildNumberSearchText(order.balance_amount),
  ].join(' ');
  if (!colCellIncludes(f.balance, balHay)) return false;

  return true;
}

function OrderColumnFilterTrigger({
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

const OrdersPage = () => {
  const ORDERS_PAGE_SIZE = 100;
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersWithCuttingMaster, setOrdersWithCuttingMaster] = useState<Set<string>>(new Set());
  const [salesManagers, setSalesManagers] = useState<{ [key: string]: { id: string; full_name: string; avatar_url?: string } }>({});
  const [loading, setLoading] = useState(true);
  // Use persistent tab state to prevent resetting to first tab on refresh
  const { activeTab, setActiveTab } = usePersistentTabState({
    pageKey: 'orders',
    defaultValue: 'list'
  });
  const [columnFilters, setColumnFilters] = useState<OrdersColumnFilters>({ ...EMPTY_COLUMN_FILTERS });
  const [filterDialogColumn, setFilterDialogColumn] = useState<OrdersFilterColumnKey | null>(null);
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [loggedInSalesManagerFilterValue, setLoggedInSalesManagerFilterValue] = useState<string>("");
  const [prefillFromManualQuotationId, setPrefillFromManualQuotationId] = useState<string | null>(null);
  const [ordersLimit, setOrdersLimit] = useState<number>(ORDERS_PAGE_SIZE);

  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => v.trim().length > 0);

  const filterDialogMeta = filterDialogColumn ? COLUMN_FILTER_DIALOG_META[filterDialogColumn] : null;

  // Only refresh on tab change, not on visibility changes or focus
  useEffect(() => {
    if (activeTab === "list" || activeTab === "completed") {
      fetchOrders();
    }
  }, [activeTab]);

  // Handle navigation state to refresh orders when returning from order detail
  useEffect(() => {
    if (location.state?.refreshOrders && activeTab !== "create") {
      fetchOrders(true); // Force refresh when returning from order detail
      // Clear the state to prevent unnecessary refreshes
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, activeTab, navigate, location.pathname]);

  useEffect(() => {
    const manualQuotationId = (location.state as any)?.openCreateFromManualQuotationId;
    if (typeof manualQuotationId === 'string' && manualQuotationId.trim()) {
      setPrefillFromManualQuotationId(manualQuotationId);
      setActiveTab('create');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, setActiveTab]);

  const resolveLoggedInSalesManagerFilterValue = async (): Promise<string> => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      const userEmail = authData?.user?.email || null;
      if (!userId) return "";

      const employeeRows = await fetchEmployeeRowsWithSelectFallbacks(supabase, 'orders-sales-manager');
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

  // Prefetch marker for quick My Orders toggle.
  useEffect(() => {
    const load = async () => {
      const marker = await resolveLoggedInSalesManagerFilterValue();
      if (marker) setLoggedInSalesManagerFilterValue(marker);
    };
    load();
  }, []);

  const isMyOrdersFilterActive =
    !!loggedInSalesManagerFilterValue &&
    columnFilters.sales_manager.trim().toLowerCase() === loggedInSalesManagerFilterValue.trim().toLowerCase();

  const handleToggleMyOrdersFilter = async () => {
    if (isMyOrdersFilterActive) {
      setColumnFilters((p) => ({ ...p, sales_manager: '' }));
      return;
    }

    let marker = loggedInSalesManagerFilterValue;
    if (!marker) {
      marker = await resolveLoggedInSalesManagerFilterValue();
      if (marker) setLoggedInSalesManagerFilterValue(marker);
    }
    if (!marker) {
      toast.error('Unable to resolve your sales-manager profile.');
      return;
    }
    setColumnFilters((p) => ({ ...p, sales_manager: marker }));
  };

  const fetchOrders = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Clear orders state first if force refresh
      if (forceRefresh) {
        setOrders([]);
        setOrdersWithCuttingMaster(new Set());
        setSalesManagers({});
      }
      
      // Fetch only custom orders (exclude readymade orders)
      const buildOrdersQuery = () =>
        supabase
          .from('orders')
          .select(`
            *,
            customer:customers(company_name)
          `)
          .or('order_type.is.null,order_type.eq.custom')
          .range(0, Math.max(ordersLimit - 1, 0))
          .order('created_at', { ascending: false });

      let { data, error } = await measureAsync('OrdersPage.fetchOrders.baseOrders', async () =>
        buildOrdersQuery().eq('is_deleted', false)
      );
      if (error && shouldRetryReadWithoutIsDeletedFilter(error)) {
        const retry = await measureAsync('OrdersPage.fetchOrders.baseOrders.retry', async () =>
          buildOrdersQuery()
        );
        if (retry.error) throw retry.error;
        data = retry.data;
      }
      if (error) throw error;

      const orderIds = (data || []).map((o) => o.id).filter(Boolean);
      const orderNumbers = (data || []).map((o) => o.order_number).filter(Boolean);

      let ordersWithCuttingMasterSet = new Set<string>();
      if (orderIds.length > 0) {
        const { data: assignmentRows, error: assignmentError } = await measureAsync(
          'OrdersPage.fetchOrders.cuttingAssignments',
          async () =>
            supabase
              .from('order_assignments')
              .select('order_id, cutting_master_id')
              .in('order_id', orderIds as any)
              .not('cutting_master_id', 'is', null)
        );
        if (assignmentError) {
          console.warn('order_assignments fetch for orders list stats:', assignmentError);
        } else if (assignmentRows) {
          ordersWithCuttingMasterSet = new Set(
            (assignmentRows as Array<{ order_id: string | null }>).map((r) => r.order_id).filter(Boolean) as string[]
          );
        }
      }

      let receiptRows: Array<{
        id: string;
        reference_id: string | null;
        reference_number: string | null;
        amount: number | null;
        status?: string | null;
        payment_mode?: string | null;
        payment_type?: string | null;
      }> = [];

      if (orderIds.length > 0 || orderNumbers.length > 0) {
        const receiptsSelect =
          'id, reference_id, reference_number, amount, status, payment_mode, payment_type';

        const fetchReceiptsByIds = async () => {
          if (orderIds.length === 0) return [] as any[];
          let r = await supabase
            .from('receipts')
            .select(receiptsSelect)
            .eq('is_deleted', false)
            .in('reference_id', orderIds as any);
          if (r.error && shouldRetryReadWithoutIsDeletedFilter(r.error)) {
            const r2 = await supabase.from('receipts').select(receiptsSelect).in('reference_id', orderIds as any);
            return r2.data || [];
          }
          return r.data || [];
        };

        const fetchReceiptsByNumbers = async () => {
          if (orderNumbers.length === 0) return [] as any[];
          let r = await supabase
            .from('receipts')
            .select(receiptsSelect)
            .eq('is_deleted', false)
            .in('reference_number', orderNumbers as any);
          if (r.error && shouldRetryReadWithoutIsDeletedFilter(r.error)) {
            const r2 = await supabase
              .from('receipts')
              .select(receiptsSelect)
              .in('reference_number', orderNumbers as any);
            return r2.data || [];
          }
          return r.data || [];
        };

        const [receiptsById, receiptsByNumber] = await measureAsync(
          'OrdersPage.fetchOrders.receipts',
          async () => Promise.all([fetchReceiptsByIds(), fetchReceiptsByNumbers()])
        );

        const receiptMap = new Map<string, {
          id: string;
          reference_id: string | null;
          reference_number: string | null;
          amount: number | null;
        }>();

        [...receiptsById, ...receiptsByNumber].forEach((receipt: any) => {
          if (!receipt?.id) return;
          receiptMap.set(receipt.id, receipt);
        });
        receiptRows = Array.from(receiptMap.values());
      }

      const creditOrderIdSet =
        orderIds.length > 0
          ? await measureAsync('OrdersPage.fetchOrders.creditOrderIds', async () =>
              fetchOrderIdsWithActiveCreditReceipt(orderIds)
            )
          : new Set<string>();

      const additionalByOrderId = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: chargesRows, error: chargesError } = await measureAsync(
          'OrdersPage.fetchOrders.additionalCharges',
          async () =>
            supabase
              .from('order_additional_charges')
              .select('order_id, amount_incl_gst')
              .in('order_id', orderIds as any)
        );
        if (chargesError) {
          console.warn('order_additional_charges fetch for orders list:', chargesError);
        } else if (chargesRows) {
          for (const row of chargesRows as { order_id: string; amount_incl_gst: number | null }[]) {
            if (!row?.order_id) continue;
            const amt = Number(row.amount_incl_gst || 0);
            additionalByOrderId.set(
              row.order_id,
              (additionalByOrderId.get(row.order_id) ?? 0) + amt
            );
          }
        }
      }

      const itemsSelect = 'order_id, id, unit_price, quantity, size_prices, sizes_quantities, specifications, gst_rate';
      let orderItems: any[] = [];
      if (orderIds.length > 0) {
        const itemsFetch = await measureAsync('OrdersPage.fetchOrders.orderItems.bulk', async () =>
          supabase
            .from('order_items')
            .select(itemsSelect)
            .eq('is_deleted', false)
            .in('order_id', orderIds as any)
        );
        if (itemsFetch.error && shouldRetryReadWithoutIsDeletedFilter(itemsFetch.error)) {
          const retry = await measureAsync('OrdersPage.fetchOrders.orderItems.bulk.retry', async () =>
            supabase.from('order_items').select(itemsSelect).in('order_id', orderIds as any)
          );
          if (retry.error) throw retry.error;
          orderItems = retry.data || [];
        } else if (itemsFetch.error) {
          throw itemsFetch.error;
        } else {
          orderItems = itemsFetch.data || [];
        }
      }

      const itemsByOrderId = new Map<string, any[]>();
      for (const item of orderItems) {
        const oid = String(item?.order_id || '');
        if (!oid) continue;
        const list = itemsByOrderId.get(oid) || [];
        list.push(item);
        itemsByOrderId.set(oid, list);
      }

      const activeReceiptRows = receiptRows.filter(
        (r) => String(r.status || '').trim().toLowerCase() === 'active'
      );
      const { byOrderId: receiptsByOrderId, byOrderNumber: receiptsByOrderNumber } =
        buildActiveReceiptTotalLookup(activeReceiptRows);

      const ordersWithCalculatedAmounts = measureAsync('OrdersPage.fetchOrders.compute', async () =>
        (data || []).map((order: any) => {
          const orderId = String(order.id || '');
          const orderNumber = String(order.order_number || '').trim();
          const totalReceipts =
            (receiptsByOrderId.get(orderId) || 0) ||
            (orderNumber ? receiptsByOrderNumber.get(orderNumber) || 0 : 0);

          const orderLineItems = itemsByOrderId.get(orderId) || [];
          const additionalSum = additionalByOrderId.get(orderId) ?? 0;
          const fallbackAmount = Number(order.final_amount || order.total_amount || 0);

          if (orderLineItems.length > 0) {
            const { grandTotal: lineItemsGrandTotal } = calculateOrderSummary(orderLineItems, order);
            const grandTotal = lineItemsGrandTotal + additionalSum;
            return {
              ...order,
              calculatedAmount: grandTotal,
              calculatedBalance: Math.max(grandTotal - totalReceipts, 0),
              has_credit_receipt: creditOrderIdSet.has(orderId),
            };
          }

          return {
            ...order,
            calculatedAmount: fallbackAmount,
            calculatedBalance: Math.max(fallbackAmount - totalReceipts, 0),
            has_credit_receipt: creditOrderIdSet.has(orderId),
          };
        })
      );
      
      // Fetch sales managers if there are orders with sales_manager field
      if (data && data.length > 0) {
        const salesManagerIds = data
          .map(order => order.sales_manager)
          .filter(Boolean)
          .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

        if (salesManagerIds.length > 0) {
          const { data: employeesData, error: employeesError } = await supabase
            .from('employees')
            .select('id, full_name, avatar_url')
            .in('id', salesManagerIds);

          if (!employeesError && employeesData) {
            const managersMap = employeesData.reduce((acc, emp) => {
              acc[emp.id] = emp;
              return acc;
            }, {} as { [key: string]: { id: string; full_name: string; avatar_url?: string } });
            setSalesManagers(managersMap);
          }
        }
      }
      
      setOrders(await ordersWithCalculatedAmounts);
      setOrdersWithCuttingMaster(ordersWithCuttingMasterSet);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    try {
      // Cascade soft-delete across all order-linked records.
      const { data, error } = await supabase
        .rpc('soft_delete_order_cascade', { order_uuid: orderId, reason: 'Deleted from Orders list' });
      
      if (error) {
        console.error('Error calling soft_delete_order_cascade:', error);
        toast.error(`Failed to delete order: ${error.message}`);
        return;
      } else if (!(data as any)?.ok) {
        toast.error('Order not found or already deleted');
        await fetchOrders(); // Refresh the list
        return;
      }

      toast.success(`Order ${orderNumber} deleted successfully`);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setOrdersWithCuttingMaster((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('An unexpected error occurred while deleting the order');
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const statusRequiresReceipt = !['pending', 'cancelled'].includes(String(newStatus).toLowerCase());
      if (statusRequiresReceipt) {
        const order = orders.find((o) => o.id === orderId);
        const orderNumber = String(order?.order_number || '').trim();
        const byId = await supabase
          .from('receipts')
          .select('id')
          .eq('reference_type', 'order')
          .eq('status', 'active')
          .eq('reference_id', orderId)
          .limit(1);
        const byNumber = !orderNumber
          ? { data: [] as any[], error: null as any }
          : await supabase
              .from('receipts')
              .select('id')
              .eq('reference_type', 'order')
              .eq('status', 'active')
              .eq('reference_number', orderNumber)
              .limit(1);
        const hasActiveReceipt =
          (!byId.error && (byId.data || []).length > 0) || (!byNumber.error && (byNumber.data || []).length > 0);
        if (!hasActiveReceipt) {
          toast.error('Create at least one active receipt before moving this order to the selected status.');
          return;
        }
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any })
        .eq('id', orderId);

      if (error) throw error;

      playOrderStatusChangeSound();
      toast.success(`Order status changed to ${newStatus.replace('_', ' ').toUpperCase()}`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleRestoreByOrderNumber = async () => {
    const orderNumber = window.prompt('Enter Order Number to restore (example: TUC/26-27/006)');
    if (!orderNumber?.trim()) return;

    try {
      const { data: orderRow, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, is_deleted')
        .eq('order_number', orderNumber.trim())
        .single();

      if (orderError || !orderRow?.id) {
        toast.error('Order not found');
        return;
      }

      if (!orderRow.is_deleted) {
        toast('Order is already active');
        return;
      }

      const { data, error } = await supabase.rpc('restore_order_cascade', { order_uuid: orderRow.id });
      if (error) {
        toast.error(`Failed to restore order: ${error.message}`);
        return;
      }
      if (!(data as any)?.ok) {
        toast.error('Restore failed');
        return;
      }

      toast.success(`Order ${orderRow.order_number} restored successfully`);
      await fetchOrders(true);
    } catch (error) {
      console.error('Error restoring order:', error);
      toast.error('Unexpected error while restoring order');
    }
  };

  const filteredOrders = useMemo(() => {
    const searched = orders.filter((order) => orderMatchesColumnFilters(order, columnFilters, salesManagers));
    return [...searched].sort((a, b) => {
      if (sortBy === "date_asc") {
        return (
          (parseBusinessDateLocal(a.order_date)?.getTime() ?? new Date(a.order_date).getTime()) -
          (parseBusinessDateLocal(b.order_date)?.getTime() ?? new Date(b.order_date).getTime())
        );
      }
      if (sortBy === "date_desc") {
        return (
          (parseBusinessDateLocal(b.order_date)?.getTime() ?? new Date(b.order_date).getTime()) -
          (parseBusinessDateLocal(a.order_date)?.getTime() ?? new Date(a.order_date).getTime())
        );
      }
      if (sortBy === "amount_asc") {
        return (a.final_amount || 0) - (b.final_amount || 0);
      }
      if (sortBy === "amount_desc") {
        return (b.final_amount || 0) - (a.final_amount || 0);
      }
      return 0;
    });
  }, [orders, columnFilters, sortBy, salesManagers]);

  const pendingOrders = useMemo(
    () => filteredOrders.filter((order) => String(order.status).toLowerCase() !== 'completed'),
    [filteredOrders]
  );

  const completedOrders = useMemo(
    () => filteredOrders.filter((order) => String(order.status).toLowerCase() === 'completed'),
    [filteredOrders]
  );

  const activeOrders = activeTab === 'completed' ? completedOrders : pendingOrders;
  const pendingOrdersTotal = useMemo(
    () => orders.filter((order) => String(order.status).toLowerCase() !== 'completed').length,
    [orders]
  );
  const completedOrdersTotal = useMemo(
    () => orders.filter((order) => String(order.status).toLowerCase() === 'completed').length,
    [orders]
  );
  /** Actionable snapshot from the same orders loaded for the list (lines + receipts + charges when available). */
  const ordersPageSnapshot = useMemo(() => {
    const open = orders.filter((o) => isOpenOrderStatus(o.status));
    const today = startOfDayLocal(new Date());
    const overdueOpen = open.filter((o) => {
      if (!o.expected_delivery_date) return false;
      let exp = parseBusinessDateLocal(o.expected_delivery_date);
      if (!exp) {
        const d = new Date(o.expected_delivery_date);
        exp = Number.isNaN(d.getTime()) ? null : d;
      }
      if (!exp) return false;
      return startOfDayLocal(exp).getTime() < today.getTime();
    });
    const pipelineValue = open.reduce(
      (s, o) => s + Number(o.calculatedAmount ?? o.final_amount ?? o.total_amount ?? 0),
      0
    );
    const balanceDueOpen = open.reduce(
      (s, o) => s + Number(o.calculatedBalance ?? o.balance_amount ?? 0),
      0
    );
    const completedLoaded = orders.filter((o) => String(o.status).toLowerCase() === 'completed').length;
    return {
      openCount: open.length,
      pipelineValue,
      balanceDueOpen,
      overdueOpenCount: overdueOpen.length,
      completedLoaded,
    };
  }, [orders]);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Orders Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customer orders from creation to fulfillment
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Open orders</CardTitle>
              <p className="text-xs font-normal opacity-80 leading-snug">
                Not completed or cancelled — work still in flight.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums">{ordersPageSnapshot.openCount}</span>
                <ClipboardList className="w-5 h-5 shrink-0 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-violet-100 text-violet-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Pipeline value</CardTitle>
              <p className="text-xs font-normal opacity-80 leading-snug">
                Booked value on open orders (lines + GST + charges when loaded).
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-2xl font-bold tabular-nums truncate"
                  title={formatOrdersPageInr(ordersPageSnapshot.pipelineValue)}
                >
                  {formatOrdersPageInrCompact(ordersPageSnapshot.pipelineValue)}
                </span>
                <IndianRupee className="w-5 h-5 shrink-0 text-violet-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-amber-100 text-amber-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Balance due (open)</CardTitle>
              <p className="text-xs font-normal opacity-80 leading-snug">
                Outstanding on open orders after matched receipts.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-2xl font-bold tabular-nums truncate"
                  title={formatOrdersPageInr(ordersPageSnapshot.balanceDueOpen)}
                >
                  {formatOrdersPageInrCompact(ordersPageSnapshot.balanceDueOpen)}
                </span>
                <Wallet className="w-5 h-5 shrink-0 text-amber-800" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-rose-100 text-rose-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">Past expected delivery</CardTitle>
              <p className="text-xs font-normal opacity-80 leading-snug">
                Open orders whose EDD is before today — needs attention.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {ordersPageSnapshot.overdueOpenCount}
                </span>
                <CalendarClock className="w-5 h-5 shrink-0 text-rose-800" />
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Figures reflect the orders currently loaded for this page (newest first, up to {ordersLimit} rows).
          Completed count in tabs: {ordersPageSnapshot.completedLoaded} completed in this load.
        </p>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div
              className="orders-view-switch"
              aria-label="Switch between pending orders and completed orders"
              role="tablist"
            >
              <button
                type="button"
                className={cn("orders-view-switch-tab", activeTab === "list" && "is-active")}
                onClick={() => setActiveTab("list")}
                role="tab"
                aria-selected={activeTab === "list"}
              >
                Pending Orders
              </button>
              <button
                type="button"
                className={cn("orders-view-switch-tab", activeTab === "completed" && "is-active")}
                onClick={() => setActiveTab("completed")}
                role="tab"
                aria-selected={activeTab === "completed"}
              >
                Completed
              </button>
            </div>
            <Button onClick={() => setActiveTab("create")}>
              <Plus className="w-4 h-4 mr-2" />
              Create Order
            </Button>
          </div>

          {(activeTab === "list" || activeTab === "completed") && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {activeTab === "completed" ? "Completed Orders" : "Pending Orders"}
                      {hasActiveColumnFilters && (
                        <span className="text-sm font-normal text-muted-foreground">
                          ({activeOrders.length} of {activeTab === "completed" ? completedOrdersTotal : pendingOrdersTotal} shown)
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click the filter icon on a column header to set that filter. Active filters combine (all must match).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleToggleMyOrdersFilter}
                      className={cn(
                        "rounded-full border border-yellow-500 bg-yellow-300 text-black text-sm font-semibold px-4 py-2 transition-all duration-300 shadow-[0_0_0_0_black] hover:-translate-y-1 hover:-translate-x-0.5 hover:shadow-[2px_5px_0_0_black] active:translate-y-0.5 active:translate-x-0.5 active:shadow-[0_0_0_0_black]",
                        isMyOrdersFilterActive && "bg-black text-white border-black"
                      )}
                    >
                      My Orders
                    </Button>
                    {hasActiveColumnFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setColumnFilters({ ...EMPTY_COLUMN_FILTERS })}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Clear column filters
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
                    <Button variant="outline" size="sm" onClick={() => fetchOrders(true)} disabled={loading}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Force Refresh
                    </Button>
                    {orders.length >= ordersLimit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setOrdersLimit((prev) => prev + ORDERS_PAGE_SIZE);
                          setTimeout(() => fetchOrders(true), 0);
                        }}
                        disabled={loading}
                      >
                        Load More
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleRestoreByOrderNumber}>
                      Restore Order
                    </Button>
                    <Button onClick={() => setActiveTab("create")}> <Plus className="w-4 h-4 mr-2" /> New Order </Button>
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
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="align-middle min-w-[6.5rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Order #</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.order_number.trim()}
                                ariaLabel="Filter by order number"
                                onOpen={() => setFilterDialogColumn('order_number')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[6rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Customer</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.customer.trim()}
                                ariaLabel="Filter by customer"
                                onOpen={() => setFilterDialogColumn('customer')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[7rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Sales Mgr.</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.sales_manager.trim()}
                                ariaLabel="Filter by sales manager"
                                onOpen={() => setFilterDialogColumn('sales_manager')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[6.5rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Order date</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.order_date.trim()}
                                ariaLabel="Filter by order date"
                                onOpen={() => setFilterDialogColumn('order_date')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[6.5rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Exp. delivery</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.expected_delivery.trim()}
                                ariaLabel="Filter by expected delivery"
                                onOpen={() => setFilterDialogColumn('expected_delivery')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[14rem] w-56 text-left">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Status</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.status.trim()}
                                ariaLabel="Filter by status"
                                onOpen={() => setFilterDialogColumn('status')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[5.5rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Amount</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.amount.trim()}
                                ariaLabel="Filter by amount"
                                onOpen={() => setFilterDialogColumn('amount')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle min-w-[5.5rem]">
                            <div className="flex items-center justify-between gap-1 py-2 pr-1">
                              <span className="text-xs font-semibold">Balance</span>
                              <OrderColumnFilterTrigger
                                active={!!columnFilters.balance.trim()}
                                ariaLabel="Filter by balance"
                                onOpen={() => setFilterDialogColumn('balance')}
                              />
                            </div>
                          </TableHead>
                          <TableHead className="align-middle w-[1%] whitespace-nowrap">
                            <span className="text-xs font-semibold py-2 inline-block">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeOrders.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                              {orders.length === 0
                                ? 'No orders yet.'
                                : `No ${activeTab === "completed" ? 'completed' : 'pending'} orders match the column filters. Adjust filters or clear them to see all rows.`}
                            </TableCell>
                          </TableRow>
                        ) : (
                          activeOrders.map((order) => (
                          <TableRow 
                            key={order.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/orders/${order.id}`)}
                          >
                            <TableCell className="font-medium">{order.order_number}</TableCell>
                            <TableCell>{order.customer?.company_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="w-12 h-12">
                                  <AvatarImage src={salesManagers[order.sales_manager]?.avatar_url} alt={salesManagers[order.sales_manager]?.full_name} />
                                  <AvatarFallback className="text-sm">
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
                              <div className="flex items-center justify-start text-left">
                                <Select 
                                  value={order.status} 
                                  onValueChange={(newStatus) => handleStatusChange(order.id, newStatus)}
                                >
                                  <SelectTrigger className="w-56 text-left">
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
                            </TableCell>
                            <TableCell>₹{(order.calculatedAmount ?? order.final_amount)?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div>
                                  ₹{(order.calculatedBalance ?? order.balance_amount)?.toFixed(2) || '0.00'}
                                </div>
                                {(order.has_credit_receipt ||
                                  (!!order.payment_due_date &&
                                    (order.calculatedBalance ?? order.balance_amount ?? 0) > 0)) && (
                                  <div className="flex flex-wrap gap-1">
                                    {order.has_credit_receipt && <CreditOrderBadge />}
                                    {order.payment_due_date &&
                                      (order.calculatedBalance ?? order.balance_amount ?? 0) > 0 && (
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
                                {order.status !== 'completed' && order.status !== 'cancelled' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(order.id, 'completed');
                                    }}
                                  >
                                    ✅ Mark Complete
                                  </Button>
                                )}
                                
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
                                
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="w-4 h-4" />
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
                                        onClick={() => handleDeleteOrder(order.id, order.order_number)}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        Delete Order
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
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
          </div>
          )}

          {activeTab === "create" && (
          <div className="space-y-6">
            <OrderForm
              prefillFromManualQuotationId={prefillFromManualQuotationId || undefined}
              onOrderCreated={async () => {
                setPrefillFromManualQuotationId(null);
                setActiveTab("list");
                setTimeout(async () => {
                  await fetchOrders();
                }, 100);
              }}
            />
          </div>
          )}
        </div>
      </div>
    </ErpLayout>
  );
};

export default OrdersPage;