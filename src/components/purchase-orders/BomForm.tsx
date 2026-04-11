import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, ArrowLeft, X, FileText } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ErpLayout } from '@/components/ErpLayout';
import { useFormData } from '@/contexts/FormPersistenceContext';
import {
  sortOrderLines,
  bomNumberForOrderLine,
  BOM_ORDER_ITEMS_SELECT,
  orderLineFabricFromOrder,
  orderLineFabricColorGsmSuffix,
  orderLineBomProductColumnLabel,
  orderLineProductDropdownOnly,
  getBomLinePoQuantity,
} from './bomOrderLineUtils';
import {
  type FabricMasterPickerRow,
  uniqueFabricNameBases,
  dedupedColorVariants,
  gsmValuesForNameAndColor,
  findFabricVariantRow,
  deriveBaseFabricIdFromVariantId,
  baseFabricIdForFabricName,
} from '@/utils/fabricMasterPicker';
import './BomLinePicker.css';

type Customer = { 
  id: string; 
  company_name: string; 
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
};

type CompanySettings = {
  company_name: string;
  logo_url: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
};

type BomLineItem = {
  id?: string;
  item_type: 'fabric' | 'item' | 'product' | 'Zipper' | 'Drawcord' | 'Laces' | string;
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
  unit_of_measure?: string;
  notes?: string;
  attributes?: Record<string, any> | null;
  fabricSelections?: { color: string; gsm: string; quantity: number }[];
  itemSelections?: { id: string; label: string; image_url?: string | null; quantity: number; price: number }[];
  item_category?: string | null;
  // BOM specific fields
  qty_per_product: number;
  qty_total: number;
  stock: number;
  to_order: number;
  // For item type selection
  selected_item_type?: string;
  // Fabric specific fields for display
  fabric_name?: string;
  fabric_for_supplier?: string | null;
  fabric_color?: string;
  fabric_gsm?: string;
  // Mark if fabric is pre-filled from order
  is_prefilled?: boolean;
  /** Order-form “Product” row id (one base variant per fabric_name); in-memory only */
  fabric_base_id?: string;
  // New item_master fields
  item_code?: string;
  description?: string;
  size?: string;
  color?: string;
  material?: string;
  weight?: number;
  brand?: string;
  current_stock?: number;
  min_stock_level?: number;
  lead_time?: number;
  cost_price?: number;
  gst_rate?: number;
};

type BomRecord = {
  id?: string;
  bom_number?: string;
  order_id?: string;
  order_item_id?: string;
  product_name: string;
  product_image_url?: string | null;
  total_order_qty: number;
  status?: 'draft' | 'active' | 'inactive';
  created_by?: string;
  created_at?: string;
};

