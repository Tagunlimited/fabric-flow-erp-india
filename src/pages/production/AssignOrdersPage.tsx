import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface OrderAssignment {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  assignedTo: string; // legacy single assignee
  cuttingMasterId?: string;
  cuttingMasterName?: string;
  patternMasterId?: string;
  patternMasterName?: string;
  cuttingWorkDate?: string;
  patternWorkDate?: string;
  assignedDate: string;
  dueDate: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  materialStatus: 'Available' | 'Not Available';
  // Pricing captured at assignment time by tailor type
  cuttingPriceSingleNeedle?: number;
  cuttingPriceOverlockFlatlock?: number;
  patternPriceSingleNeedle?: number;
  patternPriceOverlockFlatlock?: number;
}

const AssignOrdersPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Initialize with empty array - data will be loaded from backend
  const [assignments, setAssignments] = useState<OrderAssignment[]>([]);

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
  const [scheduleRole, setScheduleRole] = useState<'cutting' | 'pattern' | null>(null);
  const [scheduleAssignmentId, setScheduleAssignmentId] = useState<string | null>(null);
  const [scheduleWorkerId, setScheduleWorkerId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scheduleCuttingPriceSingleNeedle, setScheduleCuttingPriceSingleNeedle] = useState<string>('');
  const [scheduleCuttingPriceOverlockFlatlock, setScheduleCuttingPriceOverlockFlatlock] = useState<string>('');
  const [schedulePatternPriceSingleNeedle, setSchedulePatternPriceSingleNeedle] = useState<string>('');
  const [schedulePatternPriceOverlockFlatlock, setSchedulePatternPriceOverlockFlatlock] = useState<string>('');

  // View schedule dialog for a worker
  const [viewScheduleOpen, setViewScheduleOpen] = useState(false);
  const [viewScheduleWorker, setViewScheduleWorker] = useState<any | null>(null);
  const setStoredAssignment = (
    orderId: string,
    update: Partial<Pick<OrderAssignment, 'cuttingMasterId' | 'cuttingMasterName' | 'patternMasterId' | 'patternMasterName' | 'assignedDate' | 'cuttingWorkDate' | 'patternWorkDate'>>
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
      pattern_master_id: string | null;
      pattern_master_name: string | null;
      pattern_work_date: string | null;
      cutting_price_single_needle: number | null;
      cutting_price_overlock_flatlock: number | null;
      pattern_price_single_needle: number | null;
      pattern_price_overlock_flatlock: number | null;
    }>
  ) => {
    try {
      const payload = { order_id: orderId, ...fields } as any;
      await supabase
        .from('order_assignments' as any)
        .upsert(payload, { onConflict: 'order_id' } as any);
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

  // Load employees: Pattern Masters and Cutting Masters
  useEffect(() => {
    const loadProductionTeam = async () => {
      try {
        const { data, error } = await supabase
          .from('employees' as any)
          .select('id, full_name, designation')
          .in('designation', ['Pattern Master', 'Cutting Manager', 'Cutting Master'] as any);
        if (error) {
          console.error('Failed to load production_team:', error);
          return;
        }
        const list = (data || []).map((row: any) => ({
          id: row.id,
          name: row.full_name,
          designation: row.designation,
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

        // 2) Fetch orders for those ids (optionally exclude cancelled)
        const { data: orders, error: ordersErr } = await supabase
          .from('orders')
          .select('id, order_number, status, expected_delivery_date, customer_id')
          .in('id', orderIds as any);
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
          .select('bom_id, item_id, item_code, qty_total')
          .in('bom_id', bomIds as any);
        if (bomItemsErr) throw bomItemsErr;

        // Build per-order required quantities, preferring item_id over item_code per row
        const orderReqById: Record<string, Record<string, number>> = {};
        const orderReqByCode: Record<string, Record<string, number>> = {};
        const allItemIds = new Set<string>();
        const allItemCodes = new Set<string>();
        (bomItems || []).forEach((bi: any) => {
          const orderId = bomIdToOrderId[bi.bom_id];
          if (!orderId) return;
          const reqQty = Number(bi.qty_total || 0) || 0;
          if (bi.item_id) {
            const id = bi.item_id as string;
            (orderReqById[orderId] ||= {});
            orderReqById[orderId][id] = (orderReqById[orderId][id] || 0) + reqQty;
            allItemIds.add(id);
          } else if (bi.item_code) {
            const code = bi.item_code as string;
            (orderReqByCode[orderId] ||= {});
            orderReqByCode[orderId][code] = (orderReqByCode[orderId][code] || 0) + reqQty;
            allItemCodes.add(code);
          }
        });

        // 5) Check availability in warehouse_inventory for item_ids and item_codes
        const itemIdsArr = Array.from(allItemIds);
        const itemCodesArr = Array.from(allItemCodes);

        const availableQtyByItemId = new Map<string, number>();
        const availableQtyByItemCodeWI = new Map<string, number>();

        if (itemIdsArr.length > 0) {
          const { data: wi1 } = await supabase
            .from('warehouse_inventory' as any)
            .select('item_id, quantity')
            .in('item_id', itemIdsArr as any);
          (wi1 || []).forEach((r: any) => {
            if (r?.item_id) {
              const q = Number(r.quantity || 0) || 0;
              availableQtyByItemId.set(r.item_id, (availableQtyByItemId.get(r.item_id) || 0) + q);
            }
          });
        }
        if (itemCodesArr.length > 0) {
          const { data: wi2 } = await supabase
            .from('warehouse_inventory' as any)
            .select('item_code, quantity')
            .in('item_code', itemCodesArr as any);
          (wi2 || []).forEach((r: any) => {
            if (r?.item_code) {
              const q = Number(r.quantity || 0) || 0;
              availableQtyByItemCodeWI.set(r.item_code, (availableQtyByItemCodeWI.get(r.item_code) || 0) + q);
            }
          });
        }

        // 6) Also check legacy inventory table by item_code
        const availableQtyByItemCodeInv = new Map<string, number>();
        if (itemCodesArr.length > 0) {
          const { data: inv } = await supabase
            .from('inventory' as any)
            .select('item_code, current_stock')
            .in('item_code', itemCodesArr as any);
          (inv || []).forEach((r: any) => {
            if (r?.item_code) {
              const q = Number(r.current_stock || 0) || 0;
              availableQtyByItemCodeInv.set(r.item_code, q);
            }
          });
        }

        // Merge WI and legacy inventory by item_code
        const availableQtyByItemCode = new Map<string, number>();
        availableQtyByItemCodeWI.forEach((q, code) => {
          availableQtyByItemCode.set(code, (availableQtyByItemCode.get(code) || 0) + q);
        });
        availableQtyByItemCodeInv.forEach((q, code) => {
          availableQtyByItemCode.set(code, (availableQtyByItemCode.get(code) || 0) + q);
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
            .select('order_id, cutting_master_id, cutting_master_name, cutting_work_date, pattern_master_id, pattern_master_name, pattern_work_date, cutting_price_single_needle, cutting_price_overlock_flatlock, pattern_price_single_needle, pattern_price_overlock_flatlock')
            .in('order_id', orderIds as any);
          (rows || []).forEach((r: any) => { if (r?.order_id) assignmentsByOrder[r.order_id] = r; });
        } catch (e) {
          console.error('Failed to load order assignments:', e);
        }
        const nextAssignments: OrderAssignment[] = validOrders.map((o: any) => {
          const bomList = bomsByOrder[o.id] || [];
          const productName = bomList.length === 1
            ? (bomList[0]?.product_name || 'Product')
            : (bomList.length > 1 ? 'Multiple Products' : 'Product');
          const quantity = bomList.reduce((sum: number, b: any) => sum + (b?.total_order_qty || 0), 0);
          const due = o.expected_delivery_date || '';

          // Determine material availability by comparing required vs available quantities
          const reqIds = orderReqById[o.id] || {};
          const reqCodes = orderReqByCode[o.id] || {};
          let allOk = true;
          for (const id of Object.keys(reqIds)) {
            const req = Number(reqIds[id] || 0) || 0;
            const avail = Number(availableQtyByItemId.get(id) || 0) || 0;
            if (avail < req) { allOk = false; break; }
          }
          if (allOk) {
            for (const code of Object.keys(reqCodes)) {
              const req = Number(reqCodes[code] || 0) || 0;
              const avail = Number(availableQtyByItemCode.get(code) || 0) || 0;
              if (avail < req) { allOk = false; break; }
            }
          }
          const materialStatus: OrderAssignment['materialStatus'] = allOk ? 'Available' : 'Not Available';

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
          if (a.cutting_master_id || a.pattern_master_id) {
            base.cuttingMasterId = a.cutting_master_id || undefined;
            base.cuttingMasterName = a.cutting_master_name || undefined;
            base.patternMasterId = a.pattern_master_id || undefined;
            base.patternMasterName = a.pattern_master_name || undefined;
            base.cuttingWorkDate = a.cutting_work_date || undefined;
            base.patternWorkDate = a.pattern_work_date || undefined;
            base.assignedTo = a.cutting_master_name || a.pattern_master_name || base.assignedTo;
            if (base.status === 'pending') base.status = 'assigned';
            base.cuttingPriceSingleNeedle = a.cutting_price_single_needle != null ? Number(a.cutting_price_single_needle) : undefined;
            base.cuttingPriceOverlockFlatlock = a.cutting_price_overlock_flatlock != null ? Number(a.cutting_price_overlock_flatlock) : undefined;
            base.patternPriceSingleNeedle = a.pattern_price_single_needle != null ? Number(a.pattern_price_single_needle) : undefined;
            base.patternPriceOverlockFlatlock = a.pattern_price_overlock_flatlock != null ? Number(a.pattern_price_overlock_flatlock) : undefined;
          }
          return base;
        });

        setAssignments(nextAssignments);
      } catch (err) {
        console.error('Failed to load assignable orders (with BOM):', err);
        setAssignments([]);
      }
    };

    loadAssignments();
  }, []);

  const filteredAssignments = assignments.filter(assignment => {
    const matchesSearch = assignment.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || assignment.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || assignment.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Compute how many assignments each worker currently has
  const assignedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assignments) {
      if (a.cuttingMasterId) {
        counts[a.cuttingMasterId] = (counts[a.cuttingMasterId] || 0) + 1;
      }
      if (a.patternMasterId) {
        counts[a.patternMasterId] = (counts[a.patternMasterId] || 0) + 1;
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

  const handleAssignPatternMaster = async (
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
            patternMasterId: workerId,
            patternMasterName: worker?.name || '',
            assignedTo: assignment.assignedTo || worker?.name || '',
            assignedDate: new Date().toISOString().split('T')[0],
            patternWorkDate: workDate || assignment.patternWorkDate,
            status: 'assigned' as const,
            patternPriceSingleNeedle: prices?.singleNeedle ?? assignment.patternPriceSingleNeedle,
            patternPriceOverlockFlatlock: prices?.overlockFlatlock ?? assignment.patternPriceOverlockFlatlock
          }
        : assignment
    ));
    await upsertAssignment(assignmentId, {
      pattern_master_id: workerId,
      pattern_master_name: (worker as any)?.name || '',
      pattern_work_date: workDate || new Date().toISOString().split('T')[0],
      pattern_price_single_needle: prices?.singleNeedle ?? null,
      pattern_price_overlock_flatlock: prices?.overlockFlatlock ?? null
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
    setSchedulePatternPriceSingleNeedle(existing?.patternPriceSingleNeedle != null ? String(existing.patternPriceSingleNeedle) : '');
    setSchedulePatternPriceOverlockFlatlock(existing?.patternPriceOverlockFlatlock != null ? String(existing.patternPriceOverlockFlatlock) : '');
    if (designation === 'Cutting Manager' || designation === 'Cutting Master') {
      setScheduleRole('cutting');
    } else if (designation === 'Pattern Master') {
      setScheduleRole('pattern');
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
    } else {
      await handleAssignPatternMaster(
        scheduleAssignmentId,
        scheduleWorkerId,
        scheduleDate,
        {
          singleNeedle: schedulePatternPriceSingleNeedle !== '' ? Number(schedulePatternPriceSingleNeedle) : undefined,
          overlockFlatlock: schedulePatternPriceOverlockFlatlock !== '' ? Number(schedulePatternPriceOverlockFlatlock) : undefined,
        }
      );
    }
    setScheduleDialogOpen(false);
  };

  const openWorkerSchedule = (worker: any) => {
    setViewScheduleWorker(worker);
    setViewScheduleOpen(true);
  };

  return (
    <ErpLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Assign Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage order assignments and track production workflow
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-yellow-600">
                  {assignments.filter(a => a.status === 'pending').length}
                </span>
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-orange-600">
                  {assignments.filter(a => a.status === 'in_progress').length}
                </span>
                <ArrowRight className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-600">
                  {assignments.filter(a => a.status === 'completed').length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-600" />
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
                <span className="text-2xl font-bold text-blue-600">
                  {workers.filter(w => w.availability === 'available').length}
                </span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="assignments" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assignments">Order Assignments</TabsTrigger>
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
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Cutting Master</TableHead>
                        <TableHead>Pattern Master</TableHead>
                        <TableHead>Stitching Price</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
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
                            {assignment.cuttingMasterName ? (
                              <div className="flex items-center">
                                <UserCheck className="w-4 h-4 mr-2 text-green-600" />
                                {assignment.cuttingMasterName}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {assignment.patternMasterName ? (
                              <div className="flex items-center">
                                <UserCheck className="w-4 h-4 mr-2 text-green-600" />
                                {assignment.patternMasterName}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          {/* Stitching Price Column */}
                          <TableCell>
                            <div className="text-xs">
                              {(() => {
                                const sn = (assignment.patternPriceSingleNeedle ?? assignment.cuttingPriceSingleNeedle);
                                const of = (assignment.patternPriceOverlockFlatlock ?? assignment.cuttingPriceOverlockFlatlock);
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
                              <Select onValueChange={(value) => handleAssignAny(assignment.id, value)}>
                                <SelectTrigger className="w-72">
                                  <SelectValue placeholder="Assign to employee" />
                                </SelectTrigger>
                                <SelectContent>
                                  {workers
                                    .filter(w => ['Cutting Manager', 'Cutting Master', 'Pattern Master'].includes((w as any).designation))
                                    .map(worker => (
                                      <SelectItem key={worker.id} value={worker.id}>
                                        {(worker as any).name}{' '}—{' '}{(worker as any).designation}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
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
              {scheduleRole === 'pattern' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Tailor (SN)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={schedulePatternPriceSingleNeedle}
                      onChange={(e) => setSchedulePatternPriceSingleNeedle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Tailor (OF)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={schedulePatternPriceOverlockFlatlock}
                      onChange={(e) => setSchedulePatternPriceOverlockFlatlock(e.target.value)}
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
                    .filter(a => a.cuttingMasterId === (viewScheduleWorker as any)?.id || a.patternMasterId === (viewScheduleWorker as any)?.id)
                    .sort((a, b) => {
                      const ad = a.cuttingMasterId === (viewScheduleWorker as any)?.id ? (a.cuttingWorkDate || '') : (a.patternWorkDate || '');
                      const bd = b.cuttingMasterId === (viewScheduleWorker as any)?.id ? (b.cuttingWorkDate || '') : (b.patternWorkDate || '');
                      return (new Date(ad).getTime() || 0) - (new Date(bd).getTime() || 0);
                    })
                    .map(a => (
                      <tr key={`${a.id}-${(viewScheduleWorker as any)?.id}`} className="border-t">
                        <td className="p-2">{formatDateDDMMYY(a.cuttingMasterId === (viewScheduleWorker as any)?.id ? a.cuttingWorkDate : a.patternWorkDate)}</td>
                        <td className="p-2">{a.orderNumber}</td>
                        <td className="p-2">{a.customerName}</td>
                        <td className="p-2">{a.cuttingMasterId === (viewScheduleWorker as any)?.id ? 'Cutting' : 'Pattern'}</td>
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
      </div>
    </ErpLayout>
  );
};

export default AssignOrdersPage;
