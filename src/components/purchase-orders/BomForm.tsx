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

export function BomForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;
  
  // Check for Order data in URL params
  const orderParam = searchParams.get('order');
  const [orderData, setOrderData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [bom, setBom] = useState<BomRecord>({
    product_name: '',
    total_order_qty: 0,
    status: 'draft',
  });
  const [items, setItems] = useState<BomLineItem[]>([]);
  
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; type?: string; gst_rate?: number; uom?: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  
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
    
    // If no item types found, return empty array
    if (result.length === 0) {
      console.log('No item types found');
      return [];
    }
    
    return result;
  }, [itemOptions]);

  // Get filtered items based on selected item type
  const getFilteredItems = useCallback((selectedItemType: string) => {
    const filtered = itemOptions.filter(item => item.type === selectedItemType);
    console.log(`Filtered items for type "${selectedItemType}":`, filtered);
    
    // If no items found for this type, return empty array
    if (filtered.length === 0) {
      console.log(`No items found for type "${selectedItemType}"`);
      return [];
    }
    
    return filtered;
  }, [itemOptions]);

  useEffect(() => {
    fetchCustomers();
    fetchCompanySettings();
    fetchFabrics();
    fetchItems();
    fetchProducts();
    
    if (id) fetchExisting();
    
    // Process Order data if present
    if (orderParam && !id) {
      try {
        const decodedOrderData = JSON.parse(decodeURIComponent(orderParam));
        setOrderData(decodedOrderData);
        
        // Pre-fill BOM data from order
        if (decodedOrderData.order_item) {
          setBom(prev => ({
            ...prev,
            order_id: decodedOrderData.order_id,
            order_item_id: decodedOrderData.order_item_id,
            product_name: decodedOrderData.order_item.product_description || '',
            product_image_url: decodedOrderData.order_item.category_image_url || null,
            total_order_qty: decodedOrderData.order_item.quantity || 0,
          }));
        }
      } catch (error) {
        console.error('Error parsing Order data:', error);
      }
    }
  }, [id, orderParam]);

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
    const { data, error } = await supabase
      .from('fabrics')
      .select('id, name, image_url')
      .order('name');
    
    if (error) {
      console.error('Error fetching fabrics:', error);
    }
    
    setFabricOptions((data || []).map((f: any) => ({ id: f.id, label: f.name, image_url: f.image_url || null })));
  };

  const fetchItems = async () => {
    try {
      // First, let's check what columns exist in the item_master table
      const { data: columns, error: columnsError } = await supabase
        .from('item_master')
        .select('*')
        .limit(1);
      
      if (columnsError) {
        console.error('Error checking item_master structure:', columnsError);
        setItemOptions([]);
        return;
      }
      
      console.log('item_master table structure:', columns && columns.length > 0 ? Object.keys(columns[0]) : 'No data');
      
      // Try with is_active filter first
      const { data, error } = await supabase
        .from('item_master')
        .select('id, item_name, item_type, gst_rate, unit_of_measure, image_url, category')
        .eq('is_active', true)
        .order('item_name');
      
      if (error) {
        console.error('Error fetching items with is_active filter:', error);
        // Fallback: try without is_active filter
        const { data: data2, error: error2 } = await supabase
          .from('item_master')
          .select('id, item_name, item_type, gst_rate, unit_of_measure, image_url, category')
          .order('item_name');
        
        if (error2) {
          console.error('Error fetching items (fallback):', error2);
          setItemOptions([]);
          return;
        }
        
        console.log('Raw item data (fallback):', data2);
        
        const mappedItems = (data2 || []).map((item: any) => ({ 
          id: item.id, 
          label: item.item_name, 
          image_url: item.image_url || null,
          type: item.item_type || item.category,
          gst_rate: item.gst_rate || 18,
          uom: item.unit_of_measure || 'PCS'
        }));
        
        console.log('Mapped item options:', mappedItems);
        setItemOptions(mappedItems);
        return;
      }
      
      console.log('Raw item data:', data);
      
      const mappedItems = (data || []).map((item: any) => ({ 
        id: item.id, 
        label: item.item_name, 
        image_url: item.image_url || null,
        type: item.item_type || item.category,
        gst_rate: item.gst_rate || 18,
        uom: item.unit_of_measure || 'PCS'
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
      // First, let's check what columns exist in the product_master table
      const { data: columns, error: columnsError } = await supabase
        .from('product_master')
        .select('*')
        .limit(1);
      
      if (columnsError) {
        console.error('Error checking product_master structure:', columnsError);
        setProductOptions([]);
        return;
      }
      
      console.log('product_master table structure:', columns && columns.length > 0 ? Object.keys(columns[0]) : 'No data');
      
      // Try with status filter first
      const { data, error } = await supabase
        .from('product_master')
        .select('id, product_name, image_url')
        .eq('status', 'active')
        .order('product_name');
      
      if (error) {
        console.error('Error fetching products with status filter:', error);
        // Fallback: try without status filter
        const { data: data2, error: error2 } = await supabase
          .from('product_master')
          .select('id, product_name, image_url')
          .order('product_name');
        
        if (error2) {
          console.error('Error fetching products (fallback):', error2);
          setProductOptions([]);
          return;
        }
        
        console.log('Raw product data (fallback):', data2);
        setProductOptions((data2 || []).map((p: any) => ({ id: p.id, label: p.product_name, image_url: p.image_url || null })));
        return;
      }
      
      console.log('Raw product data:', data);
      setProductOptions((data || []).map((p: any) => ({ id: p.id, label: p.product_name, image_url: p.image_url || null })));
    } catch (err) {
      console.error('Exception in fetchProducts:', err);
      setProductOptions([]);
    }
  };

  const fetchExisting = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      // Fetch BOM record
      const { data: bomData, error: bomError } = await supabase
        .from('bom_records')
        .select('*')
        .eq('id', id)
        .single();
      
      if (bomError) throw bomError;
      
      setBom(bomData);
      
      // Fetch BOM items
      const { data: itemsData, error: itemsError } = await supabase
        .from('bom_record_items')
        .select('*')
        .eq('bom_id', id);
      
      if (itemsError) throw itemsError;
      
      // Convert BOM items to line items format and fetch attributes for fabrics
      const lineItems = await Promise.all((itemsData || []).map(async (item: any) => {
        // Parse fabric name to extract color and GSM
        let fabricSelections = undefined;
        let itemSelections = undefined;
        let attributes = null;
        
        if (item.category === 'Fabric') {
          // Parse the item_name to extract color and GSM
          const fabricNameMatch = item.item_name.match(/^(.*?)(?:\s*-\s*([^,]+))?(?:,\s*([0-9]+)\s*GSM)?$/i);
          if (fabricNameMatch) {
            const [, name, color, gsm] = fabricNameMatch;
            fabricSelections = [{
              color: color || '',
              gsm: gsm || '',
              quantity: item.qty_total
            }];
          } else {
            fabricSelections = [{ color: '', gsm: '', quantity: item.qty_total }];
          }
          
          // Fetch fabric attributes for dropdown options
          if (item.item_id) {
            const [{ data: fabric }, { data: variants }] = await Promise.all([
              supabase.from('fabrics').select('*').eq('id', item.item_id).maybeSingle(),
              supabase.from('fabric_variants').select('*').eq('fabric_id', item.item_id),
            ]);
            
            // Extract available colors and GSM from variants
            const colorSet = new Set<string>();
            const gsmSet = new Set<string>();
            (variants || []).forEach((r: any) => {
              if (r.color) colorSet.add(r.color);
              if (r.gsm) gsmSet.add(r.gsm);
            });
            
            // If no variants found, provide some default options
            if (colorSet.size === 0) {
              colorSet.add('Red');
              colorSet.add('Blue');
              colorSet.add('Green');
              colorSet.add('Black');
              colorSet.add('White');
            }
            
            if (gsmSet.size === 0) {
              gsmSet.add('150');
              gsmSet.add('200');
              gsmSet.add('250');
              gsmSet.add('300');
            }
            
            attributes = {
              fabric_name: (fabric as any)?.name || '',
              fabric_gsm: (fabric as any)?.gsm || null,
              description: (fabric as any)?.description || null,
              colorsList: Array.from(colorSet),
              gsmList: Array.from(gsmSet),
            };
          }
                 } else {
           // For items, we don't need itemSelections anymore
           itemSelections = undefined;
         }
        
                 return {
           id: item.id,
           item_type: item.category === 'Fabric' ? 'fabric' : 'item',
           item_id: item.item_id || '',
           item_name: item.item_name,
           quantity: item.qty_total,
           unit_of_measure: item.unit_of_measure,
           qty_per_product: item.qty_per_product,
           qty_total: item.qty_total,
           stock: item.stock,
           to_order: item.to_order,
           item_category: item.category,
           fabricSelections: fabricSelections,
           itemSelections: itemSelections,
           attributes: attributes,
           selected_item_type: item.item_type || ''
         };
      }));
      
      setItems(lineItems);
      
    } catch (error) {
      console.error('Error fetching existing BOM:', error);
      toast.error('Failed to fetch BOM data');
    } finally {
      setLoading(false);
    }
  };

  const addItem = (type: BomLineItem['item_type']) => {
    const newItem: BomLineItem = {
      item_type: type,
      item_id: '',
      item_name: '',
      quantity: 0,
      qty_per_product: 0,
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

  const fetchAndSetAttributes = useCallback(async (index: number, type: BomLineItem['item_type'], entityId: string) => {
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
          supabase.from('fabrics').select('*').eq('id', entityId).maybeSingle(),
          supabase.from('fabric_variants').select('*').eq('fabric_id', entityId),
        ]);
        
        // Extract available colors and GSM from variants
        const colorSet = new Set<string>();
        const gsmSet = new Set<string>();
        (variants || []).forEach((r: any) => {
          if (r.color) colorSet.add(r.color);
          if (r.gsm) gsmSet.add(r.gsm);
        });
        
        console.log('Fabric variants:', variants);
        console.log('Color set:', colorSet);
        console.log('GSM set:', gsmSet);
        
        // If no variants found, provide some default options
        if (colorSet.size === 0) {
          colorSet.add('Red');
          colorSet.add('Blue');
          colorSet.add('Green');
          colorSet.add('Black');
          colorSet.add('White');
        }
        
        if (gsmSet.size === 0) {
          gsmSet.add('150');
          gsmSet.add('200');
          gsmSet.add('250');
          gsmSet.add('300');
        }
        
        const uomCandidate = (variants || []).find((v: any) => !!v.uom)?.uom || 'MTR';
        const attrs: Record<string, any> = {
          fabric_name: (fabric as any)?.name || '',
          fabric_gsm: (fabric as any)?.gsm || null,
          description: (fabric as any)?.description || null,
          colorsList: Array.from(colorSet),
          gsmList: Array.from(gsmSet),
        };
        
        console.log('Attributes being set:', attrs);
        
        // Start with one empty fabric selection for manual input
        const fabricSelections = [{ color: '', gsm: '', quantity: 0 }];
        
        const updateData = { 
          attributes: attrs, 
          unit_of_measure: uomCandidate, 
          item_image_url: (fabric as any)?.image_url || null,
          fabricSelections: fabricSelections
        };
        attributesCache.current.set(cacheKey, updateData);
        updateItem(index, updateData);
        return;
      }
             if (type === 'item') {
         const { data: item } = await supabase.from('item_master').select('*').eq('id', entityId).maybeSingle();
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
           item_category: (item as any)?.item_type || null,
         };
         attributesCache.current.set(cacheKey, updateData);
         updateItem(index, updateData);
         return;
       }
      if (type === 'product') {
        let attrs: Record<string, any> = {};
        const { data: pm } = await supabase.from('product_master').select('*').eq('id', entityId).maybeSingle();
        if (pm) {
          ['code', 'category', 'base_price', 'hsn_code', 'gst_rate'].forEach((k) => {
            if (pm[k] != null && pm[k] !== '') attrs[k] = pm[k];
          });
        } else {
          const { data: p } = await supabase.from('products').select('*').eq('id', entityId).maybeSingle();
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

  const save = async () => {
    if (!bom.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (items.length === 0) {
      toast.error('At least one item is required');
      return;
    }

    try {
      setLoading(true);

             // Prepare BOM record data
       const bomData = {
         product_name: bom.product_name,
         product_image_url: bom.product_image_url,
         total_order_qty: bom.total_order_qty,
         status: bom.status || 'draft',
         ...(bom.order_id && { order_id: bom.order_id }),
         ...(bom.order_item_id && { order_item_id: bom.order_item_id }),
       };

      let bomId = bom.id;

      if (bomId) {
        // Update existing BOM
        const { error: bomError } = await supabase
          .from('bom_records')
          .update(bomData)
          .eq('id', bomId);

        if (bomError) throw bomError;

        // Delete existing items
        await supabase
          .from('bom_record_items')
          .delete()
          .eq('bom_id', bomId);
      } else {
        // Create new BOM
        const { data: newBom, error: bomError } = await supabase
          .from('bom_records')
          .insert(bomData)
          .select('id')
          .single();

        if (bomError) throw bomError;
        bomId = newBom.id;
      }

             // Prepare BOM items data
       const bomItems = [];
       
       for (const item of items) {
         const base = {
           bom_id: bomId,
           item_id: item.item_id || null,
           item_name: item.item_name,
           category: item.item_type === 'fabric' ? 'Fabric' : item.item_category || 'Item',
           unit_of_measure: item.unit_of_measure || 'pcs',
           qty_per_product: item.qty_per_product || 0,
           qty_total: item.qty_total || 0,
           stock: item.stock || 0,
           to_order: item.to_order || 0,
         };

                   // Add additional data for fabrics and items
          if (item.item_type === 'fabric' && item.fabricSelections && item.fabricSelections.length > 0) {
            // Create separate BOM items for each fabric variant
            item.fabricSelections.forEach(selection => {
              bomItems.push({
                ...base,
                item_name: `${item.item_name} - ${selection.color || ''}, ${selection.gsm || ''} GSM`,
                qty_total: selection.quantity || 0,
                to_order: selection.quantity || 0
              });
            });
          } else {
            // For items and products, use the main quantity
            bomItems.push({
              ...base,
              qty_total: item.quantity || item.qty_total || 0,
              to_order: item.to_order || 0
            });
          }
       }

       // Insert BOM items
       if (bomItems.length > 0) {
         const { error: itemsError } = await supabase
           .from('bom_record_items')
           .insert(bomItems);

        if (itemsError) throw itemsError;
      }

      toast.success(bomId ? 'BOM updated successfully' : 'BOM created successfully');
      navigate(`/procurement/bom/${bomId}`);
    } catch (error) {
      console.error('Error saving BOM:', error);
      toast.error('Failed to save BOM');
    } finally {
      setLoading(false);
    }
  };

  const handleItemTypeChange = (index: number, newType: BomLineItem['item_type']) => {
    const item = items[index];
    if (item.item_type === newType) return;

    // Reset item data when type changes
    const resetItem: BomLineItem = {
      ...item,
      item_type: newType,
      item_id: '',
      item_name: '',
      quantity: 0,
      qty_per_product: 0,
      qty_total: 0,
      stock: 0,
      to_order: 0,
      unit_of_measure: newType === 'fabric' ? 'Kgs' : 'pcs',
      fabricSelections: newType === 'fabric' ? [{ color: '', gsm: '', quantity: 0 }] : undefined,
      attributes: null,
      selected_item_type: '',
    };

    updateItem(index, resetItem);
  };

  const handleItemSelection = (index: number, type: BomLineItem['item_type'], selectedId: string) => {
    const item = items[index];
    
    let found: any = null;
    let label = '';

    if (type === 'fabric') {
      found = fabricOptions.find(f => f.id === selectedId);
      label = found?.label || '';
    } else if (type === 'item') {
      found = itemOptions.find(i => i.id === selectedId);
      label = found?.label || '';
    } else if (type === 'product') {
      found = productOptions.find(p => p.id === selectedId);
      label = found?.label || '';
    }

    if (found) {
      updateItem(index, {
        item_id: selectedId,
        item_name: label,
        item_image_url: found.image_url || null,
      });

      // Fetch additional attributes
      fetchAndSetAttributes(index, type, selectedId);
    }
  };

       // Recalculate fabric totals when BOM total order quantity changes
  useEffect(() => {
    items.forEach((item, index) => {
      if (item.item_type === 'fabric' && item.fabricSelections && item.fabricSelections.length > 0) {
        const totalQuantity = item.fabricSelections.reduce((sum, sel) => sum + (sel.quantity || 0), 0);
        const qtyPerProduct = bom.total_order_qty > 0 ? totalQuantity / bom.total_order_qty : 0;
        const toOrder = Math.max(totalQuantity - (item.stock || 0), 0);
        
        updateItem(index, {
          qty_total: totalQuantity,
          qty_per_product: qtyPerProduct,
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
        // For fabrics, sum up all fabric selections
        const fabricTotal = (item.fabricSelections || []).reduce((sum, selection) => sum + (selection.quantity || 0), 0);
        totalFabrics += fabricTotal;
        totalToOrder += fabricTotal;
      } else {
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

  if (loading && !isEditMode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/procurement')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEditMode ? 'Edit BOM' : 'Create New BOM'}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? 'Modify existing Bill of Materials' : 'Create a new Bill of Materials'}
            </p>
          </div>
        </div>
                 <div className="flex gap-2">
           <Button variant="outline" onClick={() => navigate('/procurement')}>
             Cancel
           </Button>
           {isReadOnly && (
             <Button 
               variant="outline" 
               onClick={() => navigate(`/procurement/bom/${id}?edit=1`)}
             >
               Edit
             </Button>
           )}
           {!isReadOnly && (
             <Button onClick={save} disabled={loading}>
               <Save className="w-4 h-4 mr-2" />
               {loading ? 'Saving...' : 'Save BOM'}
             </Button>
           )}
           {isReadOnly && items.length > 0 && (
             <Button 
               onClick={() => {
                                   const bomData = encodeURIComponent(JSON.stringify({
                    bomId: bom.id,
                    items: items.flatMap(item => {
                      if (item.item_type === 'fabric') {
                        // For fabrics, create separate items for each fabric selection
                        return (item.fabricSelections || []).map(fabricSelection => ({
                          item_type: 'fabric',
                          item_id: item.item_id || '',
                          item_name: item.item_name,
                          quantity: fabricSelection.quantity || 0,
                          unit_price: 0,
                          unit_of_measure: item.unit_of_measure || 'Kgs',
                          item_image_url: item.item_image_url,
                          fabricSelections: [{
                            color: fabricSelection.color || '',
                            gsm: fabricSelection.gsm || '',
                            quantity: fabricSelection.quantity || 0
                          }]
                        }));
                      } else {
                        // For items, use the first item selection
                        const itemSelection = item.itemSelections?.[0] || { id: '', label: '', quantity: 0, price: 0 };
                        return [{
                          item_type: 'item',
                          item_id: item.item_id || '',
                          item_name: item.item_name,
                          quantity: item.to_order || item.qty_total,
                          unit_price: 0,
                          unit_of_measure: item.unit_of_measure || 'pcs',
                          item_category: item.item_category || null,
                          item_image_url: item.item_image_url,
                          itemSelections: [{
                            id: item.item_id || '',
                            label: item.item_name,
                            image_url: item.item_image_url,
                            quantity: item.to_order || item.qty_total,
                            price: 0
                          }]
                        }];
                      }
                    })
                  }));
                 navigate(`/procurement/po/new?bom=${bomData}`);
               }}
               className="bg-blue-600 hover:bg-blue-700"
             >
               <FileText className="w-4 h-4 mr-2" />
               Create PO from BOM
             </Button>
           )}
         </div>
      </div>

      {/* BOM Details */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">Created from Order: {orderData.order_number}</div>
              <div className="text-sm text-muted-foreground">Customer: {orderData.customer?.company_name}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BOM Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>BOM Items</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addItem('fabric')}
                disabled={isReadOnly}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Fabric
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addItem('item')}
                disabled={isReadOnly}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items added yet. Add fabrics or items to create your BOM.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Item Image */}
                    <div className="w-16 h-16 bg-muted rounded overflow-hidden flex items-center justify-center">
                      {item.item_image_url ? (
                        <img src={item.item_image_url} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-muted-foreground">IMG</span>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 space-y-3">
                                                                     <div className="grid grid-cols-1 lg:grid-cols-4 md:grid-cols-2 gap-4">
                          {/* Item Type */}
                          <div className="relative z-10">
                            <Label>Item Type</Label>
                            <Select
                              value={item.item_type}
                              onValueChange={(value) => handleItemTypeChange(index, value as BomLineItem['item_type'])}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-50">
                                <SelectItem value="fabric">Fabric</SelectItem>
                                <SelectItem value="item">Item</SelectItem>
                                <SelectItem value="product">Product</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Item Type Selection (for items) */}
                          {item.item_type === 'item' && (
                            <div className="relative z-10">
                              <Label>Select Item Type</Label>
                              <Select
                                value={item.selected_item_type || ''}
                                onValueChange={(value) => {
                                  console.log('Selected item type:', value);
                                  updateItem(index, { 
                                    selected_item_type: value,
                                    item_id: '',
                                    item_name: ''
                                  });
                                }}
                                disabled={isReadOnly}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select item type..." />
                                </SelectTrigger>
                                                                 <SelectContent className="z-50" position="popper">
                                   {console.log('Rendering item types dropdown with:', itemTypes)}
                                   {itemTypes.length > 0 ? itemTypes.map(type => (
                                     <SelectItem key={type} value={type}>
                                       {type}
                                     </SelectItem>
                                   )) : (
                                     <SelectItem value="no-types" disabled>
                                       No item types available
                                     </SelectItem>
                                   )}
                                 </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Item Selection */}
                          <div className="relative z-10">
                            <Label>
                              {item.item_type === 'fabric' ? 'Select Fabric' : 
                               item.item_type === 'item' ? 'Select Item' : 'Select Product'}
                            </Label>
                            <Select
                              value={item.item_id}
                              onValueChange={(value) => handleItemSelection(index, item.item_type, value)}
                              disabled={isReadOnly || (item.item_type === 'item' && !item.selected_item_type)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={
                                  item.item_type === 'item' && !item.selected_item_type 
                                    ? 'Select item type first...' 
                                    : `Select ${item.item_type}...`
                                } />
                              </SelectTrigger>
                              <SelectContent className="z-50">
                                {item.item_type === 'fabric' && fabricOptions.map(option => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                                {item.item_type === 'item' && item.selected_item_type && 
                                  getFilteredItems(item.selected_item_type).map(option => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.label}
                                    </SelectItem>
                                  ))
                                }
                                {item.item_type === 'product' && productOptions.map(option => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Item Name */}
                          <div>
                            <Label>Item Name</Label>
                            <Input
                              value={item.item_name}
                              onChange={(e) => updateItem(index, { item_name: e.target.value })}
                              placeholder="Item name"
                              disabled={isReadOnly}
                              className="w-full"
                            />
                          </div>
                        </div>

                       {/* Fabric Selections for Fabric Items - Moved here */}
                       {item.item_type === 'fabric' && item.fabricSelections && item.fabricSelections.length > 0 && (
                         <div>
                           <div className="flex items-center justify-between mb-2">
                             <Label>Fabric Variants</Label>
                             {!isReadOnly && (
                               <Button
                                 type="button"
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   const newSelections = [...(item.fabricSelections || []), { color: '', gsm: '', quantity: 0 }];
                                   updateItem(index, { fabricSelections: newSelections });
                                 }}
                               >
                                 <Plus className="w-4 h-4 mr-1" />
                                 Add Variant
                               </Button>
                             )}
                           </div>
                           <div className="space-y-2">
                             {item.fabricSelections.map((selection, selIndex) => (
                               <div key={selIndex} className="grid grid-cols-4 gap-2 p-2 border rounded">
                                 {/* Color Dropdown */}
                                 <Select
                                   value={selection.color}
                                   onValueChange={(value) => {
                                     const newSelections = [...(item.fabricSelections || [])];
                                     newSelections[selIndex] = { ...selection, color: value };
                                     updateItem(index, { fabricSelections: newSelections });
                                   }}
                                   disabled={isReadOnly}
                                 >
                                   <SelectTrigger>
                                     <SelectValue placeholder="Select Color" />
                                   </SelectTrigger>
                                                                       <SelectContent>
                                      {console.log('Colors list:', item.attributes?.colorsList)}
                                      {(item.attributes?.colorsList || []).map((color: string) => (
                                        <SelectItem key={color} value={color}>
                                          {color}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                 </Select>
                                 
                                 {/* GSM Dropdown */}
                                 <Select
                                   value={selection.gsm}
                                   onValueChange={(value) => {
                                     const newSelections = [...(item.fabricSelections || [])];
                                     newSelections[selIndex] = { ...selection, gsm: value };
                                     updateItem(index, { fabricSelections: newSelections });
                                   }}
                                   disabled={isReadOnly}
                                 >
                                   <SelectTrigger>
                                     <SelectValue placeholder="Select GSM" />
                                   </SelectTrigger>
                                                                       <SelectContent>
                                      {console.log('GSM list:', item.attributes?.gsmList)}
                                      {(item.attributes?.gsmList || []).map((gsm: string) => (
                                        <SelectItem key={gsm} value={gsm}>
                                          {gsm}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                 </Select>
                                 
                                                                   {/* Quantity Input */}
                                  <Input
                                    type="number"
                                    placeholder="Qty"
                                    value={selection.quantity}
                                    onChange={(e) => {
                                      const newSelections = [...(item.fabricSelections || [])];
                                      newSelections[selIndex] = { ...selection, quantity: parseFloat(e.target.value) || 0 };
                                      
                                      // Calculate totals automatically
                                      const totalQuantity = newSelections.reduce((sum, sel) => sum + (sel.quantity || 0), 0);
                                      const qtyPerProduct = bom.total_order_qty > 0 ? totalQuantity / bom.total_order_qty : 0;
                                      const toOrder = Math.max(totalQuantity - (item.stock || 0), 0);
                                      
                                      updateItem(index, { 
                                        fabricSelections: newSelections,
                                        qty_total: totalQuantity,
                                        qty_per_product: qtyPerProduct,
                                        to_order: toOrder
                                      });
                                    }}
                                    disabled={isReadOnly}
                                  />
                                 
                                 {/* Remove Button */}
                                 {!isReadOnly && item.fabricSelections && item.fabricSelections.length > 1 && (
                                                                       <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newSelections = item.fabricSelections?.filter((_, i) => i !== selIndex) || [];
                                        
                                        // Recalculate totals after removing variant
                                        const totalQuantity = newSelections.reduce((sum, sel) => sum + (sel.quantity || 0), 0);
                                        const qtyPerProduct = bom.total_order_qty > 0 ? totalQuantity / bom.total_order_qty : 0;
                                        const toOrder = Math.max(totalQuantity - (item.stock || 0), 0);
                                        
                                        updateItem(index, { 
                                          fabricSelections: newSelections,
                                          qty_total: totalQuantity,
                                          qty_per_product: qtyPerProduct,
                                          to_order: toOrder
                                        });
                                      }}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                     <X className="w-4 h-4" />
                                   </Button>
                                 )}
                               </div>
                             ))}
                           </div>
                         </div>
                       )}

                                               {/* Quantity and Stock Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                          {/* Quantity */}
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const quantity = parseFloat(e.target.value) || 0;
                                const qtyPerProduct = bom.total_order_qty > 0 ? quantity / bom.total_order_qty : 0;
                                const toOrder = Math.max(quantity - (item.stock || 0), 0);
                                updateItem(index, { 
                                  quantity: quantity,
                                  qty_total: quantity,
                                  qty_per_product: qtyPerProduct,
                                  to_order: toOrder
                                });
                              }}
                              placeholder="0"
                              disabled={isReadOnly}
                            />
                          </div>

                          {/* Quantity per Product */}
                          <div>
                            <Label>Qty per Product</Label>
                            <Input
                              type="number"
                              value={item.qty_per_product}
                              placeholder="0"
                              disabled={true}
                              className="bg-muted"
                            />
                          </div>

                          {/* Total Quantity */}
                          <div>
                            <Label>Total Qty</Label>
                            <Input
                              type="number"
                              value={item.qty_total}
                              placeholder="0"
                              disabled={true}
                              className="bg-muted"
                            />
                          </div>

                         {/* Stock */}
                         <div>
                           <Label>In Stock</Label>
                           <Input
                             type="number"
                             value={item.stock}
                             onChange={(e) => {
                               const stock = parseFloat(e.target.value) || 0;
                               const toOrder = Math.max((item.qty_total || 0) - stock, 0);
                               updateItem(index, { stock, to_order: toOrder });
                             }}
                             placeholder="0"
                             disabled={isReadOnly}
                           />
                         </div>

                                                   {/* To Order */}
                          <div>
                            <Label>To Order</Label>
                            <Input
                              type="number"
                              value={item.to_order}
                              placeholder="0"
                              disabled={true}
                              className="font-semibold text-blue-600 bg-muted"
                            />
                          </div>
                        </div>

                       {/* Unit of Measure */}
                       <div>
                         <Label>Unit of Measure</Label>
                         <Input
                           value={item.unit_of_measure}
                           onChange={(e) => updateItem(index, { unit_of_measure: e.target.value })}
                           placeholder="pcs, kgs, mtr, etc."
                           disabled={isReadOnly}
                         />
                       </div>

                      

                      {/* Notes */}
                      <div>
                        <Label>Notes</Label>
                        <Textarea
                          value={item.notes || ''}
                          onChange={(e) => updateItem(index, { notes: e.target.value })}
                          placeholder="Additional notes..."
                          disabled={isReadOnly}
                        />
                      </div>
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
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>BOM Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{totals.totalItems}</div>
                <div className="text-sm text-muted-foreground">Total Items</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{totals.totalFabrics}</div>
                <div className="text-sm text-muted-foreground">Total Fabrics</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{totals.totalToOrder}</div>
                <div className="text-sm text-muted-foreground">Total to Order</div>
              </div>
            </div>
          </CardContent>
                 </Card>
       )}
     </div>
     </ErpLayout>
   );
 }