function fallbackBomNumberNoOrder(): string {
  return `BOM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function resolveBomNumberForSave(
  orderId: string | undefined | null,
  orderItemId: string | undefined | null,
  trimmedUserInput: string | undefined | null
): Promise<string> {
  if (trimmedUserInput) return trimmedUserInput;
  if (!orderId || !orderItemId) return fallbackBomNumberNoOrder();
  const { data: ord, error: oErr } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId as any)
    .single();
  if (oErr || !ord?.order_number) return fallbackBomNumberNoOrder();
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('id, created_at')
    .eq('order_id', orderId as any)
    .order('created_at', { ascending: true });
  if (iErr || !items?.length) {
    return `BOM-${(ord as any).order_number}-P1`;
  }
  const sorted = sortOrderLines(items as any[]);
  return bomNumberForOrderLine((ord as any).order_number, sorted, orderItemId);
}

export type BomFormProps = {
  /** Render without ErpLayout; load order from props instead of URL */
  embedded?: boolean;
  embeddedOrderId?: string;
  embeddedOrderItemId?: string;
  /** After a successful save in embedded mode (e.g. refresh line BOM state) */
  onEmbeddedBomSaved?: () => void;
};

export function BomForm({
  embedded = false,
  embeddedOrderId,
  embeddedOrderItemId,
  onEmbeddedBomSaved,
}: BomFormProps = {}) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && (searchParams.get('edit') === '1' || window.location.pathname.includes('/edit'));
  const isReadOnly = !!id && !isEditMode;
  
  // Check for Order data in URL params
  const orderParam = searchParams.get('order') || searchParams.get('orderId');
  const orderItemIdParam = searchParams.get('orderItemId') || undefined;
  const [orderData, setOrderData] = useState<any>(null);
  const [orderFabricData, setOrderFabricData] = useState<any>(null);
  /** True when order has multiple lines and URL has no orderItemId — user must pick a line */
  const [needsOrderLineChoice, setNeedsOrderLineChoice] = useState(false);

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const bomFormInitial = useMemo(
    () =>
      ({
        product_name: '',
        total_order_qty: 0,
        status: 'draft' as const,
      }) satisfies BomRecord,
    []
  );
  const formPersistenceKey =
    embedded && embeddedOrderId && embeddedOrderItemId
      ? `bomForm-embed-${embeddedOrderId}-${embeddedOrderItemId}`
      : 'bomForm';
  const { data: bom, updateData: setBom, resetData: resetBomData, isLoaded: isBomLoaded, hasSavedData: hasBomData } =
    useFormData<BomRecord>(formPersistenceKey, bomFormInitial);
  const [items, setItems] = useState<BomLineItem[]>([]);

  // Clear BOM ID when creating a new BOM (not editing and not from order)
  useEffect(() => {
    if (!isEditMode && !isReadOnly && !orderParam && !embedded && bom.id) {
      console.log('Clearing BOM ID for new BOM creation (no order param)');
      setBom(prev => ({ ...prev, id: undefined }));
    }
  }, [isEditMode, isReadOnly, orderParam, embedded, bom.id, setBom]);

  // Clear all form data when creating a new BOM (not editing and not from order)
  useEffect(() => {
    if (!isEditMode && !isReadOnly && !id && !orderParam && !embedded) {
      console.log('Clearing all form data for new BOM creation (no order param)');
      resetBomData();
    }
  }, [isEditMode, isReadOnly, id, orderParam, embedded, resetBomData]);
  
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<
    {
      id: string;
      label: string;
      image_url?: string | null;
      image?: string | null;
      color?: string;
      gsm?: string;
      rate?: number;
      fabric_for_supplier?: string | null;
      status?: string | null;
      hex?: string | null;
    }[]
  >([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; type?: string; gst_rate?: number; uom?: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  
  // Fabric selection state for new fabrics
  const [fabricSelectionState, setFabricSelectionState] = useState<{
    [key: number]: {
      selectedFabricName?: string;
      selectedColor?: string;
      availableColors?: string[];
      availableGsm?: string[];
    }
  }>({});
  
  // Caching for performance
  const attributesCache = useRef<Map<string, any>>(new Map());

  // Get unique item types from item_master
  const itemTypes = useMemo(() => {
    const types = new Set<string>();
    itemOptions.forEach(item => {
      if (item.type) {
        types.add(item.type);
      }
    });
    const result = Array.from(types).sort();
    console.log('Available item types:', result);
    console.log('Item options:', itemOptions);
    
    // If no item types found, provide some default types for testing
    if (result.length === 0) {
      console.log('No item types found, providing default types');
      return ['Zipper', 'Drawcord', 'Laces', 'Button', 'Thread', 'Label', 'Packaging'];
    }
    
    return result;
  }, [itemOptions]);

  // Get filtered items based on selected item type
  const getFilteredItems = useCallback((selectedItemType: string) => {
    const filtered = itemOptions.filter(item => item.type === selectedItemType);
    console.log(`Filtered items for type "${selectedItemType}":`, filtered);
    console.log('Available itemOptions:', itemOptions);
    
    // If no items found for this type, provide sample items for testing
    if (filtered.length === 0) {
      console.log(`No items found for type "${selectedItemType}", providing sample items`);
      const sampleItems = {
        'Zipper': [
          { id: 'zip1', label: 'YKK-8IN-Metal-BR', type: 'Zipper', uom: 'PCS', gst_rate: 18 },
          { id: 'zip2', label: 'YKK-6IN-Metal-SL', type: 'Zipper', uom: 'PCS', gst_rate: 18 },
          { id: 'zip3', label: 'YKK-10IN-Metal-BK', type: 'Zipper', uom: 'PCS', gst_rate: 18 }
        ],
        'Drawcord': [
          { id: 'dc1', label: 'Cotton-Drawcord-White', type: 'Drawcord', uom: 'MTR', gst_rate: 18 },
          { id: 'dc2', label: 'Cotton-Drawcord-Black', type: 'Drawcord', uom: 'MTR', gst_rate: 18 }
        ],
        'Laces': [
          { id: 'lace1', label: 'Shoe-Lace-White', type: 'Laces', uom: 'PCS', gst_rate: 18 },
          { id: 'lace2', label: 'Shoe-Lace-Black', type: 'Laces', uom: 'PCS', gst_rate: 18 }
        ],
        'Button': [
          { id: 'btn1', label: 'Plastic-Button-White', type: 'Button', uom: 'PCS', gst_rate: 18 },
          { id: 'btn2', label: 'Metal-Button-Gold', type: 'Button', uom: 'PCS', gst_rate: 18 }
        ],
        'Thread': [
          { id: 'thr1', label: 'Polyester-Thread-White', type: 'Thread', uom: 'SPOOL', gst_rate: 18 },
          { id: 'thr2', label: 'Cotton-Thread-Black', type: 'Thread', uom: 'SPOOL', gst_rate: 18 }
        ],
        'Label': [
          { id: 'lbl1', label: 'Woven-Label-Cotton', type: 'Label', uom: 'PCS', gst_rate: 18 },
          { id: 'lbl2', label: 'Printed-Label-Polyester', type: 'Label', uom: 'PCS', gst_rate: 18 }
        ],
        'Packaging': [
          { id: 'pkg1', label: 'Poly-Bag-Small', type: 'Packaging', uom: 'PCS', gst_rate: 18 },
          { id: 'pkg2', label: 'Cardboard-Box-Medium', type: 'Packaging', uom: 'PCS', gst_rate: 18 }
        ],
        // Add mappings for the actual item types from your database
        'Finished Good': [
          { id: 'fg1', label: 'Sample-Finished-Good-1', type: 'Finished Good', uom: 'PCS', gst_rate: 18 },
          { id: 'fg2', label: 'Sample-Finished-Good-2', type: 'Finished Good', uom: 'PCS', gst_rate: 18 }
        ],
        'Laces & Drawcords': [
          { id: 'ld1', label: 'Sample-Lace-1', type: 'Laces & Drawcords', uom: 'MTR', gst_rate: 18 },
          { id: 'ld2', label: 'Sample-Drawcord-1', type: 'Laces & Drawcords', uom: 'MTR', gst_rate: 18 }
        ],
        'Neck Type': [
          { id: 'nt1', label: 'Sample-Neck-Type-1', type: 'Neck Type', uom: 'PCS', gst_rate: 18 },
          { id: 'nt2', label: 'Sample-Neck-Type-2', type: 'Neck Type', uom: 'PCS', gst_rate: 18 }
        ],
        'ZIPPER': [
          { id: 'zip1', label: 'Sample-Zipper-1', type: 'ZIPPER', uom: 'PCS', gst_rate: 18 },
          { id: 'zip2', label: 'Sample-Zipper-2', type: 'ZIPPER', uom: 'PCS', gst_rate: 18 }
        ]
      };
      
      return sampleItems[selectedItemType as keyof typeof sampleItems] || [];
    }
    
    return filtered;
  }, [itemOptions]);

  const fabricPickerRows: FabricMasterPickerRow[] = useMemo(
    () =>
      fabricOptions.map((f) => ({
        id: f.id,
        fabric_name: f.label,
        color: f.color,
        gsm: f.gsm,
        hex: f.hex,
        status: f.status,
        fabric_for_supplier: f.fabric_for_supplier,
        image: f.image,
        image_url: f.image_url,
        rate: f.rate,
      })),
    [fabricOptions]
  );

  const fabricNameBaseOptions = useMemo(
    () => uniqueFabricNameBases(fabricPickerRows),
    [fabricPickerRows]
  );

  useEffect(() => {
    if (fabricPickerRows.length === 0) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        if (it.item_type !== 'fabric' || it.is_prefilled) return it;
        if (it.fabric_base_id || !it.item_id) return it;
        const base = deriveBaseFabricIdFromVariantId(fabricPickerRows, it.item_id);
        if (!base) return it;
        changed = true;
        return { ...it, fabric_base_id: base };
      });
      return changed ? next : prev;
    });
  }, [fabricPickerRows]);

  /** Fabric table “Product” column: same as “Fabric on order” minus color/GSM. */
  const fabricRowsProductLabel = useMemo(() => {
    if (orderData?.order_items && bom.order_item_id) {
      const line = (orderData.order_items as any[]).find((i: any) => i.id === bom.order_item_id);
      if (line) {
        const v = orderLineBomProductColumnLabel(line);
        return v || '—';
      }
    }
    return '—';
  }, [orderData, bom.order_item_id]);

  useEffect(() => {
    fetchCustomers();
    fetchCompanySettings();
    fetchFabrics();
    fetchItems();
    fetchProducts();
    
    if (id) fetchExisting();
    
    // Process Order data if present
    if (orderParam && !id) {
      const processOrderData = async () => {
        try {
          const decodedOrderData = JSON.parse(decodeURIComponent(orderParam));
          setOrderData(decodedOrderData);
          setNeedsOrderLineChoice(false);

          if (decodedOrderData.order_item) {
            console.log('Setting BOM data from decoded order data:', decodedOrderData);
            const resolvedItemId =
              orderItemIdParam ||
              decodedOrderData.order_item_id ||
              decodedOrderData.order_item.id;
            let productImageUrl = null;
            if (decodedOrderData.order_item.fabric_id) {
              try {
                const { data: fabric } = await supabase
                  .from('fabric_master')
                  .select('image, fabric_for_supplier')
                  .eq('id', decodedOrderData.order_item.fabric_id)
                  .single();
                productImageUrl = fabric?.image || null;
              } catch (e) {
                console.warn('Failed to fetch fabric image:', e);
              }
            }

            const oid = decodedOrderData.order_id as string;
            const onum = decodedOrderData.order_number as string | undefined;
            const itemsArr = Array.isArray(decodedOrderData.order_items)
              ? sortOrderLines(decodedOrderData.order_items)
              : [];
            const suggested =
              onum && resolvedItemId && itemsArr.length
                ? bomNumberForOrderLine(onum, itemsArr, resolvedItemId)
                : onum && resolvedItemId
                  ? `BOM-${onum}-P1`
                  : fallbackBomNumberNoOrder();
            setBom(prev => ({
              ...prev,
              order_id: oid,
              order_item_id: resolvedItemId,
              product_name:
                orderLineBomProductColumnLabel(decodedOrderData.order_item) ||
                orderLineProductDropdownOnly(decodedOrderData.order_item) ||
                '',
              product_image_url: productImageUrl,
              total_order_qty: decodedOrderData.order_item.quantity || 0,
              bom_number: prev.bom_number?.trim() ? prev.bom_number : suggested,
            }));
          }
        } catch {
          console.log('Order param is not JSON, treating as order ID:', orderParam);
          await fetchOrderData(orderParam, orderItemIdParam ?? null);
        }
      };

      processOrderData();
    }
  }, [id, orderParam, orderItemIdParam]);

  useEffect(() => {
    if (!embedded || !embeddedOrderId || id) return;
    fetchOrderData(embeddedOrderId, embeddedOrderItemId ?? null);
  }, [embedded, embeddedOrderId, embeddedOrderItemId, id]);

  // Auto-add fabric items when order fabric data is available
  useEffect(() => {
    if (orderFabricData && orderFabricData.length > 0 && items.length === 0) {
      const fabricItems: BomLineItem[] = orderFabricData.map((fabricItem: any, index: number) => ({
        id: `order-fabric-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, // Generate unique ID
        item_type: 'fabric',
        item_id: fabricItem.fabric_id || '',
        item_name: fabricItem.fabric?.fabric_name || '',
        quantity: fabricItem.quantity || 0,
        qty_per_product: 0, // Reset to 0 for pre-filled fabric
        qty_total: fabricItem.quantity || 0,
        stock: 0,
        to_order: fabricItem.quantity || 0,
        unit_of_measure: 'Kgs',
        fabricSelections: [{
          color: fabricItem.color || fabricItem.fabric?.color || '',
          gsm: fabricItem.gsm || fabricItem.fabric?.gsm || '',
          quantity: fabricItem.quantity || 0
        }],
        item_image_url: fabricItem.fabric?.image_url || fabricItem.fabric?.image || null,
        // Add fabric details for display
        fabric_name: fabricItem.fabric?.fabric_name || '',
        fabric_for_supplier: fabricItem.fabric?.fabric_for_supplier || null,
        fabric_color: fabricItem.color || fabricItem.fabric?.color || '',
        fabric_gsm: fabricItem.gsm || fabricItem.fabric?.gsm || '',
        // Mark as pre-filled from order
        is_prefilled: true
      }));
      
      setItems(fabricItems);
      toast.success('Fabric auto-selected from order');
    }
  }, [orderFabricData, items.length]);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('company_name');
    
    if (error) {
      console.error('Error fetching customers:', error);
    }
    
    setCustomers((data as any) || []);
  };

  const fetchCompanySettings = async () => {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .single();
    
    if (error) {
      console.error('Error fetching company settings:', error);
    }
    
    setCompanySettings(data as any);
  };

  const fetchFabrics = async () => {
    // Paginate like OrderForm — Supabase caps each request (~1000 rows); a single query omits the rest.
    const fetchAllFabricRows = async () => {
      const columns =
        'id, fabric_name, color, gsm, rate, image, fabric_for_supplier, status, hex';
      let all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error, count } = await supabase
          .from('fabric_master')
          .select(columns, { count: 'exact' })
          .order('fabric_name')
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('Error fetching fabrics:', error);
          return all;
        }

        if (data?.length) {
          all = [...all, ...data];
        }

        if (count != null) {
          if (all.length >= count) hasMore = false;
          else from += pageSize;
        } else {
          if (!data || data.length < pageSize) hasMore = false;
          else from += pageSize;
        }
      }

      return all;
    };

    try {
      const data = await fetchAllFabricRows();
      setFabricOptions(
        (data || []).map((f: any) => ({
          id: f.id,
          label: f.fabric_name,
          fabric_for_supplier: f.fabric_for_supplier || null,
          image_url: f.image_url || f.image || null,
          image: f.image || null,
          color: f.color,
          gsm: f.gsm,
          rate: f.rate,
          status:
            f.status != null && String(f.status).trim() !== '' ? f.status : 'active',
          hex: f.hex ?? null,
        }))
      );
    } catch (e) {
      console.error('fetchFabrics failed:', e);
      setFabricOptions([]);
    }
  };

  const fetchItems = async () => {
    try {
      // Use the new item_master schema with correct column names
      const { data, error } = await supabase
        .from('item_master')
        .select('id, item_code, item_name, item_type, description, uom, size, color, material, weight, brand, current_stock, min_stock_level, lead_time, cost_price, gst_rate, image, image_url, is_active')
        .eq('is_active', true as any)
        .order('item_name');
      
      if (error) {
        console.error('Error fetching items:', error);
          setItemOptions([]);
        return;
      }
      
      console.log('Raw item data:', data);
      
      const mappedItems = (data || []).map((item: any) => ({ 
        id: item.id, 
        label: item.item_name || 'Unknown Item', 
        image_url: item.image_url || item.image || null,
        image: item.image || null,
        type: item.item_type || 'General',
        gst_rate: item.gst_rate || 18,
        uom: item.uom || 'PCS',
        item_code: item.item_code,
        description: item.description,
        size: item.size,
        color: item.color,
        material: item.material,
        weight: item.weight,
        brand: item.brand,
        current_stock: item.current_stock || 0,
        min_stock_level: item.min_stock_level,
        lead_time: item.lead_time,
        cost_price: item.cost_price
      }));
      
      console.log('Mapped item options:', mappedItems);
      setItemOptions(mappedItems);
    } catch (err) {
      console.error('Exception in fetchItems:', err);
      setItemOptions([]);
    }
  };

  const fetchProducts = async () => {
    try {
      // Try different table names and column combinations
      let data = null;
      let error = null;

      // First try product_master with both possible column names
      const result1 = await supabase
        .from('product_master')
        .select('id, name, product_name, image_url')
        .order('name');
      
      if (result1.error) {
        console.log('product_master failed, trying products table...');
        // Try products table as fallback - without image_url column
        const result2 = await supabase
          .from('products')
          .select('id, name')
          .order('name');
        
        if (result2.error) {
          console.error('All product queries failed:', result2.error);
          setProductOptions([]);
          return;
        } else {
          data = result2.data;
        }
      } else {
        data = result1.data;
      }
      
      console.log('Raw product data:', data);
      setProductOptions((data || []).map((p: any) => ({ 
        id: p.id, 
        label: p.product_name || p.name || 'Unknown Product', 
        image_url: p.image_url || null 
      })));
    } catch (err) {
      console.error('Exception in fetchProducts:', err);
      setProductOptions([]);
    }
  };

  const fetchOrderData = async (orderId: string, explicitOrderItemId?: string | null) => {
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(
          `
          *,
          customer:customers(company_name),
          order_items(${BOM_ORDER_ITEMS_SELECT})
        `
        )
        .eq('id', orderId as any)
        .single();

      if (orderError) throw orderError;

      setOrderData(order as any);
      const linesRaw: any[] = (order as any)?.order_items || [];
      const lines = sortOrderLines(linesRaw);

      const resolvedLineId =
        explicitOrderItemId ||
        (lines.length === 1 ? lines[0].id : null);

      if (lines.length > 1 && !resolvedLineId) {
        setNeedsOrderLineChoice(true);
        setOrderFabricData(null);
        setItems([]);
        setBom(prev => ({
          ...prev,
          order_id: (order as any).id,
          order_item_id: undefined,
          product_name: '',
          product_image_url: undefined,
          total_order_qty: 0,
        }));
        return;
      }

      setNeedsOrderLineChoice(false);

      if (lines.length === 0) {
        setOrderFabricData(null);
        return;
      }

      let line: any;
      if (resolvedLineId) {
        line = lines.find((it: any) => it.id === resolvedLineId);
        if (!line) {
          toast.error('Selected order line was not found on this order.');
          if (lines.length > 1) {
            setNeedsOrderLineChoice(true);
            setOrderFabricData(null);
            setItems([]);
            setBom(prev => ({
              ...prev,
              order_id: (order as any).id,
              order_item_id: undefined,
              product_name: '',
              product_image_url: undefined,
              total_order_qty: 0,
            }));
          }
          return;
        }
      } else {
        line = lines[0];
      }

      setItems([]);

      const fabricItems = line.fabric_id ? [line] : [];
      if (fabricItems.length > 0) {
        const fabricIds = fabricItems.map((item: any) => item.fabric_id).filter(Boolean);
        if (fabricIds.length > 0) {
          const { data: fabrics, error: fabricError } = await supabase
            .from('fabric_master')
            .select('id, fabric_name, color, gsm, rate, image, fabric_for_supplier')
            .in('id', fabricIds);

          if (!fabricError && fabrics) {
            const enrichedFabricItems = fabricItems.map((item: any) => {
              const fabric = fabrics.find((f: any) => f.id === item.fabric_id);
              return { ...item, fabric };
            });
            setOrderFabricData(enrichedFabricItems);
          } else {
            setOrderFabricData(fabricItems);
          }
        } else {
          setOrderFabricData(null);
        }
      } else {
        setOrderFabricData(null);
      }

      let productImageUrl: string | null = null;
      if (line.fabric_id) {
        try {
          const { data: fabric, error: fabricErr } = await supabase
            .from('fabric_master')
            .select('image')
            .eq('id', line.fabric_id)
            .single();
          if (!fabricErr && fabric?.image) {
            productImageUrl = fabric.image;
          }
        } catch (e) {
          console.warn('Failed to fetch fabric image:', e);
        }
      }

      const lineQty = Number(line.quantity) || 0;
      console.log('Setting BOM from single order line:', {
        orderId: (order as any).id,
        order_item_id: line.id,
        lineQty,
        product: orderLineBomProductColumnLabel(line) || orderLineProductDropdownOnly(line),
      });

      const oid = (order as any).id as string;
      const orderNumber = (order as any).order_number as string;
      const suggestedNumber =
        orderNumber && line.id ? bomNumberForOrderLine(orderNumber, lines, line.id) : fallbackBomNumberNoOrder();
      setBom(prev => ({
        ...prev,
        order_id: oid,
        order_item_id: line.id,
        product_name: orderLineBomProductColumnLabel(line) || orderLineProductDropdownOnly(line),
        product_image_url: productImageUrl,
        total_order_qty: lineQty,
        bom_number: prev.bom_number?.trim() ? prev.bom_number : suggestedNumber,
      }));
    } catch (error) {
      console.error('Error fetching order data:', error);
      toast.error('Failed to load order data');
    }
  };

  /** Load order + enriched lines for the grey “from order” panel (edit/read-only BOM without re-running fetchOrderData). */
  const loadOrderLinkedOrderData = async (orderId: string) => {
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          customer:customers(company_name),
          order_items(${BOM_ORDER_ITEMS_SELECT})
        `
        )
        .eq('id', orderId as any)
        .single();
      if (!error && order) setOrderData(order as any);
    } catch (e) {
      console.warn('Could not load linked order for BOM context', e);
    }
  };

  const fetchExisting = async () => {
    if (!id) return;
    
    console.log('Fetching existing BOM for edit mode, ID:', id);
    
    try {
      setLoading(true);
      
      // Fetch BOM record - try different table names
      let bomData = null;
      let bomError = null;
      
      const result1 = await supabase
        .from('bom_records')
        .select('*')
        .eq('id', id as any)
        .single();
      
      if (result1.error) {
        console.log('bom_records failed, trying bills_of_materials...');
        const result2 = await supabase
          .from('bills_of_materials')
          .select('*')
          .eq('id', id as any)
          .single();
        
        if (result2.error) {
          bomError = result2.error;
        } else {
          bomData = result2.data;
        }
      } else {
        bomData = result1.data;
      }
      
      if (bomError) throw bomError;
      
      setBom(bomData);
      
      // Fetch BOM items - try different table names
      let itemsData = null;
      let itemsError = null;
      
      const itemsResult1 = await supabase
        .from('bom_record_items')
        .select('*')
        .eq('bom_id', id as any);
      
      if (itemsResult1.error) {
        console.log('bom_record_items failed, trying bom_items...');
        const itemsResult2 = await supabase
          .from('bom_items')
          .select('*')
          .eq('bom_id', id as any);
        
        if (itemsResult2.error) {
          console.log('bom_items failed, trying bill_of_materials_items...');
          const itemsResult3 = await supabase
            .from('bill_of_materials_items')
            .select('*')
            .eq('bom_id', id as any);
          
          if (itemsResult3.error) {
            console.error('All BOM items table attempts failed:', itemsResult3.error);
            itemsError = itemsResult3.error;
          } else {
            itemsData = itemsResult3.data;
            console.log('Successfully fetched from bill_of_materials_items');
          }
        } else {
          itemsData = itemsResult2.data;
          console.log('Successfully fetched from bom_items (fallback)');
        }
      } else {
        itemsData = itemsResult1.data;
        console.log('Successfully fetched from bom_record_items');
      }
        
      if (itemsError) throw itemsError;
      
      // Convert BOM items to line items format
      console.log('Raw items data from database:', itemsData);
      console.log('Items data length:', itemsData?.length || 0);
      
      const lineItems = await Promise.all((itemsData || []).map(async (item: any) => {
        console.log('Processing item:', item);
        const isFabric = item.category === 'Fabric';
        let fabricName = item.fabric_name || '';
        let fabricColor = item.fabric_color || '';
        let fabricGsm = item.fabric_gsm || '';
        
        // Parse fabric details from item_name if not stored separately or if they are empty
        if (isFabric && item.item_name && (!fabricName || !fabricColor || !fabricGsm)) {
          console.log('Parsing fabric from item_name:', item.item_name);
          const fabricMatch = item.item_name.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$/i);
          if (fabricMatch) {
            fabricName = fabricMatch[1].trim();
            fabricColor = fabricMatch[2].trim();
            fabricGsm = fabricMatch[3].trim();
            console.log('Parsed fabric details:', { fabricName, fabricColor, fabricGsm });
          } else {
            console.log('No fabric pattern match found in:', item.item_name);
            // If no pattern match, try to extract at least the fabric name
            if (!fabricName) {
              fabricName = item.item_name.split(' - ')[0] || item.item_name;
              console.log('Using first part as fabric name:', fabricName);
            }
          }
        }
        
        // Always fetch fresh image from master tables, ignore stored item_image_url (may be mockup)
        let itemImageUrl = null;
        let fabricForSupplier = null;
        if (isFabric && item.item_id) {
          // Fetch fabric image and fabric_for_supplier from fabric_master
          try {
            const { data: fabric } = await supabase
              .from('fabric_master')
              .select('image, fabric_for_supplier')
              .eq('id', item.item_id)
              .single();
            itemImageUrl = fabric?.image || null;
            fabricForSupplier = fabric?.fabric_for_supplier || null;
          } catch (error) {
            console.warn('Failed to fetch fabric image:', error);
          }
        } else if (!isFabric && item.item_id) {
          // Fetch item image from item_master
          try {
            const { data: itemData } = await supabase
              .from('item_master')
              .select('image_url, image')
              .eq('id', item.item_id)
              .single();
            itemImageUrl = itemData?.image_url || itemData?.image || null;
          } catch (error) {
            console.warn('Failed to fetch item image:', error);
          }
        }
        
        const lineItem = {
           id: item.id,
           item_type: isFabric ? 'fabric' : 'item',
           item_id: item.item_id || '',
           item_name: item.item_name,
           quantity: item.qty_total,
           unit_of_measure: item.unit_of_measure,
           qty_per_product: item.qty_per_product,
           qty_total: item.qty_total,
           stock: item.stock,
           to_order: item.to_order,
            item_category: isFabric ? 'Fabric' : item.item_type || item.category || 'Item',
            selected_item_type: isFabric ? 'fabric' : (item.item_type || item.category || ''),
           // Preserve fabric details for editing
           fabric_name: fabricName,
           fabric_for_supplier: fabricForSupplier,
           fabric_color: fabricColor,
           fabric_gsm: fabricGsm,
           // Mark as prefilled in edit mode
           is_prefilled: isEditMode && isFabric,
           item_image_url: itemImageUrl // Use fresh image from master tables, not stored value
        };
        
        console.log('Created line item:', lineItem);
        return lineItem;
      }));
      
      console.log('Final line items array:', lineItems);
      console.log('Line items length:', lineItems.length);
      setItems(lineItems);
      
      // Fetch fabric images for fabric items in edit mode
      if (isEditMode) {
        const fabricItems = lineItems.filter(item => item.item_type === 'fabric');
        
        // Fetch fabric images from fabric master
        for (const item of fabricItems) {
          if (item.fabric_name) {
            try {
              // Try exact match first
              let fabricData = null;
              let fabricError = null;
              
              const exactResult = await supabase
                .from('fabric_master')
                .select('image, image_url')
                .eq('fabric_name', item.fabric_name)
                .eq('color', item.fabric_color || '')
                .eq('gsm', item.fabric_gsm || '')
                .single();
              
              if (exactResult.error) {
                // Try partial match - just name
                console.log('Exact match failed, trying name-only match for:', item.fabric_name);
                const partialResult = await supabase
                  .from('fabric_master')
                  .select('image, image_url')
                  .eq('fabric_name', item.fabric_name)
                  .single();
                
                if (partialResult.error) {
                  fabricError = partialResult.error;
                } else {
                  fabricData = partialResult.data;
                }
              } else {
                fabricData = exactResult.data;
              }
              
              const resolvedImage = fabricData?.image_url || fabricData?.image || null;

              if (resolvedImage) {
                // Update the item with the fabric image URL
                setItems(prevItems => 
                  prevItems.map(prevItem => 
                    prevItem.id === item.id 
                      ? { ...prevItem, item_image_url: resolvedImage }
                      : prevItem
                  )
                );
                console.log('Found fabric image for:', item.fabric_name, resolvedImage);
              } else {
                // Try to find image from loaded fabric options as fallback
                const fabricFromOptions = fabricOptions.find(fabric => 
                  fabric.label.toLowerCase().includes(item.fabric_name.toLowerCase())
                );
                
            if (fabricFromOptions?.image_url || (fabricFromOptions as any)?.image) {
                  setItems(prevItems => 
                    prevItems.map(prevItem => 
                      prevItem.id === item.id 
                    ? { ...prevItem, item_image_url: fabricFromOptions.image_url || (fabricFromOptions as any).image || null }
                        : prevItem
                    )
                  );
              console.log('Found fabric image from options for:', item.fabric_name, fabricFromOptions.image_url || (fabricFromOptions as any).image);
                } else {
                  console.log('No fabric image found for:', item.fabric_name, fabricError);
                }
              }
            } catch (error) {
              console.log('Error fetching fabric image:', error);
            }
          }
        }
        
        // Fetch item images for non-fabric items
        const itemItems = lineItems.filter(item => item.item_type === 'item' && item.item_id);
        
        for (const item of itemItems) {
          console.log('Processing item for image:', {
            item_name: item.item_name,
            item_id: item.item_id,
            item_type: item.item_type
          });
          
          if (item.item_id) {
            try {
              const { data: itemData, error: itemError } = await supabase
                .from('item_master')
                .select('image, image_url')
                .eq('id', item.item_id)
                .single();
              
              if (!itemError && (itemData?.image || itemData?.image_url)) {
                // Update the item with the image URL
                const imageUrl = itemData.image || itemData.image_url;
                setItems(prevItems => 
                  prevItems.map(prevItem => 
                    prevItem.id === item.id 
                      ? { ...prevItem, item_image_url: imageUrl }
                      : prevItem
                  )
                );
                console.log('Found item image for:', item.item_name, imageUrl);
              } else {
                console.log('Item image query failed:', {
                  item_name: item.item_name,
                  item_id: item.item_id,
                  error: itemError,
                  data: itemData
                });
                
                // Try to find image from loaded item options as fallback
                const itemFromOptions = itemOptions.find(option => 
                  option.id === item.item_id || option.label.toLowerCase().includes(item.item_name.toLowerCase())
                );
                
                if (itemFromOptions?.image_url) {
                  setItems(prevItems => 
                    prevItems.map(prevItem => 
                      prevItem.id === item.id 
                        ? { ...prevItem, item_image_url: itemFromOptions.image_url }
                        : prevItem
                    )
                  );
                  console.log('Found item image from options for:', item.item_name, itemFromOptions.image_url);
                } else {
                  console.log('No item image found for:', item.item_name, itemError);
                  console.log('Available item options:', itemOptions.map(opt => ({ id: opt.id, label: opt.label, image_url: opt.image_url })));
                }
              }
            } catch (error) {
              console.log('Error fetching item image:', error);
            }
          } else {
            console.log('Item has no item_id, cannot fetch image:', {
              item_name: item.item_name,
              item_id: item.item_id
            });
          }
        }
      }
      
      // Parse and set fabric selection state for edit mode
      if (isEditMode) {
        const fabricItems = lineItems.filter(item => item.item_type === 'fabric');
        const newFabricState: any = {};
        
        console.log('Setting up fabric selection state for edit mode');
        console.log('Fabric items found:', fabricItems);
        console.log('Total line items:', lineItems.length);
        
        fabricItems.forEach((item) => {
          // Find the actual index of this item in the full items array
          const actualIndex = lineItems.findIndex(lineItem => lineItem.id === item.id);
          if (actualIndex !== -1) {
            // Use the already parsed fabric details from lineItems
            newFabricState[actualIndex] = {
              selectedFabricName: item.fabric_name,
              selectedColor: item.fabric_color,
              selectedGsm: item.fabric_gsm,
              availableColors: [], // Will be populated when fabric is selected
              availableGsm: [] // Will be populated when color is selected
            };
            console.log(`Setting fabric state for index ${actualIndex}:`, {
              selectedFabricName: item.fabric_name,
              selectedColor: item.fabric_color,
              selectedGsm: item.fabric_gsm
            });
          }
        });
        
        console.log('Setting fabric selection state for edit mode:', newFabricState);
        console.log('Fabric items for edit mode:', fabricItems);
        console.log('Current fabricSelectionState before update:', fabricSelectionState);
        setFabricSelectionState(newFabricState);
        console.log('Fabric selection state updated');
      }
      
      if (isEditMode) {
        if (lineItems.length === 0) {
          toast.warning('BOM loaded but no items found. This may indicate a data issue.');
          console.warn('BOM loaded in edit mode but no items found');
        } else {
          toast.success('BOM loaded successfully for editing');
        }
      }

      const linkedOid = (bomData as any)?.order_id;
      if (linkedOid) {
        await loadOrderLinkedOrderData(String(linkedOid));
      }
      
    } catch (error) {
      console.error('Error fetching existing BOM:', error);
      toast.error('Failed to fetch BOM data');
    } finally {
      setLoading(false);
    }
  };

  const addItem = (type: BomLineItem['item_type']) => {
    const newItem: BomLineItem = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Generate unique temporary ID
      item_type: type,
      item_id: '',
      item_name: '',
      quantity: 0,
      qty_per_product: 0, // Set to 0 to allow decimal values
      qty_total: 0,
      stock: 0,
      to_order: 0,
      unit_of_measure: type === 'fabric' ? 'Kgs' : 'pcs',
      fabricSelections: type === 'fabric' ? [{ color: '', gsm: '', quantity: 0 }] : undefined,
      selected_item_type: ''
    };
    
    setItems(prev => [...prev, newItem]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, updates: Partial<BomLineItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  // Helper function to safely get the index of an item by its ID
  const getItemIndex = (itemId: string) => {
    return items.findIndex(item => item.id === itemId);
  };

  // Helper function to update item by ID instead of index
  const updateItemById = (itemId: string, updates: Partial<BomLineItem>) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
  };

  // Helper function to remove item by ID instead of index
  const removeItemById = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleItemSelection = (index: number, type: BomLineItem['item_type'], selectedId: string) => {
    console.log('handleItemSelection called:', { index, type, selectedId });
    console.log('Available itemOptions:', itemOptions);
    const item = items[index];
    
    let found: any = null;
    let label = '';

      if (type === 'fabric') {
      found = fabricOptions.find(f => f.id === selectedId);
      label = found?.label || '';
    } else if (type === 'item') {
      found = itemOptions.find(i => i.id === selectedId);
      label = found?.label || '';
      console.log('Found item:', found);
      console.log('Selected ID:', selectedId);
      console.log('Item ID from found:', found?.id);
    } else if (type === 'product') {
      found = productOptions.find(p => p.id === selectedId);
      label = found?.label || '';
    }

    if (found) {
      const updateData: any = {
        item_id: found.id, // Use found.id instead of selectedId
        item_name: label,
        item_image_url: found.image_url || found.image || null,
      };

      // For fabrics, add fabric-specific fields
      if (type === 'fabric') {
        updateData.fabric_name = found.label;
        updateData.fabric_color = found.color || '';
        updateData.fabric_gsm = found.gsm || '';
        updateData.item_category = 'Fabric';
        updateData.selected_item_type = 'fabric';
      }

      // For items, add item-specific fields from new schema
      if (type === 'item') {
        updateData.item_code = found.item_code;
        updateData.description = found.description;
        updateData.size = found.size;
        updateData.color = found.color;
        updateData.material = found.material;
        updateData.weight = found.weight;
        updateData.brand = found.brand;
        updateData.current_stock = found.current_stock || 0;
        updateData.min_stock_level = found.min_stock_level;
        updateData.lead_time = found.lead_time;
        updateData.cost_price = found.cost_price;
        updateData.gst_rate = found.gst_rate;
        updateData.unit_of_measure = found.uom || 'PCS';
        updateData.item_category = found.type;
        updateData.selected_item_type = found.type || 'item';
      }

      updateItem(index, updateData);
    }
  };

  const handleBomFabricBaseSelect = useCallback(
    (itemRowId: string, baseId: string) => {
      const base = fabricOptions.find((f) => f.id === baseId);
      if (!base) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemRowId && it.item_type === 'fabric'
            ? {
                ...it,
                fabric_base_id: baseId,
                fabric_name: base.label,
                fabric_for_supplier: base.fabric_for_supplier ?? null,
                fabric_color: '',
                fabric_gsm: '',
                item_id: '',
                item_image_url: null,
                item_name: '',
              }
            : it
        )
      );
    },
    [fabricOptions]
  );

  const handleBomFabricColorVariantSelect = useCallback(
    (itemRowId: string, variantId: string) => {
      const row = fabricOptions.find((f) => f.id === variantId);
      if (!row) return;
      const baseId =
        baseFabricIdForFabricName(fabricPickerRows, row.label) ||
        deriveBaseFabricIdFromVariantId(fabricPickerRows, variantId);
      const img = row.image_url || row.image || null;
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemRowId && it.item_type === 'fabric'
            ? {
                ...it,
                fabric_base_id: baseId || it.fabric_base_id,
                fabric_name: row.label,
                fabric_color: row.color || '',
                fabric_gsm: row.gsm || '',
                fabric_for_supplier: row.fabric_for_supplier ?? null,
                item_id: variantId,
                item_image_url: img,
                item_name: '',
              }
            : it
        )
      );
    },
    [fabricOptions, fabricPickerRows]
  );

  const handleBomFabricGsmInputChange = useCallback(
    (itemRowId: string, gsmRaw: string) => {
      const gsm = gsmRaw.trim();
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemRowId || it.item_type !== 'fabric') return it;
          const name = it.fabric_name || '';
          const color = it.fabric_color || '';
          if (!name || !color) {
            return { ...it, fabric_gsm: gsm, item_name: '' };
          }
          const match = findFabricVariantRow(fabricPickerRows, name, color, gsm);
          if (match) {
            const img = match.image_url || match.image || null;
            return {
              ...it,
              fabric_gsm: match.gsm || gsm,
              item_id: match.id,
              fabric_for_supplier: match.fabric_for_supplier ?? it.fabric_for_supplier,
              item_image_url: img,
              item_name: '',
            };
          }
          return { ...it, fabric_gsm: gsm, item_id: '', item_name: '' };
        })
      );
    },
    [fabricPickerRows]
  );

  // Helper function to calculate qty_total based on item type
  const calculateQtyTotal = (item: BomLineItem, totalOrderQty: number): number => {
    if (item.item_type === 'fabric') {
      // For fabric: division calculation (total_order_qty ÷ pcs_in_1_unit)
      if (!item.qty_per_product || item.qty_per_product <= 0) {
        return 0;
      }
      return totalOrderQty / item.qty_per_product;
    } else {
      // For non-fabric: multiplication calculation (qty_per_product × total_order_qty)
      return (item.qty_per_product || 0) * totalOrderQty;
    }
  };

  // Helper function to get label text based on item type
  const getQtyLabel = (item: BomLineItem): string => {
    if (item.item_type === 'fabric') {
      const uom = item.unit_of_measure?.toLowerCase() || 'kg';
      return `Pcs in 1 ${uom}`;
    }
    return 'Qty/Pc';
  };

  // Handle Qty/Pc change with auto-reset to 1 on focus
  const handleQtyPerProductChange = (index: number, value: string) => {
    const qtyPerProduct = parseFloat(value) || 0;
    const item = items[index];
    const qtyTotal = calculateQtyTotal({ ...item, qty_per_product: qtyPerProduct }, bom.total_order_qty);
    const toOrder = Math.max(qtyTotal - (item.stock || 0), 0);
    
    updateItem(index, { 
      qty_per_product: qtyPerProduct,
      qty_total: qtyTotal,
      to_order: toOrder
    });
  };

  // Handle Qty/Pc focus - reset to 1
  const handleQtyPerProductFocus = (index: number) => {
    const item = items[index];
    // Only reset to 1 if the value is empty, 0, or undefined
    if (item.qty_per_product === undefined || item.qty_per_product === null) {
      const qtyTotal = 0 * bom.total_order_qty;
      const toOrder = Math.max(qtyTotal - (item.stock || 0), 0);
      
      updateItem(index, { 
        qty_per_product: 0,
        qty_total: qtyTotal,
        to_order: toOrder
      });
    }
  };

  // Recalculate totals when BOM total order quantity changes
  useEffect(() => {
    items.forEach((item, index) => {
      if (item.qty_per_product && bom.total_order_qty > 0) {
        const qtyTotal = calculateQtyTotal(item, bom.total_order_qty);
        const toOrder = Math.max(qtyTotal - (item.stock || 0), 0);
        
        updateItem(index, {
          qty_total: qtyTotal,
          to_order: toOrder
        });
      }
    });
  }, [bom.total_order_qty, items.length]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalItems = 0;
    let totalFabrics = 0;
    let totalToOrder = 0;

    items.forEach(item => {
      if (item.item_type === 'fabric') {
        // For fabrics, use qty_total
        totalFabrics += item.qty_total || 0;
        totalToOrder += item.to_order || 0;
      } else {
        // For items, use qty_total
        totalItems += item.qty_total || 0;
        totalToOrder += item.to_order || 0;
      }
    });

    return {
      totalItems,
      totalFabrics,
      totalToOrder,
    };
  }, [items]);

  const isSaveAndCreatePoReady = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((item) => Number(item.qty_per_product) > 0);
  }, [items]);

  const save = async (nextAction: 'view-bom' | 'create-po' = 'view-bom') => {
    if (!bom.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (items.length === 0) {
      toast.error('At least one item is required');
      return;
    }

    // Validate fabric items have qty_per_product > 0
    const invalidFabricItems = items.filter(
      item => item.item_type === 'fabric' && (!item.qty_per_product || item.qty_per_product <= 0)
    );
    if (invalidFabricItems.length > 0) {
      const uom = invalidFabricItems[0].unit_of_measure?.toLowerCase() || 'kg';
      toast.error(`Fabric items require "Pcs in 1 ${uom}" to be greater than 0`);
      return;
    }

    // Check for duplicate BOM (only for new BOMs)
    if (!bom.id) {
      try {
        if (bom.order_id && bom.order_item_id) {
          const { data: existingBoms, error: checkError } = await supabase
            .from('bom_records')
            .select('id')
            .eq('order_id', bom.order_id as any)
            .eq('order_item_id', bom.order_item_id as any);

          if (checkError) {
            console.log('Duplicate check failed, continuing with creation:', checkError);
          } else if (existingBoms && existingBoms.length > 0) {
            toast.error('A BOM already exists for this order line. Open it from View BOMs to edit.');
            return;
          }
        } else if (bom.order_id && !bom.order_item_id) {
          const { data: existingBoms, error: checkEnd } = await supabase
            .from('bom_records')
            .select('id')
            .eq('order_id', bom.order_id as any)
            .is('order_item_id', null);

          if (checkEnd) {
            console.log('Duplicate check failed, continuing with creation:', checkEnd);
          } else if (existingBoms && existingBoms.length > 0) {
            toast.error('A legacy order-level BOM already exists for this order. Edit it instead of creating another.');
            return;
          }
        } else {
          const { data: existingBoms, error: checkError } = await supabase
            .from('bom_records')
            .select('id')
            .eq('product_name', bom.product_name as any)
            .is('order_id', null);

          if (checkError) {
            console.log('Duplicate check failed, continuing with creation:', checkError);
          } else if (existingBoms && existingBoms.length > 0) {
            toast.error(`A BOM without an order link already exists for product "${bom.product_name}". Please edit the existing BOM instead.`);
            return;
          }
        }
      } catch (error) {
        console.log('Duplicate check failed, continuing with creation');
      }
    }

    try {
      setLoading(true);

      const trimmedBn =
        bom.bom_number && String(bom.bom_number).trim() ? String(bom.bom_number).trim() : null;
      const resolvedBomNumber = await resolveBomNumberForSave(
        bom.order_id,
        bom.order_item_id,
        trimmedBn
      );

      // Prepare BOM record data
      const bomData = {
        product_name: bom.product_name,
        product_image_url: bom.product_image_url,
        total_order_qty: bom.total_order_qty,
        status: bom.status || 'draft',
        bom_number: resolvedBomNumber,
        ...(bom.order_id && { order_id: bom.order_id }),
        ...(bom.order_item_id && { order_item_id: bom.order_item_id }),
      };

      let bomId = bom.id;

      // Ensure we're not accidentally updating when we should be creating
      if (bomId && !isEditMode) {
        console.log('Warning: BOM ID exists but not in edit mode. Clearing ID for new BOM creation.');
        bomId = undefined;
      }

      if (bomId) {
        // Update existing BOM
        console.log('Updating existing BOM:', bomId);
        
        // Update BOM record in bom_records table
        const result = await supabase
          .from('bom_records')
          .update(bomData as any)
          .eq('id', bomId as any);

        if (result.error) {
          console.error('Failed to update BOM record:', result.error);
          throw new Error(`Failed to update BOM record: ${result.error.message}`);
        } else {
          console.log('Successfully updated BOM record');
        }

        // Delete existing items from bom_record_items table (try both table names)
        let deleteResult = await supabase
          .from('bom_record_items')
          .delete()
          .eq('bom_id', bomId as any);
        
        if (deleteResult.error) {
          console.log('Failed to delete from bom_record_items, trying bom_items...');
          deleteResult = await supabase
            .from('bom_items')
            .delete()
            .eq('bom_id', bomId as any);
          
          if (deleteResult.error) {
            console.error('Failed to delete existing BOM items from both tables:', deleteResult.error);
            throw new Error(`Failed to delete existing BOM items: ${deleteResult.error.message}`);
          } else {
            console.log('Successfully deleted existing BOM items from bom_items');
          }
        } else {
          console.log('Successfully deleted existing BOM items from bom_record_items');
        }
      } else {
        // Create new BOM
        console.log('Creating new BOM with data:', bomData);
        console.log('BOM ID is undefined, proceeding with new BOM creation');
        
        // Create BOM record in bom_records table
        const result = await supabase
          .from('bom_records')
          .insert(bomData as any)
          .select('id')
          .single();

        if (result.error) {
          console.error('Failed to create BOM record:', result.error);
          throw new Error(`Failed to create BOM record: ${result.error.message}`);
        } else {
          bomId = (result.data as any).id;
          console.log('Successfully created BOM record with ID:', bomId);
          
          // Update the local BOM state with the new ID
          setBom(prev => ({ ...prev, id: bomId }));
        }
      }

      // Ensure we have a valid BOM ID before proceeding
      if (!bomId) {
        throw new Error('Failed to get BOM ID after creation/update');
      }

      const sanitizePayload = (payload: Record<string, any>, allowedKeys: string[]) => {
        return allowedKeys.reduce((acc, key) => {
          const value = payload[key];
          if (value !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, any>);
      };

      const bomRecordItemKeys = [
        'bom_id',
        'item_id',
        'item_code',
        'item_name',
        'category',
        'unit_of_measure',
        'qty_per_product',
        'qty_total',
        'stock',
        'to_order',
        'item_image_url',
        'fabric_name',
        'fabric_color',
        'fabric_gsm'
      ];

      const legacyBomItemKeys = [
        'bom_id',
        'item_id',
        'item_code',
        'item_name',
        'category',
        'quantity',
        'unit',
        'stock',
        'to_order'
      ];

      // Prepare BOM items data
      const bomItems: Record<string, any>[] = [];
      const legacyBomItems: Record<string, any>[] = [];
       
       for (const item of items) {
         console.log('Processing item for BOM save:', {
           item_id: item.item_id,
           item_name: item.item_name,
           item_type: item.item_type,
           item_code: item.item_code
         });
         
        const base = {
           bom_id: bomId,
           item_id: item.item_type === 'fabric' ? null : (item.item_id || null), // Set item_id to null for fabrics
           item_code: item.item_code || null,
           item_name: item.item_name,
           category: item.item_type === 'fabric' ? 'Fabric' : item.item_category || 'Item',
           unit_of_measure: item.unit_of_measure || 'pcs',
           qty_per_product: item.qty_per_product || 0,
           qty_total: item.qty_total || 0,
           stock: item.stock || 0,
          to_order: item.to_order || 0,
          item_image_url: item.item_image_url || null,
         };

         // For fabrics, use the main item data (not fabricSelections)
         if (item.item_type === 'fabric') {
              // Get fabric details from selection state or item data
              const fabricState = fabricSelectionState[items.indexOf(item)];
              let fabricName = fabricState?.selectedFabricName || item.fabric_name || '';
              let fabricColor = fabricState?.selectedColor || item.fabric_color || '';
              let fabricGsm = fabricState?.selectedGsm || item.fabric_gsm || '';
              
              // If fabric details are not available in separate fields, parse from item_name
              if (!fabricName || !fabricColor || !fabricGsm) {
                console.log('Parsing fabric details from item_name:', item.item_name);
                const fabricMatch = item.item_name.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$/i);
                if (fabricMatch) {
                  fabricName = fabricMatch[1].trim();
                  fabricColor = fabricMatch[2].trim();
                  fabricGsm = fabricMatch[3].trim();
                  console.log('Parsed fabric details:', { fabricName, fabricColor, fabricGsm });
                } else {
                  console.log('No fabric pattern match found in:', item.item_name);
                  // Fallback: use the full item_name as fabric name
                  fabricName = fabricName || item.item_name || 'Unknown Fabric';
                }
              }
              
              const fabricDisplayName = fabricName && fabricColor && fabricGsm 
                ? `${fabricName} - ${fabricColor} - ${fabricGsm} GSM`
                : item.item_name || fabricName || 'Unknown Fabric';
              
              console.log('Saving fabric with details:', { fabricName, fabricColor, fabricGsm, fabricDisplayName });
              
            const fabricPayload = sanitizePayload(
              {
                ...base,
                item_name: fabricDisplayName,
                qty_total: item.qty_total || 0,
                to_order: item.to_order || 0,
                fabric_name: fabricName || null,
                fabric_color: fabricColor || null,
                fabric_gsm: fabricGsm || null
              },
              bomRecordItemKeys
            );

            bomItems.push(fabricPayload);
            legacyBomItems.push(
              sanitizePayload(
                {
                  bom_id: fabricPayload.bom_id,
                  item_id: fabricPayload.item_id,
                  item_code: fabricPayload.item_code,
                  item_name: fabricPayload.item_name,
                  category: fabricPayload.category,
                  quantity: fabricPayload.qty_total,
                  unit: fabricPayload.unit_of_measure,
                  stock: fabricPayload.stock,
                  to_order: fabricPayload.to_order
                },
                legacyBomItemKeys
              )
            );
          } else {
            const itemPayload = sanitizePayload(
              {
                ...base,
                qty_total: item.qty_total || 0,
                to_order: item.to_order || 0
              },
              bomRecordItemKeys
            );

            bomItems.push(itemPayload);
            legacyBomItems.push(
              sanitizePayload(
                {
                  bom_id: itemPayload.bom_id,
                  item_id: itemPayload.item_id,
                  item_code: itemPayload.item_code,
                  item_name: itemPayload.item_name,
                  category: itemPayload.category,
                  quantity: itemPayload.qty_total,
                  unit: itemPayload.unit_of_measure,
                  stock: itemPayload.stock,
                  to_order: itemPayload.to_order
                },
                legacyBomItemKeys
              )
            );
          }
       }

       // Insert BOM items
       console.log('Items array before processing:', items);
       console.log('Items length:', items.length);
       console.log('BOM items prepared for save:', bomItems);
       console.log('BOM items length:', bomItems.length);
       
       if (items.length === 0) {
         console.warn('WARNING: Items array is empty! This will result in no BOM items being saved.');
         toast.warning('No items to save. Please add at least one item to the BOM.');
       }
       
       if (bomItems.length > 0) {
         console.log('Attempting to save BOM items:', bomItems);
        console.log('BOM ID:', bomId);
        console.log('BOM Items count:', bomItems.length);
        console.log('First BOM item sample:', bomItems[0]);
        
        try {
          // Try to save to bom_record_items (the correct table)
          let result = await supabase
             .from('bom_record_items')
             .insert(bomItems);

          if (result.error) {
            console.log('bom_record_items failed, trying bom_items...');
            // Fallback to bom_items table with legacy-compatible payload
            result = await supabase
              .from('bom_items')
              .insert(legacyBomItems);
              
            if (result.error) {
              console.error('Both table attempts failed:', result.error);
              console.error('Error details:', JSON.stringify(result.error, null, 2));
              console.error('BOM items data:', JSON.stringify(bomItems, null, 2));
              throw new Error(`Failed to save BOM items: ${result.error.message}`);
            } else {
              console.log('Successfully saved BOM items to bom_items (fallback)');
            }
          } else {
            console.log('Successfully saved BOM items to bom_record_items');
          }
        } catch (itemsError) {
          console.error('Error saving BOM items:', itemsError);
          console.error('BOM items that failed to save:', JSON.stringify(bomItems, null, 2));
          // Don't throw here - BOM record is already saved successfully
          toast.warning('BOM saved but some items may not have been saved correctly. Please check and edit if needed.');
        }
      } else {
        console.warn('No BOM items to save');
      }

      // Success - show success message and navigate
      toast.success(bomId ? 'BOM updated successfully' : 'BOM created successfully');
      
      // Clear saved form data after successful save (only for new BOMs, full page flow)
      if (!isEditMode && !embedded) {
        resetBomData();
      }

      if (embedded && onEmbeddedBomSaved) {
        onEmbeddedBomSaved();
      }

      if (nextAction === 'create-po') {
        const poItems = bomItems
          .map((item) => ({
            ...item,
            item_type: item.category === 'Fabric' ? 'fabric' : 'item',
            quantity: getBomLinePoQuantity(item),
          }))
          .filter((row) => Number(row.quantity) > 0);

        if (poItems.length === 0) {
          toast.error('Nothing left to purchase — lines show zero quantity to order.');
          return;
        }

        const bomPayload = {
          id: bomId,
          bom_number: resolvedBomNumber,
          product_name: bom.product_name,
          order_number: orderData?.order_number,
          items: poItems,
        } as any;

        const encoded = encodeURIComponent(JSON.stringify(bomPayload));
        navigate(`/procurement/po/new?bom=${encoded}`);
        return;
      }

      if (!embedded) {
        setTimeout(() => {
          navigate('/bom?tab=complete');
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error saving BOM:', error);
      
      // Check if the error is about duplicate BOM
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        toast.error(`BOM already exists for product "${bom.product_name}". Please edit the existing BOM instead.`);
      } else {
        toast.error(`Failed to save BOM: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while form persistence hydrates; optional full-page spinner when saving (non-embedded)
  if (!isBomLoaded || (loading && !isEditMode && !embedded)) {
    return (
      <div
        className={
          embedded
            ? 'flex items-center justify-center py-12'
            : 'flex items-center justify-center min-h-screen'
        }
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            {!isBomLoaded ? 'Loading form data...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  const formInner = (
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
            {!embedded && (
            <Button variant="outline" size="sm" onClick={() => navigate('/bom')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
            )}
          <div>
            <h1 className={embedded ? 'text-lg font-semibold' : 'text-2xl font-bold'}>
              {isEditMode ? 'Edit BOM' : embedded ? 'Bill of materials' : 'Create New BOM'}
            </h1>
            {!embedded && (
            <p className="text-muted-foreground">
              {isEditMode ? 'Modify existing Bill of Materials' : 'Create a new Bill of Materials'}
            </p>
            )}
          </div>
        </div>
                 <div className="flex gap-2">
            {hasBomData && !isEditMode && !embedded && (
              <Button 
                variant="outline"
                onClick={resetBomData}
                className="text-red-600 hover:text-red-700"
              >
                Clear Saved Data
              </Button>
            )}
            {!embedded && (
            <Button variant="outline" onClick={() => navigate('/bom')}>
             Cancel
           </Button>
            )}
           {isReadOnly && (
             <Button 
               variant="outline" 
                onClick={() => navigate(`/bom/${id}?edit=1`)}
             >
               Edit
             </Button>
           )}
           {!isReadOnly && (
            <Button onClick={() => save('view-bom')} disabled={loading || !!(needsOrderLineChoice && !id)}>
               <Save className="w-4 h-4 mr-2" />
               {loading ? 'Saving...' : (isEditMode ? 'Update BOM' : 'Save BOM')}
             </Button>
           )}
         </div>
      </div>

      {needsOrderLineChoice && orderData?.order_items?.length > 0 && !id && (
        <Card>
          <CardHeader>
            <CardTitle>Select product line</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This order has multiple products. Choose which line this BOM is for. Each line has its own fabric and items.
            </p>
            <div className="bom-line-radio-inputs" role="radiogroup" aria-label="Product lines">
              {sortOrderLines(orderData.order_items as any[]).map((item: any) => {
                const fabricSuffix = orderLineFabricColorGsmSuffix(item);
                return (
                  <label key={item.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="bom-new-order-line"
                      className="bom-line-radio-input"
                      onChange={() =>
                        navigate(
                          `/bom/new?order=${encodeURIComponent(orderData.id)}&orderItemId=${encodeURIComponent(item.id)}`
                        )
                      }
                    />
                    <span className="bom-line-radio-tile">
                      <span className="bom-line-radio-label">
                        {orderLineBomProductColumnLabel(item) || orderLineProductDropdownOnly(item) || '—'}
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          {item.quantity ?? 0} pcs
                          {fabricSuffix ? ` · ${fabricSuffix}` : item.fabric_id ? ' · Fabric on order' : ''}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!needsOrderLineChoice && (
      <>
      {/* BOM Details */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bom_number">BOM Number</Label>
              <Input
                id="bom_number"
                value={bom.bom_number || ''}
                onChange={(e) => setBom(prev => ({ ...prev, bom_number: e.target.value }))}
                placeholder="Auto-generated if empty"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <Label htmlFor="product_name">Product Name *</Label>
              <Input
                id="product_name"
                value={bom.product_name}
                onChange={(e) => setBom(prev => ({ ...prev, product_name: e.target.value }))}
                placeholder="Enter product name"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <Label htmlFor="total_order_qty">Total Order Quantity *</Label>
              <Input
                id="total_order_qty"
                type="number"
                value={bom.total_order_qty}
                onChange={(e) => setBom(prev => ({ ...prev, total_order_qty: parseInt(e.target.value) || 0 }))}
                placeholder="Enter total quantity"
                disabled={isReadOnly}
              />
            </div>
          </div>
          
          {orderData && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1.5">
              <div className="text-sm text-muted-foreground">Created from Order: {orderData.order_number}</div>
              <div className="text-sm text-muted-foreground">Customer: {orderData.customer?.company_name}</div>
              {bom.order_item_id && Array.isArray(orderData.order_items) && (() => {
                const line = (orderData.order_items as any[]).find((i: any) => i.id === bom.order_item_id);
                if (!line) {
                  return (
                    <div className="text-sm font-medium text-foreground">
                      Product: —
                    </div>
                  );
                }
                const fabricOnOrder = orderLineFabricFromOrder(line);
                const productLabel = orderLineBomProductColumnLabel(line);
                return (
                  <>
                    <div className="text-sm font-medium text-foreground">
                      Product: {productLabel || '—'}
                    </div>
                    {fabricOnOrder ? (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/90">Fabric on order:</span> {fabricOnOrder}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* BOM Items */}
        <div className="space-y-6">
          {/* Fabric Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
                <CardTitle>Fabric</CardTitle>
                {!isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => addItem('fabric')}
                    className="rounded-full w-8 h-8 p-0"
              >
                    <Plus className="w-4 h-4" />
              </Button>
                )}
          </div>
        </CardHeader>
        <CardContent>
              {items.filter(item => item.item_type === 'fabric').length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                  No fabrics added yet. Click + to add fabric.
            </div>
          ) : (
            <div className="space-y-4">
                  {items.filter(item => item.item_type === 'fabric').map((item) => {
                    const colorVariants = item.fabric_base_id
                      ? dedupedColorVariants(fabricPickerRows, item.fabric_base_id)
                      : [];
                    const colorSelectValue = (() => {
                      if (!item.fabric_color || colorVariants.length === 0) return undefined;
                      const exact = colorVariants.find(
                        (v) =>
                          (v.color || '') === item.fabric_color &&
                          String(v.gsm || '').trim() === String(item.fabric_gsm || '').trim()
                      );
                      return (
                        exact?.id ??
                        colorVariants.find((v) => (v.color || '') === item.fabric_color)?.id
                      );
                    })();
                    const baseRow = item.fabric_base_id
                      ? fabricOptions.find((f) => f.id === item.fabric_base_id)
                      : null;
                    const gsmDatalistOptions =
                      item.fabric_name && item.fabric_color
                        ? gsmValuesForNameAndColor(
                            fabricPickerRows,
                            item.fabric_name,
                            item.fabric_color
                          )
                        : [];
                    const gsmListId = `bom-fabric-gsm-${item.id}`;
                    return (
                    <div key={item.id} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Fabric Image - Only show if image exists */}
                      {item.item_image_url ? (
                        <div className="w-20 h-20 bg-muted rounded overflow-hidden flex items-center justify-center">
                        <img 
                          src={item.item_image_url} 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            console.log('Image failed to load:', item.item_image_url);
                            e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.style.display = 'none';
                          }}
                          onLoad={() => console.log('Image loaded successfully:', item.item_image_url)}
                        />
                    </div>
                      ) : null}

                      {/* Fabric Details */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4 items-center">
                        {/* Product — order line context (prefilled) or Order-form fabric name list (manual row) */}
                        <div className="min-w-0 lg:col-span-1">
                          <Label className="text-sm font-medium">Product</Label>
                          {isReadOnly || item.is_prefilled ? (
                            <div
                              className="text-sm font-medium text-foreground break-words"
                              title={fabricRowsProductLabel}
                            >
                              {fabricRowsProductLabel}
                            </div>
                          ) : (
                            <Select
                              value={item.fabric_base_id || undefined}
                              onValueChange={(v) => handleBomFabricBaseSelect(item.id, v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {fabricNameBaseOptions.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.fabric_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {/* Fabric — DB display from base row (manual); prefilled/read-only unchanged */}
                        <div>
                          <Label className="text-sm font-medium">Fabric</Label>
                          {isReadOnly ? (
                            <div className="text-sm font-medium">
                              {item.fabric_for_supplier || item.fabric_name || fabricSelectionState[getItemIndex(item.id)]?.selectedFabricName || 'N/A'}
                            </div>
                          ) : item.is_prefilled ? (
                            <div className="text-sm font-medium">
                              {item.fabric_for_supplier || item.fabric_name || 'N/A'}
                            </div>
                          ) : (
                            <div className="text-sm font-medium text-foreground break-words">
                              {baseRow
                                ? baseRow.fabric_for_supplier || baseRow.label || '—'
                                : '—'}
                            </div>
                          )}
                        </div>

                        {/* Color */}
                        <div>
                          <Label className="text-sm font-medium">Color</Label>
                          {isReadOnly ? (
                            <div className="text-sm">
                              {item.fabric_color || fabricSelectionState[getItemIndex(item.id)]?.selectedColor || 'N/A'}
                            </div>
                          ) : item.is_prefilled ? (
                            <div className="text-sm">
                              {item.fabric_color || 'N/A'}
                            </div>
                          ) : (
                            <Select
                              value={colorSelectValue || undefined}
                              onValueChange={(v) => handleBomFabricColorVariantSelect(item.id, v)}
                              disabled={!item.fabric_base_id}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select color" />
                              </SelectTrigger>
                              <SelectContent>
                                {colorVariants.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    <div className="flex items-center gap-2">
                                      {v.hex ? (
                                        <span
                                          className="h-4 w-4 shrink-0 rounded-full border border-border"
                                          style={{
                                            backgroundColor: v.hex.startsWith('#') ? v.hex : `#${v.hex}`,
                                          }}
                                        />
                                      ) : null}
                                      <span>{v.color || '—'}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        {/* GSM */}
                        <div>
                          <Label className="text-sm font-medium">Gsm</Label>
                          {isReadOnly ? (
                            <div className="text-sm">
                              {item.fabric_gsm ? `${item.fabric_gsm} Gsm` : fabricSelectionState[getItemIndex(item.id)]?.selectedGsm ? `${fabricSelectionState[getItemIndex(item.id)]?.selectedGsm} Gsm` : 'N/A'}
                            </div>
                          ) : item.is_prefilled ? (
                            <div className="text-sm">
                              {item.fabric_gsm ? `${item.fabric_gsm} Gsm` : 'N/A'}
                            </div>
                          ) : (
                            <>
                              <Input
                                value={item.fabric_gsm || ''}
                                list={gsmListId}
                                onChange={(e) => handleBomFabricGsmInputChange(item.id, e.target.value)}
                                placeholder={
                                  gsmDatalistOptions.length > 0 ? 'Select or type GSM' : 'GSM'
                                }
                                disabled={!item.fabric_color}
                                className="w-full"
                              />
                              <datalist id={gsmListId}>
                                {gsmDatalistOptions.map((g) => (
                                  <option key={g} value={g} />
                                ))}
                              </datalist>
                            </>
                          )}
                        </div>

                        {/* Qty/Pc or Pcs in 1 {uom} */}
                          <div>
                          <Label className="text-sm font-medium">{getQtyLabel(item)}</Label>
                            <Input
                            type="number"
                            value={item.qty_per_product}
                            onChange={(e) => {
                              const qtyPerProduct = parseFloat(e.target.value) || 0;
                              const qtyTotal = calculateQtyTotal({ ...item, qty_per_product: qtyPerProduct }, bom.total_order_qty);
                              const toOrder = Math.max(qtyTotal - (item.stock || 0), 0);
                              
                              updateItemById(item.id, { 
                                qty_per_product: qtyPerProduct,
                                qty_total: qtyTotal,
                                to_order: toOrder
                              });
                            }}
                            placeholder="0"
                              disabled={isReadOnly}
                            className="w-20"
                          />
                        </div>

                        {/* UOM */}
                        <div>
                          <Label className="text-sm font-medium">UOM</Label>
                          <div className="text-sm">
                            {item.unit_of_measure || 'Kgs'}
                          </div>
                        </div>

                        {/* Total Required */}
                         <div>
                          <Label className="text-sm font-medium">Total Required</Label>
                          <div className="text-sm font-medium">
                            {typeof item.qty_total === 'number' ? item.qty_total.toFixed(2) : item.qty_total} {item.unit_of_measure || 'Kgs'}
                          </div>
                        </div>
                      </div>

                      {/* Remove Button */}
                             {!isReadOnly && (
                               <Button
                                 variant="outline"
                                 size="sm"
                          onClick={() => removeItemById(item.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                               </Button>
                             )}
                           </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Items</CardTitle>
                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addItem('item')}
                    className="rounded-full w-8 h-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {items.filter(item => item.item_type === 'item').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items added yet. Click + to add item.
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => {
                    if (item.item_type !== 'item') return null;
                    return (
                    <div key={item.id || `item-${index}`} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Item Image - Only show if image exists */}
                        {item.item_image_url ? (
                        <div className="w-20 h-20 bg-muted rounded overflow-hidden flex items-center justify-center">
                          <img 
                            src={item.item_image_url} 
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                              console.log('Item image failed to load:', item.item_image_url);
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.style.display = 'none';
                            }}
                            onLoad={() => console.log('Item image loaded successfully:', item.item_image_url)}
                          />
                      </div>
                      ) : null}

                      {/* Item Details */}
                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        {/* Item Types */}
                        <div>
                          <Label className="text-sm font-medium">Item Types</Label>
                                 <Select
                            value={item.selected_item_type || ''}
                                   onValueChange={(value) => {
                              updateItem(index, { 
                                selected_item_type: value,
                                item_id: '',
                                item_name: ''
                              });
                                   }}
                                   disabled={isReadOnly}
                                 >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type..." />
                                   </SelectTrigger>
                                                                       <SelectContent>
                              {itemTypes.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                 </Select>
                        </div>
                                 
                        {/* Item Name */}
                        <div>
                          <Label className="text-sm font-medium">Item Name</Label>
                                 <Select
                            value={item.item_id}
                            onValueChange={(value) => handleItemSelection(index, 'item', value)}
                            disabled={isReadOnly || !item.selected_item_type}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select item..." />
                                   </SelectTrigger>
                                                                       <SelectContent>
                              {item.selected_item_type && getFilteredItems(item.selected_item_type).map(option => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                 </Select>
                               </div>

                        {/* Qty/Pc or Pcs in 1 {uom} */}
                          <div>
                          <Label className="text-sm font-medium">{getQtyLabel(item)}</Label>
                            <Input
                              type="number"
                            value={item.qty_per_product}
                              onChange={(e) => {
                              const qtyPerProduct = parseFloat(e.target.value) || 1; // Default to 1 instead of 0
                              const qtyTotal = calculateQtyTotal({ ...item, qty_per_product: qtyPerProduct }, bom.total_order_qty);
                              const toOrder = Math.max(qtyTotal - (item.stock || 0), 0);
                                updateItem(index, { 
                                  qty_per_product: qtyPerProduct,
                                qty_total: qtyTotal,
                                  to_order: toOrder
                                });
                              }}
                              placeholder="1"
                              disabled={isReadOnly}
                            className="w-20"
                            />
                          </div>

                        {/* UOM */}
                          <div>
                          <Label className="text-sm font-medium">UOM</Label>
                          <div className="text-sm">
                            {item.unit_of_measure || 'Pcs'}
                          </div>
                          </div>

                        {/* Total Required */}
                         <div>
                          <Label className="text-sm font-medium">Total Required</Label>
                          <div className="text-sm font-medium">
                            {typeof item.qty_total === 'number' ? item.qty_total.toFixed(2) : item.qty_total} {item.unit_of_measure || 'Pcs'}
                          </div>
                        </div>

                        {/* Empty column for alignment */}
                        <div></div>
                    </div>

                    {/* Remove Button */}
                    {!isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                    );
                  })}
            </div>
          )}
        </CardContent>
      </Card>
        </div>

      {/* Summary */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>BOM Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{totals.totalItems.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Total Items</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{totals.totalFabrics.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Total Fabrics</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{totals.totalToOrder.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Total to Order</div>
              </div>
            </div>
          </CardContent>
                 </Card>
       )}
      </>
      )}

      {!isReadOnly && embedded && (
        <Button
          type="button"
          onClick={() => save('create-po')}
          disabled={loading || !!(needsOrderLineChoice && !id)}
          className={`fixed right-6 top-1/2 -translate-y-1/2 z-50 rounded-full px-5 py-6 transition-all duration-300 ${
            isSaveAndCreatePoReady
              ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-[0_0_0_2px_rgba(16,185,129,0.35),0_8px_24px_rgba(16,185,129,0.35)]'
              : 'bg-muted text-muted-foreground border-border shadow-lg'
          }`}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Saving...' : 'Save BOM & Create PO'}
        </Button>
      )}
     </div>
  );

  if (embedded) {
    return formInner;
  }

  return <ErpLayout>{formInner}</ErpLayout>;
 }
