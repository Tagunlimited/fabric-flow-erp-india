import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { Badge } from "@/components/ui/badge";
import "@/components/purchase-orders/POPlanningSegmentedSwitch.css";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  Users, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Plus, 
  Search,
  Filter,
  Calendar,
  UserCheck,
  ArrowRight
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDueDateIndian } from '@/lib/utils';
import { getOrderTotalQuantityFromItems } from '@/utils/orderItemLineQuantity';
import { ReassignCuttingMasterDialog } from '@/components/production/ReassignCuttingMasterDialog';

function firstImageFromArray(arr: unknown): string | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const v = arr[0];
  return v != null && String(v).trim() !== '' ? String(v) : undefined;
}

/** Best preview image for an order line (mockup → reference → line/category image). */
function resolveOrderItemLinePreviewImage(
  item: {
    mockup_images?: unknown;
    reference_images?: unknown;
    category_image_url?: string | null;
    product_category_id?: string | null;
  },
  categoryFallback?: Record<string, string>
): string | undefined {
  return (
    firstImageFromArray(item.mockup_images) ||
    firstImageFromArray(item.reference_images) ||
    (item.category_image_url && String(item.category_image_url).trim()) ||
    (item.product_category_id && categoryFallback?.[item.product_category_id]) ||
    undefined
  );
}

function buildOrderItemLineRatesFromItems(
  items: any[],
  categoryLookup: Record<string, { category_name?: string | null; category_image_url?: string | null }>
): OrderItemLineRates[] {
  const imageFallback: Record<string, string> = {};
  for (const [id, meta] of Object.entries(categoryLookup)) {
    const u = meta.category_image_url;
    if (u && String(u).trim()) imageFallback[id] = String(u);
  }
  return items.map((it: any, idx: number) => {
    const cid = it.product_category_id ? String(it.product_category_id) : '';
    const cat = cid ? categoryLookup[cid] : undefined;
    const categoryName =
      cat?.category_name != null && String(cat.category_name).trim()
        ? String(cat.category_name).trim()
        : undefined;
    const descRaw =
      it.product_description != null ? String(it.product_description).trim() : '';
    const productDescription = descRaw || undefined;
    const productLabel = descRaw || categoryName || `Product ${idx + 1}`;
    return {
      id: String(it.id),
      lineIndex: idx + 1,
      categoryName,
      productDescription,
      productLabel,
      imageUrl: resolveOrderItemLinePreviewImage(it, imageFallback),
      quantity: it.quantity != null ? Number(it.quantity) : undefined,
      cuttingPriceSingleNeedle:
        it.cutting_price_single_needle != null ? Number(it.cutting_price_single_needle) : null,
      cuttingPriceOverlockFlatlock:
        it.cutting_price_overlock_flatlock != null ? Number(it.cutting_price_overlock_flatlock) : null,
    };
  });
}

/** One sales line on an order — used for per-line stitching/cutting rates. */
export interface OrderItemLineRates {
  id: string;
  /** 1-based position in the order (for labels like “Product 1 of 3”). */
  lineIndex: number;
  /** Product category name (from product_categories). */
  categoryName?: string;
  /** Full line description from order_items.product_description. */
  productDescription?: string;
  /** Compact label for tables / fallback. */
  productLabel: string;
  imageUrl?: string;
  quantity?: number;
  cuttingPriceSingleNeedle?: number | null;
  cuttingPriceOverlockFlatlock?: number | null;
}

interface OrderAssignment {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  productCategoryImage?: string;
  quantity: number;
  assignedTo: string; // legacy single assignee
  // Multiple cutting masters support
  cuttingMasters?: Array<{
    id: string;                    // NEW - assignment ID from order_cutting_assignments
    cuttingMasterId: string;       // NEW - cutting master employee ID
    name: string;
    avatarUrl?: string;
    assignedDate: string;
    assignedBy?: string;
    assignedQuantity?: number | null;    // NEW - may be NULL
    completedQuantity?: number;         // NEW - what this master has cut
    cutQuantitiesBySize?: Record<string, number>; // NEW - size-wise cut quantities for this master
    leftQuantity?: number;               // NEW (calculated) - left quantity for this master
    leftQuantitiesBySize?: Record<string, number>; // NEW - size-wise left quantities for this master
    status?: string;                     // NEW
    bomTotalQuantity?: number;            // NEW - for reference
  }>;
  // Legacy single cutting master fields (for backward compatibility)
  cuttingMasterId?: string;
  cuttingMasterName?: string;
  cuttingMasterAvatarUrl?: string;
  cuttingWorkDate?: string;
  assignedDate: string;
  dueDate: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  materialStatus: 'Available' | 'Not Available';
  // Pricing captured at assignment time by tailor type
  cuttingPriceSingleNeedle?: number;
  cuttingPriceOverlockFlatlock?: number;
  // Stitching rates (separate from assignment)
  stitchingRatesSet?: boolean;
  stitchingPriceSingleNeedle?: number;
  stitchingPriceOverlockFlatlock?: number;
  /** Loaded from order_items; used when multiple products/lines need different SN/OF rates */
  orderItemLines?: OrderItemLineRates[];
}

const AssignOrdersPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortField, setSortField] = useState<string>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [assignOrdersTab, setAssignOrdersTab] = useState<'assignments' | 'assigned' | 'workers'>('assignments');

  // Initialize with empty array - data will be loaded from backend
  const [assignments, setAssignments] = useState<OrderAssignment[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initialize with empty array - data will be loaded from backend
  const [workers, setWorkers] = useState([
    // Workers data will be loaded from backend
  ]);
  const navigate = useNavigate();

  // Persist assignments locally to survive refresh until backend persistence is added
  const LOCAL_STORAGE_KEY = 'production-assignments';
  const getStoredAssignments = (): Record<string, any> => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  // Schedule dialog state (choose working date on assignment)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleRole, setScheduleRole] = useState<'cutting' | null>(null);
  const [scheduleAssignmentId, setScheduleAssignmentId] = useState<string | null>(null);
  const [scheduleWorkerId, setScheduleWorkerId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scheduleCuttingPriceSingleNeedle, setScheduleCuttingPriceSingleNeedle] = useState<string>('');
  const [scheduleCuttingPriceOverlockFlatlock, setScheduleCuttingPriceOverlockFlatlock] = useState<string>('');

  // View schedule dialog for a worker
  const [viewScheduleOpen, setViewScheduleOpen] = useState(false);
  const [viewScheduleWorker, setViewScheduleWorker] = useState<any | null>(null);
  
  // Multi-cutting master assignment dialog
  const [multiAssignmentOpen, setMultiAssignmentOpen] = useState(false);
  const [multiAssignmentOrderId, setMultiAssignmentOrderId] = useState<string | null>(null);
  const [selectedCuttingMasters, setSelectedCuttingMasters] = useState<string[]>([]);
  
  // Stitching rates dialog (one row per order line, or a single synthetic row if no lines loaded)
  const [stitchingRatesOpen, setStitchingRatesOpen] = useState(false);
  const [stitchingRatesOrderId, setStitchingRatesOrderId] = useState<string | null>(null);
  const [stitchingFormLines, setStitchingFormLines] = useState<
    {
      orderItemId: string;
      lineIndex: number;
      categoryName?: string;
      productDescription?: string;
      productLabel: string;
      imageUrl?: string;
      quantity?: number;
      sn: string;
      of: string;
    }[]
  >([]);
  const [stitchingDialogLoading, setStitchingDialogLoading] = useState(false);
  const [isEditingStitchingRates, setIsEditingStitchingRates] = useState(false);
  
  // Reassignment dialog
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignAssignment, setReassignAssignment] = useState<OrderAssignment | null>(null);
  
  // Current user state
  const [currentUser, setCurrentUser] = useState<{id: string, name: string} | null>(null);

  const setStoredAssignment = (
    orderId: string,
    update: Partial<Pick<OrderAssignment, 'cuttingMasterId' | 'cuttingMasterName' | 'assignedDate' | 'cuttingWorkDate'>>
  ) => {
    try {
      const map = getStoredAssignments();
      map[orderId] = { ...(map[orderId] || {}), ...update };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStitchingRatesTableCell = (assignment: OrderAssignment) => {
    const lines = assignment.orderItemLines || [];
    const sn = assignment.stitchingPriceSingleNeedle;
    const of = assignment.stitchingPriceOverlockFlatlock;
    if (lines.length > 1) {
      const pairs = lines.map((l) => ({
        sn: l.cuttingPriceSingleNeedle ?? sn ?? null,
        of: l.cuttingPriceOverlockFlatlock ?? of ?? null,
      }));
      const first = pairs[0];
      const mixed = pairs.some(
        (p) => p.sn !== first.sn || p.of !== first.of || p.sn == null || p.of == null
      );
      if (mixed) {
        return <span className="text-muted-foreground">Per line</span>;
      }
    }
    if (sn == null && of == null) return <span className="text-muted-foreground">-</span>;
    return (
      <span>
        SN ₹{formatPrice(sn)} / OF ₹{formatPrice(of)}
      </span>
    );
  };

  // Persist assignment in DB
  const upsertAssignment = async (
    orderId: string,
    fields: Partial<{
      cutting_master_id: string | null;
      cutting_master_name: string | null;
      cutting_work_date: string | null;
      cutting_price_single_needle: number | null;
      cutting_price_overlock_flatlock: number | null;
    }>
  ) => {
    try {
      const payload = { order_id: orderId, ...fields } as any;
      
      // First try to update existing record
      const { error: updateError } = await supabase
        .from('order_assignments' as any)
        .update(fields as any)
        .eq('order_id', orderId as any);

      // If update failed (no existing record), insert new one
      if (updateError) {
        await supabase
          .from('order_assignments' as any)
          .insert(payload);
      }
    } catch (e) {
      console.error('Failed to upsert order assignment:', e);
    }
  };

  // Use the centralized Indian date format function
  const formatDateDDMMYY = (value?: string) => {
    return formatDueDateIndian(value);
  };

  const formatPrice = (value?: number) => {
    if (value == null || isNaN(Number(value))) return '-';
    try {
      return Number(value).toFixed(2);
    } catch {
      return String(value);
    }
  };

  // Load employees: Cutting Managers and Cutting Masters
  useEffect(() => {
    const loadProductionTeam = async () => {
      try {
        // First, fetch all employees to see what designations exist
        const { data: allEmployees } = await supabase
          .from('employees' as any)
          .select('id, full_name, designation, avatar_url')
          .not('designation', 'is', null);
        
        if (allEmployees && allEmployees.length > 0) {
          // Get unique designations to see what's actually in the database
          const uniqueDesignations = [...new Set(allEmployees.map((e: any) => e.designation))];
          console.log('All available designations in employees table:', uniqueDesignations);
          
          // Find cutting-related designations (case-insensitive)
          const cuttingDesignations = uniqueDesignations.filter((d: string) => 
            d && typeof d === 'string' && d.toLowerCase().includes('cutting')
          );
          console.log('Cutting-related designations found:', cuttingDesignations);
          
          // Filter employees by cutting-related designations (case-insensitive)
          const cuttingMasters = allEmployees.filter((e: any) => {
            if (!e.designation) return false;
            const designation = e.designation.toLowerCase();
            return designation.includes('cutting master') || designation.includes('cutting manager');
          });
          
          console.log(`Found ${cuttingMasters.length} cutting masters with designations:`, 
            cuttingMasters.map((e: any) => `${e.full_name} (${e.designation})`));
          
          const list = cuttingMasters.map((row: any) => ({
            id: row.id,
            name: row.full_name,
            designation: row.designation,
            avatar_url: row.avatar_url,
          }));
          
          setWorkers(list);
          return;
        }
        
        // Fallback: Try exact match if no employees found
        const { data, error } = await supabase
          .from('employees' as any)
          .select('id, full_name, designation, avatar_url')
          .in('designation', ['Cutting Manager', 'Cutting Master'] as any);
        if (error) {
          console.error('Failed to load production_team:', error);
          return;
        }
        const list = (data || []).map((row: any) => ({
          id: row.id,
          name: row.full_name,
          designation: row.designation,
          avatar_url: row.avatar_url,
          availability: 'available',
          department: row.designation,
        }));
        setWorkers(list as any);
      } catch (err) {
        console.error('Error loading production team:', err);
      }
    };
    loadProductionTeam();
  }, []);

  // Load current user
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUser({
            id: user.id,
            name: user.user_metadata?.full_name || user.email || 'Current User'
          });
        }
      } catch (err) {
        console.error('Error loading current user:', err);
        // Fallback to a default user ID if auth fails
        setCurrentUser({
          id: '00000000-0000-0000-0000-000000000000',
          name: 'System User'
        });
      }
    };
    loadCurrentUser();
  }, []);

  // Load only orders which have at least one BOM created
  useEffect(() => {
    const loadAssignments = async () => {
      try {
        // 1) Fetch BOM records to get order_ids that have BOMs
        const { data: bomRows, error: bomErr } = await supabase
          .from('bom_records')
          .select('id, order_id, product_name, total_order_qty, created_at')
          .not('order_id', 'is', null);
        if (bomErr) throw bomErr;

        const boms = (bomRows || []).filter((b: any) => !!b.order_id);
        if (boms.length === 0) {
          setAssignments([]);
          return;
        }

        // Map BOM -> Order and gather all BOM ids
        const bomIdToOrderId: Record<string, string> = {};
        boms.forEach((b: any) => { if (b?.id && b?.order_id) bomIdToOrderId[b.id] = b.order_id; });
        const bomIds = boms.map((b: any) => b.id as string);

        // Group BOMs by order_id
        const bomsByOrder: Record<string, any[]> = {};
        boms.forEach((b: any) => {
          const key = b.order_id as string;
          (bomsByOrder[key] ||= []).push(b);
        });
        const orderIds = Object.keys(bomsByOrder);

        // 2) Fetch orders for those ids (exclude cancelled and readymade orders)
        const { data: orders, error: ordersErr } = await supabase
          .from('orders')
          .select('id, order_number, status, expected_delivery_date, customer_id')
          .eq('is_deleted', false)
          .in('id', orderIds as any)
          .or('order_type.is.null,order_type.eq.custom');
        if (ordersErr) throw ordersErr;

        const validOrders = (orders || []).filter((o: any) => o.status !== 'cancelled');
        const customerIds = Array.from(new Set(validOrders.map((o: any) => o.customer_id).filter(Boolean)));

        // 3) Fetch customers for name display
        let customersMap: Record<string, { company_name?: string }> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await supabase
            .from('customers')
            .select('id, company_name')
            .in('id', customerIds as any);
          (customers || []).forEach((c: any) => { if (c?.id) customersMap[c.id] = { company_name: c.company_name }; });
        }

        // 4) Fetch BOM items for all BOMs to determine material availability
        const { data: bomItems, error: bomItemsErr } = await supabase
          .from('bom_record_items' as any)
          .select('bom_id, item_id, item_code, item_name, qty_total')
          .in('bom_id', bomIds as any);
        if (bomItemsErr) throw bomItemsErr;

        // Fetch POs linked to these BOMs: 1) purchase_orders.bom_id 2) bom_po_items (in case PO has no bom_id set)
        const { data: posFromBoms } = await supabase
          .from('purchase_orders')
          .select('id, bom_id')
          .eq('is_deleted', false)
          .in('bom_id', bomIds);

        let bomIdToPoIds: Record<string, Set<string>> = {};
        (posFromBoms || []).forEach((po: any) => {
          if (po?.bom_id) {
            if (!bomIdToPoIds[po.bom_id]) bomIdToPoIds[po.bom_id] = new Set();
            bomIdToPoIds[po.bom_id].add(po.id);
          }
        });

        const { data: bomPoItems } = await supabase
          .from('bom_po_items')
          .select('bom_id, po_id')
          .in('bom_id', bomIds);
        (bomPoItems || []).forEach((row: any) => {
          if (row?.bom_id && row?.po_id) {
            if (!bomIdToPoIds[row.bom_id]) bomIdToPoIds[row.bom_id] = new Set();
            bomIdToPoIds[row.bom_id].add(row.po_id);
          }
        });

        const poIds = Array.from(new Set([
          ...(posFromBoms || []).map((po: any) => po.id),
          ...(bomPoItems || []).map((row: any) => row.po_id)
        ].filter(Boolean)));

        // Fetch GRN masters for these POs (with po_id to link back to BOM)
        let grnMasterData: any[] = [];
        let grnItemsData: any[] = [];
        if (poIds.length > 0) {
          const { data: grnMasters } = await supabase
            .from('grn_master')
            .select('id, po_id')
            .in('po_id', poIds);
          grnMasterData = grnMasters || [];

          const grnIds = grnMasterData.map(g => g.id);
          if (grnIds.length > 0) {
            const { data: grnItems } = await supabase
              .from('grn_items')
              .select('grn_id, po_item_id, approved_quantity, item_name')
              .in('grn_id', grnIds)
              .eq('quality_status', 'approved');
            grnItemsData = grnItems || [];
          }
        }

        // BOM has material available if: there is a PO for that BOM and that PO has a GRN with at least one approved item
        const grnIdsWithApprovedItems = new Set((grnItemsData || []).map((gi: any) => gi.grn_id));
        const poIdsWithApprovedGrn = new Set(
          (grnMasterData || [])
            .filter((g: any) => grnIdsWithApprovedItems.has(g.id))
            .map((g: any) => g.po_id)
        );
        const bomIdsWithGrn: Set<string> = new Set();
        Object.entries(bomIdToPoIds).forEach(([bomId, poIdSet]) => {
          const hasApprovedGrn = Array.from(poIdSet).some(poId => poIdsWithApprovedGrn.has(poId));
          if (hasApprovedGrn) bomIdsWithGrn.add(bomId);
        });

        if (process.env.NODE_ENV === 'development') {
          console.log('[Material Status] BOMs:', bomIds.length, 'POs from purchase_orders:', (posFromBoms || []).length, 'POs from bom_po_items:', (bomPoItems || []).length, 'total poIds:', poIds.length);
          console.log('[Material Status] GRN masters:', grnMasterData.length, 'GRN items (approved):', grnItemsData.length);
          console.log('[Material Status] BOMs with approved GRN:', Array.from(bomIdsWithGrn));
        }

        // 4) Build assignments from orders + grouped BOMs
        const mapStatusToAssignment = (orderStatus: string): OrderAssignment['status'] => {
          if (orderStatus === 'pending' || orderStatus === 'confirmed') return 'pending';
          if (orderStatus === 'in_production' || orderStatus === 'quality_check') return 'in_progress';
          if (orderStatus === 'completed') return 'completed';
          return 'pending';
        };

        const computePriority = (dueDateStr?: string | null): OrderAssignment['priority'] => {
          if (!dueDateStr) return 'medium';
          const today = new Date();
          const due = new Date(dueDateStr);
          const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 2) return 'urgent';
          if (diffDays <= 7) return 'high';
          return 'medium';
        };

        // Load existing assignments from DB
        let assignmentsByOrder: Record<string, any> = {};
        try {
          const { data: rows } = await supabase
            .from('order_assignments' as any)
            .select('order_id, cutting_master_id, cutting_master_name, cutting_work_date, cutting_price_single_needle, cutting_price_overlock_flatlock')
            .in('order_id', orderIds as any);
          (rows || []).forEach((r: any) => { if (r?.order_id) assignmentsByOrder[r.order_id] = r; });
        } catch (e) {
          console.error('Failed to load order assignments:', e);
        }

        // Fetch employee avatar URLs for legacy single cutting masters
        const cuttingMasterIds = Array.from(new Set(
          Object.values(assignmentsByOrder)
            .map((a: any) => a.cutting_master_id)
            .filter(Boolean)
        ));
        let employeeAvatars: Record<string, string> = {};
        if (cuttingMasterIds.length > 0) {
          try {
            const { data: employees } = await supabase
              .from('employees' as any)
              .select('id, avatar_url')
              .in('id', cuttingMasterIds as any);
            (employees || []).forEach((emp: any) => {
              if (emp?.id && emp?.avatar_url) {
                employeeAvatars[emp.id] = emp.avatar_url;
              }
            });
          } catch (e) {
            console.error('Failed to load employee avatars:', e);
          }
        }

        // Fetch order items to get sizes_quantities for size-wise calculations
        let orderItemsByOrder: Record<string, any[]> = {};
        try {
          const { data: orderItemsData } = await supabase
            .from('order_items' as any)
            .select(
              'id, order_id, quantity, sizes_quantities, specifications, product_description, cutting_price_single_needle, cutting_price_overlock_flatlock, product_category_id, category_image_url, reference_images, mockup_images'
            )
            .in('order_id', orderIds as any)
            .order('created_at', { ascending: true });
          (orderItemsData || []).forEach((item: any) => {
            if (item?.order_id) {
              if (!orderItemsByOrder[item.order_id]) orderItemsByOrder[item.order_id] = [];
              orderItemsByOrder[item.order_id].push(item);
            }
          });
        } catch (e) {
          console.error('Failed to load order items:', e);
        }

        const orderItemCategoryIds = Array.from(
          new Set(
            (Object.values(orderItemsByOrder).flat() as any[])
              .map((it: any) => it.product_category_id)
              .filter(Boolean)
          )
        );
        let orderItemCategoryLookup: Record<
          string,
          { category_name?: string | null; category_image_url?: string | null }
        > = {};
        if (orderItemCategoryIds.length > 0) {
          try {
            const { data: cats } = await supabase
              .from('product_categories' as any)
              .select('id, category_name, category_image_url')
              .in('id', orderItemCategoryIds as any);
            (cats || []).forEach((c: any) => {
              if (c?.id) {
                orderItemCategoryLookup[String(c.id)] = {
                  category_name: c.category_name,
                  category_image_url: c.category_image_url,
                };
              }
            });
          } catch (e) {
            console.error('Failed to load category metadata for order lines:', e);
          }
        }

        // Fetch cut_quantities_by_size from order_assignments for each order
        let cutQuantitiesByOrder: Record<string, any> = {};
        try {
          const { data: cutQuantitiesData } = await supabase
            .from('order_assignments' as any)
            .select('order_id, cut_quantities_by_size')
            .in('order_id', orderIds as any);
          (cutQuantitiesData || []).forEach((r: any) => {
            if (r?.order_id) {
              cutQuantitiesByOrder[r.order_id] = r.cut_quantities_by_size || {};
            }
          });
        } catch (e) {
          console.error('Failed to load cut quantities:', e);
        }

        // Load multiple cutting masters from order_cutting_assignments with quantity fields
        // Also fetch employee avatars for cutting masters
        const allCuttingMasterIds: string[] = [];
        let cuttingMastersByOrder: Record<string, any[]> = {};
        try {
          const { data: cuttingRows } = await supabase
            .from('order_cutting_assignments' as any)
            .select('id, order_id, cutting_master_id, cutting_master_name, cutting_master_avatar_url, assigned_date, assigned_quantity, completed_quantity, status, notes, cut_quantities_by_size')
            .in('order_id', orderIds as any);
          (cuttingRows || []).forEach((r: any) => { 
            if (r?.order_id) {
              if (!cuttingMastersByOrder[r.order_id]) cuttingMastersByOrder[r.order_id] = [];
              cuttingMastersByOrder[r.order_id].push(r);
              if (r.cutting_master_id && !allCuttingMasterIds.includes(r.cutting_master_id)) {
                allCuttingMasterIds.push(r.cutting_master_id);
              }
            }
          });
        } catch (e) {
          console.error('Failed to load cutting masters:', e);
        }

        // Fetch employee avatars for all cutting masters
        let cuttingMasterAvatars: Record<string, string> = {};
        if (allCuttingMasterIds.length > 0) {
          try {
            const { data: employees } = await supabase
              .from('employees' as any)
              .select('id, avatar_url')
              .in('id', allCuttingMasterIds as any);
            (employees || []).forEach((emp: any) => {
              if (emp?.id && emp?.avatar_url) {
                cuttingMasterAvatars[emp.id] = emp.avatar_url;
              }
            });
          } catch (e) {
            console.error('Failed to load cutting master avatars:', e);
          }
        }
        const nextAssignments: OrderAssignment[] = validOrders.map((o: any) => {
          const bomList = bomsByOrder[o.id] || [];
          const productName = bomList.length === 1
            ? (bomList[0]?.product_name || 'Product')
            : (bomList.length > 1 ? 'Multiple Products' : 'Product');
          const quantity = getOrderTotalQuantityFromItems(orderItemsByOrder[o.id] || []);
          const due = o.expected_delivery_date || '';

          // Material status: Available if order has a BOM and that BOM has a GRN (PO created for BOM + GRN with approved items)
          const orderBomIds = (bomsByOrder[o.id] || []).map((b: any) => b.id).filter(Boolean);
          const hasBomWithGrn = orderBomIds.length > 0 && orderBomIds.some((bomId: string) => bomIdsWithGrn.has(bomId));
          const materialStatus: OrderAssignment['materialStatus'] = hasBomWithGrn ? 'Available' : 'Not Available';

          const base: OrderAssignment = {
            id: o.id,
            orderNumber: o.order_number,
            customerName: customersMap[o.customer_id]?.company_name || '',
            productName,
            quantity,
            assignedTo: '',
            assignedDate: '',
            dueDate: due,
            status: mapStatusToAssignment(o.status),
            priority: computePriority(due),
            materialStatus,
          };
          // Merge any DB selections
          const a = assignmentsByOrder[o.id] || {};
          const cuttingMasters = cuttingMastersByOrder[o.id] || [];
          
          if (cuttingMasters.length > 0) {
            // Multiple cutting masters - calculate quantities per master
            const bomTotalQty = quantity; // Calculated from canonical order item quantities
            
            // Get order items for this order to calculate size-wise quantities
            const orderItems = orderItemsByOrder[o.id] || [];
            const totalOrderSizes: Record<string, number> = {};
            orderItems.forEach((item: any) => {
              const sizes = item.sizes_quantities || {};
              Object.entries(sizes).forEach(([size, qty]: [string, any]) => {
                totalOrderSizes[size] = (totalOrderSizes[size] || 0) + (Number(qty) || 0);
              });
            });
            
            base.cuttingMasters = cuttingMasters.map((cm: any) => {
              const assignedQty = cm.assigned_quantity ?? null;
              const effectiveAssignedQty = assignedQty ?? bomTotalQty;
              
              // Get this cutting master's cut quantities by size (per-cutting-master tracking)
              const masterCutQuantitiesBySize = cm.cut_quantities_by_size || {};
              
              // Calculate total cut quantity from size-wise breakdown
              const masterTotalCutQtyFromSizes = Object.values(masterCutQuantitiesBySize).reduce((sum: number, val: any) => {
                return sum + (Number(val) || 0);
              }, 0);
              
              // Also check completed_quantity field from database
              const completedQtyFromDB = Number(cm.completed_quantity || 0);
              
              // Use the maximum of both to ensure we don't miss any cuts
              // This handles cases where completed_quantity might be updated separately
              const masterTotalCutQty = Math.max(masterTotalCutQtyFromSizes, completedQtyFromDB);
              
              // Calculate left quantities by size for this cutting master
              // Left = assigned_quantity (proportional by size) - what they've already cut
              const masterLeftQuantitiesBySize: Record<string, number> = {};
              
              // Get order sizes to calculate proportional assignment
              const totalOrderQty = Object.values(totalOrderSizes).reduce((sum, qty) => sum + qty, 0);
              
              if (totalOrderQty > 0) {
                Object.entries(totalOrderSizes).forEach(([size, orderQty]) => {
                  // Calculate proportional assigned quantity for this size based on effectiveAssignedQty
                  const proportionalAssigned = Math.round((orderQty / totalOrderQty) * effectiveAssignedQty);
                  const masterCutQty = Number(masterCutQuantitiesBySize[size] || 0);
                  // Left = proportional assigned - what they've cut
                  masterLeftQuantitiesBySize[size] = Math.max(0, proportionalAssigned - masterCutQty);
                });
              }
              
              // Calculate total left quantity for this master
              // Left = assigned_quantity - what they've cut
              // IMPORTANT: Allow reassignment if effectiveAssignedQty > 0 and not fully cut
              // This ensures reassignment works even if cutting hasn't started (cutQty = 0)
              const masterLeftQty = Math.max(0, effectiveAssignedQty - masterTotalCutQty);
              
              // Use avatar from employees table if not in cutting_master_avatar_url
              const avatarUrl = cm.cutting_master_avatar_url || cuttingMasterAvatars[cm.cutting_master_id] || undefined;
              
              return {
                id: cm.id, // Assignment ID from order_cutting_assignments
                cuttingMasterId: cm.cutting_master_id, // Cutting master employee ID
                name: cm.cutting_master_name,
                avatarUrl: avatarUrl,
                assignedDate: cm.assigned_date,
                assignedBy: 'System',
                assignedQuantity: assignedQty,
                completedQuantity: masterTotalCutQty, // What this master has cut
                cutQuantitiesBySize: masterCutQuantitiesBySize, // Size-wise cut quantities for this master
                leftQuantity: masterLeftQty, // Left quantity for this master
                leftQuantitiesBySize: masterLeftQuantitiesBySize, // Size-wise left quantities for this master
                status: cm.status,
                bomTotalQuantity: bomTotalQty
              };
            });
            // Keep legacy single cutting master for backward compatibility
            base.cuttingMasterId = cuttingMasters[0].cutting_master_id;
            base.cuttingMasterName = cuttingMasters[0].cutting_master_name;
            base.assignedTo = cuttingMasters[0].cutting_master_name || base.assignedTo;
            if (base.status === 'pending') base.status = 'assigned';
          } else if (a.cutting_master_id) {
            // Legacy single cutting master
            base.cuttingMasterId = a.cutting_master_id || undefined;
            base.cuttingMasterName = a.cutting_master_name || undefined;
            base.cuttingMasterAvatarUrl = employeeAvatars[a.cutting_master_id] || undefined;
            base.cuttingWorkDate = a.cutting_work_date || undefined;
            base.assignedTo = a.cutting_master_name || base.assignedTo;
            if (base.status === 'pending') base.status = 'assigned';
          }
          
          // Load cutting prices from order_assignments and use them as stitching rates
            base.cuttingPriceSingleNeedle = a.cutting_price_single_needle != null ? Number(a.cutting_price_single_needle) : undefined;
            base.cuttingPriceOverlockFlatlock = a.cutting_price_overlock_flatlock != null ? Number(a.cutting_price_overlock_flatlock) : undefined;
          
          // Use cutting prices as stitching rates (they are the same in this context)
          base.stitchingPriceSingleNeedle = a.cutting_price_single_needle != null ? Number(a.cutting_price_single_needle) : undefined;
          base.stitchingPriceOverlockFlatlock = a.cutting_price_overlock_flatlock != null ? Number(a.cutting_price_overlock_flatlock) : undefined;

          const itemsForOrder = orderItemsByOrder[o.id] || [];
          const lineRates: OrderItemLineRates[] = buildOrderItemLineRatesFromItems(
            itemsForOrder,
            orderItemCategoryLookup
          );
          if (lineRates.length > 0) {
            base.orderItemLines = lineRates;
          }

          const headerRatesMissing =
            (base.stitchingPriceSingleNeedle == null || base.stitchingPriceOverlockFlatlock == null) &&
            lineRates.length > 0;
          if (headerRatesMissing) {
            const pick = lineRates.find(
              (l) => l.cuttingPriceSingleNeedle != null && l.cuttingPriceOverlockFlatlock != null
            );
            if (pick) {
              base.cuttingPriceSingleNeedle = base.cuttingPriceSingleNeedle ?? pick.cuttingPriceSingleNeedle ?? undefined;
              base.cuttingPriceOverlockFlatlock =
                base.cuttingPriceOverlockFlatlock ?? pick.cuttingPriceOverlockFlatlock ?? undefined;
              base.stitchingPriceSingleNeedle =
                base.stitchingPriceSingleNeedle ?? pick.cuttingPriceSingleNeedle ?? undefined;
              base.stitchingPriceOverlockFlatlock =
                base.stitchingPriceOverlockFlatlock ?? pick.cuttingPriceOverlockFlatlock ?? undefined;
            }
          }

          const orderLevelRatesOk =
            a.cutting_price_single_needle != null && a.cutting_price_overlock_flatlock != null;
          const allLineRatesOk =
            lineRates.length > 0 &&
            lineRates.every(
              (l) =>
                l.cuttingPriceSingleNeedle != null && l.cuttingPriceOverlockFlatlock != null
            );
          /** Multi-line orders must have SN/OF on every order_items row; order_assignments alone is not enough. */
          const multiLineOrder = lineRates.length > 1;
          base.stitchingRatesSet = multiLineOrder
            ? allLineRatesOk
            : orderLevelRatesOk || allLineRatesOk;
          return base;
        });

        setAssignments(nextAssignments);
      } catch (err) {
        console.error('Failed to load assignable orders (with BOM):', err);
        setAssignments([]);
      }
    };

    loadAssignments();
  }, [refreshTrigger]);

  // Helper function to check if an order is fully assigned (has cutting master and stitching rates)
  const isOrderFullyAssigned = (assignment: OrderAssignment): boolean => {
    const hasCuttingMaster = assignment.cuttingMasterId != null;
    return hasCuttingMaster && Boolean(assignment.stitchingRatesSet);
  };

  // Helper function to check if an order needs assignment (missing cutting master or stitching rates)
  const isOrderNeedsAssignment = (assignment: OrderAssignment): boolean => {
    const hasCuttingMaster = assignment.cuttingMasterId != null;
    return !hasCuttingMaster || !assignment.stitchingRatesSet;
  };

  // Helper function to check if reassignment is possible
  // Reassignment is allowed if at least one cutting master has assigned quantity that hasn't been fully cut
  // This means: assignedQuantity > completedQuantity (or assignedQuantity > 0 if no cutting started)
  const canReassign = (assignment: OrderAssignment): boolean => {
    if (!assignment.cuttingMasters || assignment.cuttingMasters.length === 0) {
      return false; // No cutting master assigned
    }
    
    // Check if any cutting master has quantity left to cut
    // This works even if cutting hasn't started yet (leftQty will equal assignedQty)
    return assignment.cuttingMasters.some(master => {
      const leftQty = master.leftQuantity ?? 0;
      const assignedQty = master.assignedQuantity ?? master.bomTotalQuantity ?? 0;
      const completedQty = master.completedQuantity ?? 0;
      
      // Allow reassignment if:
      // 1. There's left quantity > 0, OR
      // 2. There's assigned quantity > 0 and completed < assigned (not fully cut)
      return leftQty > 0 || (assignedQty > 0 && completedQty < assignedQty);
    });
  };

  // Filter assignments for "Order Assignments" tab (orders that need assignment)
  // Sort handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Generic sort function
  const sortAssignments = (assignments: OrderAssignment[]) => {
    return [...assignments].sort((a, b) => {
      let aVal: any = a[sortField as keyof OrderAssignment];
      let bVal: any = b[sortField as keyof OrderAssignment];
      
      // Handle date fields
      if (sortField === 'dueDate' || sortField === 'assignedDate' || sortField === 'cuttingWorkDate') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }
      
      // Handle string fields
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const assignmentsNeedingWork = sortAssignments(assignments.filter(assignment => {
    const matchesSearch = assignment.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || assignment.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || assignment.priority === priorityFilter;
    const needsAssignment = isOrderNeedsAssignment(assignment);
    
    return matchesSearch && matchesStatus && matchesPriority && needsAssignment;
  }));

  // Filter assignments for "Assigned Orders" tab (fully assigned orders)
  const fullyAssignedOrders = sortAssignments(assignments.filter(assignment => {
    const matchesSearch = assignment.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || assignment.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || assignment.priority === priorityFilter;
    const isFullyAssigned = isOrderFullyAssigned(assignment);
    
    return matchesSearch && matchesStatus && matchesPriority && isFullyAssigned;
  }));

  // Legacy filteredAssignments (kept for backward compatibility)
  const filteredAssignments = assignmentsNeedingWork;

  // Compute how many assignments each worker currently has
  const assignedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assignments) {
      if (a.cuttingMasterId) {
        counts[a.cuttingMasterId] = (counts[a.cuttingMasterId] || 0) + 1;
      }
    }
    return counts;
  }, [assignments]);

  const handleAssignCuttingMaster = async (
    assignmentId: string,
    workerId: string,
    workDate?: string,
    prices?: { singleNeedle?: number; overlockFlatlock?: number }
  ) => {
    const worker = (workers as any[]).find(w => w.id === workerId);
    setAssignments(prev => prev.map(assignment => 
      assignment.id === assignmentId 
        ? { 
            ...assignment, 
            cuttingMasterId: workerId,
            cuttingMasterName: worker?.name || '',
            assignedTo: worker?.name || assignment.assignedTo || '',
            assignedDate: new Date().toISOString().split('T')[0],
            cuttingWorkDate: workDate || assignment.cuttingWorkDate,
            status: 'assigned' as const,
            cuttingPriceSingleNeedle: prices?.singleNeedle ?? assignment.cuttingPriceSingleNeedle,
            cuttingPriceOverlockFlatlock: prices?.overlockFlatlock ?? assignment.cuttingPriceOverlockFlatlock
          }
        : assignment
    ));
    await upsertAssignment(assignmentId, {
      cutting_master_id: workerId,
      cutting_master_name: (worker as any)?.name || '',
      cutting_work_date: workDate || new Date().toISOString().split('T')[0],
      cutting_price_single_needle: prices?.singleNeedle ?? null,
      cutting_price_overlock_flatlock: prices?.overlockFlatlock ?? null
    });

    const lines = assignments.find((x) => x.id === assignmentId)?.orderItemLines || [];
    if (
      lines.length === 1 &&
      prices?.singleNeedle != null &&
      prices?.overlockFlatlock != null
    ) {
      try {
        await supabase
          .from('order_items' as any)
          .update({
            cutting_price_single_needle: prices.singleNeedle,
            cutting_price_overlock_flatlock: prices.overlockFlatlock,
          } as any)
          .eq('id', lines[0].id as any);
      } catch (e) {
        console.error('Failed to sync rates to order_items:', e);
      }
    }
  };


  const handleAssignAny = (assignmentId: string, workerId: string) => {
    const worker = (workers as any[]).find(w => w.id === workerId);
    const designation = (worker as any)?.designation as string | undefined;
    if (!designation) return;
    // Open scheduling dialog to pick working date before finalizing
    setScheduleAssignmentId(assignmentId);
    setScheduleWorkerId(workerId);
    setScheduleDate(new Date().toISOString().split('T')[0]);
    // Prefill prices from existing assignment if available
    const existing = assignments.find(a => a.id === assignmentId);
    setScheduleCuttingPriceSingleNeedle(existing?.cuttingPriceSingleNeedle != null ? String(existing.cuttingPriceSingleNeedle) : '');
    setScheduleCuttingPriceOverlockFlatlock(existing?.cuttingPriceOverlockFlatlock != null ? String(existing.cuttingPriceOverlockFlatlock) : '');
    if (designation === 'Cutting Manager' || designation === 'Cutting Master') {
      setScheduleRole('cutting');
    } else {
      setScheduleRole(null);
    }
    setScheduleDialogOpen(true);
  };

  const finalizeScheduleAssignment = async () => {
    if (!scheduleAssignmentId || !scheduleWorkerId || !scheduleRole) {
      setScheduleDialogOpen(false);
      return;
    }
    if (scheduleRole === 'cutting') {
      await handleAssignCuttingMaster(
        scheduleAssignmentId,
        scheduleWorkerId,
        scheduleDate,
        {
          singleNeedle: scheduleCuttingPriceSingleNeedle !== '' ? Number(scheduleCuttingPriceSingleNeedle) : undefined,
          overlockFlatlock: scheduleCuttingPriceOverlockFlatlock !== '' ? Number(scheduleCuttingPriceOverlockFlatlock) : undefined,
        }
      );
    }
    setScheduleDialogOpen(false);
  };

  const parseStitchingRateInput = (s: string): number | null => {
    const n = parseFloat(String(s).trim());
    return Number.isFinite(n) ? n : null;
  };

  const fetchOrderItemLinesForStitchingDialog = async (
    orderId: string
  ): Promise<OrderItemLineRates[]> => {
    try {
      const { data: items, error } = await supabase
        .from('order_items' as any)
        .select(
          'id, product_description, quantity, cutting_price_single_needle, cutting_price_overlock_flatlock, product_category_id, category_image_url, reference_images, mockup_images'
        )
        .eq('order_id', orderId as any)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Stitching dialog: order_items query failed:', error);
        return [];
      }
      if (!items?.length) return [];
      const categoryIds = Array.from(
        new Set(items.map((i: any) => i.product_category_id).filter(Boolean))
      );
      let categoryLookup: Record<
        string,
        { category_name?: string | null; category_image_url?: string | null }
      > = {};
      if (categoryIds.length > 0) {
        const { data: cats } = await supabase
          .from('product_categories' as any)
          .select('id, category_name, category_image_url')
          .in('id', categoryIds as any);
        (cats || []).forEach((c: any) => {
          if (c?.id) {
            categoryLookup[String(c.id)] = {
              category_name: c.category_name,
              category_image_url: c.category_image_url,
            };
          }
        });
      }
      return buildOrderItemLineRatesFromItems(items, categoryLookup);
    } catch (e) {
      console.error('Failed to load order lines for stitching dialog:', e);
      return [];
    }
  };

  // Function to set stitching rates (per order line on order_items when multiple lines; always mirrors first line to order_assignments)
  const handleSetStitchingRates = async (orderId: string) => {
    try {
      const assignment = assignments.find((a) => a.id === orderId);
      if (!assignment || stitchingFormLines.length === 0) return;

      for (const row of stitchingFormLines) {
        const sn = parseStitchingRateInput(row.sn);
        const of = parseStitchingRateInput(row.of);
        if (sn == null || of == null) {
          toast.error('Enter single needle and overlock/flatlock rates for every row.');
          return;
        }
      }

      const rowsWithItemId = stitchingFormLines.filter((r) => r.orderItemId);
      const orderOnly = rowsWithItemId.length === 0;

      if (!orderOnly) {
        for (const row of rowsWithItemId) {
          const sn = parseStitchingRateInput(row.sn)!;
          const of = parseStitchingRateInput(row.of)!;
          const { error } = await supabase
            .from('order_items' as any)
            .update({
              cutting_price_single_needle: sn,
              cutting_price_overlock_flatlock: of,
            } as any)
            .eq('id', row.orderItemId as any);
          if (error) {
            console.error('Error updating order_items rates:', error);
            toast.error('Failed to save per-line stitching rates');
            return;
          }
        }
      }

      const firstForOrderAssignment = orderOnly
        ? stitchingFormLines[0]
        : rowsWithItemId[0];
      const masterSn = parseStitchingRateInput(firstForOrderAssignment.sn)!;
      const masterOf = parseStitchingRateInput(firstForOrderAssignment.of)!;

      const updateData = {
        cutting_master_id: assignment.cuttingMasterId || null,
        cutting_master_name: assignment.cuttingMasterName || null,
        cutting_price_single_needle: masterSn,
        cutting_price_overlock_flatlock: masterOf,
      };

      const { error: updateError } = await supabase
        .from('order_assignments')
        .update(updateData as any)
        .eq('order_id', orderId as any);

      if (updateError) {
        const { error: insertError } = await supabase
          .from('order_assignments')
          .insert({
            order_id: orderId,
            ...updateData,
          } as any);

        if (insertError) {
          console.error('Error inserting stitching rates:', insertError);
          toast.error('Failed to set stitching rates');
          return;
        }
      }

      if (orderOnly && (assignment.orderItemLines?.length ?? 0) === 1) {
        const onlyLine = assignment.orderItemLines![0];
        await supabase
          .from('order_items' as any)
          .update({
            cutting_price_single_needle: masterSn,
            cutting_price_overlock_flatlock: masterOf,
          } as any)
          .eq('id', onlyLine.id as any);
      }

      toast.success('Stitching rates saved');
      setStitchingRatesOpen(false);
      setStitchingFormLines([]);
      setStitchingRatesOrderId(null);
      setIsEditingStitchingRates(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Error setting stitching rates:', error);
      toast.error('Failed to set stitching rates');
    }
  };

  const openStitchingRatesDialog = async (orderId: string, editing: boolean) => {
    const assignment = assignments.find((a) => a.id === orderId);
    if (!assignment) return;
    setStitchingRatesOrderId(orderId);
    setIsEditingStitchingRates(editing);
    setStitchingRatesOpen(true);
    setStitchingDialogLoading(true);
    setStitchingFormLines([]);

    let lines = assignment.orderItemLines || [];
    if (lines.length === 0) {
      lines = await fetchOrderItemLinesForStitchingDialog(orderId);
    }

    const defSn =
      assignment.stitchingPriceSingleNeedle != null
        ? String(assignment.stitchingPriceSingleNeedle)
        : '';
    const defOf =
      assignment.stitchingPriceOverlockFlatlock != null
        ? String(assignment.stitchingPriceOverlockFlatlock)
        : '';

    if (lines.length === 0) {
      setStitchingFormLines([
        {
          orderItemId: '',
          lineIndex: 1,
          categoryName: undefined,
          productDescription: undefined,
          productLabel: assignment.productName || 'Order',
          imageUrl: assignment.productCategoryImage,
          quantity: assignment.quantity,
          sn: editing ? defSn : '',
          of: editing ? defOf : '',
        },
      ]);
    } else {
      setStitchingFormLines(
        lines.map((l) => ({
          orderItemId: l.id,
          lineIndex: l.lineIndex,
          categoryName: l.categoryName,
          productDescription: l.productDescription,
          productLabel: l.productLabel,
          imageUrl: l.imageUrl,
          quantity: l.quantity,
          sn:
            l.cuttingPriceSingleNeedle != null
              ? String(l.cuttingPriceSingleNeedle)
              : defSn,
          of:
            l.cuttingPriceOverlockFlatlock != null
              ? String(l.cuttingPriceOverlockFlatlock)
              : defOf,
        }))
      );
    }
    setStitchingDialogLoading(false);
  };

  // Function to open stitching rates dialog in edit mode
  const handleEditStitchingRates = (orderId: string) => {
    void openStitchingRatesDialog(orderId, true);
  };

  // Function to open stitching rates dialog in create mode
  const handleCreateStitchingRates = (orderId: string) => {
    void openStitchingRatesDialog(orderId, false);
  };

  // Function to open reassignment dialog
  const handleOpenReassignDialog = (assignment: OrderAssignment) => {
    setReassignAssignment(assignment);
    setReassignDialogOpen(true);
  };

  // Function to handle successful reassignment - triggers refresh
  const handleReassignmentSuccess = () => {
    // Trigger refresh by incrementing refreshTrigger, which will cause useEffect to re-run
    setRefreshTrigger(prev => prev + 1);
  };

  // Function to handle multiple cutting master assignment
  const handleMultiCuttingMasterAssignment = async () => {
    if (!multiAssignmentOrderId || selectedCuttingMasters.length === 0 || !currentUser) return;
    
    try {
      // Get the order assignment
      const assignment = assignments.find(a => a.id === multiAssignmentOrderId);
      if (!assignment) return;

      // First, delete existing cutting master assignments for this order
      const { error: deleteError } = await supabase
        .from('order_cutting_assignments')
        .delete()
        .eq('order_id', multiAssignmentOrderId as any);

      if (deleteError) {
        console.warn('Warning: Could not delete existing assignments:', deleteError);
        // Continue anyway - we'll try to insert new ones
      }

      // Create multiple cutting master assignments
      const cuttingMastersData = selectedCuttingMasters.map(masterId => {
        const worker = (workers as any[]).find(w => w.id === masterId);
        return {
          order_id: multiAssignmentOrderId,
          cutting_master_id: masterId,
          cutting_master_name: (worker as any)?.name || '',
          cutting_master_avatar_url: (worker as any)?.avatar_url || null,
          assigned_date: new Date().toISOString().split('T')[0],
          assigned_by_name: currentUser?.name || 'System User',
          notes: `Assigned via multi-assignment dialog`
        };
      });

      // Insert multiple assignments using order_cutting_assignments table
      const { error } = await supabase
        .from('order_cutting_assignments')
        .insert(cuttingMastersData as any);

      if (error) throw error;

      // Also create/update the order_assignments record with the first cutting master for consistency
      if (selectedCuttingMasters.length > 0) {
        const firstMasterId = selectedCuttingMasters[0];
        const firstWorker = (workers as any[]).find(w => w.id === firstMasterId);
        
        await supabase
          .from('order_assignments')
          .upsert({
            order_id: multiAssignmentOrderId,
            cutting_master_id: firstMasterId,
            cutting_master_name: (firstWorker as any)?.name || '',
            cutting_work_date: new Date().toISOString().split('T')[0]
          } as any);
      }

      // Update local state
      setAssignments(prev => prev.map(assignment => 
        assignment.id === multiAssignmentOrderId 
          ? { 
              ...assignment, 
              cuttingMasters: selectedCuttingMasters.map(masterId => {
                const worker = (workers as any[]).find(w => w.id === masterId);
                return {
                  id: masterId,
                  name: (worker as any)?.name || '',
                  avatarUrl: (worker as any)?.avatar_url || undefined,
                  assignedDate: new Date().toISOString().split('T')[0],
                  assignedBy: 'Current User'
                };
              }),
              // Keep legacy single cutting master for backward compatibility
              cuttingMasterId: selectedCuttingMasters[0],
              cuttingMasterName: (workers as any[]).find(w => w.id === selectedCuttingMasters[0])?.name || '',
              status: 'assigned' as const
            }
          : assignment
      ));

      // Close dialog and reset state
      setMultiAssignmentOpen(false);
      setSelectedCuttingMasters([]);
      setMultiAssignmentOrderId(null);
    } catch (error) {
      console.error('Error assigning multiple cutting masters:', error);
    }
  };

  const openWorkerSchedule = (worker: any) => {
    setViewScheduleWorker(worker);
    setViewScheduleOpen(true);
  };

  return (
    <ErpLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Assign Orders
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage order assignments and track production workflow
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Need Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-yellow-600">
                  {assignmentsNeedingWork.length}
                </span>
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Fully Assigned
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-600">
                  {fullyAssignedOrders.length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-600">
                  {assignments.length}
                </span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available Workers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-purple-600">
                  {workers.filter(w => w.availability === 'available').length}
                </span>
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full">
          <div
            className="erp-segmented-3 erp-segmented-3--stretch"
            data-idx={assignOrdersTab === 'assignments' ? 0 : assignOrdersTab === 'assigned' ? 1 : 2}
            role="tablist"
            aria-label="Assign orders views"
          >
            <span className="erp-segmented-3__thumb" aria-hidden />
            <button
              type="button"
              role="tab"
              aria-selected={assignOrdersTab === 'assignments'}
              data-idx="0"
              className="erp-segmented-3__btn"
              onClick={() => setAssignOrdersTab('assignments')}
            >
              Order Assignments
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignOrdersTab === 'assigned'}
              data-idx="1"
              className="erp-segmented-3__btn"
              onClick={() => setAssignOrdersTab('assigned')}
            >
              Assigned Orders
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignOrdersTab === 'workers'}
              data-idx="2"
              className="erp-segmented-3__btn"
              onClick={() => setAssignOrdersTab('workers')}
            >
              Available Workers
            </button>
          </div>
        </div>

          {assignOrdersTab === 'assignments' && (
          <div className="space-y-2">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full">
                      <Filter className="w-4 h-4 mr-2" />
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assignments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Order Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader label="Order #" field="orderNumber" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Customer" field="customerName" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Product" field="productName" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Quantity" field="quantity" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <TableHead>Cutting Master</TableHead>
                        <TableHead>Stitching Price</TableHead>
                        <SortableTableHeader label="Due Date" field="dueDate" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Status" field="status" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Priority" field="priority" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <TableHead>Material Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((assignment) => (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">{assignment.orderNumber}</TableCell>
                          <TableCell>{assignment.customerName}</TableCell>
                          <TableCell>{assignment.productName}</TableCell>
                          <TableCell>{assignment.quantity}</TableCell>
                          <TableCell>
                            {assignment.cuttingMasters && assignment.cuttingMasters.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {assignment.cuttingMasters.map((master, index) => (
                                  <div key={master.id} className="flex items-center">
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={master.avatarUrl} />
                                      <AvatarFallback className="text-sm">{master.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="ml-2 text-sm">{master.name}</span>
                                    {index < assignment.cuttingMasters.length - 1 && <span className="mx-1">,</span>}
                                  </div>
                                ))}
                              </div>
                            ) : assignment.cuttingMasterName ? (
                              <div className="flex items-center">
                                <Avatar className="w-12 h-12">
                                  <AvatarImage src={assignment.cuttingMasterAvatarUrl} />
                                  <AvatarFallback className="text-sm">{assignment.cuttingMasterName.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="ml-2 text-sm">{assignment.cuttingMasterName}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          {/* Stitching Price Column */}
                          <TableCell>
                            <div className="text-xs">{formatStitchingRatesTableCell(assignment)}</div>
                          </TableCell>
                          <TableCell>
                              <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                              {assignment.dueDate ? formatDateDDMMYY(assignment.dueDate) : '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(assignment.status)}>
                              {assignment.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getPriorityColor(assignment.priority)}>
                              {assignment.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={assignment.materialStatus === 'Available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {assignment.materialStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {/* Assign button - show for all orders in this tab (they need assignment work) */}
                              <Button 
                                variant="default" 
                                size="sm" 
                                onClick={() => {
                                  setMultiAssignmentOrderId(assignment.id);
                                  // Pre-select current cutting masters if they exist
                                  const currentMasters = assignment.cuttingMasters?.map(cm => cm.id) || 
                                                       (assignment.cuttingMasterId ? [assignment.cuttingMasterId] : []);
                                  setSelectedCuttingMasters(currentMasters);
                                  setMultiAssignmentOpen(true);
                                }}
                              >
                                {assignment.cuttingMasterId ? 'Re-assign' : 'Assign'}
                              </Button>
                              {/* Set Rate button - only show when cutting master is assigned but rates are not set */}
                              {assignment.cuttingMasterId && !assignment.stitchingRatesSet && (
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => handleCreateStitchingRates(assignment.id)}
                                >
                                  Set Rate
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${assignment.id}?from=production`)}>
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {assignOrdersTab === 'assigned' && (
          <div className="space-y-2">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="search-assigned">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search-assigned"
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="status-assigned">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="priority-assigned">Priority</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full">
                      <Filter className="w-4 h-4 mr-2" />
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assigned Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle>Assigned Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHeader label="Order #" field="orderNumber" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Customer" field="customerName" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Product" field="productName" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Quantity" field="quantity" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <TableHead>Cutting Master</TableHead>
                        <TableHead>Stitching Price</TableHead>
                        <SortableTableHeader label="Due Date" field="dueDate" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Status" field="status" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <SortableTableHeader label="Priority" field="priority" currentSortField={sortField} currentSortDirection={sortDirection} onSort={handleSort} />
                        <TableHead>Material Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fullyAssignedOrders.map((assignment) => (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">{assignment.orderNumber}</TableCell>
                          <TableCell>{assignment.customerName}</TableCell>
                          <TableCell>{assignment.productName}</TableCell>
                          <TableCell>{assignment.quantity}</TableCell>
                          <TableCell>
                            {assignment.cuttingMasters && assignment.cuttingMasters.length > 0 ? (
                              <div className="flex flex-wrap gap-3">
                                {assignment.cuttingMasters.map((master, index) => {
                                  // Show cutting master name, how much they've cut, and left quantity
                                  const cutQty = master.completedQuantity ?? 0;
                                  const leftQty = master.leftQuantity ?? 0;
                                  const leftQuantitiesBySize = master.leftQuantitiesBySize || {};
                                  const hasSizeBreakdown = Object.keys(leftQuantitiesBySize).length > 0;
                                  
                                  return (
                                    <div key={master.id} className="flex items-start gap-2 p-2 border rounded-lg bg-gray-50">
                                      <Avatar className="w-10 h-10">
                                        <AvatarImage src={master.avatarUrl} />
                                        <AvatarFallback className="text-xs">{master.name.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium">{master.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          Cut: {cutQty} pcs | Left: {leftQty} pcs
                                        </div>
                                        {hasSizeBreakdown && (
                                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                                            {Object.entries(leftQuantitiesBySize)
                                              .filter(([_, qty]) => qty > 0)
                                              .map(([size, qty]) => (
                                                <span key={size} className="bg-gray-200 px-1.5 py-0.5 rounded">
                                                  {size}: {qty}
                                                </span>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : assignment.cuttingMasterName ? (
                              <div className="flex items-center">
                                <Avatar className="w-12 h-12">
                                  <AvatarImage src={assignment.cuttingMasterAvatarUrl} />
                                  <AvatarFallback className="text-sm">{assignment.cuttingMasterName.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="ml-2 text-sm">{assignment.cuttingMasterName}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          {/* Stitching Price Column */}
                          <TableCell>
                            <div className="text-xs">{formatStitchingRatesTableCell(assignment)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                              {assignment.dueDate ? formatDateDDMMYY(assignment.dueDate) : '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(assignment.status)}>
                              {assignment.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getPriorityColor(assignment.priority)}>
                              {assignment.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={assignment.materialStatus === 'Available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {assignment.materialStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {/* Edit Rate button - always show in Assigned Orders tab since they have rates */}
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => handleEditStitchingRates(assignment.id)}
                              >
                                Edit Rate
                              </Button>
                              {/* Reassign Cutting Master button */}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleOpenReassignDialog(assignment)}
                                disabled={!canReassign(assignment)}
                                title={!canReassign(assignment) ? 'All cutting is completed' : 'Reassign cutting master'}
                              >
                                Reassign
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${assignment.id}?from=production`)}>
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {assignOrdersTab === 'workers' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Available Workers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {workers.map((worker) => (
                    <Card key={worker.id} className="shadow-erp-md">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{worker.name}</CardTitle>
                          <Badge 
                            className={worker.availability === 'available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                          >
                            {worker.availability}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-2">
                          Department: {worker.department}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            Current Tasks: {assignedCounts[(worker as any).id] || 0}
                          </span>
                          <Button variant="outline" size="sm" onClick={() => openWorkerSchedule(worker)}>
                            View Schedule
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          )}

        {/* Reassign Cutting Master Dialog */}
        <ReassignCuttingMasterDialog
          isOpen={reassignDialogOpen}
          onClose={() => setReassignDialogOpen(false)}
          onSuccess={handleReassignmentSuccess}
          assignment={reassignAssignment}
          workers={workers}
        />

        {/* Schedule date selection dialog */}
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select working date</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Work Date</Label>
                <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              </div>
              {scheduleRole === 'cutting' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Tailor price (SN)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={scheduleCuttingPriceSingleNeedle}
                      onChange={(e) => setScheduleCuttingPriceSingleNeedle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Tailor price (OF)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={scheduleCuttingPriceOverlockFlatlock}
                      onChange={(e) => setScheduleCuttingPriceOverlockFlatlock(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
              <Button onClick={finalizeScheduleAssignment}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View worker schedule dialog */}
        <Dialog open={viewScheduleOpen} onOpenChange={setViewScheduleOpen}>
          <DialogContent className="max-w-2xl w-[95vw]">
            <DialogHeader>
              <DialogTitle>
                {(viewScheduleWorker as any)?.name ? `${(viewScheduleWorker as any).name}'s Schedule` : 'Schedule'}
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Order #</th>
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments
                    .filter(a => a.cuttingMasterId === (viewScheduleWorker as any)?.id)
                    .sort((a, b) => {
                      const ad = a.cuttingWorkDate || '';
                      const bd = b.cuttingWorkDate || '';
                      return (new Date(ad).getTime() || 0) - (new Date(bd).getTime() || 0);
                    })
                    .map(a => (
                      <tr key={`${a.id}-${(viewScheduleWorker as any)?.id}`} className="border-t">
                        <td className="p-2">{formatDateDDMMYY(a.cuttingWorkDate)}</td>
                        <td className="p-2">{a.orderNumber}</td>
                        <td className="p-2">{a.customerName}</td>
                        <td className="p-2">Cutting</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewScheduleOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Multi-Cutting Master Assignment Dialog */}
        <Dialog open={multiAssignmentOpen} onOpenChange={setMultiAssignmentOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Cutting Masters</DialogTitle>
              <DialogDescription>
                Select one or more cutting masters to assign to this order. You can assign multiple cutting masters to share the workload.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="max-h-60 overflow-y-auto">
                {workers
                  .filter(w => {
                    const designation = (w as any).designation?.toLowerCase() || '';
                    return designation.includes('cutting master') || designation.includes('cutting manager');
                  })
                  .map(worker => (
                    <div key={worker.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={(worker as any)?.avatar_url} />
                        <AvatarFallback className="text-sm">{(worker as any)?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{(worker as any)?.name}</p>
                        <p className="text-sm text-muted-foreground">{(worker as any)?.designation}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedCuttingMasters.includes(worker.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCuttingMasters(prev => [...prev, worker.id]);
                          } else {
                            setSelectedCuttingMasters(prev => prev.filter(id => id !== worker.id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                    </div>
                  ))}
              </div>
              {selectedCuttingMasters.length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Selected Cutting Masters:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCuttingMasters.map(masterId => {
                      const worker = (workers as any[]).find(w => w.id === masterId);
                      return (
                        <div key={masterId} className="flex items-center space-x-2 bg-background px-2 py-1 rounded border">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={(worker as any)?.avatar_url} />
                            <AvatarFallback className="text-sm">{(worker as any)?.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{(worker as any)?.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setMultiAssignmentOpen(false);
                setSelectedCuttingMasters([]);
                setMultiAssignmentOrderId(null);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleMultiCuttingMasterAssignment}
                disabled={selectedCuttingMasters.length === 0}
              >
                Assign {selectedCuttingMasters.length} Cutting Master{selectedCuttingMasters.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Set/Edit Stitching Rates Dialog */}
        <Dialog
          open={stitchingRatesOpen}
          onOpenChange={(open) => {
            setStitchingRatesOpen(open);
            if (!open) {
              setStitchingFormLines([]);
              setStitchingRatesOrderId(null);
              setIsEditingStitchingRates(false);
              setStitchingDialogLoading(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0">
            <DialogHeader>
              <DialogTitle>{isEditingStitchingRates ? 'Edit Stitching Rates' : 'Set Stitching Rates'}</DialogTitle>
              <DialogDescription>
                Set rates product by product. Each row shows the line image (when available) so you can match the
                correct item. Order-level defaults in the database follow the first product for legacy flows.
              </DialogDescription>
            </DialogHeader>
            {stitchingDialogLoading ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <span>Loading order lines…</span>
              </div>
            ) : (
              <div className="max-h-[min(60vh,480px)] space-y-4 overflow-y-auto pr-1 py-2">
                {stitchingFormLines.map((row, idx) => {
                  const total = stitchingFormLines.length;
                  const label =
                    total > 1 ? `Product ${row.lineIndex} of ${total}` : `Product ${row.lineIndex}`;
                  return (
                    <div
                      key={row.orderItemId || `stitch-line-${idx}`}
                      className="rounded-lg border bg-card p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="mx-auto shrink-0 sm:mx-0">
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt=""
                              className="h-28 w-28 rounded-md border object-cover bg-muted"
                            />
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed bg-muted px-2 text-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="font-normal">
                              {label}
                            </Badge>
                            {row.quantity != null && row.quantity > 0 && (
                              <span className="text-sm text-muted-foreground">Qty: {row.quantity}</span>
                            )}
                          </div>
                          {row.categoryName ? (
                            <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
                              <span className="text-muted-foreground">Category: </span>
                              <span className="font-medium text-foreground">{row.categoryName}</span>
                            </div>
                          ) : null}
                          {row.productDescription ? (
                            <div className="space-y-1">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Product description
                              </p>
                              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                                {row.productDescription}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {row.productLabel}
                            </p>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor={`stitch-sn-${idx}`}>Single needle (₹)</Label>
                              <Input
                                id={`stitch-sn-${idx}`}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={row.sn}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setStitchingFormLines((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, sn: v } : r))
                                  );
                                }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`stitch-of-${idx}`}>Overlock / flatlock (₹)</Label>
                              <Input
                                id={`stitch-of-${idx}`}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={row.of}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setStitchingFormLines((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, of: v } : r))
                                  );
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <DialogFooter className="mt-4 sm:mt-0">
              <Button variant="outline" onClick={() => setStitchingRatesOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => stitchingRatesOrderId && handleSetStitchingRates(stitchingRatesOrderId)}
                disabled={
                  stitchingDialogLoading ||
                  stitchingFormLines.length === 0 ||
                  stitchingFormLines.some((row) => {
                    const sn = parseStitchingRateInput(row.sn);
                    const of = parseStitchingRateInput(row.of);
                    return sn == null || of == null;
                  })
                }
              >
                {isEditingStitchingRates ? 'Update Rates' : 'Set Rates'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default AssignOrdersPage;