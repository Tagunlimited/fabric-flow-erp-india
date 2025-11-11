import { useEffect, useMemo, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, Users, Scissors, ShoppingCart, Shirt, Package, ClipboardList, Printer } from "lucide-react";
import PickerQuantityDialog from "@/components/production/PickerQuantityDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getOrderItemDisplayImage } from "@/utils/orderItemImageUtils";
import { getBinsForProduct } from "@/utils/inventoryAdjustmentAPI";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface TailorListItem {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  tailor_type?: string | null;
  assigned_orders: number;
  assigned_quantity: number;
  picked_quantity: number;
  rejected_quantity?: number;
  batch_id?: string | null;
  is_batch_leader?: boolean | null;
}

interface ReadymadeOrder {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
}

interface ReadymadeOrderItem {
  id: string;
  order_id: string;
  product_description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  specifications: any;
}

interface GroupedProduct {
  product_name: string;
  product_id?: string;
  product_master_id?: string;
  total_quantity: number;
  size_quantities: Record<string, number>;
  orders: Array<{
    order_id: string;
    order_number: string;
    customer_name: string;
    size_quantities: Record<string, number>;
    quantity: number;
  }>;
  image_url: string | null;
}

export default function PickerPage() {
  const [tailors, setTailors] = useState<TailorListItem[]>([]);
  const [tailorSearch, setTailorSearch] = useState("");
  const [loadingTailors, setLoadingTailors] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchOrders, setBatchOrders] = useState<any[]>([]);
  const [loadingBatchOrders, setLoadingBatchOrders] = useState(false);
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<{
    assignmentId: string;
    orderNumber: string;
    customerName?: string;
    sizeDistributions: { size_name: string; quantity: number }[];
  } | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectedOrderNumber, setRejectedOrderNumber] = useState("");
  const [rejectedItems, setRejectedItems] = useState<{ size_name: string; rejected_quantity: number; remarks?: string }[]>([]);
  const [batchRejectedOpen, setBatchRejectedOpen] = useState(false);
  const [batchRejectedTitle, setBatchRejectedTitle] = useState("");
  const [batchRejectedDetails, setBatchRejectedDetails] = useState<{ order_number: string; sizes: { size_name: string; rejected_quantity: number; remarks?: string }[] }[]>([]);
  
  // Readymade Orders state
  const [readymadeOrders, setReadymadeOrders] = useState<ReadymadeOrder[]>([]);
  const [readymadeOrderItems, setReadymadeOrderItems] = useState<Record<string, ReadymadeOrderItem[]>>({});
  const [loadingReadymadeOrders, setLoadingReadymadeOrders] = useState(false);
  const [readymadeViewMode, setReadymadeViewMode] = useState<'order' | 'product'>('order');
  const [groupedProducts, setGroupedProducts] = useState<GroupedProduct[]>([]);
  const [selectedProductDetail, setSelectedProductDetail] = useState<GroupedProduct | null>(null);
  const [productDetailDialogOpen, setProductDetailDialogOpen] = useState(false);
  
  // Picklist creation state
  const [binSelectionDialogOpen, setBinSelectionDialogOpen] = useState(false);
  const [picklistPreviewDialogOpen, setPicklistPreviewDialogOpen] = useState(false);
  const [availableBins, setAvailableBins] = useState<Array<{ bin_id: string; bin_code: string; warehouse_name?: string; floor_number?: number; rack_code?: string; current_quantity: number }>>([]);
  const [selectedBin, setSelectedBin] = useState<{ bin_id: string; bin_code: string } | null>(null);
  const [picklistData, setPicklistData] = useState<{ product: GroupedProduct | null; order: ReadymadeOrder | null; bin: { bin_id: string; bin_code: string } | null }>({ product: null, order: null, bin: null });
  const [loadingBins, setLoadingBins] = useState(false);

  useEffect(() => {
    fetchTailorsWithAssignedCounts();
    fetchReadymadeOrders();
  }, []);

  const fetchReadymadeOrders = async () => {
    setLoadingReadymadeOrders(true);
    try {
      // Fetch readymade orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_date,
          expected_delivery_date,
          customer_id,
          status,
          total_amount,
          final_amount,
          balance_amount,
          customer:customers(company_name)
        `)
        .eq('order_type', 'readymade' as any)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setReadymadeOrders((ordersData as any) || []);

      // Fetch order items for all orders
      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map((o: any) => o.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds);

        if (!itemsError && itemsData) {
          const itemsByOrder: Record<string, ReadymadeOrderItem[]> = {};
          itemsData.forEach((item: any) => {
            if (!itemsByOrder[item.order_id]) {
              itemsByOrder[item.order_id] = [];
            }
            itemsByOrder[item.order_id].push(item);
          });
          setReadymadeOrderItems(itemsByOrder);
          
          // Group products by product name
          groupProductsByProductName(ordersData, itemsData);
        }
      }
    } catch (error) {
      console.error('Error fetching readymade orders:', error);
      setReadymadeOrders([]);
    } finally {
      setLoadingReadymadeOrders(false);
    }
  };

  // Utility function to sort sizes in logical order
  const sortSizes = (sizes: string[]): string[] => {
    const sizeOrder: Record<string, number> = {
      'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, '2XL': 6, 'XXL': 6,
      '3XL': 7, 'XXXL': 7, '4XL': 8, 'XXXXL': 8, '5XL': 9,
      '28': 1, '30': 2, '32': 3, '34': 4, '36': 5, '38': 6, '40': 7, '42': 8, '44': 9, '46': 10, '48': 11,
    };

    return sizes.sort((a, b) => {
      const aOrder = sizeOrder[a.toUpperCase()] || sizeOrder[a] || 999;
      const bOrder = sizeOrder[b.toUpperCase()] || sizeOrder[b] || 999;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // If same order, try numeric comparison
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      
      // Otherwise alphabetical
      return a.localeCompare(b);
    });
  };

  const groupProductsByProductName = (orders: any[], items: any[]) => {
    const productMap: Record<string, GroupedProduct> = {};
    const ordersMap: Record<string, any> = {};
    
    // Create orders map for quick lookup
    orders.forEach((order: any) => {
      ordersMap[order.id] = order;
    });

    items.forEach((item: any) => {
      const specs = typeof item.specifications === 'string' 
        ? JSON.parse(item.specifications) 
        : item.specifications || {};
      
      const productName = item.product_description || specs.product_name || 'Unknown Product';
      const order = ordersMap[item.order_id];
      
      if (!productMap[productName]) {
        productMap[productName] = {
          product_name: productName,
          product_id: specs.product_id,
          product_master_id: specs.product_master_id,
          total_quantity: 0,
          size_quantities: {},
          orders: [],
          image_url: getOrderItemDisplayImage(item, { order_type: 'readymade' }),
        };
      }

      const sizes = specs.sizes_quantities || {};
      let orderQuantity = 0;
      const orderSizeQuantities: Record<string, number> = {};

      Object.entries(sizes).forEach(([size, qty]: [string, any]) => {
        const quantity = Number(qty) || 0;
        orderQuantity += quantity;
        orderSizeQuantities[size] = (orderSizeQuantities[size] || 0) + quantity;
        
        // Aggregate total size quantities
        productMap[productName].size_quantities[size] = 
          (productMap[productName].size_quantities[size] || 0) + quantity;
      });

      // If no sizes, use item quantity
      if (Object.keys(sizes).length === 0) {
        orderQuantity = item.quantity || 0;
      }

      productMap[productName].total_quantity += orderQuantity;

      // Add order info
      productMap[productName].orders.push({
        order_id: item.order_id,
        order_number: order?.order_number || 'Unknown',
        customer_name: order?.customer?.company_name || 'Unknown',
        size_quantities: orderSizeQuantities,
        quantity: orderQuantity,
      });
    });

    // Sort sizes in each product
    Object.values(productMap).forEach((product) => {
      const sortedSizes = sortSizes(Object.keys(product.size_quantities));
      const sortedSizeQuantities: Record<string, number> = {};
      sortedSizes.forEach((size) => {
        sortedSizeQuantities[size] = product.size_quantities[size];
      });
      product.size_quantities = sortedSizeQuantities;
    });

    setGroupedProducts(Object.values(productMap));
  };

  const openProductDetail = (product: GroupedProduct) => {
    setSelectedProductDetail(product);
    setProductDetailDialogOpen(true);
  };

  const handleCreatePicklist = async (e: React.MouseEvent, type: 'order' | 'product', data?: any) => {
    e.stopPropagation(); // Prevent card click event
    
    if (type === 'product') {
      const product = data as GroupedProduct;
      if (!product.product_master_id) {
        toast.error('Product master ID not found. Cannot create picklist.');
        return;
      }
      
      setPicklistData({ product, order: null, bin: null });
      setLoadingBins(true);
      setBinSelectionDialogOpen(true);
      
      try {
        const bins = await getBinsForProduct(product.product_master_id);
        // Filter bins that have available inventory
        const binsWithInventory = bins.filter(bin => bin.current_quantity > 0);
        setAvailableBins(binsWithInventory);
        
        if (binsWithInventory.length === 0) {
          toast.error('No bins with available inventory found for this product.');
          setBinSelectionDialogOpen(false);
        }
      } catch (error) {
        console.error('Error fetching bins:', error);
        toast.error('Failed to fetch bins for this product.');
        setBinSelectionDialogOpen(false);
      } finally {
        setLoadingBins(false);
      }
    } else if (type === 'order') {
      const order = data as ReadymadeOrder;
      // For order, we need to get all products in the order and show bins for each
      // For now, let's show a message that order-level picklist needs product selection
      toast.info('Please select a product from the Product View to create a picklist.');
    }
  };

  const handleBinSelect = (binId: string) => {
    const bin = availableBins.find(b => b.bin_id === binId);
    if (bin) {
      setSelectedBin({ bin_id: bin.bin_id, bin_code: bin.bin_code });
    }
  };

  const handleConfirmBinSelection = () => {
    if (!selectedBin) {
      toast.error('Please select a bin');
      return;
    }
    
    setPicklistData(prev => ({ ...prev, bin: selectedBin }));
    setBinSelectionDialogOpen(false);
    setPicklistPreviewDialogOpen(true);
  };

  const handlePrintPicklist = () => {
    window.print();
  };

  // Removed aggressive focus and visibility refresh to prevent resetting user work

  const fetchTailorsWithAssignedCounts = async () => {
    setLoadingTailors(true);
    try {
      // Build batch-wise cards instead of tailors
      const { data: batches } = await (supabase as any)
        .from('batches')
        .select('id, batch_name, batch_code, tailor_type, status')
        .order('batch_name');

      const baseBatches = (batches || []).filter((b: any) => !b.status || b.status === 'active');
      const batchIds = baseBatches.map((b: any) => b.id).filter(Boolean);

      // Leaders
      let leaderByBatch: Record<string, { full_name?: string; avatar_url?: string }> = {};
      if (batchIds.length > 0) {
        try {
          const { data: leaders } = await (supabase as any)
            .from('tailors')
            .select('id, full_name, avatar_url, batch_id, is_batch_leader')
            .eq('is_batch_leader', true)
            .in('batch_id', batchIds as any);
          (leaders || []).forEach((t: any) => {
            if (t.batch_id) leaderByBatch[t.batch_id] = { full_name: t.full_name, avatar_url: t.avatar_url };
          });
        } catch {}
      }

      // Assigned orders and quantities per batch
      let ordersCountByBatch: Record<string, number> = {};
      let qtyByBatch: Record<string, number> = {};
      let pickedByBatch: Record<string, number> = {};
      let rejectedByBatch: Record<string, number> = {};
      let assignmentToBatch: Record<string, string> = {};
      let assignmentIds: string[] = [];
      if (batchIds.length > 0) {
        try {
          const { data: oba } = await (supabase as any)
            .from('order_batch_assignments_with_details')
            .select('assignment_id, batch_id, order_id, total_quantity')
            .in('batch_id', batchIds as any);
          const orderSet: Record<string, Set<string>> = {};
          (oba || []).forEach((row: any) => {
            const b = row?.batch_id as string | undefined;
            if (!b) return;
            qtyByBatch[b] = (qtyByBatch[b] || 0) + Number(row.total_quantity || 0);
            assignmentToBatch[row.assignment_id] = b;
            assignmentIds.push(row.assignment_id);
            const oid = row?.order_id as string | undefined;
            if (oid) {
              if (!orderSet[b]) orderSet[b] = new Set<string>();
              orderSet[b].add(oid);
            }
          });
          Object.keys(orderSet).forEach(b => { ordersCountByBatch[b] = orderSet[b].size; });
        } catch {}

        // Compute picked totals per batch from size distributions
        if (assignmentIds.length > 0) {
          try {
            const { data: pickedRows } = await (supabase as any)
              .from('order_batch_size_distributions')
              .select('order_batch_assignment_id, picked_quantity')
              .in('order_batch_assignment_id', assignmentIds as any);
            (pickedRows || []).forEach((r: any) => {
              const aid = r?.order_batch_assignment_id as string | undefined; if (!aid) return;
              const b = assignmentToBatch[aid]; if (!b) return;
              pickedByBatch[b] = (pickedByBatch[b] || 0) + Number(r.picked_quantity || 0);
            });
          } catch {}
          // Fallback: add picked from notes JSON if column not present/populated
          try {
            const { data: asn } = await (supabase as any)
              .from('order_batch_assignments')
              .select('id, notes')
              .in('id', assignmentIds as any);
            (asn || []).forEach((a: any) => {
              if (!a?.id || !a?.notes) return;
              try {
                const parsed = JSON.parse(a.notes);
                if (parsed && parsed.picked_by_size && typeof parsed.picked_by_size === 'object') {
                  let sum = 0; for (const v of Object.values(parsed.picked_by_size as Record<string, any>)) sum += Number(v) || 0;
                  const b = assignmentToBatch[a.id]; if (!b) return;
                  pickedByBatch[b] = (pickedByBatch[b] || 0) + sum;
                }
              } catch {}
            });
          } catch {}

          // QC rejections per batch
          try {
            const { data: qcRows } = await (supabase as any)
              .from('qc_reviews')
              .select('order_batch_assignment_id, rejected_quantity')
              .in('order_batch_assignment_id', assignmentIds as any);
            (qcRows || []).forEach((q: any) => {
              const aid = q?.order_batch_assignment_id as string | undefined; if (!aid) return;
              const b = assignmentToBatch[aid]; if (!b) return;
              rejectedByBatch[b] = (rejectedByBatch[b] || 0) + Number(q.rejected_quantity || 0);
            });
          } catch {}
        }
      }

      const list: TailorListItem[] = baseBatches.map((b: any) => ({
        id: b.id,
        full_name: b.batch_name,
        avatar_url: leaderByBatch[b.id]?.avatar_url,
        tailor_type: b.tailor_type,
        assigned_orders: ordersCountByBatch[b.id] || 0,
        assigned_quantity: qtyByBatch[b.id] || 0,
        picked_quantity: Math.max(0, (pickedByBatch[b.id] || 0) - (rejectedByBatch[b.id] || 0)),
        rejected_quantity: rejectedByBatch[b.id] || 0,
        batch_id: b.id,
        is_batch_leader: true,
      }));

      setTailors(list);
    } catch (e) {
      setTailors([]);
    } finally {
      setLoadingTailors(false);
    }
  };

  const openBatchRejectedDetails = async (batchId: string, batchName: string) => {
    try {
      const { data: rows } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select('assignment_id, order_id')
        .eq('batch_id', batchId);
      const aids = (rows || []).map((r: any) => r.assignment_id).filter(Boolean);
      const orderIds = Array.from(new Set((rows || []).map((r: any) => r.order_id).filter(Boolean)));
      let ordersMap: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { data: ords } = await (supabase as any)
          .from('orders')
          .select('id, order_number')
          .in('id', orderIds as any);
        (ords || []).forEach((o: any) => { ordersMap[o.id] = o.order_number; });
      }
      const { data: qcRows } = await (supabase as any)
        .from('qc_reviews')
        .select('order_batch_assignment_id, size_name, rejected_quantity, remarks')
        .in('order_batch_assignment_id', aids as any);
      // Need mapping assignment -> order_id
      const aidToOrder: Record<string, string> = {};
      (rows || []).forEach((r: any) => { if (r.assignment_id) aidToOrder[r.assignment_id] = r.order_id; });
      const perOrder: Record<string, Record<string, { size_name: string; rejected_quantity: number; remarks?: string }>> = {};
      (qcRows || []).forEach((q: any) => {
        const oid = aidToOrder[q.order_batch_assignment_id]; if (!oid) return;
        if (!perOrder[oid]) perOrder[oid] = {};
        const key = q.size_name as string;
        const prev = perOrder[oid][key]?.rejected_quantity || 0;
        perOrder[oid][key] = { size_name: key, rejected_quantity: prev + Number(q.rejected_quantity || 0), remarks: q.remarks || undefined };
      });
      const details = Object.entries(perOrder).map(([oid, map]) => ({ order_number: ordersMap[oid] || oid, sizes: Object.values(map) }));
      setBatchRejectedDetails(details);
      setBatchRejectedTitle(batchName);
      setBatchRejectedOpen(true);
    } catch {}
  };

  const openBatchOrders = async (batchId: string) => {
    setActiveBatchId(batchId);
    setLoadingBatchOrders(true);
    try {
      const { data: rows } = await (supabase as any)
        .from('order_batch_assignments_with_details')
        .select('assignment_id, order_id, assignment_date, total_quantity, size_distributions, batch_name')
        .eq('batch_id', batchId)
        .order('assignment_date', { ascending: false });

      const assignmentIds = Array.from(new Set((rows || []).map((r: any) => r.assignment_id).filter(Boolean)));

      // Picked totals: try size_distributions.picked_quantity first, then notes JSON fallback
      let pickedByAssignment: Record<string, number> = {};
      let rejectedByAssignment: Record<string, number> = {};
      let rejectedSizesByAssignment: Record<string, { size_name: string; rejected_quantity: number; remarks?: string }[]> = {};
      if (assignmentIds.length > 0) {
        try {
          const { data: pickedRows } = await (supabase as any)
            .from('order_batch_size_distributions')
            .select('order_batch_assignment_id, picked_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);
          (pickedRows || []).forEach((r: any) => {
            const id = r?.order_batch_assignment_id as string | undefined;
            if (!id) return;
            pickedByAssignment[id] = (pickedByAssignment[id] || 0) + Number(r.picked_quantity || 0);
          });
        } catch {}
        try {
          const { data: asn } = await (supabase as any)
            .from('order_batch_assignments')
            .select('id, notes')
            .in('id', assignmentIds as any);
          (asn || []).forEach((a: any) => {
            if (!a?.id || !a?.notes) return;
            try {
              const parsed = JSON.parse(a.notes);
              if (parsed && parsed.picked_by_size && typeof parsed.picked_by_size === 'object') {
                const sum: number = Object.values(parsed.picked_by_size as Record<string, any>).reduce((acc, v: any) => acc + (Number(v) || 0), 0);
                pickedByAssignment[a.id] = (pickedByAssignment[a.id] || 0) + sum;
              }
            } catch {}
          });
        } catch {}

        // Load QC rejections per size
        try {
          const { data: qcRows } = await (supabase as any)
            .from('qc_reviews')
            .select('order_batch_assignment_id, size_name, rejected_quantity, remarks')
            .in('order_batch_assignment_id', assignmentIds as any);
          const perAid: Record<string, Record<string, { size_name: string; rejected_quantity: number; remarks?: string }>> = {};
          (qcRows || []).forEach((q: any) => {
            const aid = q?.order_batch_assignment_id as string | undefined; if (!aid) return;
            rejectedByAssignment[aid] = (rejectedByAssignment[aid] || 0) + Number(q.rejected_quantity || 0);
            if (!perAid[aid]) perAid[aid] = {};
            const key = q.size_name as string;
            const prev = perAid[aid][key]?.rejected_quantity || 0;
            perAid[aid][key] = { size_name: key, rejected_quantity: prev + Number(q.rejected_quantity || 0), remarks: q.remarks || undefined };
          });
          rejectedSizesByAssignment = Object.fromEntries(Object.entries(perAid).map(([aid, map]) => [aid, Object.values(map)]));
        } catch {}
      }

      const orderIds = Array.from(new Set((rows || []).map((r: any) => r.order_id).filter(Boolean)));
      let ordersMap: Record<string, { order_number?: string; customer_id?: string }> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any);
        (orders || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
      }
      const customerIds = Array.from(new Set(Object.values(ordersMap).map(o => o.customer_id).filter(Boolean)));
      let customersMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await (supabase as any)
          .from('customers')
          .select('id, company_name')
          .in('id', customerIds as any);
        (customers || []).forEach((c: any) => { customersMap[c.id] = c.company_name; });
      }

      const enriched = (rows || []).map((r: any) => ({
        assignment_id: r.assignment_id,
        order_id: r.order_id,
        order_number: ordersMap[r.order_id]?.order_number,
        customer_name: customersMap[ordersMap[r.order_id]?.customer_id || ''],
        assignment_date: r.assignment_date,
        total_quantity: Number(r.total_quantity || 0),
        picked_quantity: Number(pickedByAssignment[r.assignment_id] || 0),
        rejected_quantity: Number(rejectedByAssignment[r.assignment_id] || 0),
        rejected_sizes: rejectedSizesByAssignment[r.assignment_id] || [],
        size_distributions: Array.isArray(r.size_distributions) ? r.size_distributions : [],
      }));
      const pending = enriched.filter((o: any) => {
        const effectivePicked = Math.max(0, Number(o.picked_quantity || 0) - Number(o.rejected_quantity || 0));
        return Number(o.total_quantity || 0) > effectivePicked;
      });
      setBatchOrders(pending);
      setOrdersDialogOpen(true);
    } catch (e) {
      setBatchOrders([]);
      setOrdersDialogOpen(true);
    } finally {
      setLoadingBatchOrders(false);
    }
  };

  const openPickerForAssignment = (assignment: any) => {
    setPickerContext({
      assignmentId: assignment.assignment_id,
      orderNumber: assignment.order_number,
      customerName: assignment.customer_name,
      sizeDistributions: assignment.size_distributions || [],
    });
    setPickerOpen(true);
  };

  const filteredTailors = useMemo(() => {
    const q = tailorSearch.trim().toLowerCase();
    if (!q) return tailors;
    return tailors.filter(t => t.full_name.toLowerCase().includes(q));
  }, [tailorSearch, tailors]);

  return (
    <ErpLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Picker
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Assignments overview by tailor and by order
          </p>
        </div>

        <Tabs defaultValue="custom" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom" className="flex items-center gap-2 text-xs sm:text-sm">
              <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Custom Orders</span>
            </TabsTrigger>
            <TabsTrigger value="readymade" className="flex items-center gap-2 text-xs sm:text-sm">
              <Shirt className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Readymade Orders</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  Tailors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tailors..."
                      value={tailorSearch}
                      onChange={(e) => setTailorSearch(e.target.value)}
                      className="pl-10 w-full"
                    />
                  </div>
                </div>

                {loadingTailors ? (
                  <p className="text-sm sm:text-base text-muted-foreground">Loading tailors...</p>
                ) : filteredTailors.length === 0 ? (
                  <p className="text-sm sm:text-base text-muted-foreground">No tailors found.</p>
                ) : (
                  <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                    {filteredTailors.map((t) => (
                      <Card key={t.id} className="border shadow-erp-md cursor-pointer hover:shadow-lg transition" onClick={() => openBatchOrders(t.id)}>
                        <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <Avatar className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
                              <AvatarImage src={t.avatar_url || undefined} alt={t.full_name} />
                              <AvatarFallback className="text-xs sm:text-sm">{t.full_name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base truncate">{t.full_name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Scissors className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                <span className="truncate">{t.tailor_type ? String(t.tailor_type).replace(/_/g, ' ') : 'Tailor'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 sm:mt-4">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5">
                                <span className="hidden sm:inline">Assigned Orders: </span>
                                <span className="sm:hidden">Orders: </span>
                                {t.assigned_orders}
                              </Badge>
                              {t.assigned_quantity > 0 && (
                                <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5">
                                  <span className="hidden sm:inline">Assigned Qty: </span>
                                  <span className="sm:hidden">Qty: </span>
                                  {t.assigned_quantity}
                                </Badge>
                              )}
                              {t.picked_quantity > 0 && (
                                <Badge className="bg-green-100 text-green-800 text-xs px-2 py-0.5">
                                  <span className="hidden sm:inline">Picked Qty: </span>
                                  <span className="sm:hidden">Picked: </span>
                                  {t.picked_quantity}
                                </Badge>
                              )}
                              {t.rejected_quantity && t.rejected_quantity > 0 && (
                                <Badge className="bg-red-100 text-red-800 text-xs px-2 py-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); openBatchRejectedDetails(t.id, t.full_name); }}>
                                  <span className="hidden sm:inline">Rejected Qty: </span>
                                  <span className="sm:hidden">Rej: </span>
                                  {t.rejected_quantity}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {activeBatchId && (
                    <div className="mt-4 sm:mt-6 space-y-3">
                      <div className="text-sm sm:text-base font-medium">Orders for selected batch</div>
                      {loadingBatchOrders ? (
                        <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
                      ) : batchOrders.length === 0 ? (
                        <p className="text-sm sm:text-base text-muted-foreground">No pending orders for this batch.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                          {batchOrders.map((o) => (
                            <Card key={o.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => openPickerForAssignment(o)}>
                              <CardContent className="pt-4 sm:pt-5 p-4 sm:p-6">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-sm sm:text-base truncate">Order #{o.order_number}</div>
                                    <div className="text-xs text-muted-foreground truncate">{o.customer_name}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5">Qty: {o.total_quantity}</Badge>
                                    <Badge className="bg-green-100 text-green-800 text-xs px-2 py-0.5">Picked: {o.picked_quantity}</Badge>
                                    {o.rejected_quantity > 0 && (
                                      <Badge className="bg-red-100 text-red-800 text-xs px-2 py-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); setRejectedOrderNumber(o.order_number); setRejectedItems(o.rejected_sizes || []); setRejectedOpen(true); }}>Rej: {o.rejected_quantity}</Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                  {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 ? (
                                    <span>Sizes: {o.size_distributions.map((sd: any) => `${sd.size_name}:${sd.quantity}`).join(', ')}</span>
                                  ) : (
                                    <span>No sizes</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="readymade" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Shirt className="h-4 w-4 sm:h-5 sm:w-5" />
                    Readymade Orders
                  </CardTitle>
                  {/* Toggle Button for View Mode */}
                  <div className="flex items-center gap-2 bg-muted rounded-full p-1">
                    <button
                      onClick={() => setReadymadeViewMode('order')}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        readymadeViewMode === 'order'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Order View
                    </button>
                    <button
                      onClick={() => setReadymadeViewMode('product')}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        readymadeViewMode === 'product'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Product View
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingReadymadeOrders ? (
                  <p className="text-sm sm:text-base text-muted-foreground">Loading readymade orders...</p>
                ) : readymadeOrders.length === 0 ? (
                  <p className="text-sm sm:text-base text-muted-foreground">No readymade orders found.</p>
                ) : readymadeViewMode === 'order' ? (
                  // Order View
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {readymadeOrders.map((order) => {
                      // Get first product image from order items
                      const items = readymadeOrderItems[order.id] || [];
                      let orderImage: string | null = null;
                      if (items.length > 0) {
                        orderImage = getOrderItemDisplayImage(items[0], { order_type: 'readymade' });
                      }
                      
                      return (
                        <Card key={order.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-gradient-to-br from-white to-slate-50/50">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex items-start gap-4">
                              <div className="flex-1 space-y-3 min-w-0">
                                <div>
                                  <div className="font-semibold text-base sm:text-lg text-slate-900 mb-1">Order #{order.order_number}</div>
                                  <div className="text-sm text-slate-600">{order.customer?.company_name || 'Unknown'}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 text-slate-700">
                                    {order.status}
                                  </Badge>
                                  <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-medium shadow-sm">
                                    ₹{order.final_amount?.toFixed(2) || '0.00'}
                                  </Badge>
                                </div>
                                <div className="pt-2 border-t border-slate-100">
                                  <div className="text-xs text-slate-500 space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-600">Date:</span>
                                      <span>{new Date(order.order_date).toLocaleDateString()}</span>
                                    </div>
                                    {order.expected_delivery_date && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium text-slate-600">Expected:</span>
                                        <span>{new Date(order.expected_delivery_date).toLocaleDateString()}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="pt-3">
                                  <Button
                                    size="sm"
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                                    onClick={(e) => handleCreatePicklist(e, 'order', order)}
                                  >
                                    <ClipboardList className="w-3 h-3 mr-1.5" />
                                    Create Picklist
                                  </Button>
                                </div>
                              </div>
                              {orderImage && (
                                <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative shadow-sm">
                                  <img 
                                    src={orderImage} 
                                    alt={order.order_number}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  // Product View - Grouped by Product
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {groupedProducts.map((product) => (
                      <Card 
                        key={product.product_name} 
                        className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden bg-gradient-to-br from-white to-slate-50/50 cursor-pointer"
                        onClick={() => openProductDetail(product)}
                      >
                        <CardContent className="p-4 sm:p-5">
                          <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-3 min-w-0">
                              <div>
                                <div className="font-semibold text-base sm:text-lg text-slate-900 mb-1 line-clamp-2">
                                  {product.product_name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {product.orders.length} {product.orders.length === 1 ? 'order' : 'orders'}
                                </div>
                              </div>
                              <div className="space-y-2 pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500">Total Qty:</span>
                                  <span className="font-semibold text-slate-700">{product.total_quantity}</span>
                                </div>
                                {Object.keys(product.size_quantities).length > 0 && (
                                  <div className="pt-2 border-t border-slate-100">
                                    <div className="text-xs text-slate-500 mb-1.5 font-medium">Sizes:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {sortSizes(Object.keys(product.size_quantities)).map((size) => (
                                        <Badge key={size} variant="outline" className="text-xs bg-slate-50 border-slate-200 text-slate-700 px-1.5 py-0.5">
                                          {size}: {product.size_quantities[size]}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="pt-3">
                                  <Button
                                    size="sm"
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                                    onClick={(e) => handleCreatePicklist(e, 'product', product)}
                                  >
                                    <ClipboardList className="w-3 h-3 mr-1.5" />
                                    Create Picklist
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {product.image_url && (
                              <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative shadow-sm">
                                <img 
                                  src={product.image_url} 
                                  alt={product.product_name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
           
        </Tabs>
        {/* Orders list dialog per batch */}
        <Dialog open={ordersDialogOpen} onOpenChange={(v) => { if (!v) { setOrdersDialogOpen(false); fetchTailorsWithAssignedCounts(); } }}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl xl:max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Orders for selected batch</DialogTitle>
            </DialogHeader>
            {loadingBatchOrders ? (
              <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
            ) : batchOrders.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground">No pending orders for this batch.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {batchOrders.map((o) => (
                  <Card key={o.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => { setOrdersDialogOpen(false); openPickerForAssignment(o); }}>
                    <CardContent className="pt-4 sm:pt-5 p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base truncate">Order #{o.order_number}</div>
                          <div className="text-xs text-muted-foreground truncate">{o.customer_name}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5">Qty: {o.total_quantity}</Badge>
                          <Badge className="bg-green-100 text-green-800 text-xs px-2 py-0.5">Picked: {o.picked_quantity}</Badge>
                          {o.rejected_quantity > 0 && (
                            <Badge className="bg-red-100 text-red-800 text-xs px-2 py-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); setRejectedOrderNumber(o.order_number); setRejectedItems(o.rejected_sizes || []); setRejectedOpen(true); }}>Rej: {o.rejected_quantity}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 ? (
                          <span>Sizes: {o.size_distributions.map((sd: any) => `${sd.size_name}:${sd.quantity}`).join(', ')}</span>
                        ) : (
                          <span>No sizes</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejected sizes dialog */}
        <Dialog open={rejectedOpen} onOpenChange={(v) => { if (!v) setRejectedOpen(false); }}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Rejected sizes for order {rejectedOrderNumber}</DialogTitle>
            </DialogHeader>
            {rejectedItems.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground">No rejections recorded.</p>
            ) : (
              <div className="space-y-2">
                {rejectedItems.map((it, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border rounded p-2 sm:p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.size_name}</div>
                      {it.remarks && <div className="text-xs text-muted-foreground mt-1">{it.remarks}</div>}
                    </div>
                    <Badge className="bg-red-100 text-red-800 text-xs px-2 py-0.5 self-start sm:self-auto">{it.rejected_quantity}</Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Batch-level rejected details dialog */}
        <Dialog open={batchRejectedOpen} onOpenChange={(v) => { if (!v) setBatchRejectedOpen(false); }}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Rejected details for {batchRejectedTitle}</DialogTitle>
            </DialogHeader>
            {batchRejectedDetails.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground">No rejections recorded.</p>
            ) : (
              <div className="space-y-3">
                {batchRejectedDetails.map((od, i) => (
                  <div key={i} className="border rounded p-3 sm:p-4">
                    <div className="text-sm font-medium mb-2">Order #{od.order_number}</div>
                    <div className="space-y-2">
                      {od.sizes.map((s, j) => (
                        <div key={j} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="text-xs sm:text-sm text-muted-foreground min-w-0 flex-1">{s.size_name}{s.remarks ? ` • ${s.remarks}` : ''}</div>
                          <Badge className="bg-red-100 text-red-800 text-xs px-2 py-0.5 self-start sm:self-auto">{s.rejected_quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Picker dialog (size-wise picking) */}
        {pickerOpen && pickerContext && (
          <PickerQuantityDialog
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSuccess={() => {
              if (activeBatchId) openBatchOrders(activeBatchId);
              fetchTailorsWithAssignedCounts();
            }}
            assignmentId={pickerContext.assignmentId}
            orderNumber={pickerContext.orderNumber}
            customerName={pickerContext.customerName}
            sizeDistributions={pickerContext.sizeDistributions}
          />
        )}

        {/* Bin Selection Dialog */}
        <Dialog open={binSelectionDialogOpen} onOpenChange={(open) => {
          setBinSelectionDialogOpen(open);
          if (!open) {
            setSelectedBin(null);
            setAvailableBins([]);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Select Bin for Picklist</DialogTitle>
            </DialogHeader>
            {loadingBins ? (
              <p className="text-sm text-muted-foreground py-4">Loading available bins...</p>
            ) : availableBins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No bins with available inventory found.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Select Bin:</label>
                  <Select onValueChange={handleBinSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a bin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBins.map((bin) => (
                        <SelectItem key={bin.bin_id} value={bin.bin_id}>
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium">{bin.bin_code}</span>
                            <span className="text-xs text-muted-foreground ml-4">
                              {bin.warehouse_name && `${bin.warehouse_name} - `}
                              {bin.floor_number && `Floor ${bin.floor_number} - `}
                              {bin.rack_code && `Rack ${bin.rack_code} - `}
                              Qty: {bin.current_quantity}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setBinSelectionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleConfirmBinSelection} disabled={!selectedBin}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Picklist Preview Dialog */}
        <Dialog open={picklistPreviewDialogOpen} onOpenChange={(open) => {
          setPicklistPreviewDialogOpen(open);
          if (!open) {
            setPicklistData({ product: null, order: null, bin: null });
            setSelectedBin(null);
          }
        }}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full print:overflow-visible">
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                .print-content, .print-content * {
                  visibility: visible;
                }
                .print-content {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            <DialogHeader className="no-print">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg sm:text-xl">
                  {picklistData.product?.product_name || 'Picklist'}
                </DialogTitle>
                <Button
                  onClick={handlePrintPicklist}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Picklist
                </Button>
              </div>
            </DialogHeader>
            {picklistData.product && picklistData.bin && (
              <div className="space-y-4 print-content">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div className="flex items-center gap-4">
                    {picklistData.product.image_url && (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative shadow-sm">
                        <img 
                          src={picklistData.product.image_url} 
                          alt={picklistData.product.product_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-slate-600">
                        Total Quantity: <span className="font-semibold text-slate-900">{picklistData.product.total_quantity}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        Orders: <span className="font-semibold text-slate-900">{picklistData.product.orders.length}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        Bin: <span className="font-semibold text-slate-900">{picklistData.bin.bin_code}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-900 sticky left-0 bg-slate-50 z-10">Order Number</TableHead>
                        <TableHead className="font-semibold text-slate-900 sticky left-[200px] bg-slate-50 z-10">Bin</TableHead>
                        {sortSizes(Object.keys(picklistData.product.size_quantities)).map((size) => (
                          <TableHead key={size} className="font-semibold text-slate-900 text-center min-w-[80px]">
                            {size}
                          </TableHead>
                        ))}
                        <TableHead className="font-semibold text-slate-900 text-center bg-blue-50">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {picklistData.product.orders.map((order) => {
                        const rowTotal = Object.values(order.size_quantities).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
                        const sortedSizes = sortSizes(Object.keys(picklistData.product!.size_quantities));
                        return (
                          <TableRow key={order.order_id} className="hover:bg-slate-50/50">
                            <TableCell className="font-medium text-slate-900 sticky left-0 bg-white z-10">
                              {order.order_number}
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 sticky left-[200px] bg-white z-10">
                              {picklistData.bin?.bin_code}
                            </TableCell>
                            {sortedSizes.map((size) => (
                              <TableCell key={size} className="text-center">
                                {order.size_quantities[size] || 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-semibold bg-blue-50">
                              {rowTotal}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Column Totals Row */}
                      <TableRow className="bg-slate-100 font-semibold">
                        <TableCell className="font-semibold text-slate-900 sticky left-0 bg-slate-100 z-10">
                          Total
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 sticky left-[200px] bg-slate-100 z-10">
                          {picklistData.bin?.bin_code}
                        </TableCell>
                        {sortSizes(Object.keys(picklistData.product.size_quantities)).map((size) => {
                          const colTotal = picklistData.product.orders.reduce((sum, order) => 
                            sum + (Number(order.size_quantities[size]) || 0), 0
                          );
                          return (
                            <TableCell key={size} className="text-center bg-blue-50">
                              {colTotal}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center bg-blue-100 font-bold">
                          {picklistData.product.total_quantity}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Product Detail Dialog */}
        <Dialog open={productDetailDialogOpen} onOpenChange={setProductDetailDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">
                {selectedProductDetail?.product_name}
              </DialogTitle>
            </DialogHeader>
            {selectedProductDetail && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div className="flex items-center gap-4">
                    {selectedProductDetail.image_url && (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative shadow-sm">
                        <img 
                          src={selectedProductDetail.image_url} 
                          alt={selectedProductDetail.product_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-slate-600">
                        Total Quantity: <span className="font-semibold text-slate-900">{selectedProductDetail.total_quantity}</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        Orders: <span className="font-semibold text-slate-900">{selectedProductDetail.orders.length}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={(e) => handleCreatePicklist(e, 'product', selectedProductDetail)}
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    Create Picklist
                  </Button>
                </div>
                
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-900 sticky left-0 bg-slate-50 z-10">Order Number</TableHead>
                        {sortSizes(Object.keys(selectedProductDetail.size_quantities)).map((size) => (
                          <TableHead key={size} className="font-semibold text-slate-900 text-center min-w-[80px]">
                            {size}
                          </TableHead>
                        ))}
                        <TableHead className="font-semibold text-slate-900 text-center bg-blue-50">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProductDetail.orders.map((order) => {
                        const rowTotal = Object.values(order.size_quantities).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
                        const sortedSizes = sortSizes(Object.keys(selectedProductDetail.size_quantities));
                        return (
                          <TableRow key={order.order_id} className="hover:bg-slate-50/50">
                            <TableCell className="font-medium text-slate-900 sticky left-0 bg-white z-10">
                              {order.order_number}
                            </TableCell>
                            {sortedSizes.map((size) => (
                              <TableCell key={size} className="text-center">
                                {order.size_quantities[size] || 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-semibold bg-blue-50">
                              {rowTotal}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Column Totals Row */}
                      <TableRow className="bg-slate-100 font-semibold">
                        <TableCell className="font-semibold text-slate-900 sticky left-0 bg-slate-100 z-10">
                          Total
                        </TableCell>
                        {sortSizes(Object.keys(selectedProductDetail.size_quantities)).map((size) => {
                          const colTotal = selectedProductDetail.orders.reduce((sum, order) => 
                            sum + (Number(order.size_quantities[size]) || 0), 0
                          );
                          return (
                            <TableCell key={size} className="text-center bg-blue-50">
                              {colTotal}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center bg-blue-100 font-bold">
                          {selectedProductDetail.total_quantity}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}


