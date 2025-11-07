import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, RefreshCw, Eye, Pencil, Trash2, ClipboardList } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ItemImage } from '@/components/ui/OptimizedImage';
import { PurchaseOrderFormDialog } from './PurchaseOrderFormDialog';

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
};

type Supplier = { id: string; supplier_name: string; supplier_code: string };

type FirstItemImage = { po_id: string; item_image_url: string | null };
type ItemRowLite = { 
  po_id: string; 
  item_image_url: string | null; 
  remarks: string | null; 
  quantity: number; 
  unit_of_measure: string | null;
  item_name: string | null;
  item_type: string | null;
  fabric_name: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
  notes: string | null;
};

// Memoized row component for better performance
const PurchaseOrderRow = memo(function PurchaseOrderRow({ 
  po, 
  supplier, 
  imageUrl, 
  totalQuantity,
  items,
  onView, 
  onEdit, 
  onDelete 
}: {
  po: PurchaseOrder;
  supplier: Supplier | undefined;
  imageUrl: string | null;
  totalQuantity: { total: number; uom: string } | undefined;
  items: ItemRowLite[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusBadge = (status: PurchaseOrder['status']) => {
    const map: Record<PurchaseOrder['status'], string> = {
      draft: 'bg-gray-100 text-gray-800 border-gray-200',
      submitted: 'bg-blue-100 text-blue-800 border-blue-200',
      approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return <Badge variant="outline" className={`font-medium ${map[status]}`}>{status.replace('_',' ')}</Badge>;
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{po.po_number}</TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{supplier?.supplier_name || '-'}</div>
          <div className="text-xs text-muted-foreground">{supplier?.supplier_code || ''}</div>
        </div>
      </TableCell>
      <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}</TableCell>
      <TableCell>
        <ItemImage 
          src={imageUrl} 
          alt="item" 
          className="w-12 h-12 object-cover rounded"
        />
      </TableCell>
      <TableCell>
        <div className="text-sm space-y-1">
          {items.slice(0, 2).map((item, idx) => (
            <div key={idx} className="border-b border-gray-100 pb-1 last:border-b-0">
              <div className="font-medium">{item.item_name || 'N/A'}</div>
              {item.item_type === 'fabric' && (
                <div className="text-xs text-muted-foreground">
                  {item.fabric_name && `${item.fabric_name} - `}
                  {item.fabric_color && `${item.fabric_color}, `}
                  {item.fabric_gsm && `${item.fabric_gsm} GSM`}
                </div>
              )}
              {item.notes && (
                <div className="text-xs text-muted-foreground truncate">
                  {item.notes}
                </div>
              )}
            </div>
          ))}
          {items.length > 2 && (
            <div className="text-xs text-muted-foreground">
              +{items.length - 2} more items
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {totalQuantity ? `${totalQuantity.total} ${totalQuantity.uom}` : '-'}
      </TableCell>
      <TableCell>{statusBadge(po.status)}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onView(po.id)}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(po.id)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(po.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

type BomRecord = {
  id: string;
  bom_number: string;
  product_name: string;
  product_image_url?: string | null;
  total_order_qty: number;
  created_at: string;
  order?: {
    order_number: string;
    customer?: {
      company_name: string;
    };
  };
  bom_record_items?: any[];
  remainingItems?: Array<{
    bom_item_id: string;
    category: string;
    item_id?: string;
    item_name: string;
    fabric_name?: string;
    fabric_color?: string;
    fabric_gsm?: string;
    required_qty: number;
    remaining_qty: number;
    unit_of_measure?: string;
  }>;
};

const PurchaseOrderList = memo(function PurchaseOrderList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  
  // Pending tab - BOMs without PO
  const [pendingBoms, setPendingBoms] = useState<BomRecord[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  
  // In Progress tab - POs without GRN
  const [inProgressPOs, setInProgressPOs] = useState<PurchaseOrder[]>([]);
  const [inProgressLoading, setInProgressLoading] = useState(true);
  const [inProgressSuppliers, setInProgressSuppliers] = useState<Record<string, Supplier>>({});
  const [inProgressFirstImageByPoId, setInProgressFirstImageByPoId] = useState<Record<string, string | null>>({});
  const [inProgressTotalQuantityByPoId, setInProgressTotalQuantityByPoId] = useState<Record<string, { total: number; uom: string }>>({});
  const [inProgressItemsByPoId, setInProgressItemsByPoId] = useState<Record<string, ItemRowLite[]>>({});
  
  // Completed tab - POs with GRN
  const [completedPOs, setCompletedPOs] = useState<PurchaseOrder[]>([]);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [completedSuppliers, setCompletedSuppliers] = useState<Record<string, Supplier>>({});
  const [completedFirstImageByPoId, setCompletedFirstImageByPoId] = useState<Record<string, string | null>>({});
  const [completedTotalQuantityByPoId, setCompletedTotalQuantityByPoId] = useState<Record<string, { total: number; uom: string }>>({});
  const [completedItemsByPoId, setCompletedItemsByPoId] = useState<Record<string, ItemRowLite[]>>({});
  
  const [search, setSearch] = useState('');
  const [createPODialogOpen, setCreatePODialogOpen] = useState(false);
  const [selectedBomsForPO, setSelectedBomsForPO] = useState<BomRecord[]>([]);

  // Fetch pending BOMs (BOMs with items/fabrics that haven't been fully ordered)
  const fetchPendingBoms = useCallback(async () => {
    try {
      setPendingLoading(true);
      
      // Fetch all BOMs
      const { data: allBoms, error: bomError } = await supabase
        .from('bom_records')
        .select(`
          *,
          order:orders(
            order_number,
            customer:customers(company_name)
          ),
          bom_record_items(
            id,
            bom_id,
            item_id,
            item_name,
            category,
            qty_total,
            to_order,
            unit_of_measure,
            fabric_name,
            fabric_color,
            fabric_gsm,
            stock
          )
        `)
        .order('created_at', { ascending: false });
      
      // Debug: Log total BOMs fetched
      console.log('📊 Total BOMs fetched:', allBoms?.length || 0);
      
      // Check if target BOM is in the fetched list
      if (allBoms && Array.isArray(allBoms)) {
        const targetBom = allBoms.find((bom: any) => bom.bom_number === 'BOM-1762363285885-LK8K') as any;
        if (targetBom) {
          console.log('✅ Target BOM found in fetched list:', {
            bom_number: targetBom.bom_number,
            product_name: targetBom.product_name,
            items_count: targetBom.bom_record_items?.length || 0,
            created_at: targetBom.created_at,
            items: targetBom.bom_record_items?.map((item: any) => ({
              id: item.id,
              item_name: item.item_name,
              fabric_name: item.fabric_name,
              fabric_color: item.fabric_color,
              fabric_gsm: item.fabric_gsm,
              qty_total: item.qty_total,
              to_order: item.to_order,
              category: item.category
            }))
          });
        } else {
          console.warn('❌ Target BOM NOT found in fetched list!', {
            total_boms: allBoms.length,
            bom_numbers: allBoms.map((bom: any) => bom.bom_number).slice(0, 10)
          });
        }
      }
      
      if (allBoms && allBoms.length > 0) {
        const recentBoms = allBoms.filter((bom: any) => 
          bom.created_at && new Date(bom.created_at) > new Date('2025-11-01')
        );
        console.log('📊 Recent BOMs (after 2025-11-01):', recentBoms.length);
        recentBoms.forEach((bom: any) => {
          console.log('📊 Recent BOM:', {
            bom_number: bom.bom_number,
            product_name: bom.product_name,
            items_count: bom.bom_record_items?.length || 0,
            created_at: bom.created_at
          });
        });
      }
      
      if (bomError) throw bomError;
      
      // Fetch ALL purchase order items globally to calculate remaining quantities
      // IMPORTANT: Fetch ALL PO items with their bom_id to properly track which BOM each item belongs to
      // This ensures we can match items across all POs to their respective BOMs
      const { data: allPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('id');
      
      if (poError) throw poError;
      
      const poIds = (allPOs || []).map((po: any) => po.id);
      
      // Fetch ALL PO items (from all POs) with their bom_id
      // The bom_id on each item tells us which BOM that item is fulfilling
      let allPOItems: any[] = [];
      if (poIds.length > 0) {
        const { data: poItemsData, error: poItemsError } = await supabase
          .from('purchase_order_items')
          .select(`
            item_type,
            item_id,
            item_name,
            fabric_name,
            fabric_color,
            fabric_gsm,
            quantity,
            po_id,
            bom_id
          `)
          .in('po_id', poIds);
        
        if (poItemsError) throw poItemsError;
        
        // Use the bom_id from each item directly (no need to map from PO)
        // This allows a single PO to have items from multiple BOMs
        allPOItems = poItemsData || [];
      }
      
      // Debug: Log total PO items fetched
      console.log('📊 Total PO items fetched globally:', allPOItems.length);
      
      // Group PO items by item key (not by BOM ID) to aggregate GLOBALLY across ALL POs
      // IMPORTANT: This creates a global map of ordered quantities across all purchase orders
      // This ensures that remaining quantities are calculated as: BOM quantity - Global ordered quantity
      // This allows us to match items from any PO to any BOM based on item attributes
      const poItemsByKey: Map<string, number> = new Map();
      
      allPOItems.forEach((poItem: any) => {
        // Create a unique key for matching items/fabrics
        // Normalize values by trimming and converting to lowercase
        let itemKey = '';
        if (poItem.item_type === 'fabric') {
          // For fabrics, match by fabric_name, color, and gsm
          const fabricName = (poItem.fabric_name || '').trim().toLowerCase();
          const fabricColor = (poItem.fabric_color || '').trim().toLowerCase();
          const fabricGsm = (poItem.fabric_gsm || '').trim().toLowerCase();
          itemKey = `fabric:${fabricName}:${fabricColor}:${fabricGsm}`;
        } else {
          // For items, match by item_id if available, otherwise use item_name
          const itemId = poItem.item_id || '';
          const itemName = (poItem.item_name || '').trim().toLowerCase();
          if (itemId) {
            itemKey = `item:${itemId}`;
          } else if (itemName) {
            itemKey = `item:${itemName}`;
          } else {
            // Fallback: use po_item_id to ensure uniqueness
            itemKey = `item:${poItem.id || ''}`;
          }
        }
        
        // Aggregate quantities GLOBALLY across ALL POs for this item key
        // This gives us the total ordered quantity for this item/fabric across the entire system
        const currentQty = poItemsByKey.get(itemKey) || 0;
        poItemsByKey.set(itemKey, currentQty + (poItem.quantity || 0));
      });
      
      // Debug: Log global ordered quantities for verification
      if (poItemsByKey.size > 0) {
        console.log('🌍 Global ordered quantities map (total keys):', poItemsByKey.size);
        console.log('🌍 Sample global ordered quantities:', Array.from(poItemsByKey.entries()).slice(0, 10).map(([key, qty]) => ({ key, qty })));
        
        // Also log if we're looking for the target BOM's fabric
        const targetFabricKey = 'fabric:airtex 240 gsm:black:240';
        if (poItemsByKey.has(targetFabricKey)) {
          console.log('🔍 Found target fabric in global map:', {
            key: targetFabricKey,
            qty: poItemsByKey.get(targetFabricKey)
          });
        }
      }
      
      // Create a global map of PO items by item key (for matching by attributes)
      // This allows us to match PO items to BOM items regardless of which BOM the PO is linked to
      const poItemsByKeyGlobal: Map<string, number> = new Map();
      
      allPOItems.forEach((poItem: any) => {
        // Create item key using the same logic as BOM items for consistent matching
        let itemKey = '';
        if (poItem.item_type === 'fabric') {
          const fabricName = (poItem.fabric_name || '').trim().toLowerCase();
          const fabricColor = (poItem.fabric_color || '').trim().toLowerCase();
          const fabricGsm = (poItem.fabric_gsm || '').trim().toLowerCase();
          // Only create key if we have at least fabric name
          if (fabricName || fabricColor || fabricGsm) {
            itemKey = `fabric:${fabricName}:${fabricColor}:${fabricGsm}`;
          } else {
            // Fallback: use po_item_id if no fabric details
            itemKey = `fabric:${poItem.id || ''}`;
          }
        } else {
          // For items, use item_id if available, otherwise use item_name as fallback
          const itemId = poItem.item_id || '';
          const itemName = (poItem.item_name || '').trim().toLowerCase();
          if (itemId) {
            itemKey = `item:${itemId}`;
          } else if (itemName) {
            // Use item_name as fallback
            itemKey = `item:${itemName}`;
          } else {
            // Last resort: use po_item_id to ensure uniqueness
            itemKey = `item:${poItem.id || ''}`;
          }
        }
        
        // Aggregate quantities globally by item key
        const currentQty = poItemsByKeyGlobal.get(itemKey) || 0;
        poItemsByKeyGlobal.set(itemKey, currentQty + (Number(poItem.quantity) || 0));
      });
      
      // Create a map by BOM ID for items that are explicitly linked to a BOM
      // IMPORTANT: Each PO item now has its own bom_id, so we can track which BOM it belongs to
      // This enables a single PO to fulfill items from multiple BOMs
      const poItemsByBomId: Record<string, Map<string, number>> = {};
      
      // Debug: Log BOM IDs found in PO items
      const bomIdsInPOItems = new Set<string>();
      allPOItems.forEach((poItem: any) => {
        if (poItem.bom_id) {
          bomIdsInPOItems.add(poItem.bom_id);
        }
      });
      if (bomIdsInPOItems.size > 0) {
        console.log('📊 BOM IDs found in PO items (item-level tracking):', Array.from(bomIdsInPOItems));
      }
      
      allPOItems.forEach((poItem: any) => {
        const bomId = poItem.bom_id;
        if (!bomId) return;
        
        // Create item key using the same logic as BOM items for consistent matching
        let itemKey = '';
        if (poItem.item_type === 'fabric') {
          const fabricName = (poItem.fabric_name || '').trim().toLowerCase();
          const fabricColor = (poItem.fabric_color || '').trim().toLowerCase();
          const fabricGsm = (poItem.fabric_gsm || '').trim().toLowerCase();
          // Only create key if we have at least fabric name
          if (fabricName || fabricColor || fabricGsm) {
            itemKey = `fabric:${fabricName}:${fabricColor}:${fabricGsm}`;
          } else {
            // Fallback: use po_item_id if no fabric details
            itemKey = `fabric:${poItem.id || ''}`;
          }
        } else {
          // For items, use item_id if available, otherwise use item_name as fallback
          const itemId = poItem.item_id || '';
          const itemName = (poItem.item_name || '').trim().toLowerCase();
          if (itemId) {
            itemKey = `item:${itemId}`;
          } else if (itemName) {
            // Use item_name as fallback
            itemKey = `item:${itemName}`;
          } else {
            // Last resort: use po_item_id to ensure uniqueness
            itemKey = `item:${poItem.id || ''}`;
          }
        }
        
        if (!poItemsByBomId[bomId]) {
          poItemsByBomId[bomId] = new Map();
        }
        
        const currentQty = poItemsByBomId[bomId].get(itemKey) || 0;
        poItemsByBomId[bomId].set(itemKey, currentQty + (Number(poItem.quantity) || 0));
      });
      
      // Process each BOM to calculate remaining quantities
      const pendingBomsList: BomRecord[] = [];
      
      // Debug: Log all BOMs being processed
      console.log('📋 Processing all BOMs. Total count:', (allBoms || []).length);
      
      (allBoms || []).forEach((bom: any) => {
        const bomItems = bom.bom_record_items || [];
        const remainingItems: BomRecord['remainingItems'] = [];
        
        // Debug: Log BOM details for recently created BOMs (checking by date or specific patterns)
        // Also log BOMs with small quantities that might be filtered incorrectly
        const isRecentBom = bom.created_at && new Date(bom.created_at) > new Date('2025-11-01');
        const isTargetBom = bom.bom_number === 'BOM-1762363285885-LK8K';
        const isNewBom = bom.created_at && new Date(bom.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000); // Created in last 24 hours
        const shouldDebug = isRecentBom || bom.bom_number?.includes('BOM-1762363285885') || isNewBom;
        const shouldDebugBom = shouldDebug || isTargetBom;
        
        // Always log newly created BOMs (within last 24 hours)
        if (isNewBom) {
          console.log('🆕 NEW BOM DETECTED:', {
            bom_number: bom.bom_number,
            product_name: bom.product_name,
            created_at: bom.created_at,
            items_count: bomItems.length,
            bom_id: bom.id
          });
        }
        
        // Check if any item has a small quantity (between 0 and 1) that might be filtered incorrectly
        const hasSmallQuantities = bomItems.some((item: any) => {
          const qty = item.qty_total != null ? Number(item.qty_total) : (item.to_order != null ? Number(item.to_order) : null);
          return qty !== null && qty > 0 && qty <= 1;
        });
        
        // Always log BOMs with small quantities or recent BOMs for debugging
        if (shouldDebugBom || hasSmallQuantities) {
          console.log('🔍 Processing BOM:', bom.bom_number, bom.product_name);
          console.log('🔍 BOM Items count:', bomItems.length);
          console.log('🔍 BOM Items:', bomItems.map((item: any) => ({
            id: item.id,
            category: item.category,
            item_name: item.item_name,
            fabric_name: item.fabric_name,
            fabric_color: item.fabric_color,
            fabric_gsm: item.fabric_gsm,
            qty_total: item.qty_total,
            to_order: item.to_order,
            unit_of_measure: item.unit_of_measure,
            qtyTotalType: typeof item.qty_total,
            toOrderType: typeof item.to_order,
            qtyTotalNum: item.qty_total != null ? Number(item.qty_total) : null,
            toOrderNum: item.to_order != null ? Number(item.to_order) : null
          })));
        }
        
        // If BOM has no items, check if it should still be shown (might be a data issue)
        if (bomItems.length === 0) {
          if (shouldDebugBom) {
            console.warn('⚠️ BOM has no items:', bom.bom_number, bom.product_name);
          }
        }
        
        // Use 0.0001 for comparison to handle floating-point precision
        // This ensures values like 0.10, 0.01, etc. are correctly detected as > 0
        const EPSILON = 0.0001;
        
        // Get PO items map for this specific BOM (outside the loop so we can use it in debug logs)
        const bomPOItems = poItemsByBomId[bom.id] || new Map();
        
        // Enhanced debug for target BOM
        if (isTargetBom && bomPOItems.size === 0) {
          console.log('🔍 Target BOM has no PO items in map. Checking all PO items for this BOM ID:', {
            bom_id: bom.id,
            bom_number: bom.bom_number,
            allPOItemsWithThisBomId: allPOItems.filter((poItem: any) => poItem.bom_id === bom.id).map((poItem: any) => ({
              item_type: poItem.item_type,
              item_name: poItem.item_name,
              fabric_name: poItem.fabric_name,
              quantity: poItem.quantity,
              bom_id: poItem.bom_id
            }))
          });
        }
        
        bomItems.forEach((bomItem: any) => {
          const isFabric = bomItem.category === 'Fabric';
          
          // Use qty_total if available, otherwise to_order
          // Check both qty_total and to_order to determine required quantity
          const qtyTotal = bomItem.qty_total != null ? Number(bomItem.qty_total) : null;
          const toOrder = bomItem.to_order != null ? Number(bomItem.to_order) : null;
          
          // Determine required quantity: prefer qty_total, fallback to to_order
          // Accept any non-null value (even if 0, as it might be a valid quantity)
          let requiredQty = 0;
          if (qtyTotal != null) {
            requiredQty = qtyTotal;
          } else if (toOrder != null) {
            requiredQty = toOrder;
          }
          
          // Debug: Log all items for recent BOMs or items with small quantities (0 < qty <= 1)
          const hasSmallQty = (qtyTotal !== null && qtyTotal > 0 && qtyTotal <= 1) || 
                              (toOrder !== null && toOrder > 0 && toOrder <= 1);
          if (shouldDebugBom || hasSmallQty) {
            console.log('🔍 Item quantity check:', {
              item_name: bomItem.item_name || bomItem.fabric_name,
              category: bomItem.category,
              qtyTotal,
              toOrder,
              requiredQty,
              qtyTotalType: typeof qtyTotal,
              toOrderType: typeof toOrder,
              qtyTotalAbs: qtyTotal !== null ? Math.abs(qtyTotal) : null,
              toOrderAbs: toOrder !== null ? Math.abs(toOrder) : null,
              EPSILON
            });
          }
          
          // Only skip items that have both qty_total and to_order as 0 or null
          // This ensures we include items even if one field is null but the other has a value
          // Check: if both are non-null AND both are effectively 0
          if (qtyTotal !== null && toOrder !== null && 
              Math.abs(qtyTotal) < EPSILON && Math.abs(toOrder) < EPSILON) {
            // Both are effectively 0, skip
            if (shouldDebugBom) {
              console.log('⚠️ Skipping item (both quantities are 0):', {
                item_name: bomItem.item_name || bomItem.fabric_name,
                qtyTotal,
                toOrder
              });
            }
            return;
          }
          
          if (qtyTotal == null && toOrder == null) {
            // Both are null/undefined, skip (no quantity data)
            if (shouldDebugBom) {
              console.log('⚠️ Skipping item (both quantities are null):', {
                item_name: bomItem.item_name || bomItem.fabric_name
              });
            }
            return;
          }
          
          // Skip items with no quantity (after all checks)
          // Use 0.000 for comparison to handle floating-point precision
          // IMPORTANT: Only skip if requiredQty is <= EPSILON, not just if it's 0
          if (requiredQty <= EPSILON) {
            // Debug: Log skipped items for recent BOMs
            if (shouldDebugBom) {
              console.log('⚠️ Skipping item (requiredQty <= EPSILON):', {
                item_name: bomItem.item_name || bomItem.fabric_name,
                category: bomItem.category,
                qtyTotal,
                toOrder,
                requiredQty,
                EPSILON,
                comparison: `${requiredQty} <= ${EPSILON}`
              });
            }
            return;
          }
          
          // Debug: Item passed quantity check
          if (shouldDebugBom) {
            console.log('✅ Item passed quantity check:', {
              item_name: bomItem.item_name || bomItem.fabric_name,
              requiredQty
            });
          }
          
          // Create matching key - normalize values by trimming and converting to lowercase
          // For items without item_id, use item_name as fallback to ensure uniqueness
          // NOTE: This key is used to match against PO items, so it should NOT include bom_item_id
          // Each BOM item will still get its own entry in remainingItems below
          let itemKey = '';
          if (isFabric) {
            const fabricName = (bomItem.fabric_name || '').trim().toLowerCase();
            const fabricColor = (bomItem.fabric_color || '').trim().toLowerCase();
            const fabricGsm = (bomItem.fabric_gsm || '').trim().toLowerCase();
            // Only create key if we have at least fabric name
            if (fabricName || fabricColor || fabricGsm) {
              itemKey = `fabric:${fabricName}:${fabricColor}:${fabricGsm}`;
            } else {
              // Fallback: use bom_item_id if no fabric details
              itemKey = `fabric:${bomItem.id}`;
            }
          } else {
            // For items, use item_id if available, otherwise use item_name as fallback
            const itemId = bomItem.item_id || '';
            const itemName = (bomItem.item_name || '').trim().toLowerCase();
            if (itemId) {
              itemKey = `item:${itemId}`;
            } else if (itemName) {
              // Use item_name as fallback, but prefix with bom_item_id to ensure uniqueness within BOM
              itemKey = `item:${bomItem.id}:${itemName}`;
            } else {
              // Last resort: use bom_item_id to ensure each item is tracked
              itemKey = `item:${bomItem.id}`;
            }
          }
          
          // Debug: Log item key for recent BOMs or target BOM
          if (shouldDebugBom) {
            console.log('🔑 Item key:', {
              item_name: bomItem.item_name || bomItem.fabric_name,
              category: bomItem.category,
              itemKey,
              isFabric,
              fabric_name: bomItem.fabric_name,
              fabric_color: bomItem.fabric_color,
              fabric_gsm: bomItem.fabric_gsm
            });
          }
          
          // Calculate ordered quantity for this item
          // IMPORTANT: Use BOM-specific ordered quantities to determine if a BOM should appear in pending
          // Each PO item now has a bom_id that links it to the specific BOM it's fulfilling
          // This allows:
          // 1. A single PO to fulfill items from multiple BOMs
          // 2. Multiple BOMs to be marked as having their PO created when one PO covers them all
          // 3. Accurate tracking of which BOMs still need POs
          let orderedQty = 0;
          
          // Use BOM-specific ordered quantities (items ordered for THIS BOM)
          // The bomPOItems map contains only items where bom_id matches this BOM's id
          orderedQty = bomPOItems.get(itemKey) || 0;
          
          // If no match in BOM-specific map, try partial matching for fabrics
          // This handles cases where the item key might not match exactly
          if (orderedQty === 0 && isFabric) {
            const fabricName = (bomItem.fabric_name || '').trim().toLowerCase();
            const fabricColor = (bomItem.fabric_color || '').trim().toLowerCase();
            const fabricGsm = (bomItem.fabric_gsm || '').trim().toLowerCase();
            
            // Search through BOM-specific PO items for partial matches
            for (const [key, qty] of bomPOItems.entries()) {
              if (key.includes(fabricName) && key.includes(fabricColor)) {
                orderedQty += qty;
              }
            }
          }
          
          // If still no match and it's an item (not fabric), try matching by item_id or item_name in BOM-specific map
          if (orderedQty === 0 && !isFabric) {
            if (bomItem.item_id) {
              const simpleKey = `item:${bomItem.item_id}`;
              orderedQty = bomPOItems.get(simpleKey) || 0;
            }
            
            // Also try matching by item_name
            if (orderedQty === 0 && bomItem.item_name) {
              const itemName = (bomItem.item_name || '').trim().toLowerCase();
              for (const [key, qty] of bomPOItems.entries()) {
                if (key.includes(itemName)) {
                  orderedQty += qty;
                }
              }
            }
          }
          
          // Debug: Log matching attempts for target BOM
          if (shouldDebugBom) {
            console.log('🔍 PO quantity lookup for BOM (BOM-specific only):', {
              itemKey,
              orderedQty,
              isFabric,
              fabric_name: bomItem.fabric_name,
              fabric_color: bomItem.fabric_color,
              fabric_gsm: bomItem.fabric_gsm,
              bomId: bom.id,
              bomPOItemsSize: bomPOItems.size,
              bomPOItemsKeys: Array.from(bomPOItems.keys()),
              bomPOItemsEntries: Array.from(bomPOItems.entries()).map(([key, qty]) => ({ key, qty }))
            });
          }
          
          // Calculate remaining quantity: BOM required quantity - (quantity ordered for THIS BOM)
          // This gives us what's still needed from this specific BOM
          const remainingQty = Math.max(0, requiredQty - orderedQty);
          
          // Debug: Log calculation for recent BOMs or items with small quantities
          const hasSmallRemainingQty = remainingQty > 0 && remainingQty < 1;
          const hasSmallRequiredQty = requiredQty > 0 && requiredQty <= 1;
          if (shouldDebugBom || hasSmallRemainingQty || hasSmallRequiredQty) {
            console.log('📊 Quantity calculation:', {
              item_name: bomItem.item_name || bomItem.fabric_name,
              itemKey,
              requiredQty,
              bomOrderedQty: orderedQty,
              calculation: `${requiredQty} - ${orderedQty} = ${requiredQty - orderedQty}`,
              remainingQty,
              EPSILON,
              willBeIncluded: remainingQty > EPSILON,
              comparison: `${remainingQty} > ${EPSILON} = ${remainingQty > EPSILON}`
            });
          }
          
          // Only add items that have remaining quantity > EPSILON
          // Use EPSILON for comparison to handle floating-point precision issues
          // This ensures small quantities like 0.10, 0.01, etc. are correctly included
          if (remainingQty > EPSILON) {
            remainingItems.push({
              bom_item_id: bomItem.id,
              category: bomItem.category || '',
              item_id: bomItem.item_id,
              item_name: bomItem.item_name || bomItem.fabric_name || '',
              fabric_name: bomItem.fabric_name,
              fabric_color: bomItem.fabric_color,
              fabric_gsm: bomItem.fabric_gsm,
              required_qty: requiredQty,
              remaining_qty: remainingQty,
              unit_of_measure: bomItem.unit_of_measure
            });
            
            // Debug: Log added items for recent BOMs or items with small quantities
            if (shouldDebugBom || hasSmallRemainingQty) {
              console.log('✅ Added remaining item:', {
                item_name: bomItem.item_name || bomItem.fabric_name,
                category: bomItem.category,
                requiredQty,
                remainingQty,
                orderedQty,
                EPSILON
              });
            }
          } else {
            // Debug: Log items with 0 remaining for recent BOMs or items with small quantities
            if (shouldDebugBom || hasSmallRemainingQty) {
              console.log('⚠️ Skipping item (fully ordered or <= EPSILON):', {
                item_name: bomItem.item_name || bomItem.fabric_name,
                category: bomItem.category,
                requiredQty,
                remainingQty,
                orderedQty,
                EPSILON,
                comparison: `${remainingQty} > ${EPSILON} = ${remainingQty > EPSILON}`
              });
            }
          }
        });
        
        // Debug: Log final count for recent BOMs or BOMs with small quantities (0 < qty <= 1)
        const hasSmallQtyInBom = bomItems.some((item: any) => {
          const qty = item.qty_total != null ? Number(item.qty_total) : (item.to_order != null ? Number(item.to_order) : null);
          return qty !== null && qty > 0 && qty <= 1;
        });
        if (shouldDebugBom || hasSmallQtyInBom) {
          console.log('🔍 Final remaining items count:', remainingItems.length);
          console.log('🔍 Remaining items:', remainingItems.map(item => ({
            item_name: item.item_name,
            category: item.category,
            remaining_qty: item.remaining_qty
          })));
          console.log('🔍 Will BOM be included?', remainingItems.length > 0);
          
          // Enhanced logging for target BOM
          if (isTargetBom) {
            console.log('🎯 TARGET BOM ANALYSIS:', {
              bom_number: bom.bom_number,
              bom_id: bom.id,
              product_name: bom.product_name,
              total_order_qty: bom.total_order_qty,
              items_count: bomItems.length,
              remaining_items_count: remainingItems.length,
              bomPOItemsMap: bomPOItems ? {
                size: bomPOItems.size,
                keys: Array.from(bomPOItems.keys()),
                entries: Array.from(bomPOItems.entries()).map(([key, qty]) => ({ key, qty }))
              } : null,
              allBomItems: bomItems.map((item: any) => ({
                id: item.id,
                item_name: item.item_name,
                fabric_name: item.fabric_name,
                category: item.category,
                qty_total: item.qty_total,
                to_order: item.to_order,
                item_id: item.item_id
              }))
            });
          }
          
          if (remainingItems.length === 0 && (hasSmallQtyInBom || isTargetBom)) {
            console.warn('⚠️ WARNING: BOM has quantities but no remaining items!', {
              bom_number: bom.bom_number,
              product_name: bom.product_name,
              items_processed: bomItems.length,
              isTargetBom,
              bom_id: bom.id,
              total_order_qty: bom.total_order_qty
            });
          }
        }
        
        // Only include BOMs that have remaining items
        if (remainingItems.length > 0) {
          pendingBomsList.push({
            id: bom.id,
            bom_number: bom.bom_number || '',
            product_name: bom.product_name || '',
            product_image_url: bom.product_image_url,
            total_order_qty: bom.total_order_qty || 0,
            created_at: bom.created_at,
            order: bom.order ? {
              order_number: bom.order.order_number || '',
              customer: bom.order.customer ? {
                company_name: bom.order.customer.company_name || ''
              } : undefined
            } : undefined,
            bom_record_items: bom.bom_record_items || [],
            remainingItems
          });
        } else if (isNewBom || isTargetBom) {
          // Log why new BOMs are not being included
          console.warn('❌ NEW BOM NOT INCLUDED IN PENDING:', {
            bom_number: bom.bom_number,
            product_name: bom.product_name,
            bom_id: bom.id,
            items_count: bomItems.length,
            remaining_items_count: remainingItems.length,
            reason: bomItems.length === 0 
              ? 'No items in BOM' 
              : remainingItems.length === 0 
                ? 'All items fully ordered or have no quantity' 
                : 'Unknown'
          });
        }
      });
      
      setPendingBoms(pendingBomsList);
    } catch (e) {
      console.error('Failed to fetch pending BOMs', e);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  // Fetch in progress POs (POs without GRN)
  const fetchInProgressPOs = useCallback(async () => {
    try {
      setInProgressLoading(true);
      
      // Fetch all POs
      const { data: allPOs, error: poErr } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:supplier_master(id, supplier_name, supplier_code),
          items:purchase_order_items(
            po_id, 
            item_image_url, 
            remarks, 
            quantity, 
            unit_of_measure, 
            item_name, 
            item_type, 
            fabric_name, 
            fabric_color, 
            fabric_gsm, 
            notes,
            item_id
          )
        `)
        .order('created_at', { ascending: false });
      
      if (poErr) throw poErr;

      // Get PO IDs
      const poIds = (allPOs || []).map((po: any) => po.id);
      
      // Check which POs have GRNs
      const { data: existingGRNs, error: grnError } = await supabase
        .from('grn_master')
        .select('po_id')
        .in('po_id', poIds);
      
      if (grnError) throw grnError;
      
      const poIdsWithGRN = new Set((existingGRNs || []).map((grn: any) => grn.po_id));
      
      // Filter POs without GRN
      const inProgressPOsList = (allPOs || []).filter((po: any) => !poIdsWithGRN.has(po.id));
      
      // Process the data
      const supplierMap: Record<string, Supplier> = {};
      const firstImageMap: Record<string, string | null> = {};
      const totalQuantityMap: Record<string, { total: number; uom: string }> = {};
      const itemsMap: Record<string, ItemRowLite[]> = {};
      const processedPOs: PurchaseOrder[] = [];

      inProgressPOsList.forEach((po: any) => {
        if (po.supplier) {
          supplierMap[po.supplier.id] = {
            id: po.supplier.id,
            supplier_name: po.supplier.supplier_name,
            supplier_code: po.supplier.supplier_code
          };
        }

        if (po.items && Array.isArray(po.items)) {
          let totalQty = 0;
          let primaryUom = '';
          
          itemsMap[po.id] = po.items;
          
          po.items.forEach((item: ItemRowLite) => {
            if (firstImageMap[item.po_id] == null && item.item_image_url) {
              firstImageMap[item.po_id] = item.item_image_url;
            }
            
            totalQty += item.quantity || 0;
            if (!primaryUom && item.unit_of_measure) {
              primaryUom = item.unit_of_measure;
            }
          });
          
          totalQuantityMap[po.id] = {
            total: totalQty,
            uom: primaryUom || 'pcs'
          };
        }

        processedPOs.push({
            id: po.id,
            po_number: po.po_number,
            supplier_id: po.supplier_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount,
            status: po.status,
          created_at: po.created_at
          });
        });

      setInProgressPOs(processedPOs);
      setInProgressSuppliers(supplierMap);
      setInProgressFirstImageByPoId(firstImageMap);
      setInProgressTotalQuantityByPoId(totalQuantityMap);
      setInProgressItemsByPoId(itemsMap);
    } catch (e) {
      console.error('Failed to fetch in progress POs', e);
    } finally {
      setInProgressLoading(false);
    }
  }, []);

  // Fetch completed POs (POs with GRN)
  const fetchCompletedPOs = useCallback(async () => {
    try {
      setCompletedLoading(true);
      
      // Fetch all POs
      const { data: allPOs, error: poErr } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:supplier_master(id, supplier_name, supplier_code),
          items:purchase_order_items(
            po_id, 
            item_image_url, 
            remarks, 
            quantity, 
            unit_of_measure, 
            item_name, 
            item_type, 
            fabric_name, 
            fabric_color, 
            fabric_gsm, 
            notes,
            item_id
          )
        `)
        .order('created_at', { ascending: false });
      
      if (poErr) throw poErr;
      
      // Get PO IDs
      const poIds = (allPOs || []).map((po: any) => po.id);
      
      // Check which POs have GRNs
      const { data: existingGRNs, error: grnError } = await supabase
        .from('grn_master')
        .select('po_id')
        .in('po_id', poIds);
      
      if (grnError) throw grnError;
      
      const poIdsWithGRN = new Set((existingGRNs || []).map((grn: any) => grn.po_id));
      
      // Filter POs with GRN
      const completedPOsList = (allPOs || []).filter((po: any) => poIdsWithGRN.has(po.id));
      
      // Process the data
      const supplierMap: Record<string, Supplier> = {};
      const firstImageMap: Record<string, string | null> = {};
      const totalQuantityMap: Record<string, { total: number; uom: string }> = {};
      const itemsMap: Record<string, ItemRowLite[]> = {};
      const processedPOs: PurchaseOrder[] = [];

      completedPOsList.forEach((po: any) => {
        if (po.supplier) {
          supplierMap[po.supplier.id] = {
            id: po.supplier.id,
            supplier_name: po.supplier.supplier_name,
            supplier_code: po.supplier.supplier_code
          };
        }

        if (po.items && Array.isArray(po.items)) {
          let totalQty = 0;
          let primaryUom = '';
          
          itemsMap[po.id] = po.items;
          
          po.items.forEach((item: ItemRowLite) => {
            if (firstImageMap[item.po_id] == null && item.item_image_url) {
              firstImageMap[item.po_id] = item.item_image_url;
            }
            
            totalQty += item.quantity || 0;
            if (!primaryUom && item.unit_of_measure) {
              primaryUom = item.unit_of_measure;
            }
          });
          
          totalQuantityMap[po.id] = {
            total: totalQty,
            uom: primaryUom || 'pcs'
          };
        }

        processedPOs.push({
          id: po.id,
          po_number: po.po_number,
          supplier_id: po.supplier_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount,
          status: po.status,
          created_at: po.created_at
        });
      });

      setCompletedPOs(processedPOs);
      setCompletedSuppliers(supplierMap);
      setCompletedFirstImageByPoId(firstImageMap);
      setCompletedTotalQuantityByPoId(totalQuantityMap);
      setCompletedItemsByPoId(itemsMap);
    } catch (e) {
      console.error('Failed to fetch completed POs', e);
    } finally {
      setCompletedLoading(false);
    }
  }, []);

  // Fetch data based on active tab
  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingBoms();
    } else if (activeTab === 'in_progress') {
      fetchInProgressPOs();
    } else if (activeTab === 'completed') {
      fetchCompletedPOs();
    }
  }, [activeTab, fetchPendingBoms, fetchInProgressPOs, fetchCompletedPOs]);
  
  // Refresh when location changes (e.g., returning from BOM creation)
  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingBoms();
    }
  }, [location.pathname, activeTab, fetchPendingBoms]);
  
  // Refresh all data
  const refreshAll = useCallback(() => {
    fetchPendingBoms();
    fetchInProgressPOs();
    fetchCompletedPOs();
  }, [fetchPendingBoms, fetchInProgressPOs, fetchCompletedPOs]);

  // Filter functions for each tab
  const filteredPendingBoms = useMemo(() => {
    return pendingBoms.filter((bom) => {
      const text = `${bom.bom_number || ''} ${bom.product_name || ''} ${bom.order?.order_number || ''} ${bom.order?.customer?.company_name || ''}`.toLowerCase();
      return !search || text.includes(search.toLowerCase());
    });
  }, [pendingBoms, search]);

  const filteredInProgressPOs = useMemo(() => {
    return inProgressPOs.filter((po) => {
      const s = inProgressSuppliers[po.supplier_id];
      const text = `${po.po_number} ${(s?.supplier_name || '')} ${(s?.supplier_code || '')}`.toLowerCase();
      return !search || text.includes(search.toLowerCase());
    });
  }, [inProgressPOs, inProgressSuppliers, search]);

  const filteredCompletedPOs = useMemo(() => {
    return completedPOs.filter((po) => {
      const s = completedSuppliers[po.supplier_id];
      const text = `${po.po_number} ${(s?.supplier_name || '')} ${(s?.supplier_code || '')}`.toLowerCase();
      return !search || text.includes(search.toLowerCase());
    });
  }, [completedPOs, completedSuppliers, search]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this purchase order?')) return;
    await supabase.from('purchase_orders').delete().eq('id', id as any);
    refreshAll();
  }, [refreshAll]);

  const handleView = useCallback((id: string) => {
    navigate(`/procurement/po/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/procurement/po/${id}?edit=1`);
  }, [navigate]);

  const handleCreatePO = useCallback(() => {
    if (activeTab === 'pending') {
      // Select all pending BOMs for PO creation
      setSelectedBomsForPO(filteredPendingBoms);
      setCreatePODialogOpen(true);
    } else {
      setSelectedBomsForPO([]);
      setCreatePODialogOpen(true);
    }
  }, [activeTab, filteredPendingBoms]);

  const handlePOCreated = useCallback(() => {
    setCreatePODialogOpen(false);
    setSelectedBomsForPO([]);
    refreshAll();
  }, [refreshAll]);

  // BOM Row Component for pending tab
  const BomRow = memo(function BomRow({ 
    bom, 
    onView 
  }: {
    bom: BomRecord;
    onView: (id: string) => void;
  }) {
    const totalRemaining = bom.remainingItems?.reduce((sum, item) => sum + item.remaining_qty, 0) || 0;
    const remainingCount = bom.remainingItems?.length || 0;
    
    return (
      <TableRow>
        <TableCell className="font-medium">{bom.bom_number || 'N/A'}</TableCell>
        <TableCell>{bom.product_name || 'N/A'}</TableCell>
        <TableCell>{bom.order?.order_number || 'N/A'}</TableCell>
        <TableCell>{bom.order?.customer?.company_name || 'N/A'}</TableCell>
        <TableCell>
          <ItemImage 
            src={bom.product_image_url} 
            alt="product" 
            className="w-12 h-12 object-cover rounded"
          />
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="font-medium">{totalRemaining.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Remaining</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="font-medium">{remainingCount} items</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onView(bom.id)}>
              <Eye className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Create and manage purchase orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={handleCreatePO}>
            <Plus className="w-4 h-4 mr-2" /> Create PO
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <Input 
                placeholder="Search..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({filteredPendingBoms.length})</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress ({filteredInProgressPOs.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({filteredCompletedPOs.length})</TabsTrigger>
        </TabsList>

        {/* Pending Tab - BOMs without PO */}
        <TabsContent value="pending">
      <Card>
        <CardHeader>
              <CardTitle>Pending BOMs - No PO Created ({filteredPendingBoms.length})</CardTitle>
        </CardHeader>
        <CardContent>
              {pendingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>BOM Number</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>Remaining Qty</TableHead>
                        <TableHead>Pending Items</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPendingBoms.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No pending BOMs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPendingBoms.map((bom) => (
                          <BomRow
                            key={bom.id}
                            bom={bom}
                            onView={(id) => navigate(`/bom/${id}`)}
                          />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* In Progress Tab - POs without GRN */}
        <TabsContent value="in_progress">
          <Card>
            <CardHeader>
              <CardTitle>In Progress - PO Created, No GRN ({filteredInProgressPOs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {inProgressLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Item Details</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                      {filteredInProgressPOs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No in progress POs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInProgressPOs.map((po) => {
                          const sup = inProgressSuppliers[po.supplier_id];
                          const img = inProgressFirstImageByPoId[po.id];
                          const totalQty = inProgressTotalQuantityByPoId[po.id];
                          const items = inProgressItemsByPoId[po.id] || [];
                    return (
                      <PurchaseOrderRow
                        key={po.id}
                        po={po}
                        supplier={sup}
                        imageUrl={img}
                        totalQuantity={totalQty}
                        items={items}
                        onView={handleView}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    );
                        })
                      )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* Completed Tab - POs with GRN */}
        <TabsContent value="completed">
      <Card>
        <CardHeader>
              <CardTitle>Completed - GRN Created ({filteredCompletedPOs.length})</CardTitle>
        </CardHeader>
        <CardContent>
              {completedLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Item Details</TableHead>
                    <TableHead>Total Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                      {filteredCompletedPOs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No completed POs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCompletedPOs.map((po) => {
                          const sup = completedSuppliers[po.supplier_id];
                          const img = completedFirstImageByPoId[po.id];
                          const totalQty = completedTotalQuantityByPoId[po.id];
                          const items = completedItemsByPoId[po.id] || [];
                    return (
                      <PurchaseOrderRow
                        key={po.id}
                        po={po}
                        supplier={sup}
                        imageUrl={img}
                        totalQuantity={totalQty}
                        items={items}
                        onView={handleView}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    );
                        })
                      )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Create PO Dialog */}
      <PurchaseOrderFormDialog
        open={createPODialogOpen}
        onOpenChange={setCreatePODialogOpen}
        boms={selectedBomsForPO}
        onPOCreated={handlePOCreated}
      />
    </div>
  );
});

export { PurchaseOrderList };


