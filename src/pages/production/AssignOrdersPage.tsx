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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ReassignCuttingMasterDialog } from '@/components/production/ReassignCuttingMasterDialog';

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
}

const AssignOrdersPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortField, setSortField] = useState<string>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
  
  // Stitching rates dialog
  const [stitchingRatesOpen, setStitchingRatesOpen] = useState(false);
  const [stitchingRatesOrderId, setStitchingRatesOrderId] = useState<string | null>(null);
  const [stitchingPriceSingleNeedle, setStitchingPriceSingleNeedle] = useState<string>('');
  const [stitchingPriceOverlockFlatlock, setStitchingPriceOverlockFlatlock] = useState<string>('');
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

        // NEW: Fetch all POs created from these BOMs
        const { data: posFromBoms } = await supabase
          .from('purchase_orders')
          .select('id, bom_id')
          .in('bom_id', bomIds);

        const poIds = (posFromBoms || []).map(po => po.id);

        // NEW: Fetch GRN items for these POs (approved items only)
        let grnItemsData: any[] = [];
        if (poIds.length > 0) {
          const { data: grnMasterData } = await supabase
            .from('grn_master')
            .select('id')
            .in('po_id', poIds);
          
          const grnIds = (grnMasterData || []).map(g => g.id);
          
          if (grnIds.length > 0) {
            const { data: grnItems } = await supabase
              .from('grn_items')
              .select('po_item_id, approved_quantity, item_name')
              .in('grn_id', grnIds)
              .eq('quality_status', 'approved');
            grnItemsData = grnItems || [];
          }
        }

        // Build mapping: BOM item_name → total approved quantity
        const approvedQtyByItemName = new Map<string, number>();
        grnItemsData.forEach(gi => {
          const current = approvedQtyByItemName.get(gi.item_name) || 0;
          approvedQtyByItemName.set(gi.item_name, current + (gi.approved_quantity || 0));
        });

        // Check availability by matching BOM item names with GRN approved items
        const reqByItemName: Record<string, Record<string, number>> = {};
        (bomItems || []).forEach((bi: any) => {
          const orderId = bomIdToOrderId[bi.bom_id];
          if (!orderId) return;
          const reqQty = Number(bi.qty_total || 0) || 0;
          const itemName = bi.item_name;
          (reqByItemName[orderId] ||= {});
          reqByItemName[orderId][itemName] = (reqByItemName[orderId][itemName] || 0) + reqQty;
        });

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
            .select('order_id, sizes_quantities')
            .in('order_id', orderIds as any);
          (orderItemsData || []).forEach((item: any) => {
            if (item?.order_id) {
              if (!orderItemsByOrder[item.order_id]) orderItemsByOrder[item.order_id] = [];
              orderItemsByOrder[item.order_id].push(item);
            }
          });
        } catch (e) {
          console.error('Failed to load order items:', e);
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
          const quantity = bomList.reduce((sum: number, b: any) => sum + (b?.total_order_qty || 0), 0);
          const due = o.expected_delivery_date || '';

          // Determine material availability by comparing required vs available quantities
          const required = reqByItemName[o.id] || {};
          let allOk = true;
          for (const itemName of Object.keys(required)) {
            const req = required[itemName];
            const avail = approvedQtyByItemName.get(itemName) || 0;
            if (avail < req) {
              allOk = false;
              break;
            }
          }
          const materialStatus: OrderAssignment['materialStatus'] = allOk ? 'Available' : 'Not Available';

          // Debug logging
          console.log('Order:', o.order_number);
          console.log('Required materials:', required);
          console.log('Available materials:', Array.from(approvedQtyByItemName.entries()));
          console.log('Material Status:', materialStatus);

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
            const bomTotalQty = quantity; // Already calculated from BOM
            
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
          base.stitchingRatesSet = (a.cutting_price_single_needle != null && a.cutting_price_overlock_flatlock != null);
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
    const hasStitchingRates = assignment.stitchingPriceSingleNeedle != null && assignment.stitchingPriceOverlockFlatlock != null;
    return hasCuttingMaster && hasStitchingRates;
  };

  // Helper function to check if an order needs assignment (missing cutting master or stitching rates)
  const isOrderNeedsAssignment = (assignment: OrderAssignment): boolean => {
    const hasCuttingMaster = assignment.cuttingMasterId != null;
    const hasStitchingRates = assignment.stitchingPriceSingleNeedle != null && assignment.stitchingPriceOverlockFlatlock != null;
    return !hasCuttingMaster || !hasStitchingRates;
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

  // Function to set stitching rates
  const handleSetStitchingRates = async (orderId: string) => {
    try {
      // Get the current assignment to include cutting master information
      const assignment = assignments.find(a => a.id === orderId);
      
      const updateData = {
        cutting_master_id: assignment?.cuttingMasterId || null,
        cutting_master_name: assignment?.cuttingMasterName || null,
        cutting_price_single_needle: stitchingPriceSingleNeedle ? parseFloat(stitchingPriceSingleNeedle) : null,
        cutting_price_overlock_flatlock: stitchingPriceOverlockFlatlock ? parseFloat(stitchingPriceOverlockFlatlock) : null
      };

      // First try to update existing record
      const { error: updateError } = await supabase
        .from('order_assignments')
        .update(updateData as any)
        .eq('order_id', orderId as any);

      // If update failed (no existing record), insert new one
      if (updateError) {
        const { error: insertError } = await supabase
          .from('order_assignments')
          .insert({
            order_id: orderId,
            ...updateData
          } as any);

        if (insertError) {
          console.error('Error inserting stitching rates:', insertError);
          toast.error('Failed to set stitching rates');
          return;
        }
      }

      // Update local state
      setAssignments(prev => prev.map(assignment => 
        assignment.id === orderId 
          ? { 
              ...assignment, 
              stitchingRatesSet: true,
              stitchingPriceSingleNeedle: stitchingPriceSingleNeedle ? parseFloat(stitchingPriceSingleNeedle) : undefined,
              stitchingPriceOverlockFlatlock: stitchingPriceOverlockFlatlock ? parseFloat(stitchingPriceOverlockFlatlock) : undefined
            }
          : assignment
      ));

      setStitchingRatesOpen(false);
      setStitchingPriceSingleNeedle('');
      setStitchingPriceOverlockFlatlock('');
      setIsEditingStitchingRates(false);
    } catch (error) {
      console.error('Error setting stitching rates:', error);
    }
  };

  // Function to open stitching rates dialog in edit mode
  const handleEditStitchingRates = (orderId: string) => {
    const assignment = assignments.find(a => a.id === orderId);
    if (assignment) {
      setStitchingRatesOrderId(orderId);
      setStitchingPriceSingleNeedle(assignment.stitchingPriceSingleNeedle?.toString() || '');
      setStitchingPriceOverlockFlatlock(assignment.stitchingPriceOverlockFlatlock?.toString() || '');
      setIsEditingStitchingRates(true);
      setStitchingRatesOpen(true);
    }
  };

  // Function to open stitching rates dialog in create mode
  const handleCreateStitchingRates = (orderId: string) => {
    setStitchingRatesOrderId(orderId);
    setStitchingPriceSingleNeedle('');
    setStitchingPriceOverlockFlatlock('');
    setIsEditingStitchingRates(false);
    setStitchingRatesOpen(true);
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

        <Tabs defaultValue="assignments" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="assignments">Order Assignments</TabsTrigger>
            <TabsTrigger value="assigned">Assigned Orders</TabsTrigger>
            <TabsTrigger value="workers">Available Workers</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="space-y-2">
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
                            <div className="text-xs">
                              {(() => {
                                const sn = assignment.stitchingPriceSingleNeedle;
                                const of = assignment.stitchingPriceOverlockFlatlock;
                                if (sn == null && of == null) return <span className="text-muted-foreground">-</span>;
                                return (
                                  <span>
                                    SN ₹{formatPrice(sn)} / OF ₹{formatPrice(of)}
                                  </span>
                                );
                              })()}
                            </div>
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
          </TabsContent>

          <TabsContent value="assigned" className="space-y-2">
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
                            <div className="text-xs">
                              {(() => {
                                const sn = assignment.stitchingPriceSingleNeedle;
                                const of = assignment.stitchingPriceOverlockFlatlock;
                                if (sn == null && of == null) return <span className="text-muted-foreground">-</span>;
                                return (
                                  <span>
                                    SN ₹{formatPrice(sn)} / OF ₹{formatPrice(of)}
                                  </span>
                                );
                              })()}
                            </div>
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
          </TabsContent>

          <TabsContent value="workers" className="space-y-4">
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
          </TabsContent>
        </Tabs>

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
                  .filter(w => ['Cutting Manager', 'Cutting Master'].includes((w as any).designation))
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
        <Dialog open={stitchingRatesOpen} onOpenChange={setStitchingRatesOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isEditingStitchingRates ? 'Edit Stitching Rates' : 'Set Stitching Rates'}</DialogTitle>
              <DialogDescription>
                {isEditingStitchingRates 
                  ? 'Update the stitching rates for this order. These rates will be used for production planning.'
                  : 'Set the stitching rates for this order. These rates will be used for production planning.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="single-needle-rate">Single Needle Rate (₹)</Label>
                <Input
                  id="single-needle-rate"
                  type="number"
                  step="0.01"
                  placeholder="Enter single needle rate"
                  value={stitchingPriceSingleNeedle}
                  onChange={(e) => setStitchingPriceSingleNeedle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="overlock-flatlock-rate">Overlock/Flatlock Rate (₹)</Label>
                <Input
                  id="overlock-flatlock-rate"
                  type="number"
                  step="0.01"
                  placeholder="Enter overlock/flatlock rate"
                  value={stitchingPriceOverlockFlatlock}
                  onChange={(e) => setStitchingPriceOverlockFlatlock(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStitchingRatesOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => stitchingRatesOrderId && handleSetStitchingRates(stitchingRatesOrderId)}
                disabled={!stitchingPriceSingleNeedle && !stitchingPriceOverlockFlatlock}
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