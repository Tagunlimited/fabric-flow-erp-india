import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Save, 
  ArrowLeft, 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  FileText, 
  Camera,
  Upload,
  Download,
  Printer,
  Eye,
  Edit,
  Trash2,
  Plus,
  Minus
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ProductImage } from '@/components/ui/OptimizedImage';
import { GRNPrintExport } from './GRNPrintExport';
import { useAuth } from '@/components/auth/AuthProvider';

type GRN = {
  id?: string;
  grn_number: string;
  po_id: string;
  supplier_id: string;
  grn_date: string;
  received_date: string;
  received_by?: string;
  received_at_location: string;
  status: 'draft' | 'received' | 'under_inspection' | 'approved' | 'rejected' | 'partially_approved';
  total_items_received: number;
  total_items_approved: number;
  total_items_rejected: number;
  total_amount_received: number;
  total_amount_approved: number;
  quality_inspector?: string;
  inspection_date?: string;
  inspection_notes?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_by?: string;
};

type GRNItem = {
  id?: string;
  grn_id?: string;
  po_item_id: string;
  item_type: 'fabric' | 'item' | 'product';
  item_id: string;
  item_name: string;
  item_image_url?: string;
  ordered_quantity: number;
  received_quantity: number;
  approved_quantity: number;
  rejected_quantity: number;
  unit_of_measure: string;
  unit_price: number;
  total_price: number;
  gst_rate: number;
  gst_amount: number;
  line_total: number;
  quality_status: 'pending' | 'approved' | 'rejected' | 'damaged';
  batch_number?: string;
  expiry_date?: string;
  condition_notes?: string;
  inspection_notes?: string;
  // Additional fields for display
  fabric_color?: string;
  fabric_gsm?: string;
  fabric_name?: string;
  item_color?: string;
};

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  status: string;
  total_amount: number;
  items: any[];
  grns?: Array<{ id: string; status?: string | null }>;
};

type Supplier = {
  id: string;
  supplier_name: string;
  supplier_code: string;
  contact_person: string;
  phone: string;
  email: string;
  billing_address: string;
};

const GRNForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const isNew = !id;
  const isEdit = isNew || searchParams.get('edit') === '1';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [grn, setGrn] = useState<GRN>({
    grn_number: '',
    po_id: '',
    supplier_id: '',
    grn_date: new Date().toISOString().split('T')[0],
    received_date: new Date().toISOString(),
    received_at_location: 'Receiving Zone',
    status: 'draft',
    total_items_received: 0,
    total_items_approved: 0,
    total_items_rejected: 0,
    total_amount_received: 0,
    total_amount_approved: 0
  });

  const [grnItems, setGrnItems] = useState<GRNItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  // Only Form View is supported now
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch purchase orders for selection
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoadingPOs(true);
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          supplier_id,
          order_date,
          status,
          total_amount,
          supplier:supplier_master(id, supplier_name, supplier_code),
          grns:grn_master(id)
        `)
        // Show all purchase orders regardless of status
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log('Fetched purchase orders:', data?.length || 0, 'orders');

      const purchaseOrderList = ((data as PurchaseOrder[]) || []).map(po => ({
        ...po,
        items: []
      }));
      const poIds = purchaseOrderList.map(po => po.id);

      const receivedByPo = new Map<string, number>();
      const itemsByPo = new Map<string, any[]>();

      if (poIds.length > 0) {
        const { data: poItems, error: poItemsError } = await supabase
          .from('purchase_order_items')
          .select(
            `
              id,
              po_id,
              item_type,
              item_id,
              item_name,
              item_image_url,
              quantity,
              unit_of_measure,
              fabric_name,
              fabric_color,
              fabric_gsm,
              fabric_id
            `
          )
          .in('po_id', poIds);

        if (poItemsError) {
          console.warn('Failed to fetch purchase order line items for GRN form', poItemsError);
        } else {
          (poItems || []).forEach(item => {
            const poId = (item as any).po_id;
            if (!itemsByPo.has(poId)) {
              itemsByPo.set(poId, []);
            }
            itemsByPo.get(poId)!.push(item);
          });
        }

        const { data: grnTotals, error: grnTotalsError } = await supabase
          .from('grn_items')
          .select('received_quantity, purchase_order_items!inner(po_id)')
          .in('purchase_order_items.po_id', poIds);

        if (grnTotalsError) {
          console.warn('Failed to fetch aggregated GRN totals for POs', grnTotalsError);
        } else {
          (grnTotals || []).forEach(entry => {
            const poId = (entry as any)?.purchase_order_items?.po_id;
            if (poId) {
              const current = receivedByPo.get(poId) || 0;
              receivedByPo.set(poId, current + Number((entry as any).received_quantity || 0));
            }
          });
        }
      }
      
      // Filter out POs that are fully received (only for new GRN creation)
      if (isNew) {
        const filteredPOs = purchaseOrderList.filter(po => {
          // Skip POs that already have at least one GRN
          if (po.grns && po.grns.length > 0) {
            return false;
          }

          po.items = itemsByPo.get(po.id) || [];

          const totalOrdered = (po.items || []).reduce((sum, item: any) => sum + Number(item.quantity || 0), 0);
          const totalReceived = receivedByPo.get(po.id) || 0;

          return totalReceived < totalOrdered;
        });
        setPurchaseOrders(filteredPOs as any);
      } else {
        const enrichedPOs = purchaseOrderList.map(po => ({
          ...po,
          items: itemsByPo.get(po.id) || []
        }));
        setPurchaseOrders(enrichedPOs as any);
      }
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast.error('Failed to fetch purchase orders');
    } finally {
      setLoadingPOs(false);
    }
  }, [isNew]);

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_master')
        .select('*')
        .eq('enabled', true as any)
        .order('supplier_name');

      if (error) throw error;
      setSuppliers((data as any) || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to fetch suppliers');
    }
  }, []);

  // Fetch company settings
  const fetchCompanySettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error) throw error;
      setCompanySettings(data);
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
  }, []);

  // Load existing GRN
  const loadGRN = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      
      // Fetch GRN master
      const { data: grnData, error: grnError } = await supabase
        .from('grn_master')
        .select(`
          *,
          purchase_orders(*),
          supplier_master(*)
        `)
        .eq('id', id as any)
        .single();

      if (grnError) throw grnError;

      setGrn(grnData as any);
      setSelectedPO((grnData as any)?.purchase_orders);
      setSelectedSupplier((grnData as any)?.supplier_master);

      // Fetch GRN items
      const { data: itemsData, error: itemsError } = await supabase
        .from('grn_items')
        .select('*')
        .eq('grn_id', id as any)
        .order('created_at');

      if (itemsError) throw itemsError;
      
      // Enrich items with image data
      const enrichedItems = await Promise.all((itemsData || []).map(async (item: any) => {
        let enrichedItem = { ...item };
        
        console.log('Processing GRN item for image enrichment:', {
          item_name: item.item_name,
          item_type: item.item_type,
          item_id: item.item_id,
          current_image_url: item.item_image_url
        });
        
        // If item_image_url is missing, try multiple strategies to fetch it
        if (!item.item_image_url) {
          try {
            if (item.item_type === 'fabric') {
              console.log('Trying to enrich fabric item:', item.item_name);
              
              // Strategy 1: Try to fetch by item_id from fabric_master
              if (item.item_id) {
                const { data: fabricData, error: fabricError } = await supabase
                  .from('fabric_master')
                  .select('id, image, fabric_name, color, gsm')
                  .eq('id', item.item_id)
                  .single();
                
                console.log('Fabric fetch by ID result:', { fabricData, fabricError });
                
                if (fabricData?.image) {
                  enrichedItem.item_image_url = fabricData.image;
                  console.log('✅ Enriched fabric item with image by ID:', item.item_name, fabricData.image);
                }
              }
              
              // Strategy 2: If still no image, try to find by fabric name
              if (!enrichedItem.item_image_url && item.fabric_name) {
                const { data: fabricByName, error: nameError } = await supabase
                  .from('fabric_master')
                  .select('id, image, fabric_name, color, gsm')
                  .ilike('fabric_name', `%${item.fabric_name}%`)
                  .single();
                
                console.log('Fabric fetch by name result:', { fabricByName, nameError });
                
                if (fabricByName?.image) {
                  enrichedItem.item_image_url = fabricByName.image;
                  console.log('✅ Enriched fabric item with image by name:', item.item_name, fabricByName.image);
                }
              }
              
              // Strategy 3: If still no image, try to find by item name
              if (!enrichedItem.item_image_url && item.item_name) {
                const { data: fabricByItemName, error: itemNameError } = await supabase
                  .from('fabric_master')
                  .select('id, image, fabric_name, color, gsm')
                  .ilike('fabric_name', `%${item.item_name.split(' - ')[0]}%`)
                  .single();
                
                console.log('Fabric fetch by item name result:', { fabricByItemName, itemNameError });
                
                if (fabricByItemName?.image) {
                  enrichedItem.item_image_url = fabricByItemName.image;
                  console.log('✅ Enriched fabric item with image by item name:', item.item_name, fabricByItemName.image);
                }
              }
            } else {
              console.log('Trying to enrich regular item:', item.item_name);
              
              // Strategy 1: Try to fetch by item_id from item_master
              if (item.item_id) {
                const { data: itemMasterData, error: itemError } = await supabase
                  .from('item_master')
                  .select('id, image_url, image, item_name, item_type')
                  .eq('id', item.item_id)
                  .single();
                
                console.log('Item master fetch by ID result:', { itemMasterData, itemError });
                
                if (itemMasterData?.image_url || itemMasterData?.image) {
                  enrichedItem.item_image_url = itemMasterData.image_url || itemMasterData.image;
                  console.log('✅ Enriched item with image by ID:', item.item_name, itemMasterData.image_url || itemMasterData.image);
                }
              }
              
              // Strategy 2: If still no image, try to find by item name
              if (!enrichedItem.item_image_url && item.item_name) {
                const { data: itemByName, error: nameError } = await supabase
                  .from('item_master')
                  .select('id, image_url, image, item_name, item_type')
                  .ilike('item_name', `%${item.item_name}%`)
                  .single();
                
                console.log('Item master fetch by name result:', { itemByName, nameError });
                
                if (itemByName?.image_url || itemByName?.image) {
                  enrichedItem.item_image_url = itemByName.image_url || itemByName.image;
                  console.log('✅ Enriched item with image by name:', item.item_name, itemByName.image_url || itemByName.image);
                }
              }
            }
            
            // Log final result
            console.log('Final enrichment result:', {
              item_name: item.item_name,
              original_image_url: item.item_image_url,
              final_image_url: enrichedItem.item_image_url,
              success: !!enrichedItem.item_image_url
            });
            
          } catch (error) {
            console.warn('❌ Failed to enrich image for item:', item.item_name, error);
          }
        } else {
          console.log('✅ Item already has image URL:', item.item_name, item.item_image_url);
        }
        
        return enrichedItem;
      }));
      
      setGrnItems(enrichedItems);

    } catch (error) {
      console.error('Error loading GRN:', error);
      toast.error('Failed to load GRN');
      navigate('/procurement/grn');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchPurchaseOrders();
    fetchSuppliers();
    fetchCompanySettings();
    if (!isNew) {
      loadGRN();
    }
  }, [fetchPurchaseOrders, fetchSuppliers, fetchCompanySettings, loadGRN, isNew]);

  useEffect(() => {
    const channel = supabase
      .channel('grn-po-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          void fetchPurchaseOrders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grn_master' },
        () => {
          void fetchPurchaseOrders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grn_items' },
        () => {
          void fetchPurchaseOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPurchaseOrders]);

  // Do NOT pre-generate GRN numbers on the client.
  // The database trigger will assign a number only when the record is inserted.

  // Handle PO selection
  const handlePOSelect = useCallback(async (poId: string) => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (po) {
      setSelectedPO(po);
      setGrn(prev => ({ 
        ...prev, 
        po_id: po.id,
        supplier_id: po.supplier_id
      }));
      
      // Set supplier
      const supplier = suppliers.find(s => s.id === po.supplier_id);
      if (supplier) {
        setSelectedSupplier(supplier);
      }

      // Convert PO items to GRN items
        // Sort items: fabrics first, then items, maintaining PO order within each type
        const sortedItems = [...(po.items || [])].sort((a, b) => {
          if (a.item_type === 'fabric' && b.item_type !== 'fabric') return -1;
          if (a.item_type !== 'fabric' && b.item_type === 'fabric') return 1;
          return 0; // Keep original order within same type
        });
        
        // Process items in the sorted order
        const items: GRNItem[] = await Promise.all(sortedItems.map(async (item: any, index: number) => {
        console.log('Processing PO item:', {
          id: item.id,
          item_id: item.item_id,
          item_type: item.item_type,
          item_name: item.item_name,
          fabric_id: item.fabric_id,
          fabric_color: item.fabric_color,
          fabric_gsm: item.fabric_gsm,
          fabric_name: item.fabric_name,
          item_color: item.item_color,
          color: item.color,
          item_image_url: item.item_image_url
        });
        
        let itemColor = item.color || item.fabric_color;
        let fabricColor = item.fabric_color;
        let fabricGsm = item.fabric_gsm;
        let fabricName = item.fabric_name;
        let itemImageUrl = item.item_image_url;
        
        // Use the data that's already in the purchase order item first
        // Only fetch additional data if the PO item doesn't have it
        try {
          // First, use the data from the purchase order item itself
          if (item.fabric_color) fabricColor = item.fabric_color;
          if (item.fabric_gsm) fabricGsm = item.fabric_gsm;
          if (item.fabric_name) fabricName = item.fabric_name;
          if (item.item_color) itemColor = item.item_color;
          if (item.item_image_url) itemImageUrl = item.item_image_url;
          
          console.log('Using PO item data:', {
            fabric_color: item.fabric_color,
            fabric_gsm: item.fabric_gsm,
            fabric_name: item.fabric_name,
            item_color: item.item_color,
            item_image_url: item.item_image_url
          });
          
          // Use the PO item data directly since it's already correct after our SQL fix
          // Only search by name if we're missing critical data
          if (item.item_type === 'fabric' && (!fabricColor || !fabricGsm || !fabricName)) {
            console.log('Searching fabric by name for:', item.item_name);
            try {
              const { data: fabricByName, error: nameError } = await supabase
                .from('fabric_master')
                .select('id, color, gsm, fabric_name, image')
                .ilike('fabric_name', `%${item.item_name}%`)
                .single();
              
              console.log('Fabric search by name result:', { fabricByName, nameError });
              
              if (fabricByName) {
                fabricColor = (fabricByName as any).color;
                fabricGsm = (fabricByName as any).gsm;
                fabricName = (fabricByName as any).fabric_name;
                itemColor = (fabricByName as any).color;
                itemImageUrl = (fabricByName as any).image;
                console.log('Updated fabric details from name search:', { fabricColor, fabricGsm, fabricName, itemColor });
              }
            } catch (error) {
              console.log('Fabric search failed, using PO data:', error);
            }
          } else if (item.item_type === 'item' && (!itemColor || !itemImageUrl)) {
            console.log('Searching item by name for:', item.item_name);
            try {
              const { data: itemByName, error: nameError } = await supabase
                .from('item_master')
                .select('id, color, item_name, image_url, image')
                .ilike('item_name', `%${item.item_name}%`)
                .single();
              
              console.log('Item search by name result:', { itemByName, nameError });
              
              if (itemByName) {
                itemColor = (itemByName as any).color;
                itemImageUrl = (itemByName as any).image_url || (itemByName as any).image;
                // Clear fabric data for non-fabric items
                fabricColor = null;
                fabricGsm = null;
                fabricName = null;
                console.log('Updated item details from name search:', { itemColor, itemImageUrl });
              }
            } catch (error) {
              console.log('Item search failed, using PO data:', error);
            }
          }
          
          // Only fetch by item_id as a last resort if we still don't have data
          if (item.item_id && (!fabricColor || !fabricGsm || !fabricName || !itemImageUrl)) {
            if (item.item_type === 'fabric') {
              console.log('Fetching additional fabric data for item_id:', item.item_id);
              const { data: fabricData, error: fabricError } = await supabase
                .from('fabric_master')
                .select('color, gsm, fabric_name, image')
                .eq('id', item.item_id)
                .single();
              
              console.log('Additional fabric data result:', { fabricData, fabricError });
              
              if (fabricData) {
                if (!fabricColor) fabricColor = (fabricData as any).color;
                if (!fabricGsm) fabricGsm = (fabricData as any).gsm;
                if (!fabricName) fabricName = (fabricData as any).fabric_name;
                if (!itemColor) itemColor = (fabricData as any).color;
                if (!itemImageUrl) itemImageUrl = (fabricData as any).image;
                console.log('Updated missing fabric details:', { fabricColor, fabricGsm, fabricName, itemColor });
              }
            } else {
              console.log('Fetching additional item data for item_id:', item.item_id);
              const { data: itemData, error: itemError } = await supabase
                .from('item_master')
                .select('color, item_name, image_url, image')
                .eq('id', item.item_id)
                .single();
              
              console.log('Additional item data result:', { itemData, itemError });
              
              if (itemData) {
                if (!itemColor) itemColor = (itemData as any).color;
                if (!itemImageUrl) itemImageUrl = (itemData as any).image_url || (itemData as any).image;
                console.log('Updated missing item details:', { itemColor, itemImageUrl });
              }
            }
          }
        } catch (error) {
          console.error('Error fetching item/fabric data:', error);
        }
        
        console.log('Final GRN item data:', {
          item_name: item.item_name,
          item_type: item.item_type,
          fabric_color: fabricColor,
          fabric_gsm: fabricGsm,
          fabric_name: fabricName,
          item_color: itemColor,
          item_image_url: itemImageUrl,
          original_po_item: {
            fabric_color: item.fabric_color,
            fabric_gsm: item.fabric_gsm,
            fabric_name: item.fabric_name,
            item_color: item.item_color,
            color: item.color,
            item_image_url: item.item_image_url
          }
        });
        
        // Additional debugging: Check if any fabric data is still empty
        if (item.item_type === 'fabric' && (!fabricColor || !fabricGsm || !fabricName)) {
          console.warn('⚠️ MISSING FABRIC DATA for item:', {
            item_name: item.item_name,
            item_type: item.item_type,
            item_id: item.item_id,
            fabric_color: fabricColor,
            fabric_gsm: fabricGsm,
            fabric_name: fabricName,
            item_color: itemColor
          });
        }
        
        // Additional debugging: Check if image URL is missing
        if (!itemImageUrl) {
          console.warn('⚠️ MISSING IMAGE URL for item:', {
            item_name: item.item_name,
            item_type: item.item_type,
            item_id: item.item_id,
            original_image_url: item.item_image_url,
            final_image_url: itemImageUrl
          });
        }
        
        return {
          po_item_id: item.id,
          item_type: item.item_type || 'item',
          item_id: item.item_id,
          item_name: item.item_name,
          item_image_url: itemImageUrl,
          ordered_quantity: item.quantity || 0,
          received_quantity: 0, // To be filled by user
          approved_quantity: 0,
          rejected_quantity: 0,
          unit_of_measure: item.unit_of_measure || 'pcs',
          unit_price: item.unit_price || 0,
          total_price: 0,
          gst_rate: item.gst_rate || 0,
          gst_amount: 0,
          line_total: 0,
          quality_status: 'pending',
          fabric_color: fabricColor,
          fabric_gsm: fabricGsm,
          fabric_name: fabricName,
          item_color: itemColor
        };
      }));

      setGrnItems(items);
    }
  }, [purchaseOrders, suppliers, supabase]);

  // Auto-select PO from URL query parameter (must be after handlePOSelect is defined)
  useEffect(() => {
    const poIdFromUrl = searchParams.get('po');
    
    // Only auto-select if:
    // 1. This is a new GRN
    // 2. There's a PO ID in the URL
    // 3. Purchase orders have been loaded
    // 4. PO hasn't been selected yet
    if (isNew && poIdFromUrl && purchaseOrders.length > 0 && !grn.po_id) {
      const poExists = purchaseOrders.find(po => po.id === poIdFromUrl);
      if (poExists) {
        // Use the existing handlePOSelect function which fetches all item details
        handlePOSelect(poIdFromUrl);
      }
    }
  }, [isNew, searchParams, purchaseOrders, grn.po_id, handlePOSelect]);

  // Update received quantity
  const updateReceivedQuantity = useCallback((index: number, quantity: number) => {
    setGrnItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      
      item.received_quantity = quantity;
      item.total_price = quantity * item.unit_price;
      item.gst_amount = (item.total_price * item.gst_rate) / 100;
      item.line_total = item.total_price + item.gst_amount;
      
      updated[index] = item;
      return updated;
    });
  }, []);

  // Update quality status
  const updateQualityStatus = useCallback((index: number, status: GRNItem['quality_status']) => {
    setGrnItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      
      item.quality_status = status;
      
      // Auto-set approved/rejected quantities based on status
      if (status === 'approved') {
        item.approved_quantity = item.received_quantity;
        item.rejected_quantity = 0;
      } else if (status === 'rejected') {
        item.approved_quantity = 0;
        item.rejected_quantity = item.received_quantity;
      } else if (status === 'damaged') {
        item.approved_quantity = 0;
        item.rejected_quantity = item.received_quantity;
      }
      
      updated[index] = item;
      return updated;
    });
  }, []);

  // Update inventory when GRN is approved
  const updateInventory = useCallback(async (approvedItems: any[]) => {
    try {
      console.log('Updating inventory for approved items:', approvedItems);
      
      // Get a receiving zone bin for placing items
      const { data: receivingBins, error: binError } = await supabase
        .from('bins')
        .select('id, bin_code')
        .eq('location_type', 'RECEIVING_ZONE' as any)
        .eq('is_active', true as any)
        .limit(1);

      if (binError) {
        console.error('Error fetching receiving bins:', binError);
        throw new Error(`Failed to fetch receiving bins: ${binError.message}`);
      }

      if (!receivingBins || receivingBins.length === 0) {
        console.warn('No receiving zone bins found. Please create receiving zone bins first.');
        toast.error('No receiving zone bins found. Please create receiving zone bins first.');
        return;
      }

      const defaultBin = (receivingBins as any)?.[0];
      console.log(`Using default receiving bin: ${defaultBin?.bin_code} (${defaultBin?.id})`);
      
      for (const item of approvedItems) {
        if (item.quality_status === 'approved' && item.approved_quantity > 0) {
          // Only update master table inventory if item_id exists
          if (item.item_id && item.item_type === 'fabric') {
            try {
              // Get current fabric inventory
              const { data: fabricData, error: fetchError } = await supabase
                .from('fabric_master')
                .select('inventory')
                .eq('id', item.item_id)
                .single();

              if (fetchError) {
                console.error('Error fetching fabric inventory:', fetchError);
                console.log('Skipping fabric inventory update for item:', item.item_name);
              } else {
                const currentInventory = (fabricData as any)?.inventory || 0;
                const newInventory = currentInventory + item.approved_quantity;

                // Update fabric_master inventory
                const { error: fabricError } = await supabase
                  .from('fabric_master')
                  .update({
                    inventory: newInventory
                  } as any)
                  .eq('id', item.item_id as any);

                if (fabricError) {
                  console.error('Error updating fabric inventory:', fabricError);
                  console.log('Skipping fabric inventory update for item:', item.item_name);
                } else {
                  console.log(`Updated fabric inventory for ${item.item_name}: ${currentInventory} + ${item.approved_quantity} = ${newInventory}`);
                }
              }
            } catch (error) {
              console.error('Error processing fabric inventory update:', error);
              console.log('Continuing with warehouse inventory insertion...');
            }
          } else if (item.item_id && (item.item_type === 'item' || item.item_type === 'product')) {
            try {
              // Get current item inventory
              const { data: itemData, error: fetchError } = await supabase
                .from('item_master')
                .select('current_stock')
                .eq('id', item.item_id)
                .single();

              if (fetchError) {
                console.error('Error fetching item inventory:', fetchError);
                console.log('Skipping item inventory update for item:', item.item_name);
              } else {
                const currentStock = (itemData as any)?.current_stock || 0;
                const newStock = currentStock + item.approved_quantity;

                // Update item_master inventory
                const { error: itemError } = await supabase
                  .from('item_master')
                  .update({
                    current_stock: newStock
                  } as any)
                  .eq('id', item.item_id as any);

                if (itemError) {
                  console.error('Error updating item inventory:', itemError);
                  console.log('Skipping item inventory update for item:', item.item_name);
                } else {
                  console.log(`Updated item inventory for ${item.item_name}: ${currentStock} + ${item.approved_quantity} = ${newStock}`);
                }
              }
            } catch (error) {
              console.error('Error processing item inventory update:', error);
              console.log('Continuing with warehouse inventory insertion...');
            }
          } else {
            console.log(`Skipping master table inventory update for ${item.item_name} - no item_id or custom item`);
          }

          // Add item to warehouse inventory tracking with consolidation
          try {
            const itemType = (item.item_type === 'fabric' ? 'FABRIC' : 
                            item.item_type === 'product' ? 'PRODUCT' : 'ITEM') as any;
            const itemCode = item.item_code || item.item_name;
            const itemColor = item.item_color || item.fabric_color || null;

            // Check if the same item already exists in the same bin with same status
            // Items are considered the same if they have:
            // - Same item_id (if available) OR same item_code + item_name + color
            // - Same bin_id
            // - Same status
            // - Same unit
            let existingInventory: any = null;
            
            if (item.item_id) {
              // First try to find by item_id
              const { data: existingByItemId, error: findError1 } = await supabase
                .from('warehouse_inventory')
                .select('*')
                .eq('item_id', item.item_id)
                .eq('bin_id', defaultBin?.id)
                .eq('status', 'RECEIVED')
                .eq('item_type', itemType)
                .eq('unit', item.unit_of_measure || 'pcs')
                .limit(1)
                .single();
              
              if (!findError1 && existingByItemId) {
                existingInventory = existingByItemId;
              }
            }

            // If not found by item_id, try by item_code + item_name
            // Note: We'll match items with same code/name even if color differs slightly
            // since they represent the same base item
            if (!existingInventory) {
              const { data: existingByCodeData, error: findError2 } = await supabase
                .from('warehouse_inventory')
                .select(`
                  *,
                  grn_item:grn_item_id (
                    item_color,
                    fabric_color
                  )
                `)
                .eq('item_code', itemCode)
                .eq('item_name', item.item_name)
                .eq('bin_id', defaultBin?.id)
                .eq('status', 'RECEIVED')
                .eq('item_type', itemType)
                .eq('unit', item.unit_of_measure || 'pcs')
                .limit(1);
              
              const existingByCode = existingByCodeData && existingByCodeData.length > 0 ? existingByCodeData[0] : null;
              
              if (!findError2 && existingByCode) {
                // For items with colors, also check color match
                if (itemColor) {
                  const existingColor = (existingByCode as any).grn_item?.item_color || 
                                       (existingByCode as any).grn_item?.fabric_color ||
                                       (existingByCode as any).item_color ||
                                       (existingByCode as any).fabric_color ||
                                       null;
                  if (itemColor === existingColor || !existingColor) {
                    existingInventory = existingByCode;
                  }
                } else {
                  // No color specified, match anyway
                  existingInventory = existingByCode;
                }
              }
            }

            let warehouseInventoryId: string;

            if (existingInventory) {
              // Update existing inventory quantity
              const newQuantity = Number(existingInventory.quantity) + Number(item.approved_quantity);
              
              const { data: updatedInventory, error: updateError } = await supabase
                .from('warehouse_inventory')
                .update({
                  quantity: newQuantity,
                  updated_at: new Date().toISOString()
                } as any)
                .eq('id', existingInventory.id)
                .select()
                .single();

              if (updateError) {
                console.error('Error updating warehouse inventory:', updateError);
                throw updateError;
              }

              warehouseInventoryId = updatedInventory.id;
              console.log(`Updated existing inventory for ${item.item_name}: ${existingInventory.quantity} + ${item.approved_quantity} = ${newQuantity}`);
            } else {
              // Insert new inventory entry
              const insertData: any = {
                grn_id: grn.id,
                grn_item_id: item.id,
                item_type: itemType,
                item_id: item.item_id || null,
                item_name: item.item_name,
                item_code: itemCode,
                quantity: item.approved_quantity,
                unit: item.unit_of_measure || 'pcs',
                bin_id: defaultBin?.id,
                status: 'RECEIVED' as any,
                notes: `Auto-placed from GRN ${grn.grn_number}`
              };
              
              // Add color fields if they exist in the table schema
              if (itemColor) {
                if (item.item_type === 'fabric') {
                  insertData.fabric_color = itemColor;
                } else {
                  insertData.item_color = itemColor;
                }
              }
              
              const { data: newInventory, error: insertError } = await supabase
                .from('warehouse_inventory')
                .insert(insertData)
                .select()
                .single();

              if (insertError) {
                console.error('Error adding to warehouse inventory:', insertError);
                throw insertError;
              }

              warehouseInventoryId = newInventory.id;
              console.log(`Added new inventory entry for ${item.item_name} to warehouse inventory in bin ${defaultBin?.bin_code}`);
            }

            // Always create a log entry for this addition
            const { logInventoryAddition } = await import('@/utils/inventoryLogging');
            await logInventoryAddition(
              warehouseInventoryId,
              {
                item_type: itemType,
                item_id: item.item_id || undefined,
                item_name: item.item_name,
                item_code: itemCode,
                unit: item.unit_of_measure || 'pcs',
              },
              item.approved_quantity,
              {
                bin_id: defaultBin?.id,
                status: 'RECEIVED',
                color: itemColor || undefined,
                action: existingInventory ? 'CONSOLIDATED' : 'ADDED',
                grn_id: grn.id,
                grn_item_id: item.id,
                old_quantity: existingInventory ? Number(existingInventory.quantity) : undefined,
                new_quantity: existingInventory 
                  ? Number(existingInventory.quantity) + Number(item.approved_quantity)
                  : Number(item.approved_quantity),
                notes: existingInventory 
                  ? `Added ${item.approved_quantity} ${item.unit_of_measure || 'pcs'} from GRN ${grn.grn_number} - Consolidated with existing inventory`
                  : `Added ${item.approved_quantity} ${item.unit_of_measure || 'pcs'} from GRN ${grn.grn_number}`
              }
            );

          } catch (warehouseError) {
            console.error('Error updating warehouse inventory:', warehouseError);
            // Don't throw error here, just log it as inventory is already updated
          }
        }
      }
      
      toast.success('Inventory updated successfully for approved items');
    } catch (error) {
      console.error('Error updating inventory:', error);
      toast.error('Failed to update inventory');
      throw error;
    }
  }, [grn.id, grn.grn_number]);

  // Update GRN master status
  const updateGrnStatus = useCallback(async (newStatus: string) => {
    if (!grn.id) {
      toast.error('Cannot update status for unsaved GRN');
      return;
    }

    try {
      // First, check if grn_master table exists
      const { data: tableCheck, error: tableError } = await supabase
        .from('grn_master')
        .select('id')
        .limit(1);
      
      if (tableError) {
        console.error('GRN master table error:', tableError);
        toast.error('GRN tables are not set up. Please run the GRN setup script in Supabase.');
        return;
      }
      // Validate status transition
      const currentStatus = grn.status || 'draft';
      const validTransitions: Record<string, string[]> = {
        'draft': ['received'],
        'received': ['under_inspection', 'approved', 'rejected'],
        'under_inspection': ['approved', 'rejected', 'partially_approved'],
        'approved': [], // Final status
        'rejected': [], // Final status
        'partially_approved': ['approved', 'rejected']
      };

      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        toast.error(`Cannot change status from ${currentStatus} to ${newStatus}`);
        return;
      }

      // Additional validation for specific statuses
      if (newStatus === 'approved' || newStatus === 'partially_approved') {
        const hasApprovedItems = grnItems.some(item => item.quality_status === 'approved');
        if (!hasApprovedItems) {
          toast.error('Cannot approve GRN without any approved items');
          return;
        }
      }

      if (newStatus === 'rejected') {
        const hasRejectedItems = grnItems.some(item => item.quality_status === 'rejected' || item.quality_status === 'damaged');
        if (!hasRejectedItems) {
          toast.error('Cannot reject GRN without any rejected items');
          return;
        }
      }

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Set additional fields based on status
      if (newStatus === 'received') {
        updateData.received_date = new Date().toISOString();
        updateData.received_by = user?.id;
      } else if (newStatus === 'under_inspection') {
        updateData.quality_inspector = user?.id;
        updateData.inspection_date = new Date().toISOString();
      } else if (newStatus === 'approved' || newStatus === 'rejected') {
        updateData.approved_by = user?.id;
        updateData.approved_at = new Date().toISOString();
      }

      console.log('Updating GRN with data:', updateData);
      console.log('GRN ID:', grn.id);
      
      const { error } = await supabase
        .from('grn_master')
        .update(updateData)
        .eq('id', grn.id as any);

      if (error) {
        console.error('Error updating GRN status:', error);
        console.error('Update data:', updateData);
        console.error('GRN ID:', grn.id);
        throw error;
      }
      
      setGrn(prev => ({ ...prev, ...updateData }));
      
      // Update inventory when GRN is approved or partially approved
      if (newStatus === 'approved' || newStatus === 'partially_approved') {
        // Server-side trigger will insert into warehouse_inventory.
        // Client-side, ensure idempotency: do not double-insert.
        const approvedItems = grnItems.filter(item => item.quality_status === 'approved');
        if (approvedItems.length > 0) {
          try {
            const { data: existingInventory } = await supabase
              .from('warehouse_inventory')
              .select('grn_item_id')
              .in('grn_item_id', approvedItems.map(i => i.id as any));

            const existingSet = new Set((existingInventory || []).map((r: any) => r.grn_item_id));
            const missing = approvedItems.filter(i => i.id && !existingSet.has(i.id));

            if (missing.length > 0) {
              await updateInventory(missing);
            }
            // Notify warehouse views to refresh
            try { window.dispatchEvent(new CustomEvent('warehouse-inventory-updated')); } catch {}
          } catch (e) {
            console.warn('Skipping client-side inventory insert; DB trigger should handle it.', e);
            try { window.dispatchEvent(new CustomEvent('warehouse-inventory-updated')); } catch {}
          }
        }
      }
      
      const statusMessages: Record<string, string> = {
        'received': 'GRN marked as received',
        'under_inspection': 'GRN moved to inspection',
        'approved': 'GRN approved successfully and inventory updated',
        'rejected': 'GRN rejected',
        'partially_approved': 'GRN partially approved and inventory updated'
      };
      
      toast.success(statusMessages[newStatus] || `GRN status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating GRN status:', error);
      toast.error('Failed to update GRN status');
    }
  }, [grn.id, grn.status, grnItems, user?.id, updateInventory]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalItems = grnItems.length;
    const totalReceived = grnItems.reduce((sum, item) => sum + item.received_quantity, 0);
    const totalApproved = grnItems.reduce((sum, item) => sum + item.approved_quantity, 0);
    const totalRejected = grnItems.reduce((sum, item) => sum + item.rejected_quantity, 0);
    const totalAmount = grnItems.reduce((sum, item) => sum + item.line_total, 0);
    const approvedAmount = grnItems
      .filter(item => item.quality_status === 'approved')
      .reduce((sum, item) => sum + item.line_total, 0);

    return {
      totalItems,
      totalReceived,
      totalApproved,
      totalRejected,
      totalAmount,
      approvedAmount
    };
  }, [grnItems]);

  // Derived filtered items for quick find and pending focus
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    let list = grnItems;
    if (q) {
      list = list.filter(i =>
        i.item_name.toLowerCase().includes(q) ||
        (i.fabric_name?.toLowerCase().includes(q) ?? false) ||
        (i.item_color?.toLowerCase().includes(q) ?? false) ||
        (i.fabric_color?.toLowerCase().includes(q) ?? false)
      );
    }
    if (showOnlyPending) {
      list = list.filter(i => i.quality_status === 'pending');
    }
    // Keep fabrics first for visual grouping
    return [...list].sort((a, b) => {
      if (a.item_type === 'fabric' && b.item_type !== 'fabric') return -1;
      if (a.item_type !== 'fabric' && b.item_type === 'fabric') return 1;
      return 0;
    });
  }, [grnItems, itemSearch, showOnlyPending]);

  // Save GRN
  const saveGRN = useCallback(async () => {
    if (!grn.po_id || grnItems.length === 0) {
      toast.error('Please select a purchase order and add items');
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        // Create new GRN
        // Let database generate grn_number via default; do not send grn_number to avoid uniqueness conflicts
        const insertPayload: any = {
          ...grn,
          grn_number: undefined,
          total_items_received: totals.totalItems,
          total_items_approved: grnItems.filter(item => item.quality_status === 'approved').length,
          total_items_rejected: grnItems.filter(item => item.quality_status === 'rejected' || item.quality_status === 'damaged').length,
          total_amount_received: totals.totalAmount,
          total_amount_approved: totals.approvedAmount
        };
        delete insertPayload.grn_number; // ensure omitted

        const { data: grnData, error: grnError } = await supabase
          .from('grn_master')
          .insert(insertPayload)
          .select()
          .single();

        if (grnError) throw grnError;

        // Insert GRN items
        console.log('GRN items to insert:', grnItems);
        const itemsToInsert = grnItems.map(item => ({
          grn_id: (grnData as any).id,
          po_item_id: item.po_item_id,
          item_type: item.item_type,
          item_id: item.item_id || null, // Allow null for items without specific item_id
          item_name: item.item_name,
          item_image_url: item.item_image_url,
          ordered_quantity: item.ordered_quantity,
          received_quantity: item.received_quantity,
          approved_quantity: item.approved_quantity,
          rejected_quantity: item.rejected_quantity,
          unit_of_measure: item.unit_of_measure,
          unit_price: item.unit_price,
          total_price: item.total_price,
          gst_rate: item.gst_rate,
          gst_amount: item.gst_amount,
          line_total: item.line_total,
          quality_status: item.quality_status,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          condition_notes: item.condition_notes,
          inspection_notes: item.inspection_notes,
          // Fabric details
          fabric_color: item.fabric_color,
          fabric_gsm: item.fabric_gsm,
          fabric_name: item.fabric_name,
          item_color: item.item_color
        }));

        console.log('Items to insert:', itemsToInsert);
        const { error: itemsError } = await supabase
          .from('grn_items')
          .insert(itemsToInsert as any);

        if (itemsError) {
          console.error('Error inserting GRN items:', itemsError);
          throw itemsError;
        }

        toast.success('GRN created successfully');
        navigate(`/procurement/grn/${(grnData as any).id}`);
      } else {
        // Update existing GRN
        console.log('Updating GRN with data:', grn);
        console.log('GRN totals:', totals);
        const { error: grnError } = await supabase
          .from('grn_master')
          .update({
            po_id: grn.po_id,
            supplier_id: grn.supplier_id,
            grn_date: grn.grn_date,
            received_date: grn.received_date,
            received_by: grn.received_by,
            received_at_location: grn.received_at_location,
            status: grn.status,
            total_items_received: totals.totalItems,
            total_items_approved: grnItems.filter(item => item.quality_status === 'approved').length,
            total_items_rejected: grnItems.filter(item => item.quality_status === 'rejected' || item.quality_status === 'damaged').length,
            total_amount_received: totals.totalAmount,
            total_amount_approved: totals.approvedAmount,
            quality_inspector: grn.quality_inspector,
            inspection_date: grn.inspection_date,
            inspection_notes: grn.inspection_notes,
            approved_by: grn.approved_by,
            approved_at: grn.approved_at,
            rejection_reason: grn.rejection_reason
          } as any)
          .eq('id', id as any);

        if (grnError) {
          console.error('Error updating GRN:', grnError);
          throw grnError;
        }

        // Update GRN items
        for (const item of grnItems) {
          if (item.id) {
            // Update existing item
            const { error } = await supabase
              .from('grn_items')
              .update({
                ...item,
                // Ensure fabric details are included in update
                fabric_color: item.fabric_color,
                fabric_gsm: item.fabric_gsm,
                fabric_name: item.fabric_name,
                item_color: item.item_color
              } as any)
              .eq('id', item.id as any);
            if (error) throw error;
          } else {
            // Insert new item
            const { error } = await supabase
              .from('grn_items')
              .insert({ 
                grn_id: id,
                po_item_id: item.po_item_id,
                item_type: item.item_type,
                item_id: item.item_id || null, // Allow null for items without specific item_id
                item_name: item.item_name,
                item_image_url: item.item_image_url,
                ordered_quantity: item.ordered_quantity,
                received_quantity: item.received_quantity,
                approved_quantity: item.approved_quantity,
                rejected_quantity: item.rejected_quantity,
                unit_of_measure: item.unit_of_measure,
                unit_price: item.unit_price,
                total_price: item.total_price,
                gst_rate: item.gst_rate,
                gst_amount: item.gst_amount,
                line_total: item.line_total,
                quality_status: item.quality_status,
                batch_number: item.batch_number,
                expiry_date: item.expiry_date,
                condition_notes: item.condition_notes,
                inspection_notes: item.inspection_notes,
                // Ensure fabric details are included in insert
                fabric_color: item.fabric_color,
                fabric_gsm: item.fabric_gsm,
                fabric_name: item.fabric_name,
                item_color: item.item_color
              } as any);
            if (error) throw error;
          }
        }

        toast.success('GRN updated successfully');
      }
    } catch (error: any) {
      console.error('Error saving GRN:', error);
      if (error.code === '23505') {
        toast.error('GRN number already exists. Please try again.');
      } else if (error.message?.includes('relation "grn_master" does not exist')) {
        toast.error('Database tables not found. Please run the GRN database schema first.');
      } else {
        toast.error(`Failed to save GRN: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setSaving(false);
    }
  }, [grn, grnItems, totals, isNew, id, navigate]);

  // Status badge component for GRN items
  const StatusBadge = ({ status }: { status: GRNItem['quality_status'] }) => {
    const map = {
      pending: { className: 'bg-gray-100 text-gray-800', icon: <AlertCircle className="w-3 h-3" />, label: 'Pending' },
      approved: { className: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" />, label: 'Approved' },
      rejected: { className: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" />, label: 'Rejected' },
      damaged: { className: 'bg-orange-100 text-orange-800', icon: <AlertCircle className="w-3 h-3" />, label: 'Damaged' }
    };
    
    const statusInfo = map[status];
    return (
      <Badge variant="outline" className={`font-medium ${statusInfo.className} flex items-center gap-1`}>
        {statusInfo.icon}
        {statusInfo.label}
      </Badge>
    );
  };

  // GRN Status badge component for GRN master
  const GRNStatusBadge = ({ status }: { status: GRN['status'] }) => {
    const map = {
      draft: { className: 'bg-gray-100 text-gray-800', icon: <FileText className="w-3 h-3" />, label: 'Draft' },
      received: { className: 'bg-blue-100 text-blue-800', icon: <Package className="w-3 h-3" />, label: 'Received' },
      under_inspection: { className: 'bg-yellow-100 text-yellow-800', icon: <Eye className="w-3 h-3" />, label: 'Under Inspection' },
      approved: { className: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" />, label: 'Approved' },
      rejected: { className: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" />, label: 'Rejected' },
      partially_approved: { className: 'bg-orange-100 text-orange-800', icon: <AlertCircle className="w-3 h-3" />, label: 'Partially Approved' }
    };
    
    const statusInfo = map[status];
    return (
      <Badge variant="outline" className={`font-medium ${statusInfo.className} flex items-center gap-1`}>
        {statusInfo.icon}
        {statusInfo.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky Summary/Header Bar - Show for all modes */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" onClick={() => navigate('/procurement/grn')} size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="truncate">
              <div className="font-semibold truncate">
                {isNew ? 'Create GRN' : isEdit ? `Edit GRN • ${grn.grn_number}` : `GRN • ${grn.grn_number}`}
              </div>
            </div>
            {/* GRN Status Display and Management */}
            {!isNew && (
              <div className="flex items-center gap-2">
                <GRNStatusBadge status={grn.status || 'draft'} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* GRN Status Management Buttons */}
            {!isNew && !isEdit && (
              <div className="flex items-center gap-1">
                {(grn.status || 'draft') === 'draft' && (
                  <Button onClick={() => updateGrnStatus('received')} size="sm" variant="default">
                    <Package className="w-4 h-4 mr-1" />
                    Mark Received
                  </Button>
                )}
                {(grn.status || 'draft') === 'received' && (
                  <Button onClick={() => updateGrnStatus('under_inspection')} size="sm" variant="default">
                    <Eye className="w-4 h-4 mr-1" />
                    Start Inspection
                  </Button>
                )}
                {(grn.status || 'draft') === 'under_inspection' && (
                  <>
                    <Button onClick={() => updateGrnStatus('approved')} size="sm" variant="default">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button onClick={() => updateGrnStatus('rejected')} size="sm" variant="destructive">
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button onClick={() => updateGrnStatus('partially_approved')} size="sm" variant="outline">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Partial Approve
                    </Button>
                  </>
                )}
                {(grn.status || 'draft') === 'partially_approved' && (
                  <>
                    <Button onClick={() => updateGrnStatus('approved')} size="sm" variant="default">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Full Approve
                    </Button>
                    <Button onClick={() => updateGrnStatus('rejected')} size="sm" variant="destructive">
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
              </div>
            )}
            
            {/* Only show print/export actions, not the full print view */}
            {!isNew && companySettings && selectedSupplier && selectedPO && (
              <GRNPrintExport
                grn={grn as any}
                grnItems={grnItems as any}
                companySettings={companySettings as any}
                supplier={selectedSupplier as any}
                purchaseOrder={selectedPO as any}
                showActions={true}
              />
            )}
            {!isEdit && !isNew && (
              <Button 
                onClick={() => navigate(`${location.pathname}?edit=1`)} 
                size="sm"
                variant="outline"
              >
                <Edit className="w-4 h-4 mr-2" /> Edit
              </Button>
            )}
            {isEdit && (
              <Button onClick={saveGRN} disabled={saving} size="sm">
                <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* GRN Status Management Section */}
      {!isNew && grnItems.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              GRN Status Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {grn.status === 'draft' && (
                <Button 
                  onClick={() => updateGrnStatus('received')} 
                  variant="outline"
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark as Received
                </Button>
              )}
              
              {grn.status === 'received' && (
                <>
                  <Button 
                    onClick={() => updateGrnStatus('under_inspection')} 
                    variant="outline"
                    className="bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Move to Inspection
                  </Button>
                  <Button 
                    onClick={() => updateGrnStatus('approved')} 
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                    disabled={!grnItems.some(item => item.quality_status === 'approved')}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve GRN
                  </Button>
                </>
              )}
              
              {grn.status === 'under_inspection' && (
                <>
                  <Button 
                    onClick={() => updateGrnStatus('approved')} 
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                    disabled={!grnItems.some(item => item.quality_status === 'approved')}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve GRN
                  </Button>
                  <Button 
                    onClick={() => updateGrnStatus('partially_approved')} 
                    variant="outline"
                    className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                    disabled={!grnItems.some(item => item.quality_status === 'approved')}
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Partial Approval
                  </Button>
                  <Button 
                    onClick={() => updateGrnStatus('rejected')} 
                    variant="outline"
                    className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                    disabled={!grnItems.some(item => item.quality_status === 'rejected' || item.quality_status === 'damaged')}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject GRN
                  </Button>
                </>
              )}
              
              {grn.status === 'partially_approved' && (
                <>
                  <Button 
                    onClick={() => updateGrnStatus('approved')} 
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Full Approval
                  </Button>
                  <Button 
                    onClick={() => updateGrnStatus('rejected')} 
                    variant="outline"
                    className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject GRN
                  </Button>
                </>
              )}
              
              {(grn.status === 'approved' || grn.status === 'rejected' || grn.status === 'partially_approved') && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>GRN is {grn.status.replace('_', ' ')} and items have been moved to receiving zone</span>
                </div>
              )}
            </div>
            
            {/* Status Information */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">
                <strong>Current Status:</strong> {grn.status?.replace('_', ' ').toUpperCase()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                <strong>Approved Items:</strong> {grnItems.filter(item => item.quality_status === 'approved').length} / {grnItems.length}
              </div>
              {grn.status === 'approved' && (
                <div className="text-sm text-green-600 mt-1">
                  ✓ Approved items have been added to warehouse inventory in the receiving zone
                </div>
              )}
              
              {/* Warehouse Status */}
              {grn.status === 'approved' && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700">
                    <Package className="w-4 h-4" />
                    <span className="font-medium">Items in Receiving Zone</span>
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    Approved items are now available in the warehouse inventory system. 
                    They can be moved to storage zones or dispatched as needed.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Preview GRN</DialogTitle>
          </DialogHeader>
          {companySettings && selectedSupplier && selectedPO && (
            <div className="max-h-[75vh] overflow-auto">
              <GRNPrintExport
                grn={grn as any}
                grnItems={grnItems as any}
                companySettings={companySettings as any}
                supplier={selectedSupplier as any}
                purchaseOrder={selectedPO as any}
                showActions={false}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Single Comprehensive Form (only view) */}
      <div className="space-y-8">
        {/* Header Section */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              GRN Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="grn_number" className="text-sm font-medium">GRN Number</Label>
                <Input
                  id="grn_number"
                  value={grn.grn_number}
                  onChange={(e) => setGrn(prev => ({ ...prev, grn_number: e.target.value }))}
                  disabled={!isEdit}
                  className="font-mono"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="po_select" className="text-sm font-medium">Purchase Order</Label>
                  <Select
                    value={grn.po_id}
                    onValueChange={handlePOSelect}
                    disabled={!isEdit || (!isNew && !!grn.po_id) || loadingPOs}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        loadingPOs 
                          ? "Loading purchase orders..." 
                          : isNew && purchaseOrders.length === 0 
                            ? "No POs available (all fully received)" 
                            : "Select Purchase Order"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {purchaseOrders.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          {isNew ? "All purchase orders are fully received" : "No purchase orders found"}
                        </div>
                      ) : (
                        purchaseOrders.map((po) => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.po_number} - {format(new Date(po.order_date), 'dd MMM yyyy')}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {isNew && purchaseOrders.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      All purchase orders have been fully received. You can only edit existing GRNs.
                    </p>
                  )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="grn_date" className="text-sm font-medium">GRN Date</Label>
                <Input
                  id="grn_date"
                  type="date"
                  value={grn.grn_date}
                  onChange={(e) => setGrn(prev => ({ ...prev, grn_date: e.target.value }))}
                  disabled={!isEdit}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="received_date" className="text-sm font-medium">Received Date</Label>
                <Input
                  id="received_date"
                  type="datetime-local"
                  value={grn.received_date ? new Date(grn.received_date).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setGrn(prev => ({ ...prev, received_date: e.target.value }))}
                  disabled={!isEdit}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-sm font-medium">Received At Location</Label>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Receiving Zone</span>
                  <Badge variant="secondary" className="ml-auto">Auto-assigned</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  All GRN items are automatically placed in the Receiving Zone for quality inspection and processing.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="px-3 py-1">
                    {grn.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Information */}
        {selectedSupplier && (
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600" />
                Supplier Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Supplier Name</Label>
                  <div className="text-lg font-semibold">{selectedSupplier.supplier_name}</div>
                  <div className="text-sm text-muted-foreground">{selectedSupplier.supplier_code}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Contact Person</Label>
                  <div className="text-base">{selectedSupplier.contact_person}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                  <div className="text-base">{selectedSupplier.phone}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                  <div className="text-base">{selectedSupplier.email}</div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">Address</Label>
                  <div className="text-base">{selectedSupplier.billing_address}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Items</p>
                  <p className="text-3xl font-bold text-blue-600">{totals.totalItems}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Received Qty</p>
                  <p className="text-3xl font-bold text-green-600">{totals.totalReceived}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Approved Qty</p>
                  <p className="text-3xl font-bold text-emerald-600">{totals.totalApproved}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rejected Qty</p>
                  <p className="text-3xl font-bold text-red-600">{totals.totalRejected}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items Section */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-600" />
              Received Items
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Item toolbar - hidden in view-only mode for a clean UI */}
            {isEdit && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search items, color, GSM..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="w-full md:w-72"
                  />
                  <Button
                    type="button"
                    variant={showOnlyPending ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowOnlyPending(v => !v)}
                  >
                    {showOnlyPending ? 'Showing Pending' : 'Only Pending'}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  Amount: <span className="font-semibold">₹{totals.totalAmount.toFixed(2)}</span>
                  <span className="mx-2">•</span>
                  Approved: <span className="font-semibold">₹{totals.approvedAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">No Items</h3>
                <p className="text-sm text-muted-foreground">{grnItems.length === 0 ? 'Select a purchase order to view and manage items' : 'Try clearing filters or search'}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredItems.map((item, index) => (
                  <Card key={index} className="border border-gray-200 hover:border-gray-300 transition-colors">
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Item Image and Basic Info */}
                        <div className="lg:col-span-3">
                          <div className="flex items-center gap-4">
                            <ProductImage
                              src={item.item_image_url}
                              alt={item.item_name}
                              className="w-16 h-16 object-cover rounded-lg border"
                              fallbackText={item.item_type === 'fabric' ? 'FAB' : 'ITEM'}
                              onError={(error) => {
                                console.warn('ProductImage failed to load for item:', item.item_name, error);
                              }}
                            />
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg">{item.item_name}</h4>
                              {item.fabric_name && (
                                <p className="text-sm text-muted-foreground">{item.fabric_name}</p>
                              )}
                              <Badge variant="outline" className="mt-1">
                                {item.item_type === 'fabric' ? 'Fabric' : item.item_type}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Item Details */}
                        <div className="lg:col-span-2">
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">Color</Label>
                              <div className="text-sm font-medium flex items-center gap-2">
                                {item.item_color || item.fabric_color || '-'}
                                {(item.item_color || item.fabric_color) && (
                                  <div 
                                    className="w-4 h-4 rounded-full border border-gray-300"
                                    style={{ 
                                      backgroundColor: (item.item_color || item.fabric_color)?.toLowerCase() || 'transparent'
                                    }}
                                    title={item.item_color || item.fabric_color}
                                  />
                                )}
                              </div>
                            </div>
                            {item.item_type === 'fabric' && (
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">GSM</Label>
                                <div className="text-sm font-medium">{item.fabric_gsm || '-'}</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantities */}
                        <div className="lg:col-span-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                              <Label className="text-xs font-medium text-muted-foreground">Ordered</Label>
                              <div className="text-lg font-bold text-blue-600">{item.ordered_quantity}</div>
                            </div>
                            <div className="text-center">
                              <Label className="text-xs font-medium text-muted-foreground">Received</Label>
                              <Input
                                type="number"
                                value={item.received_quantity}
                                onChange={(e) => updateReceivedQuantity(index, parseFloat(e.target.value) || 0)}
                                disabled={!isEdit}
                                className="text-center font-semibold"
                                min="0"
                              />
                            </div>
                            <div className="text-center">
                              <Label className="text-xs font-medium text-muted-foreground">UOM</Label>
                              <div className="text-sm font-medium">{item.unit_of_measure}</div>
                            </div>
                          </div>
                        </div>

                        {/* Pricing */}
                        <div className="lg:col-span-2">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">Unit Price:</span>
                              <span className="text-sm font-medium">₹{item.unit_price.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">GST ({item.gst_rate}%):</span>
                              <span className="text-sm font-medium">₹{item.gst_amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span className="text-sm font-medium">Total:</span>
                              <span className="text-sm font-bold">₹{item.line_total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Quality Control */}
                        <div className="lg:col-span-2">
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">Quality Status</Label>
                              <div className="mt-1">
                                <StatusBadge status={item.quality_status} />
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant={item.quality_status === 'approved' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => updateQualityStatus(index, 'approved')}
                                disabled={!isEdit}
                                className="h-8 px-2"
                              >
                                <CheckCircle className="w-3 h-3" />
                              </Button>
                              <Button
                                variant={item.quality_status === 'rejected' ? 'destructive' : 'outline'}
                                size="sm"
                                onClick={() => updateQualityStatus(index, 'rejected')}
                                disabled={!isEdit}
                                className="h-8 px-2"
                              >
                                <XCircle className="w-3 h-3" />
                              </Button>
                              <Button
                                variant={item.quality_status === 'damaged' ? 'destructive' : 'outline'}
                                size="sm"
                                onClick={() => updateQualityStatus(index, 'damaged')}
                                disabled={!isEdit}
                                className="h-8 px-2"
                              >
                                <AlertCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Additional Details */}
                      <div className="mt-6 pt-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground">Batch Number</Label>
                            <Input
                              value={item.batch_number || ''}
                              onChange={(e) => {
                                const updated = [...grnItems];
                                updated[index].batch_number = e.target.value;
                                setGrnItems(updated);
                              }}
                              disabled={!isEdit}
                              placeholder="Enter batch number"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground">Expiry Date</Label>
                            <Input
                              type="date"
                              value={item.expiry_date || ''}
                              onChange={(e) => {
                                const updated = [...grnItems];
                                updated[index].expiry_date = e.target.value;
                                setGrnItems(updated);
                              }}
                              disabled={!isEdit}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground">Condition Notes</Label>
                            <Input
                              value={item.condition_notes || ''}
                              onChange={(e) => {
                                const updated = [...grnItems];
                                updated[index].condition_notes = e.target.value;
                                setGrnItems(updated);
                              }}
                              disabled={!isEdit}
                              placeholder="Enter condition notes"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Label className="text-xs font-medium text-muted-foreground">Inspection Notes</Label>
                          <Textarea
                            value={item.inspection_notes || ''}
                            onChange={(e) => {
                              const updated = [...grnItems];
                              updated[index].inspection_notes = e.target.value;
                              setGrnItems(updated);
                            }}
                            disabled={!isEdit}
                            placeholder="Enter detailed inspection notes..."
                            rows={2}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* GRN Notes Section */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              Additional Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium">Inspection Notes</Label>
                <Textarea
                  value={grn.inspection_notes || ''}
                  onChange={(e) => setGrn(prev => ({ ...prev, inspection_notes: e.target.value }))}
                  disabled={!isEdit}
                  placeholder="Enter general inspection notes..."
                  rows={4}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Rejection Reason</Label>
                <Textarea
                  value={grn.rejection_reason || ''}
                  onChange={(e) => setGrn(prev => ({ ...prev, rejection_reason: e.target.value }))}
                  disabled={!isEdit}
                  placeholder="Enter rejection reason if applicable..."
                  rows={4}
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Floating Action Button for Save */}
      {isEdit && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button 
            onClick={saveGRN} 
            disabled={saving}
            size="lg"
            className="rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Saving...' : 'Save GRN'}
          </Button>
        </div>
      )}
    </div>
  );
};

export { GRNForm };
