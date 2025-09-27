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
  // Fabric specific fields for display
  fabric_name?: string;
  fabric_color?: string;
  fabric_gsm?: string;
  // Mark if fabric is pre-filled from order
  is_prefilled?: boolean;
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

export function BomForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;
  
  // Check for Order data in URL params
  const orderParam = searchParams.get('order');
  const [orderData, setOrderData] = useState<any>(null);
  const [orderFabricData, setOrderFabricData] = useState<any>(null);

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
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null; color?: string; gsm?: string; rate?: number }[]>([]);
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

  // Get unique fabric names
  const getUniqueFabricNames = useCallback(() => {
    const names = new Set<string>();
    fabricOptions.forEach(fabric => {
      if (fabric.label) {
        names.add(fabric.label);
      }
    });
    return Array.from(names).sort();
  }, [fabricOptions]);

  // Get colors for selected fabric name
  const getColorsForFabric = useCallback((fabricName: string) => {
    const colors = new Set<string>();
    fabricOptions.forEach(fabric => {
      if (fabric.label === fabricName && fabric.color) {
        colors.add(fabric.color);
      }
    });
    return Array.from(colors).sort();
  }, [fabricOptions]);

  // Get GSM for selected fabric name and color
  const getGsmForFabricAndColor = useCallback((fabricName: string, color: string) => {
    const gsm = new Set<string>();
    fabricOptions.forEach(fabric => {
      if (fabric.label === fabricName && fabric.color === color && fabric.gsm) {
        gsm.add(fabric.gsm);
      }
    });
    return Array.from(gsm).sort();
  }, [fabricOptions]);

  // Get fabric by name, color, and GSM
  const getFabricByDetails = useCallback((fabricName: string, color: string, gsm: string) => {
    return fabricOptions.find(fabric => 
      fabric.label === fabricName && 
      fabric.color === color && 
      fabric.gsm === gsm
    );
  }, [fabricOptions]);

  useEffect(() => {
    fetchCustomers();
    fetchCompanySettings();
    fetchFabrics();
    fetchItems();
    fetchProducts();
    
    if (id) fetchExisting();
    
    // Process Order data if present
    if (orderParam && !id) {
      // Check if orderParam is a JSON string or just an order ID
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
        // If parsing fails, treat it as an order ID
        console.log('Order param is not JSON, treating as order ID:', orderParam);
        fetchOrderData(orderParam);
      }
    }
  }, [id, orderParam]);

  // Auto-add fabric items when order fabric data is available
  useEffect(() => {
    if (orderFabricData && orderFabricData.length > 0 && items.length === 0) {
      const fabricItems: BomLineItem[] = orderFabricData.map((fabricItem: any) => ({
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
        item_image_url: fabricItem.fabric?.image || null,
        // Add fabric details for display
        fabric_name: fabricItem.fabric?.fabric_name || '',
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
    const { data, error } = await supabase
      .from('fabric_master')
      .select('id, fabric_name, color, gsm, rate, image')
      .order('fabric_name');
    
    if (error) {
      console.error('Error fetching fabrics:', error);
    }
    
    setFabricOptions((data || []).map((f: any) => ({ 
      id: f.id, 
      label: f.fabric_name, 
      image_url: f.image || null,
      color: f.color,
      gsm: f.gsm,
      rate: f.rate
    })));
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

      // First try product_master
      const result1 = await supabase
        .from('product_master')
        .select('id, product_name, image_url')
        .order('product_name');
      
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

  const fetchOrderData = async (orderId: string) => {
    try {
      // Fetch order with order_items and fabric information
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            product_description,
            category_image_url,
            fabric_id,
            gsm,
            color,
            product:products(name, code, category)
          )
        `)
        .eq('id', orderId as any)
        .single();

      if (orderError) throw orderError;

      setOrderData(order as any);
      
      // Extract fabric information from order items
      const fabricItems = (order as any)?.order_items?.filter((item: any) => item.fabric_id) || [];
      if (fabricItems.length > 0) {
        // Fetch fabric details separately to avoid join issues
        const fabricIds = fabricItems.map((item: any) => item.fabric_id).filter(Boolean);
        if (fabricIds.length > 0) {
          const { data: fabrics, error: fabricError } = await supabase
            .from('fabric_master')
            .select('id, fabric_name, color, gsm, rate, image')
            .in('id', fabricIds);
          
          if (!fabricError && fabrics) {
            // Merge fabric data with order items
            const enrichedFabricItems = fabricItems.map((item: any) => {
              const fabric = fabrics.find((f: any) => f.id === item.fabric_id);
              return {
                ...item,
                fabric: fabric
              };
            });
            setOrderFabricData(enrichedFabricItems);
          } else {
            setOrderFabricData(fabricItems);
          }
        }
      }

      // Pre-fill BOM data from order
      if ((order as any)?.order_items && (order as any).order_items.length > 0) {
        const firstItem = (order as any).order_items[0];
        setBom(prev => ({
          ...prev,
          order_id: (order as any).id,
          product_name: firstItem.product_description || firstItem.product?.name || '',
          product_image_url: firstItem.category_image_url || firstItem.product?.image_url || null,
          total_order_qty: (order as any).order_items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
        }));
      }
    } catch (error) {
      console.error('Error fetching order data:', error);
      toast.error('Failed to load order data');
    }
  };

  const fetchExisting = async () => {
    if (!id) return;
    
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
            itemsError = itemsResult3.error;
          } else {
            itemsData = itemsResult3.data;
          }
        } else {
          itemsData = itemsResult2.data;
          }
                 } else {
        itemsData = itemsResult1.data;
         }
        
      if (itemsError) throw itemsError;
      
      // Convert BOM items to line items format
      const lineItems = (itemsData || []).map((item: any) => ({
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
           selected_item_type: item.item_type || ''
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
        item_image_url: found.image_url || null,
      };

      // For fabrics, add fabric-specific fields
      if (type === 'fabric') {
        updateData.fabric_name = found.label;
        updateData.fabric_color = found.color || '';
        updateData.fabric_gsm = found.gsm || '';
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
      }

      updateItem(index, updateData);
    }
  };

  // Handle fabric name selection for new fabrics
  const handleFabricNameSelection = (index: number, fabricName: string) => {
    const colors = getColorsForFabric(fabricName);
    setFabricSelectionState(prev => ({
      ...prev,
      [index]: {
        selectedFabricName: fabricName,
        availableColors: colors,
        selectedColor: undefined,
        availableGsm: undefined
      }
    }));
  };

  // Handle color selection for new fabrics
  const handleColorSelection = (index: number, color: string) => {
    const state = fabricSelectionState[index];
    if (!state?.selectedFabricName) return;

    const gsm = getGsmForFabricAndColor(state.selectedFabricName, color);
    setFabricSelectionState(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        selectedColor: color,
        availableGsm: gsm
      }
    }));
  };

  // Handle GSM selection for new fabrics
  const handleGsmSelection = (index: number, gsm: string) => {
    const state = fabricSelectionState[index];
    if (!state?.selectedFabricName || !state?.selectedColor) return;

    const fabric = getFabricByDetails(state.selectedFabricName, state.selectedColor, gsm);
    if (fabric) {
      updateItem(index, {
        item_id: fabric.id,
        item_name: fabric.label,
        item_image_url: fabric.image_url || null,
        fabric_name: fabric.label,
        fabric_color: fabric.color || '',
        fabric_gsm: fabric.gsm || '',
        qty_per_product: 0 // Reset to 0 for new fabric
      });
    }
  };

  // Handle Qty/Pc change with auto-reset to 1 on focus
  const handleQtyPerProductChange = (index: number, value: string) => {
    const qtyPerProduct = parseFloat(value) || 0; // Default to 1 instead of 0
    const item = items[index];
    const qtyTotal = qtyPerProduct * bom.total_order_qty;
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
        const qtyTotal = item.qty_per_product * bom.total_order_qty;
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

  const save = async () => {
    if (!bom.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (items.length === 0) {
      toast.error('At least one item is required');
      return;
    }

    // Check for duplicate BOM for the same product (only for new BOMs)
    if (!bom.id) {
      try {
        const { data: existingBom, error: checkError } = await supabase
          .from('bom_records')
          .select('id, product_name')
          .eq('product_name', bom.product_name as any)
          .single();

        if (existingBom && !checkError) {
          toast.error(`BOM already exists for product "${bom.product_name}". Please edit the existing BOM instead.`);
          return;
        }
      } catch (error) {
        // If check fails, continue with creation
        console.log('Duplicate check failed, continuing with creation');
      }
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

        // Delete existing items from bom_record_items table
        const deleteResult = await supabase
          .from('bom_record_items')
          .delete()
          .eq('bom_id', bomId as any);
        
        if (deleteResult.error) {
          console.error('Failed to delete existing BOM items:', deleteResult.error);
          throw new Error(`Failed to delete existing BOM items: ${deleteResult.error.message}`);
        } else {
          console.log('Successfully deleted existing BOM items');
        }
      } else {
        // Create new BOM
        console.log('Creating new BOM with data:', bomData);
        
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
        }
      }

             // Prepare BOM items data
       const bomItems = [];
       
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
         };

         // For fabrics, use the main item data (not fabricSelections)
         if (item.item_type === 'fabric') {
              // Get fabric details from selection state or item data
              const fabricState = fabricSelectionState[items.indexOf(item)];
              const fabricName = fabricState?.selectedFabricName || item.fabric_name || item.item_name;
              const fabricColor = fabricState?.selectedColor || item.fabric_color || '';
              const fabricGsm = item.fabric_gsm || '';
              
              const fabricDisplayName = fabricName && fabricColor && fabricGsm 
                ? `${fabricName} - ${fabricColor} - ${fabricGsm} GSM`
                : item.item_name || fabricName || 'Unknown Fabric';
              
              bomItems.push({
                ...base,
                item_name: fabricDisplayName,
                qty_total: item.qty_total || 0,
                to_order: item.to_order || 0,
                // Add fabric-specific fields for better data integrity
                fabric_name: fabricName,
                fabric_color: fabricColor,
                fabric_gsm: fabricGsm
              });
          } else {
            // For items and products, use the main quantity
            bomItems.push({
              ...base,
             qty_total: item.qty_total || 0,
              to_order: item.to_order || 0
            });
          }
       }

       // Insert BOM items
       if (bomItems.length > 0) {
        console.log('Attempting to save BOM items:', bomItems);
        console.log('BOM ID:', bomId);
        
        // Try to save to bom_record_items (the correct table)
        const result = await supabase
           .from('bom_record_items')
           .insert(bomItems);

        if (result.error) {
          console.error('Failed to save BOM items:', result.error);
          console.error('Error details:', JSON.stringify(result.error, null, 2));
          throw new Error(`Failed to save BOM items: ${result.error.message}`);
        } else {
          console.log('Successfully saved BOM items to bom_record_items');
        }
      } else {
        console.warn('No BOM items to save');
      }

      toast.success(bomId ? 'BOM updated successfully' : 'BOM created successfully');
      navigate(`/bom/${bomId}`);
    } catch (error) {
      console.error('Error saving BOM:', error);
      toast.error('Failed to save BOM');
    } finally {
      setLoading(false);
    }
  };

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
            <Button variant="outline" size="sm" onClick={() => navigate('/bom')}>
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
            <Button variant="outline" onClick={() => navigate('/bom')}>
             Cancel
           </Button>
           {isReadOnly && (
             <Button 
               variant="outline" 
                onClick={() => navigate(`/bom/${id}?edit=1`)}
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
                  {items.filter(item => item.item_type === 'fabric').map((item, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Fabric Image */}
                    <div className="w-20 h-20 bg-muted rounded overflow-hidden flex items-center justify-center">
                      {item.item_image_url ? (
                        <img src={item.item_image_url} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-muted-foreground">IMG</span>
                      )}
                    </div>

                      {/* Fabric Details */}
                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        {/* Fabric Name */}
                        <div>
                          <Label className="text-sm font-medium">Fabric</Label>
                          {item.is_prefilled ? (
                            <div className="text-sm font-medium">
                              {item.fabric_name || 'N/A'}
                            </div>
                          ) : (
                            <Select
                              value={fabricSelectionState[index]?.selectedFabricName || ''}
                              onValueChange={(value) => handleFabricNameSelection(index, value)}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Fabric" />
                              </SelectTrigger>
                              <SelectContent>
                                {getUniqueFabricNames().map(name => (
                                  <SelectItem key={name} value={name}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          </div>

                        {/* Color */}
                        <div>
                          <Label className="text-sm font-medium">Color</Label>
                          {item.is_prefilled ? (
                            <div className="text-sm">
                              {item.fabric_color || 'N/A'}
                            </div>
                          ) : (
                              <Select
                              value={fabricSelectionState[index]?.selectedColor || ''}
                              onValueChange={(value) => handleColorSelection(index, value)}
                              disabled={isReadOnly || !fabricSelectionState[index]?.selectedFabricName}
                              >
                                <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Color" />
                                </SelectTrigger>
                              <SelectContent>
                                {(fabricSelectionState[index]?.availableColors || []).map(color => (
                                  <SelectItem key={color} value={color}>
                                    {color}
                                     </SelectItem>
                                ))}
                                 </SelectContent>
                              </Select>
                          )}
                        </div>

                        {/* GSM */}
                        <div>
                          <Label className="text-sm font-medium">Gsm</Label>
                          {item.is_prefilled ? (
                            <div className="text-sm">
                              {item.fabric_gsm ? `${item.fabric_gsm} Gsm` : 'N/A'}
                            </div>
                          ) : (
                            <Select
                              value={item.fabric_gsm || ''}
                              onValueChange={(value) => handleGsmSelection(index, value)}
                              disabled={isReadOnly || !fabricSelectionState[index]?.selectedColor}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select GSM" />
                              </SelectTrigger>
                              <SelectContent>
                                {(fabricSelectionState[index]?.availableGsm || []).map(gsm => (
                                  <SelectItem key={gsm} value={gsm}>
                                    {gsm} Gsm
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          </div>

                        {/* Qty/Pc */}
                          <div>
                          <Label className="text-sm font-medium">Qty/Pc</Label>
                            <Input
                            type="number"
                            value={item.qty_per_product}
                            onChange={(e) => handleQtyPerProductChange(index, e.target.value)}
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
                            {item.qty_total} {item.unit_of_measure || 'Kgs'}
                          </div>
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
                  ))}
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
                    <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Item Image */}
                      <div className="w-20 h-20 bg-muted rounded overflow-hidden flex items-center justify-center">
                        {item.item_image_url ? (
                          <img src={item.item_image_url} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">IMG</span>
                        )}
                      </div>

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

                        {/* Qty/Pc */}
                          <div>
                          <Label className="text-sm font-medium">Qty/Pc</Label>
                            <Input
                              type="number"
                            value={item.qty_per_product}
                              onChange={(e) => {
                              const qtyPerProduct = parseFloat(e.target.value) || 1; // Default to 1 instead of 0
                              const qtyTotal = qtyPerProduct * bom.total_order_qty;
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
                            {item.qty_total} {item.unit_of_measure || 'Pcs'}
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
