import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Save, ArrowLeft, ExternalLink, X, Download, FileText, Share2, Printer } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BomList } from './BomList';

type Supplier = { 
  id: string; 
  supplier_name: string; 
  supplier_code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  gst_number?: string;
  pan?: string;
  credit_limit?: number;
  enabled?: boolean;
  total_outstanding_amount?: number;
  created_at?: string;
  updated_at?: string;
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

type LineItem = {
  id?: string;
  item_type: 'fabric' | 'item' | 'product' | 'Zipper' | 'Drawcord' | 'Laces' | string;
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  gst_rate?: number;
  gst_amount?: number;
  line_total?: number;
  unit_of_measure?: string;
  notes?: string;
  attributes?: Record<string, any> | null;
  fabricSelections?: { color: string; gsm: string; quantity: number }[];
  itemSelections?: { id: string; label: string; image_url?: string | null; quantity: number; price: number }[];
  item_category?: string | null;
};

type PurchaseOrder = {
  id?: string;
  po_number?: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date?: string | null;
  delivery_address?: string | null;
  terms_conditions?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  status: 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
};

// Helper function to safely access Supabase query results
function safeQueryResult<T>(result: { data: T | null; error: any }): T | null {
  if (result.error) {
    console.error('Supabase query error:', result.error);
    return null;
  }
  return result.data;
}

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
  return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
}

export function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;
  
  // Check for BOM data in URL params
  const bomParam = searchParams.get('bom');
  const [bomData, setBomData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [po, setPo] = useState<PurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
  });
  const [items, setItems] = useState<LineItem[]>([]);
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; item_type?: string; uom?: string; gst_rate?: number; type?: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemTypeOptions, setItemTypeOptions] = useState<string[]>([]);

  // Process BOM data from URL params
  useEffect(() => {
    if (bomParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(bomParam));
        setBomData(decoded);
        
        // Pre-fill PO with BOM data
        if (decoded.items && Array.isArray(decoded.items)) {
          const bomItems: LineItem[] = decoded.items.map((item: any) => ({
            id: undefined,
            item_type: item.item_type || 'item',
            item_id: item.item_id || '',
            item_name: item.item_name || '',
            item_image_url: item.item_image_url || null,
            quantity: item.quantity || 0,
            unit_price: item.unit_price || 0,
            total_price: (item.quantity || 0) * (item.unit_price || 0),
            unit_of_measure: item.unit_of_measure || '',
            notes: item.notes || '',
            attributes: item.attributes || {},
            fabricSelections: item.fabricSelections || [],
            itemSelections: item.itemSelections || [],
            item_category: item.item_category || null,
          }));
          setItems(bomItems);
        }
      } catch (error) {
        console.error('Error parsing BOM data:', error);
      }
    }
  }, [bomParam]);

  const fetchExisting = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const headerResult = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id as any)
        .single();
      
      const header = safeQueryResult(headerResult);
      if (!header) return;
      
      setPo(header as any);
      
      // Double-check if supplier exists in our list
      const supplierExists = suppliers.find(s => s.id === (header as any).supplier_id);
      if (!supplierExists && (header as any).supplier_id) {
        await fetchSuppliers();
      }
      
      const linesResult = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id as any);
      
      const lines = safeQueryResult(linesResult);
      if (!lines) return;
      
      let restored: LineItem[] = (lines as any || []).map((row: any) => {
        const base: LineItem = {
          id: row.id,
          item_type: row.item_type,
          item_id: row.item_id,
          item_name: row.item_name,
          item_image_url: row.item_image_url,
          quantity: row.quantity,
          unit_price: row.unit_price,
          total_price: row.total_price,
          gst_rate: row.gst_rate,
          gst_amount: row.gst_amount,
          line_total: row.line_total,
          unit_of_measure: row.unit_of_measure,
          notes: row.notes,
          attributes: {},
        };
        if (row.item_type === 'fabric') {
          const { color, gsm } = parseFabricDetails(row.item_name);
          base.fabricSelections = [{ color: color || '', gsm: gsm || '', quantity: row.quantity }];
        }
        if (row.item_type === 'item' || row.item_type === 'Zipper' || row.item_type === 'Drawcord' || row.item_type === 'Laces') {
          base.itemSelections = [{ id: row.item_id, label: row.item_name, image_url: row.item_image_url, quantity: row.quantity, price: row.unit_price || 0 }];
          // Restore the item_category from the saved item_type (e.g., "Zipper", "Drawcord")
          base.item_category = row.item_type === 'item' ? null : row.item_type;
        }
        return base;
      });
      
      // Populate fabric attributes (colors/gsm lists) for restored fabric lines
      const fabricIndices: number[] = [];
      restored.forEach((it, i) => { if (it.item_type === 'fabric' && it.item_id) fabricIndices.push(i); });
      if (fabricIndices.length > 0) {
        const populated = await Promise.all(fabricIndices.map(async (i) => {
          const it = restored[i];
          const variantsResult = await supabase
            .from('fabric_variants')
            .select('color, gsm')
            .eq('fabric_id', it.item_id as any);
          
          const variants = safeQueryResult(variantsResult);
          const colorSet = new Set<string>();
          const gsmSet = new Set<string>();
          (variants || []).forEach((v: any) => { if (v.color) colorSet.add(v.color); if (v.gsm) gsmSet.add(v.gsm); });
          const attrs: Record<string, any> = {
            colorsList: Array.from(colorSet),
            gsmList: Array.from(gsmSet)
          };
          const sel = it.fabricSelections && it.fabricSelections[0] ? it.fabricSelections[0] : undefined;
          // keep selected values as is
          return { index: i, attrs };
        }));
        populated.forEach(({ index, attrs }) => {
          (restored[index] as any).attributes = { ...(restored[index].attributes || {}), ...attrs };
        });
      }
      
      // If item_category is missing for any items, fetch it from item_master
      const itemsNeedingCategory = restored.filter(it => (it.item_type === 'item' || it.item_type === 'Zipper' || it.item_type === 'Drawcord' || it.item_type === 'Laces') && !it.item_category && it.item_id);
      if (itemsNeedingCategory.length > 0) {
        const itemIds = itemsNeedingCategory.map(it => it.item_id);
        const itemMasterResult = await supabase
          .from('item_master')
          .select('id, item_type')
          .in('id', itemIds as any);
        
        const itemMasterData = safeQueryResult(itemMasterResult);
        if (itemMasterData) {
          const itemTypeMap = new Map((itemMasterData as any[]).map(item => [item.id, item.item_type]));
          restored.forEach(item => {
            if ((item.item_type === 'item' || item.item_type === 'Zipper' || item.item_type === 'Drawcord' || item.item_type === 'Laces') && !item.item_category && item.item_id) {
              item.item_category = itemTypeMap.get(item.item_id) || null;
            }
          });
        }
      }
      
      setItems(restored);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const fabricsResult = await supabase
        .from('fabrics')
        .select('*')
        .order('name');
      
      const fabrics = safeQueryResult(fabricsResult);
      if (fabrics) {
        setFabricOptions((fabrics as any[]).map(f => ({ id: f.id, label: f.name, image_url: f.image_url })));
      }

      const itemsResult = await supabase
        .from('item_master')
        .select('id, item_name, image_url, item_type, is_active')
        .eq('is_active', true as any)
        .order('item_name');
      
      const items = safeQueryResult(itemsResult);
      if (items) {
        setItemOptions((items as any[]).map(i => ({ 
          id: i.id, 
          label: i.item_name, 
          image_url: i.image_url, 
          item_type: i.item_type,
          uom: i.uom || i.unit_of_measure,
          gst_rate: i.gst_rate || 0,
          type: i.item_type
        })));
        
        // Extract unique item types for the first dropdown
        const types = Array.from(new Set((items as any[]).map(i => i.item_type).filter(Boolean)));
        setItemTypeOptions(types);
      }

      const productsResult = await supabase
        .from('product_master')
        .select('id, product_name, image_url, status')
        .eq('status', 'active' as any)
        .order('product_name');
      
      const products = safeQueryResult(productsResult);
      if (products) {
        setProductOptions((products as any[]).map(p => ({ id: p.id, label: p.product_name, image_url: p.image_url })));
      }
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const result = await supabase
        .from('supplier_master')
        .select('*')
        .order('supplier_name');
      
      const suppliers = safeQueryResult(result);
      if (suppliers) {
        setSuppliers(suppliers as any);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const result = await supabase
        .from('company_settings')
        .select('*')
        .single();
      
      const settings = safeQueryResult(result);
      if (settings) {
        setCompanySettings(settings as any);
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchCompanySettings();
    fetchOptions();
    if (id) {
      fetchExisting();
    }
  }, [id]);

  const parseFabricDetails = (name?: string): { color?: string; gsm?: string } => {
    if (!name) return {};
    const parts = name.split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      return { color: parts[1], gsm: parts[2] };
    }
    return {};
  };

  const updateItem = useCallback((index: number, patch: Partial<LineItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const before = next[index];
      const after = { ...before, ...patch } as LineItem;
      
      // Only recalculate if quantity or unit_price changed
      const shouldRecalculate = patch.hasOwnProperty('quantity') || patch.hasOwnProperty('unit_price') || patch.hasOwnProperty('gst_rate');
      
      // For fabrics, auto-total quantity from fabricSelections
      if (after.item_type === 'fabric' && Array.isArray(after.fabricSelections)) {
        const sumQty = after.fabricSelections.reduce((s, fs) => s + (Number(fs.quantity) || 0), 0);
        after.quantity = sumQty;
      }
      // For items, auto-total quantity from itemSelections
      if (after.item_type === 'item' && Array.isArray(after.itemSelections)) {
        const sumQty = after.itemSelections.reduce((s, itSel) => s + (Number(itSel.quantity) || 0), 0);
        after.quantity = sumQty;
      }
      
      // Only recalculate totals if necessary
      if (shouldRecalculate) {
        after.total_price = (after.quantity || 0) * (after.unit_price || 0);
        const gstRate = (after.gst_rate ?? 0) / 100;
        after.gst_amount = after.total_price * gstRate;
        after.line_total = after.total_price + (after.gst_amount || 0);
      }
      
      next[index] = after;
      return next;
    });
  }, []);

  const getOptionsForType = (t: LineItem['item_type']) => {
    if (t === 'fabric') return fabricOptions;
    if (t === 'product') return productOptions;
    // For 'item', 'Zipper', 'Drawcord', 'Laces', etc., return itemOptions
    return itemOptions;
  };

  const handleSelectName = (index: number, selectedId: string) => {
    const t = items[index].item_type;
    const opts = getOptionsForType(t);
    const found = opts.find((o) => o.id === selectedId);
    if (found) {
      updateItem(index, { item_id: found.id, item_name: found.label, item_image_url: found.image_url || null });
      fetchAndSetAttributes(index, t, found.id);
    }
  };

  // Cache for fetched attributes to avoid duplicate database calls
  const attributesCache = useRef<Map<string, any>>(new Map());

  const fetchAndSetAttributes = useCallback(async (index: number, type: LineItem['item_type'], entityId: string) => {
    const cacheKey = `${type}-${entityId}`;
    
    // Check cache first
    if (attributesCache.current.has(cacheKey)) {
      const cached = attributesCache.current.get(cacheKey);
      updateItem(index, cached);
      return;
    }

    try {
      if (type === 'fabric') {
        const [{ data: fabric }, { data: variants }] = await Promise.all([
          supabase.from('fabrics').select('*').eq('id', entityId as any).maybeSingle(),
          supabase.from('fabric_variants').select('*').eq('fabric_id', entityId as any),
        ]);
        const colorSet = new Set<string>();
        const gsmSet = new Set<string>();
        (variants || []).forEach((r: any) => {
          if (r.color) colorSet.add(r.color);
          if (r.gsm) gsmSet.add(r.gsm);
        });
        const uomCandidate = ((variants as any[]) || []).find((v: any) => !!v.uom)?.uom || 'MTR';
        const attrs: Record<string, any> = {
          fabric_name: (fabric as any)?.name || '',
          fabric_gsm: (fabric as any)?.gsm || null,
          colorsList: Array.from(colorSet),
          gsmList: Array.from(gsmSet),
          description: (fabric as any)?.description || null,
        };
        const updateData = { 
          attributes: attrs, 
          unit_of_measure: uomCandidate, 
          item_image_url: (fabric as any)?.image_url || (fabric as any)?.image || null, 
          fabricSelections: [], 
          quantity: 0 
        };
        attributesCache.current.set(cacheKey, updateData);
        updateItem(index, updateData);
        return;
      }
      if (type === 'item') {
        const { data: item } = await supabase.from('item_master').select('*').eq('id', entityId as any).maybeSingle();
        const attrs: Record<string, any> = {};
        if (item) {
          ['item_code', 'uom', 'brand', 'category', 'color', 'size', 'specs', 'description'].forEach((k) => {
            if (item[k] != null && item[k] !== '') attrs[k] = item[k];
          });
        }
        const updateData = {
          attributes: attrs,
          unit_of_measure: (item as any)?.uom || (item as any)?.unit_of_measure || undefined,
          item_image_url: (item as any)?.image_url || (item as any)?.image || null,
          gst_rate: (item as any)?.gst_rate || 0,
          item_category: (item as any)?.item_type || null,
          itemSelections: []
        };
        attributesCache.current.set(cacheKey, updateData);
        updateItem(index, updateData);
        return;
      }
      if (type === 'product') {
        let attrs: Record<string, any> = {};
        const { data: pm } = await supabase.from('product_master').select('*').eq('id', entityId as any).maybeSingle();
        if (pm) {
          ['code', 'category', 'base_price', 'hsn_code', 'gst_rate'].forEach((k) => {
            if (pm[k] != null && pm[k] !== '') attrs[k] = pm[k];
          });
        } else {
          const { data: p } = await supabase.from('products').select('*').eq('id', entityId as any).maybeSingle();
          if (p) {
            ['code', 'category', 'base_price', 'hsn_code', 'gst_rate'].forEach((k) => {
              if (p[k] != null && p[k] !== '') attrs[k] = p[k];
            });
          }
        }
        const updateData = { attributes: attrs };
        attributesCache.current.set(cacheKey, updateData);
        updateItem(index, updateData);
      }
    } catch (e) {
      console.warn('Failed to fetch attributes', e);
      updateItem(index, { attributes: null });
    }
  }, [updateItem]);

  // Add debounced items state
  const [debouncedItems, setDebouncedItems] = useState<LineItem[]>([]);

  // Debounce items changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedItems(items);
    }, 300);
    return () => clearTimeout(timer);
  }, [items]);

  const totals = useMemo(() => {
    // Use debounced items to prevent excessive recalculations
    const itemsToCalculate = debouncedItems.length > 0 ? debouncedItems : items;
    
    // Group items by GST rate
    const gstGroups: Record<number, { subtotal: number; gstAmount: number; total: number; items: LineItem[] }> = {};
    
    itemsToCalculate.forEach(item => {
      const gstRate = item.gst_rate ?? 0;
      const subtotal = item.total_price || 0;
      const gstAmount = subtotal * (gstRate / 100);
      const total = subtotal + gstAmount;
      
      if (!gstGroups[gstRate]) {
        gstGroups[gstRate] = { subtotal: 0, gstAmount: 0, total: 0, items: [] };
      }
      
      gstGroups[gstRate].subtotal += subtotal;
      gstGroups[gstRate].gstAmount += gstAmount;
      gstGroups[gstRate].total += total;
      gstGroups[gstRate].items.push(item);
    });
    
    // Calculate grand totals
    const grandSubtotal = Object.values(gstGroups).reduce((sum, group) => sum + group.subtotal, 0);
    const grandGstAmount = Object.values(gstGroups).reduce((sum, group) => sum + group.gstAmount, 0);
    const grandTotal = grandSubtotal + grandGstAmount;
    
    return { 
      gstGroups, 
      grandSubtotal, 
      grandGstAmount, 
      grandTotal,
      amountInWords: numberToWords(grandTotal)
    };
  }, [debouncedItems, items]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { item_type: 'item', item_id: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!po.supplier_id) return;
    setLoading(true);
    try {
      let poId = id;
      if (!poId) {
        const { data: poNumberData } = await supabase.rpc('generate_po_number');
        const { data: inserted, error } = await supabase
          .from('purchase_orders')
          .insert({
            po_number: poNumberData,
            supplier_id: po.supplier_id as any,
            order_date: po.order_date,
            expected_delivery_date: po.expected_delivery_date,
            delivery_address: po.delivery_address,
            terms_conditions: po.terms_conditions,
            status: po.status,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        poId = inserted && 'id' in inserted ? inserted.id : undefined;
      } else {
        await supabase
          .from('purchase_orders')
          .update({
            supplier_id: po.supplier_id as any,
            order_date: po.order_date,
            expected_delivery_date: po.expected_delivery_date,
            delivery_address: po.delivery_address,
            terms_conditions: po.terms_conditions,
            status: po.status,
          } as any)
          .eq('id', poId as any);
        // clear existing lines to simplify
        await supabase.from('purchase_order_items').delete().eq('po_id', poId as any);
      }

      // Expand each UI line into individual DB rows
      const rows: any[] = [];
      for (const it of items) {
        if (it.item_type === 'fabric' && Array.isArray(it.fabricSelections) && it.fabricSelections.length > 0) {
          for (const sel of it.fabricSelections) {
            if (!sel.color || !sel.gsm) continue;
            const qty = Number(sel.quantity) || 0;
            const unitPrice = it.unit_price || 0;
            const totalPrice = qty * unitPrice;
            const gstRate = it.gst_rate ?? 0;
            const gstAmount = totalPrice * (gstRate / 100);
            const lineTotal = totalPrice + gstAmount;
            rows.push({
              po_id: poId,
              item_type: 'fabric',
              item_id: it.item_id || crypto.randomUUID(),
              item_name: `${it.item_name} | ${sel.color} | ${sel.gsm}`,
              item_image_url: it.item_image_url || null,
              quantity: qty,
              unit_price: unitPrice,
              total_price: totalPrice,
              gst_rate: gstRate,
              gst_amount: gstAmount,
              line_total: lineTotal,
              unit_of_measure: it.unit_of_measure || 'MTR',
              notes: it.notes || null,
            });
          }
        } else if (it.item_type === 'item' && Array.isArray(it.itemSelections) && it.itemSelections.length > 0) {
          for (const sel of it.itemSelections) {
            if (!sel.id) continue;
            const qty = Number(sel.quantity) || 0;
            const unitPrice = it.unit_price || 0;
            const totalPrice = qty * unitPrice;
            const gstRate = it.gst_rate ?? 0;
            const gstAmount = totalPrice * (gstRate / 100);
            const lineTotal = totalPrice + gstAmount;
            rows.push({
              po_id: poId,
              item_type: it.item_category || 'item', // Use the selected item type (e.g., "Zipper", "Drawcord") instead of generic "item"
              item_id: sel.id,
              item_name: sel.label || it.item_name,
              item_image_url: sel.image_url || it.item_image_url || null,
              quantity: qty,
              unit_price: unitPrice,
              total_price: totalPrice,
              gst_rate: gstRate,
              gst_amount: gstAmount,
              line_total: lineTotal,
              unit_of_measure: it.unit_of_measure || 'pcs',
              notes: it.notes || null,
            });
          }
        } else {
          // product or simple single entry
          const qty = it.quantity || 0;
          const unitPrice = it.unit_price || 0;
          const totalPrice = qty * unitPrice;
          const gstRate = it.gst_rate ?? 0;
          const gstAmount = totalPrice * (gstRate / 100);
          const lineTotal = totalPrice + gstAmount;
          rows.push({
            po_id: poId,
            item_type: it.item_type,
            item_id: it.item_id || crypto.randomUUID(),
            item_name: it.item_name,
            item_image_url: it.item_image_url || null,
            quantity: qty,
            unit_price: unitPrice,
            total_price: totalPrice,
            gst_rate: gstRate,
            gst_amount: gstAmount,
            line_total: lineTotal,
            unit_of_measure: it.unit_of_measure || 'pcs',
            notes: it.notes || null,
          });
        }
      }
      if (rows.length > 0) await supabase.from('purchase_order_items').insert(rows);
      // Re-fetch header totals to ensure DB trigger has rolled up amounts before leaving
      if (poId) {
        await supabase
          .from('purchase_orders')
          .select('id, subtotal, gst_total, total_amount')
          .eq('id', poId as any)
          .single();
      }

      navigate('/procurement/po');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Export functions
  const exportToPDF = () => {
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    
    const supplierName = supplier ? `${supplier.supplier_name} (${supplier.supplier_code})` : 'Unknown Supplier';
    
    // Build supplier address
    const supplierAddress = supplier?.billing_address || 'Not specified';
    
    // Build company address
    const companyAddress = companySettings ? [
      companySettings.address,
      companySettings.city,
      companySettings.state,
      companySettings.pincode
    ].filter(Boolean).join(', ') : '';
    
    const content = `
      <html>
        <head>
          <title>Purchase Order - ${po.po_number || 'Draft'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 15px; font-size: 12px; }
            .header { margin-bottom: 20px; }
            .company-info { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .company-details { text-align: left; }
            .company-logo { max-width: 100px; max-height: 60px; margin-bottom: 5px; }
            .po-info { text-align: right; }
            .po-info h2 { margin-top: 0; font-size: 18px; }
            .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .contact-section { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
            .contact-section h3 { margin-top: 0; color: #333; font-size: 14px; margin-bottom: 8px; }
            .contact-section p { margin: 3px 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-size: 11px; }
            .item-image { width: 40px; height: 40px; object-fit: cover; border-radius: 3px; }
            .totals { text-align: right; margin-top: 15px; font-size: 12px; }
            .footer { margin-top: 20px; font-size: 11px; }
            .page-break { page-break-before: always; }
            .company-name { font-size: 16px; font-weight: bold; margin-bottom: 3px; }
            .company-address { font-size: 11px; margin-bottom: 3px; }
            .company-details p { margin: 2px 0; font-size: 10px; }
            @media print {
              body { margin: 10mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <div class="company-details">
                ${companySettings?.logo_url ? `<img src="${companySettings.logo_url}" alt="Company Logo" class="company-logo" crossorigin="anonymous">` : ''}
                <div class="company-name">${companySettings?.company_name || 'Company Name'}</div>
                <div class="company-address">${companyAddress}</div>
                <p>GSTIN: ${companySettings?.gstin || 'N/A'} | Phone: ${companySettings?.contact_phone || 'N/A'}</p>
                <p>Email: ${companySettings?.contact_email || 'N/A'}</p>
              </div>
              <div class="po-info">
                <h2>PURCHASE ORDER</h2>
                <p><strong>PO Number:</strong> ${po.po_number || 'Draft'}</p>
                <p><strong>Date:</strong> ${po.order_date}</p>
              </div>
            </div>
          </div>
          
          <div class="contact-grid">
            <div class="contact-section">
              <h3>Supplier Information</h3>
              <p><strong>Name:</strong> ${supplierName}</p>
              <p><strong>Contact Person:</strong> ${supplier?.contact_person || 'N/A'}</p>
              <p><strong>Phone:</strong> ${supplier?.phone || 'N/A'}</p>
              <p><strong>Email:</strong> ${supplier?.email || 'N/A'}</p>
              <p><strong>GST Number:</strong> ${supplier?.gst_number || 'N/A'}</p>
              <p><strong>PAN:</strong> ${supplier?.pan || 'N/A'}</p>
              <p><strong>Address:</strong> ${supplierAddress}</p>
            </div>
            <div class="contact-section">
              <h3>Delivery Information</h3>
              <p><strong>Delivery Address:</strong> ${po.delivery_address || supplierAddress}</p>
              <p><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Item</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>UOM</th>
                <th>Unit Price</th>
                <th>GST %</th>
                <th>GST Amount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.item_image_url ? `<img src="${item.item_image_url}" alt="Item" class="item-image">` : '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 3px;"></div>'}</td>
                  <td>${item.item_name}</td>
                  <td>${item.item_type}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit_of_measure || ''}</td>
                  <td>₹${item.unit_price?.toFixed(2) || '0.00'}</td>
                  <td>${item.gst_rate || 0}%</td>
                  <td>₹${(item.gst_amount || 0).toFixed(2)}</td>
                  <td>₹${(item.line_total || (item.quantity * item.unit_price)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <h3>GST Rate-wise Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">GST Rate (%)</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Subtotal</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">GST Amount</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(totals.gstGroups)
                  .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                  .map(([gstRate, group]) => `
                    <tr>
                      <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${gstRate}%</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.subtotal.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.gstAmount.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
            <div style="border-top: 2px solid #333; padding-top: 10px; margin-top: 10px;">
              <p><strong>Grand Subtotal:</strong> ₹${totals.grandSubtotal.toFixed(2)}</p>
              <p><strong>Total GST Amount:</strong> ₹${totals.grandGstAmount.toFixed(2)}</p>
              <p><strong>Grand Total:</strong> ₹${totals.grandTotal.toFixed(2)}</p>
              <p><strong>Amount in Words:</strong> ${totals.amountInWords}</p>
            </div>
          </div>
          
          ${po.terms_conditions ? `
            <div class="footer">
              <h3>Terms & Conditions</h3>
              <p style="white-space: pre-line;">${po.terms_conditions}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;

    // Open in new window and trigger print to PDF
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const exportToExcel = () => {
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const supplierName = supplier ? `${supplier.supplier_name} (${supplier.supplier_code})` : 'Unknown Supplier';
    
    // Build supplier address
    const supplierAddress = supplier?.billing_address || 'Not specified';
    
    // Build company address
    const companyAddress = companySettings ? [
      companySettings.address,
      companySettings.city,
      companySettings.state,
      companySettings.pincode
    ].filter(Boolean).join(', ') : '';
    
    // Create CSV content
    const csvContent = [
      ['Company Information'],
      ['Company Name', companySettings?.company_name || 'N/A'],
      ['Address', companyAddress],
      ['GSTIN', companySettings?.gstin || 'N/A'],
      ['Phone', companySettings?.contact_phone || 'N/A'],
      ['Email', companySettings?.contact_email || 'N/A'],
      [],
      ['Purchase Order Details'],
      ['PO Number', po.po_number || 'Draft'],
      ['Date', po.order_date],
      [],
      ['Supplier Information'],
      ['Supplier Name', supplierName],
      ['Contact Person', supplier?.contact_person || 'N/A'],
      ['Phone', supplier?.phone || 'N/A'],
      ['Email', supplier?.email || 'N/A'],
      ['GST Number', supplier?.gst_number || 'N/A'],
      ['PAN', supplier?.pan || 'N/A'],
      ['Address', supplierAddress],
      [],
      ['Delivery Information'],
      ['Delivery Address', po.delivery_address || supplierAddress],
      ['Expected Delivery', po.expected_delivery_date || 'Not specified'],
      [],
      ['Line Items'],
      ['Item Name', 'Type', 'Quantity', 'UOM', 'Unit Price', 'GST %', 'GST Amount', 'Total', 'Image URL'],
      ...items.map(item => [
        item.item_name,
        item.item_type === 'item' && item.item_category ? item.item_category : item.item_type,
        item.quantity,
        item.unit_of_measure || '',
        item.unit_price?.toFixed(2) || '0.00',
        `${item.gst_rate || 0}%`,
        (item.gst_amount || 0).toFixed(2),
        (item.line_total || (item.quantity * item.unit_price)).toFixed(2),
        item.item_image_url || ''
      ]),
      [],
      ['Totals'],
      ['Grand Subtotal', totals.grandSubtotal.toFixed(2)],
      ['Total GST Amount', totals.grandGstAmount.toFixed(2)],
      ['Grand Total', totals.grandTotal.toFixed(2)],
      [],
             ['Terms & Conditions'],
       [(po.terms_conditions || 'Not specified').replace(/\n/g, ' ')]
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PO_${po.po_number || 'Draft'}_${po.order_date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printPO = () => {
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    
    const supplierName = supplier ? `${supplier.supplier_name} (${supplier.supplier_code})` : 'Unknown Supplier';
    
    // Build supplier address
    const supplierAddress = supplier?.billing_address || 'Not specified';
    
    // Build company address
    const companyAddress = companySettings ? [
      companySettings.address,
      companySettings.city,
      companySettings.state,
      companySettings.pincode
    ].filter(Boolean).join(', ') : '';
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    // Add logo error handling with better fallback and print-specific styling
    const logoHtml = companySettings?.logo_url ? 
      `<img src="${companySettings.logo_url}" alt="Company Logo" class="company-logo" crossorigin="anonymous" onerror="this.style.display='none'" style="max-width: 100px; max-height: 60px; margin-bottom: 5px; display: block !important; visibility: visible !important;">` : '';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Order - ${po.po_number || 'Draft'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 15px; font-size: 12px; }
            .header { margin-bottom: 20px; }
            .company-info { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .company-details { text-align: left; }
            .company-logo { max-width: 100px; max-height: 60px; margin-bottom: 5px; }
            .po-info { text-align: right; }
            .po-info h2 { margin-top: 0; font-size: 18px; }
            .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .contact-section { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
            .contact-section h3 { margin-top: 0; color: #333; font-size: 14px; margin-bottom: 8px; }
            .contact-section p { margin: 3px 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-size: 11px; }
            .item-image { width: 40px; height: 40px; object-fit: cover; border-radius: 3px; }
            .totals { text-align: right; margin-top: 15px; font-size: 12px; }
            .footer { margin-top: 20px; font-size: 11px; }
            @media print {
              body { margin: 10mm; }
              .no-print { display: none; }
              .company-name { 
                font-size: 18px !important; 
                font-weight: bold !important; 
                margin-bottom: 5px !important;
                color: #000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
              }
              .company-details { 
                margin-bottom: 10px !important;
                page-break-inside: avoid;
                display: block !important;
                visibility: visible !important;
              }
              .header { 
                page-break-inside: avoid;
                margin-bottom: 15px !important;
                display: block !important;
                visibility: visible !important;
              }
              .company-logo {
                max-width: 100px !important;
                max-height: 60px !important;
                margin-bottom: 5px !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
            .company-name { font-size: 16px; font-weight: bold; margin-bottom: 3px; }
            .company-address { font-size: 11px; margin-bottom: 3px; }
            .company-details p { margin: 2px 0; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <div class="company-details">
                ${logoHtml}
                <div class="company-name" style="display: block !important; visibility: visible !important; font-size: 18px !important; font-weight: bold !important; color: #000 !important;">${companySettings?.company_name || 'Company Name'}</div>
                <div class="company-address">${companyAddress}</div>
                <p>GSTIN: ${companySettings?.gstin || 'N/A'} | Phone: ${companySettings?.contact_phone || 'N/A'}</p>
                <p>Email: ${companySettings?.contact_email || 'N/A'}</p>
              </div>
              <div class="po-info">
                <h2>PURCHASE ORDER</h2>
                <p><strong>PO Number:</strong> ${po.po_number || 'Draft'}</p>
                <p><strong>Date:</strong> ${po.order_date}</p>
              </div>
            </div>
          </div>
          
          <div class="contact-grid">
            <div class="contact-section">
              <h3>Supplier Information</h3>
              <p><strong>Name:</strong> ${supplierName}</p>
              <p><strong>Contact Person:</strong> ${supplier?.contact_person || 'N/A'}</p>
              <p><strong>Phone:</strong> ${supplier?.phone || 'N/A'}</p>
              <p><strong>Email:</strong> ${supplier?.email || 'N/A'}</p>
              <p><strong>GST Number:</strong> ${supplier?.gst_number || 'N/A'}</p>
              <p><strong>PAN:</strong> ${supplier?.pan || 'N/A'}</p>
              <p><strong>Address:</strong> ${supplierAddress}</p>
            </div>
            <div class="contact-section">
              <h3>Delivery Information</h3>
              <p><strong>Delivery Address:</strong> ${po.delivery_address || supplierAddress}</p>
              <p><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Item</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>UOM</th>
                <th>Unit Price</th>
                <th>GST %</th>
                <th>GST Amount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.item_image_url ? `<img src="${item.item_image_url}" alt="Item" class="item-image">` : '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 3px;"></div>'}</td>
                  <td>${item.item_name}</td>
                  <td>${item.item_type}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit_of_measure || ''}</td>
                  <td>₹${item.unit_price?.toFixed(2) || '0.00'}</td>
                  <td>${item.gst_rate || 0}%</td>
                  <td>₹${(item.gst_amount || 0).toFixed(2)}</td>
                  <td>₹${(item.line_total || (item.quantity * item.unit_price)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <h3>GST Rate-wise Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">GST Rate (%)</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Subtotal</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">GST Amount</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(totals.gstGroups)
                  .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                  .map(([gstRate, group]) => `
                    <tr>
                      <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${gstRate}%</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.subtotal.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.gstAmount.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
            <div style="border-top: 2px solid #333; padding-top: 10px; margin-top: 10px;">
              <p><strong>Grand Subtotal:</strong> ₹${totals.grandSubtotal.toFixed(2)}</p>
              <p><strong>Total GST Amount:</strong> ₹${totals.grandGstAmount.toFixed(2)}</p>
              <p><strong>Grand Total:</strong> ₹${totals.grandTotal.toFixed(2)}</p>
              <p><strong>Amount in Words:</strong> ${totals.amountInWords}</p>
            </div>
          </div>
          
                    ${po.terms_conditions ? `
            <div class="footer">
              <h3>Terms & Conditions</h3>
              <p style="white-space: pre-line;">${po.terms_conditions}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const sharePO = async () => {
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const supplierName = supplier ? `${supplier.supplier_name} (${supplier.supplier_code})` : 'Unknown Supplier';
    
    // Build supplier address
    const supplierAddress = supplier?.billing_address || 'Not specified';
    
    // Build company address
    const companyAddress = companySettings ? [
      companySettings.address,
      companySettings.city,
      companySettings.state,
      companySettings.pincode
    ].filter(Boolean).join(', ') : '';
    
    // Create the specific message format as requested
    const itemQty = items.map(item => `${item.item_name} - ${item.quantity} ${item.unit_of_measure || 'units'}`).join(', ');
    const shareMessage = `Dear ${supplier?.contact_person || supplierName}

Please find attached PO ${po.po_number || 'Draft'}

The Delivery required date is ${po.expected_delivery_date || 'Not specified'}

${itemQty}

Thanks

${companySettings?.company_name || 'Our Company'}`;
    
    // Generate the exact same HTML content as print/export functions
    const logoHtml = companySettings?.logo_url ? 
      `<img src="${companySettings.logo_url}" alt="Company Logo" class="company-logo" crossorigin="anonymous" onerror="this.style.display='none'" style="max-width: 100px; max-height: 60px; margin-bottom: 5px; display: block !important; visibility: visible !important;">` : '';
    
    const htmlContent = `
      <html>
        <head>
          <title>Purchase Order - ${po.po_number || 'Draft'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 15px; font-size: 12px; }
            .header { margin-bottom: 20px; }
            .company-info { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .company-details { text-align: left; }
            .company-logo { max-width: 100px; max-height: 60px; margin-bottom: 5px; }
            .po-info { text-align: right; }
            .po-info h2 { margin-top: 0; font-size: 18px; }
            .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .contact-section { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
            .contact-section h3 { margin-top: 0; color: #333; font-size: 14px; margin-bottom: 8px; }
            .contact-section p { margin: 3px 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-size: 11px; }
            .item-image { width: 40px; height: 40px; object-fit: cover; border-radius: 3px; }
            .totals { text-align: right; margin-top: 15px; font-size: 12px; }
            .footer { margin-top: 20px; font-size: 11px; }
            .page-break { page-break-before: always; }
            .company-name { font-size: 16px; font-weight: bold; margin-bottom: 3px; }
            .company-address { font-size: 11px; margin-bottom: 3px; }
            .company-details p { margin: 2px 0; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <div class="company-details">
                ${logoHtml}
                <div class="company-name">${companySettings?.company_name || 'Company Name'}</div>
                <div class="company-address">${companyAddress}</div>
                <p>GSTIN: ${companySettings?.gstin || 'N/A'} | Phone: ${companySettings?.contact_phone || 'N/A'}</p>
                <p>Email: ${companySettings?.contact_email || 'N/A'}</p>
              </div>
              <div class="po-info">
                <h2>PURCHASE ORDER</h2>
                <p><strong>PO Number:</strong> ${po.po_number || 'Draft'}</p>
                <p><strong>Date:</strong> ${po.order_date}</p>
              </div>
            </div>
          </div>
          
          <div class="contact-grid">
            <div class="contact-section">
              <h3>Supplier Information</h3>
              <p><strong>Name:</strong> ${supplierName}</p>
              <p><strong>Contact Person:</strong> ${supplier?.contact_person || 'N/A'}</p>
              <p><strong>Phone:</strong> ${supplier?.phone || 'N/A'}</p>
              <p><strong>Email:</strong> ${supplier?.email || 'N/A'}</p>
              <p><strong>GST Number:</strong> ${supplier?.gst_number || 'N/A'}</p>
              <p><strong>PAN:</strong> ${supplier?.pan || 'N/A'}</p>
              <p><strong>Address:</strong> ${supplierAddress}</p>
            </div>
            <div class="contact-section">
              <h3>Delivery Information</h3>
              <p><strong>Delivery Address:</strong> ${po.delivery_address || supplierAddress}</p>
              <p><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Item</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>UOM</th>
                <th>Unit Price</th>
                <th>GST %</th>
                <th>GST Amount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.item_image_url ? `<img src="${item.item_image_url}" alt="Item" class="item-image">` : '<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 3px;"></div>'}</td>
                  <td>${item.item_name}</td>
                  <td>${item.item_type}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit_of_measure || ''}</td>
                  <td>₹${item.unit_price?.toFixed(2) || '0.00'}</td>
                  <td>${item.gst_rate || 0}%</td>
                  <td>₹${(item.gst_amount || 0).toFixed(2)}</td>
                  <td>₹${(item.line_total || (item.quantity * item.unit_price)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <h3>GST Rate-wise Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">GST Rate (%)</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Subtotal</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">GST Amount</th>
                  <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(totals.gstGroups)
                  .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                  .map(([gstRate, group]) => `
                    <tr>
                      <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${gstRate}%</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.subtotal.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.gstAmount.toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">₹${group.total.toFixed(2)}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
            <div style="border-top: 2px solid #333; padding-top: 10px; margin-top: 10px;">
              <p><strong>Grand Subtotal:</strong> ₹${totals.grandSubtotal.toFixed(2)}</p>
              <p><strong>Total GST Amount:</strong> ₹${totals.grandGstAmount.toFixed(2)}</p>
              <p><strong>Grand Total:</strong> ₹${totals.grandTotal.toFixed(2)}</p>
              <p><strong>Amount in Words:</strong> ${totals.amountInWords}</p>
            </div>
          </div>
          
          ${po.terms_conditions ? `
            <div class="footer">
              <h3>Terms & Conditions</h3>
              <p style="white-space: pre-line;">${po.terms_conditions}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;

    // Share with text message and HTML file (more reliable than PDF)
    if (navigator.share) {
      try {
        // Create HTML file for sharing
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const fileName = `PO_${po.po_number || 'Draft'}_${po.order_date}.html`;
        const file = new File([blob], fileName, { type: 'text/html' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Purchase Order - ${po.po_number || 'Draft'}`,
            text: shareMessage,
            files: [file]
          });
        } else {
          // Fallback: share just the text message
          await navigator.share({
            title: `Purchase Order - ${po.po_number || 'Draft'}`,
            text: shareMessage
          });
        }
      } catch (error) {
        console.log('Share failed:', error);
        // Fallback to download
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const fileName = `PO_${po.po_number || 'Draft'}_${po.order_date}.html`;
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } else {
      // Browser doesn't support sharing, just download the file
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const fileName = `PO_${po.po_number || 'Draft'}_${po.order_date}.html`;
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="purchase-order" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="purchase-order">Purchase Order</TabsTrigger>
          <TabsTrigger value="bom">Bills of Material</TabsTrigger>
        </TabsList>
        
        <TabsContent value="purchase-order" className="space-y-6">
          {bomData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Purchase Order created from BOM: {bomData.bomId}
                </span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Items have been pre-filled from the BOM. Please review quantities and add pricing information.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="flex gap-2">
              {/* Export/Share buttons */}
              <Button variant="outline" onClick={printPO} title="Print Purchase Order">
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button variant="outline" onClick={exportToPDF} title="Export as PDF">
                <FileText className="w-4 h-4 mr-2" /> PDF
              </Button>
              <Button variant="outline" onClick={exportToExcel} title="Export as Excel">
                <Download className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="outline" onClick={sharePO} title="Share Purchase Order">
                <Share2 className="w-4 h-4 mr-2" /> Share
              </Button>
              {!isReadOnly && (
                <Button onClick={save} disabled={loading || !po.supplier_id}>
                  <Save className="w-4 h-4 mr-2" /> Save
                </Button>
              )}
            </div>
          </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Supplier</Label>
              <Select value={po.supplier_id} onValueChange={(v) => setPo({ ...po, supplier_id: v })}>
                <SelectTrigger disabled={isReadOnly}>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.supplier_name} ({s.supplier_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Date</Label>
              <Input type="date" value={po.order_date} onChange={(e) => setPo({ ...po, order_date: e.target.value })} disabled={isReadOnly} />
            </div>
            <div>
              <Label>Expected Delivery</Label>
              <Input type="date" value={po.expected_delivery_date || ''} onChange={(e) => setPo({ ...po, expected_delivery_date: e.target.value })} disabled={isReadOnly} />
            </div>
          </div>

          <div>
            <Label>Delivery Address</Label>
            <Textarea value={po.delivery_address || ''} onChange={(e) => setPo({ ...po, delivery_address: e.target.value })} readOnly={isReadOnly} disabled={isReadOnly} />
          </div>
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea value={po.terms_conditions || ''} onChange={(e) => setPo({ ...po, terms_conditions: e.target.value })} readOnly={isReadOnly} disabled={isReadOnly} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items ({items.length})</CardTitle>
          {!isReadOnly && (
          <Button variant="outline" onClick={addItem}>
            <Plus className="w-4 h-4 mr-2" /> Add Item
          </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>GST %</TableHead>
                  <TableHead>GST Amt</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={idx}>
                                         <TableCell>
                       {(it.item_type === 'item' || it.item_type === 'Zipper' || it.item_type === 'Drawcord' || it.item_type === 'Laces') && it.itemSelections && it.itemSelections.length > 0 ? (
                         // Show first selected image for items
                         it.itemSelections[0].image_url ? (
                           <img src={it.itemSelections[0].image_url} className="w-16 h-16 rounded-lg object-cover" />
                         ) : (
                           <div className="w-16 h-16 rounded-lg bg-muted" />
                         )
                       ) : it.item_image_url ? (
                         // Show main image for other types
                         <img src={it.item_image_url} className="w-16 h-16 rounded-lg object-cover" />
                       ) : (
                         <div className="w-16 h-16 rounded-lg bg-muted" />
                       )}
                     </TableCell>
                    <TableCell>
                      <Select value={it.item_type} onValueChange={(v) => {
                        // reset selection when type changes
                        updateItem(idx, { item_type: v as any, item_id: '', item_name: '', item_image_url: null, item_category: null });
                      }}>
                        <SelectTrigger className="w-28" disabled={isReadOnly}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fabric">Fabric</SelectItem>
                          <SelectItem value="item">Item</SelectItem>
                          <SelectItem value="product">Product</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                                         <TableCell>
                       <div className="flex items-center gap-2">
                         {it.item_type === 'item' || it.item_type === 'Zipper' || it.item_type === 'Drawcord' || it.item_type === 'Laces' ? (
                           // Single dropdown for items: select item type
                           <Select 
                             value={it.item_category || ''} 
                             onValueChange={(v) => {
                               updateItem(idx, { item_category: v, item_id: '', item_name: '', item_image_url: null, itemSelections: [] });
                             }}
                           >
                             <SelectTrigger className="w-80" disabled={isReadOnly}>
                               <SelectValue placeholder="Select Item Type" />
                             </SelectTrigger>
                             <SelectContent>
                               {itemTypeOptions.map((type) => (
                                 <SelectItem key={type} value={type}>{type}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         ) : (
                           // Single dropdown for fabric and product
                           <Select value={it.item_id || ''} onValueChange={(v) => {
                             handleSelectName(idx, v);
                           }}>
                             <SelectTrigger className="w-80" disabled={isReadOnly}>
                               <SelectValue placeholder={`Select ${it.item_type}...`} />
                             </SelectTrigger>
                             <SelectContent>
                               {getOptionsForType(it.item_type).map((o) => (
                                 <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         )}
                        
                        {!isReadOnly && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const t = it.item_type;
                            if (t === 'fabric') navigate('/inventory/fabrics');
                            else if (t === 'item') navigate('/masters/items');
                            else navigate('/masters/products');
                          }}
                          title={`Create new ${it.item_type}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        )}
                      </div>
                      {/* Fabric specific selectors and attributes */}
                      {it.item_type === 'fabric' && it.attributes && (
                        <div className="mt-2">
                          <div className="flex flex-col gap-2 mb-2">
                            {(it.fabricSelections || []).map((sel, sidx) => (
                              <div key={sidx} className="grid grid-cols-12 gap-2 items-center">
                                {/* Color */}
                                <div className="col-span-5">
                                  {Array.isArray((it.attributes as any).colorsList) && (
                                    <Select
                                      value={sel.color}
                                      onValueChange={(v) => {
                                        const next = (it.fabricSelections || []).map((fs, i) => i === sidx ? { ...fs, color: v } : fs);
                                        updateItem(idx, { fabricSelections: next });
                                      }}
                                    >
                                      <SelectTrigger className="w-full" disabled={isReadOnly}>
                                        <SelectValue placeholder="Select color" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(it.attributes as any).colorsList.map((c: string) => (
                                          <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                                {/* GSM */}
                                <div className="col-span-3">
                                  {Array.isArray((it.attributes as any).gsmList) && (
                                    <Select
                                      value={sel.gsm}
                                      onValueChange={(v) => {
                                        const next = (it.fabricSelections || []).map((fs, i) => i === sidx ? { ...fs, gsm: v } : fs);
                                        updateItem(idx, { fabricSelections: next });
                                      }}
                                    >
                                      <SelectTrigger className="w-full" disabled={isReadOnly}>
                                        <SelectValue placeholder="GSM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(it.attributes as any).gsmList.map((g: string) => (
                                          <SelectItem key={g} value={g}>{g}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                                {/* Quantity per selection */}
                                <div className="col-span-3">
                                  <Input
                                    type="number"
                                    className="w-full"
                                    value={sel.quantity}
                                    onChange={(e) => {
                                      const q = parseFloat(e.target.value) || 0;
                                      const next = (it.fabricSelections || []).map((fs, i) => i === sidx ? { ...fs, quantity: q } : fs);
                                      updateItem(idx, { fabricSelections: next });
                                    }}
                                    disabled={isReadOnly}
                                    placeholder="Qty"
                                  />
                                </div>
                                {/* Remove selection */}
                                <div className="col-span-1 flex justify-end">
                                  {!isReadOnly && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => {
                                      const next = (it.fabricSelections || []).filter((_, i) => i !== sidx);
                                      updateItem(idx, { fabricSelections: next });
                                    }}
                                    title="Remove"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                             {!isReadOnly && (
                             <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const next = [...(it.fabricSelections || [])];
                                next.push({ color: '', gsm: '', quantity: 0 });
                                updateItem(idx, { fabricSelections: next });
                              }}
                            >
                              + Add Color/GSM
                            </Button>
                             )}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {'description' in (it.attributes || {}) && (
                              <div className="line-clamp-2"><span className="font-medium text-gray-700">Desc:</span> {String((it.attributes as any).description)}</div>
                            )}
                          </div>
                        </div>
                      )}
                                             {/* Item multiple selection rows */}
                       {(it.item_type === 'item' || it.item_type === 'Zipper' || it.item_type === 'Drawcord' || it.item_type === 'Laces') && (
                        <div className="mt-2">
                          <div className="flex flex-col gap-2 mb-2">
                            {(it.itemSelections && it.itemSelections.length > 0 ? it.itemSelections : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }]).map((sel, sidx) => (
                              <div key={sidx} className="grid grid-cols-12 gap-2 items-center">
                                {/* Thumb */}
                                <div className="col-span-1 flex items-center">
                                  {sel.image_url ? (
                                    <img src={sel.image_url} className="w-8 h-8 rounded object-cover border" />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-muted border" />)
                                  }
                                </div>
                                <div className="col-span-5">
                                  <Select
                                    value={sel.id}
                                    onValueChange={(v) => {
                                      let opt = itemOptions.find(o => o.id === v);
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0, price: it.unit_price || 0 }];
                                      const next = base.map((row, i) => i === sidx ? { id: v, label: opt?.label || '', image_url: opt?.image_url || null, quantity: row.quantity, price: row.price } : row);
                                      // set uom if available from option
                                      const lineImg = (next[0]?.image_url) || it.item_image_url || null;
                                      updateItem(idx, { itemSelections: next, unit_of_measure: opt?.uom || it.unit_of_measure, item_image_url: lineImg, gst_rate: (opt?.gst_rate ?? it.gst_rate ?? 0) });
                                    }}
                                    disabled={!it.item_category}
                                  >
                                    <SelectTrigger className="w-full" disabled={isReadOnly || !it.item_category}>
                                      <SelectValue placeholder={it.item_category ? "Select item name..." : "Select type first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {itemOptions
                                        .filter(o => it.item_category && o.type === it.item_category)
                                        .map((o) => (
                                          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-3">
                                  <Input
                                    type="number"
                                    className="w-full text-right min-w-[88px]"
                                    value={sel.quantity}
                                    onChange={(e) => {
                                      const q = parseFloat(e.target.value) || 0;
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0, price: it.unit_price || 0 }];
                                      const next = base.map((row, i) => i === sidx ? { ...row, quantity: q } : row);
                                      // auto sum quantities of selections into main quantity
                                      const sumQty = next.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                      updateItem(idx, { itemSelections: next, quantity: sumQty });
                                    }}
                                    disabled={isReadOnly}
                                    placeholder="Qty"
                                  />
                                </div>

                                <div className="col-span-1 flex justify-end">
                                  {!isReadOnly && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => {
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0, price: it.unit_price || 0 }];
                                      const next = base.filter((_, i) => i !== sidx);
                                      const sumQty = next.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                      const lineImg = (next[0]?.image_url) || null;
                                      updateItem(idx, { itemSelections: next, quantity: sumQty, item_image_url: lineImg });
                                    }}
                                    title="Remove"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {!isReadOnly && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const next = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0, price: it.unit_price || 0 }];
                                next.push({ id: '', label: '', image_url: null, quantity: 0, price: 0 });
                                updateItem(idx, { itemSelections: next });
                              }}
                            >
                              + Add Item
                            </Button>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Generic attributes for item/product */}
                      {it.attributes && it.item_type === 'product' && (
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {(
                            <>
                          {['name','code','category','base_price','hsn_code','gst_rate'].map((k) => (
                                (it.attributes as any)?.[k] ? (
                                  <div key={k}><span className="font-medium text-gray-700 capitalize">{k.replace('_',' ')}:</span> {String((it.attributes as any)[k])}</div>
                                ) : null
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={it.quantity} disabled className="w-40 bg-muted/50 text-right" />
                    </TableCell>
                    <TableCell>
                      <Input 
                        value={it.unit_of_measure || ''} 
                        onChange={(e) => {
                          // Update immediately for unit of measure - no debouncing
                          updateItem(idx, { unit_of_measure: e.target.value });
                        }} 
                        className="w-24" 
                        disabled={isReadOnly} 
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        value={it.unit_price || ''} 
                        onChange={(e) => {
                          // Update immediately for unit price - no debouncing
                          const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                          updateItem(idx, { unit_price: value });
                        }} 
                        className="w-28" 
                        disabled={isReadOnly} 
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={it.gst_rate ?? 0}
                        onChange={(e) => updateItem(idx, { gst_rate: parseFloat(e.target.value) || 0 })}
                        className="w-20"
                        disabled={isReadOnly}
                      />
                    </TableCell>
                    <TableCell>{(it.gst_amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{(it.line_total ?? (it.quantity * it.unit_price)).toFixed(2)}</TableCell>
                    <TableCell>
                      {!isReadOnly && (
                      <Button variant="outline" size="sm" onClick={() => removeItem(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {/* GST Rate-wise Breakdown Table */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">GST Rate-wise Summary</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GST Rate (%)</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">GST Amount</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(totals.gstGroups)
                    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                    .map(([gstRate, group]) => (
                      <TableRow key={gstRate}>
                        <TableCell className="font-medium">{gstRate}%</TableCell>
                        <TableCell className="text-right">₹{group.subtotal.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{group.gstAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{group.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Grand Total Section */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Grand Subtotal</Label>
                <div className="text-lg font-semibold">₹{totals.grandSubtotal.toFixed(2)}</div>
              </div>
              <div>
                <Label>Total GST Amount</Label>
                <div className="text-lg font-semibold">₹{totals.grandGstAmount.toFixed(2)}</div>
              </div>
              <div>
                <Label>Grand Total</Label>
                <div className="text-xl font-bold text-primary">₹{totals.grandTotal.toFixed(2)}</div>
              </div>
            </div>
            
            {/* Amount in Words */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Amount in Words</Label>
              <div className="text-sm font-medium mt-1 italic">
                {totals.amountInWords}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        
        <TabsContent value="bom" className="space-y-6">
          <BomList />
        </TabsContent>
      </Tabs>
    </div>
  );
}


