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
import { Search, Users, Scissors, ShoppingCart, Shirt, Package, ClipboardList, Printer, Check } from "lucide-react";
import PickerQuantityDialog from "@/components/production/PickerQuantityDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getOrderItemDisplayImage } from "@/utils/orderItemImageUtils";
import { getBinsForProduct } from "@/utils/inventoryAdjustmentAPI";
import type { BinInfo, BinSizeInfo } from "@/utils/inventoryAdjustmentAPI";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/CompanySettingsContext";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { sortSizesByMasterOrder, sortSizeDistributionsByMasterOrder, getFallbackSizeOrder } from "@/utils/sizeSorting";
import { BackButton } from '@/components/common/BackButton';

interface TailorListItem {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  tailor_type?: string | null;
  batch_code?: string;
  assigned_orders: number;
  assigned_quantity: number;
  picked_quantity: number;
  rejected_quantity?: number;
  batch_id?: string | null;
  is_batch_leader?: boolean | null;
  order_images?: string[];
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

interface ProductSizeVariant {
  variant_id: string;
  product_id?: string | null;
  size?: string | null;
  sku?: string | null;
}

interface SizeBinSelection {
  bin: BinInfo;
  detail: BinSizeInfo | null;
}

interface GroupedProduct {
  product_name: string;
  product_id?: string;
  product_master_id?: string;
  product_class?: string | null;
  size_type_id?: string | null;
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
  size_variants?: Record<string, ProductSizeVariant>;
}

export default function PickerPage() {
  const { config: company } = useCompanySettings();
  const { sizeTypes, loading: loadingSizeTypes } = useSizeTypes();
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
    productImage?: string;
  } | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [rejectedOrderNumber, setRejectedOrderNumber] = useState("");
  const [rejectedItems, setRejectedItems] = useState<{ size_name: string; rejected_quantity: number; remarks?: string }[]>([]);
  const [batchRejectedOpen, setBatchRejectedOpen] = useState(false);
  const [batchRejectedTitle, setBatchRejectedTitle] = useState("");
  const [batchRejectedDetails, setBatchRejectedDetails] = useState<{ order_number: string; sizes: { size_name: string; rejected_quantity: number; remarks?: string }[] }[]>([]);
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryBatchName, setGalleryBatchName] = useState('');
  
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
  const [availableBins, setAvailableBins] = useState<BinInfo[]>([]);
  const [selectedBinsBySize, setSelectedBinsBySize] = useState<Record<string, SizeBinSelection>>({});
  const [picklistData, setPicklistData] = useState<{
    product: GroupedProduct | null;
    order: ReadymadeOrder | null;
    bin: { bin_id: string; bin_code: string } | null;
    binsBySize: Record<string, SizeBinSelection> | null;
  }>({ product: null, order: null, bin: null, binsBySize: null });
  const [loadingBins, setLoadingBins] = useState(false);

  useEffect(() => {
    fetchTailorsWithAssignedCounts();
    fetchReadymadeOrders();
  }, []);

  const fetchReadymadeOrders = async () => {
    setLoadingReadymadeOrders(true);
    try {
      // Fetch readymade orders
      // @ts-expect-error - Supabase nested select causes deep type inference issue
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
          await groupProductsByProductName(ordersData, itemsData);
        }
      }
    } catch (error) {
      console.error('Error fetching readymade orders:', error);
      setReadymadeOrders([]);
    } finally {
      setLoadingReadymadeOrders(false);
    }
  };

  // Helper function to sort size distributions using master order
  const sortSizeDistributions = (sizes: any[], sizeTypeId?: string | null): any[] => {
    if (!sizes || sizes.length === 0) return [];
    
    // Use master-based sorting
    return sortSizeDistributionsByMasterOrder(sizes, sizeTypeId || null, sizeTypes);
  };

  // Utility function to sort sizes using master order
  const sortSizes = (sizes: string[], sizeTypeId?: string | null): string[] => {
    if (!sizes || sizes.length === 0) return [];
    
    // Use master-based sorting
    const sorted = sortSizesByMasterOrder(sizes, sizeTypeId || null, sizeTypes);
    
    // If master sorting didn't work (no size type found), use fallback
    if (sorted.length === 0) {
      return getFallbackSizeOrder(sizes);
    }
    
    return sorted;
  };

  const normalizeSizeLabel = (value?: string | null): string => {
    if (value === undefined || value === null) {
      return "";
    }
    return value.toString().trim().toUpperCase();
  };

  const isUniversalSizeLabel = (normalizedValue: string): boolean => {
    return ["", "UNIVERSAL", "ONE SIZE", "ONE-SIZE", "ONESIZE", "FREE SIZE", "FREESIZE", "OS"].includes(normalizedValue);
  };

  const findBinDetailForSize = (bin: BinInfo, sizeLabel: string): BinSizeInfo | null => {
    if (!bin.size_details || bin.size_details.length === 0) {
      return null;
    }

    const normalizedTarget = normalizeSizeLabel(sizeLabel);

    const matchingDetail = bin.size_details.find((detail) => {
      const normalizedDetail = normalizeSizeLabel(detail.size);
      if (normalizedDetail === normalizedTarget) {
        return true;
      }
      if (isUniversalSizeLabel(normalizedDetail) && isUniversalSizeLabel(normalizedTarget)) {
        return true;
      }
      return false;
    });

    return matchingDetail || null;
  };

  const formatBinLocation = (bin: BinInfo): string => {
    if (bin.path_label && bin.path_label.trim().length > 0) {
      return bin.path_label;
    }

    const segments: string[] = [];
    if (bin.warehouse_code) {
      segments.push(`WH ${bin.warehouse_code}`);
    } else if (bin.warehouse_name) {
      segments.push(bin.warehouse_name);
    }

    if (bin.floor_code) {
      segments.push(`Floor ${bin.floor_code}`);
    } else if (typeof bin.floor_number !== 'undefined' && bin.floor_number !== null) {
      segments.push(`Floor ${bin.floor_number}`);
    }

    if (bin.rack_code) {
      segments.push(`Rack ${bin.rack_code}`);
    }

    segments.push(`Bin ${bin.bin_code}`);
    return segments.join(' > ');
  };

  const groupProductsByProductName = async (orders: any[], items: any[]) => {
    const productMap: Record<string, GroupedProduct> = {};
    const ordersMap: Record<string, any> = {};
    const classesToFetch = new Set<string>();
    
    // Create orders map for quick lookup
    orders.forEach((order: any) => {
      ordersMap[order.id] = order;
    });

    items.forEach((item: any) => {
      const specs = typeof item.specifications === 'string' 
        ? JSON.parse(item.specifications) 
        : item.specifications || {};
      
      const productName = item.product_description || specs.product_name || 'Unknown Product';
      const productClass = specs.class || null;
      const productMasterId = specs.product_master_id || item.product_master_id || null;
      const sizeTypeId = item.size_type_id || specs.size_type_id || null;
      const order = ordersMap[item.order_id];
      
      if (!productMap[productName]) {
        productMap[productName] = {
          product_name: productName,
          product_id: specs.product_id,
          product_master_id: specs.product_master_id,
          product_class: productClass,
          size_type_id: sizeTypeId,
          total_quantity: 0,
          size_quantities: {},
          orders: [],
          image_url: getOrderItemDisplayImage(item, { order_type: 'readymade' }),
        };
      } else {
        if (!productMap[productName].product_master_id && productMasterId) {
          productMap[productName].product_master_id = productMasterId;
        }
        if (!productMap[productName].product_class && productClass) {
          productMap[productName].product_class = productClass;
        }
        if (!productMap[productName].size_type_id && sizeTypeId) {
          productMap[productName].size_type_id = sizeTypeId;
        }
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

      if (productClass) {
        classesToFetch.add(productClass);
      }
    });

    // Sort sizes in each product using master order
    Object.values(productMap).forEach((product) => {
      const sortedSizes = sortSizes(Object.keys(product.size_quantities), product.size_type_id);
      const sortedSizeQuantities: Record<string, number> = {};
      sortedSizes.forEach((size) => {
        sortedSizeQuantities[size] = product.size_quantities[size];
      });
      product.size_quantities = sortedSizeQuantities;
    });

    if (classesToFetch.size > 0) {
      try {
        const { data: variantData, error: variantError } = await supabase
          .from('product_master')
          .select('id, product_id, class, size, sku, is_active')
          .in('class', Array.from(classesToFetch));

        if (variantError) {
          console.error('Error fetching product variants for picklist:', variantError);
        } else if (variantData) {
          const variantMap = new Map<string, Record<string, ProductSizeVariant>>();
          (variantData as any[]).forEach((variant) => {
            const className = variant?.class;
            if (!className) return;
            if (!variantMap.has(className)) {
              variantMap.set(className, {});
            }
            const sizeKey = (variant?.size || '').toString() || 'UNIVERSAL';
            variantMap.get(className)![sizeKey] = {
              variant_id: variant.id,
              product_id: variant.product_id ?? variant.id,
              size: variant.size,
              sku: variant.sku,
            };
          });

          Object.values(productMap).forEach((product) => {
            if (!product.product_class) return;
            const variants = variantMap.get(product.product_class);
            if (variants) {
              product.size_variants = variants;
            }
          });
        }
      } catch (error) {
        console.error('Unexpected error while fetching product variants:', error);
      }
    }

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
      const variantIds = product.size_variants 
        ? Object.values(product.size_variants)
            .map((variant) => variant.variant_id)
            .filter((id): id is string => Boolean(id))
        : [];
      const baseProductId = product.product_master_id || variantIds[0];

      if (!baseProductId) {
        toast.error('Product metadata not found. Cannot create picklist.');
        return;
      }
      
      setPicklistData({ product, order: null, bin: null, binsBySize: null });
      setSelectedBinsBySize({});
      setLoadingBins(true);
      setBinSelectionDialogOpen(true);
      
      try {
        const bins = await getBinsForProduct(baseProductId, undefined, {
          includeSizeBreakdown: true,
          sizeVariantIds: variantIds.length > 0 ? variantIds : undefined,
        });
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

  const sizeBinOptions = useMemo(() => {
    if (!picklistData.product) {
      return {} as Record<string, { requiredQty: number; options: Array<{ bin: BinInfo; detail: BinSizeInfo }> }>;
    }

    const result: Record<string, { requiredQty: number; options: Array<{ bin: BinInfo; detail: BinSizeInfo }> }> = {};
    const sizeQuantities = picklistData.product.size_quantities || {};
    const sortedSizes = sortSizes(Object.keys(sizeQuantities), picklistData.product.size_type_id);

    sortedSizes.forEach((sizeLabel) => {
      const requiredQty = Number(sizeQuantities[sizeLabel] || 0);
      if (requiredQty <= 0) {
        return;
      }

      const options: Array<{ bin: BinInfo; detail: BinSizeInfo }> = [];

      availableBins.forEach((bin) => {
        const detail = findBinDetailForSize(bin, sizeLabel);
        if (detail && detail.quantity > 0) {
          options.push({ bin, detail });
        } else if ((!bin.size_details || bin.size_details.length === 0) && bin.current_quantity > 0) {
          options.push({
            bin,
            detail: {
              item_id: "",
              size: sizeLabel,
              sku: undefined,
              quantity: bin.current_quantity,
            },
          });
        }
      });

      result[sizeLabel] = { requiredQty, options };
    });

    return result;
  }, [availableBins, picklistData.product]);

  const sizeList = useMemo(() => Object.keys(sizeBinOptions), [sizeBinOptions]);

  const sizesWithoutOptions = useMemo(
    () => sizeList.filter((size) => (sizeBinOptions[size]?.options.length || 0) === 0),
    [sizeList, sizeBinOptions]
  );

  const allSizesSelected = useMemo(() => {
    if (sizeList.length === 0) {
      return false;
    }
    return sizeList.every((size) => Boolean(selectedBinsBySize[size]));
  }, [sizeList, selectedBinsBySize]);

  const picklistSizeEntries = useMemo(() => {
    if (!picklistData.product) {
      return [] as Array<{ size: string; requiredQty: number; selection: SizeBinSelection | null }>;
    }
    const sizes = sortSizes(Object.keys(picklistData.product.size_quantities), picklistData.product.size_type_id);
    return sizes.map((size) => ({
      size,
      requiredQty: Number(picklistData.product!.size_quantities[size] || 0),
      selection: picklistData.binsBySize ? picklistData.binsBySize[size] || null : null,
    }));
  }, [picklistData.product, picklistData.binsBySize]);

  const uniqueSelectedBins = useMemo(() => {
    const map = new Map<string, BinInfo>();
    picklistSizeEntries.forEach(({ selection }) => {
      if (selection) {
        map.set(selection.bin.bin_id, selection.bin);
      }
    });
    return Array.from(map.values());
  }, [picklistSizeEntries]);

  const handleSizeBinSelect = (sizeLabel: string, binId: string) => {
    const optionsForSize = sizeBinOptions[sizeLabel];
    if (!optionsForSize) {
      return;
    }

    const match = optionsForSize.options.find(option => option.bin.bin_id === binId);

    setSelectedBinsBySize((prev) => {
      const updated = { ...prev };
      if (match) {
        updated[sizeLabel] = {
          bin: match.bin,
          detail: match.detail,
        };
      } else {
        delete updated[sizeLabel];
      }
      return updated;
    });
  };

  const handleApplyBinToAllSizes = (sizeLabel: string) => {
    const selection = selectedBinsBySize[sizeLabel];
    if (!selection) {
      return;
    }

    const binId = selection.bin.bin_id;
    const nextSelections: Record<string, SizeBinSelection> = { ...selectedBinsBySize };
    const insufficient: string[] = [];

    Object.entries(sizeBinOptions).forEach(([size, { requiredQty, options }]) => {
      const matchingOption = options.find(option => option.bin.bin_id === binId);
      if (!matchingOption) {
        insufficient.push(size);
        return;
      }

      const availableQty = matchingOption.detail?.quantity ?? 0;
      if (availableQty < requiredQty) {
        insufficient.push(size);
        return;
      }

      nextSelections[size] = {
        bin: matchingOption.bin,
        detail: matchingOption.detail,
      };
    });

    if (insufficient.length > 0) {
      toast.error(`Bin ${selection.bin.bin_code} cannot fulfil: ${insufficient.join(', ')}`);
      return;
    }

    setSelectedBinsBySize(nextSelections);
  };

  const handleConfirmBinSelection = () => {
    if (!picklistData.product) {
      toast.error('Product context missing for picklist.');
      return;
    }

    if (sizesWithoutOptions.length > 0) {
      toast.error(`No bins available for sizes: ${sizesWithoutOptions.join(', ')}`);
      return;
    }

    const sizeEntries = Object.entries(sizeBinOptions);
    if (sizeEntries.length === 0) {
      toast.error('No size requirements found for this product.');
      return;
    }

    const missingSizes = sizeEntries
      .filter(([size]) => !selectedBinsBySize[size])
      .map(([size]) => size);

    if (missingSizes.length > 0) {
      toast.error(`Select bins for all sizes before confirming. Missing: ${missingSizes.join(', ')}`);
      return;
    }

    const insufficientSizes = sizeEntries
      .filter(([size, { requiredQty }]) => {
        const selection = selectedBinsBySize[size];
        if (!selection) return true;
        const availableQty = selection.detail?.quantity ?? 0;
        return availableQty < requiredQty;
      })
      .map(([size]) => size);

    if (insufficientSizes.length > 0) {
      toast.error(`Insufficient inventory for sizes: ${insufficientSizes.join(', ')}`);
      return;
    }

    const firstSelection = selectedBinsBySize[sizeEntries[0][0]];

    setPicklistData(prev => ({
      ...prev,
      bin: firstSelection ? { bin_id: firstSelection.bin.bin_id, bin_code: firstSelection.bin.bin_code } : null,
      binsBySize: { ...selectedBinsBySize },
    }));
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
      let orderSet: Record<string, Set<string>> = {}; // Declare outside try-catch
      let orderImagesByBatch: Record<string, string[]> = {}; // Declare outside try-catch
      if (batchIds.length > 0) {
        try {
          const { data: oba } = await (supabase as any)
            .from('order_batch_assignments_with_details')
            .select('assignment_id, batch_id, order_id, total_quantity')
            .in('batch_id', batchIds as any);
          orderSet = {}; // Initialize
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

        // Fetch product images for each batch's orders
        if (batchIds.length > 0 && Object.keys(orderSet).length > 0) {
          try {
            for (const [batchId, orderIdSet] of Object.entries(orderSet)) {
              const orderIds = Array.from(orderIdSet);
              if (orderIds.length === 0) continue;
              
              // Fetch order items with images
              const { data: orderItems } = await (supabase as any)
                .from('order_items')
                .select('order_id, specifications, mockup_images')
                .in('order_id', orderIds);
              
              const images: string[] = [];
              const processedOrders = new Set<string>();
              
              (orderItems || []).forEach((item: any) => {
                if (processedOrders.has(item.order_id)) return; // One image per order
                
                let imageUrl = null;
                
                // Priority 1: Check mockup_images column (TEXT[] array)
                if (item.mockup_images && Array.isArray(item.mockup_images) && item.mockup_images.length > 0) {
                  const firstMockup = item.mockup_images[0];
                  if (firstMockup && typeof firstMockup === 'string' && firstMockup.trim()) {
                    imageUrl = firstMockup.trim();
                  }
                }
                
                // Priority 2: Try mockup image from specifications
                if (!imageUrl) {
                try {
                  const specs = typeof item.specifications === 'string' 
                    ? JSON.parse(item.specifications) 
                    : item.specifications;
                  if (specs?.mockup_images && Array.isArray(specs.mockup_images) && specs.mockup_images.length > 0) {
                      const firstMockup = specs.mockup_images[0];
                      if (firstMockup && typeof firstMockup === 'string' && firstMockup.trim()) {
                        imageUrl = firstMockup.trim();
                      }
                  }
                } catch {}
                }
                
                // Only add image if it's a mockup (do NOT fall back to category image)
                if (imageUrl) {
                  images.push(imageUrl);
                  processedOrders.add(item.order_id);
                }
              });
              
              orderImagesByBatch[batchId] = images;
            }
          } catch (error) {
            console.error('Error fetching order images:', error);
          }
        }

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
        avatar_url: leaderByBatch[b.id]?.avatar_url || null, // Ensure batch leader avatar is used
        tailor_type: b.tailor_type,
        batch_code: b.batch_code,
        assigned_orders: ordersCountByBatch[b.id] || 0,
        assigned_quantity: qtyByBatch[b.id] || 0,
        picked_quantity: pickedByBatch[b.id] || 0, // Show actual picked quantity without subtracting rejected
        rejected_quantity: rejectedByBatch[b.id] || 0,
        batch_id: b.id,
        is_batch_leader: true,
        order_images: orderImagesByBatch[b.id] || [],
      }));

      console.log('Batches loaded:', list.length, 'batches');
      console.log('Batch leaders:', Object.keys(leaderByBatch).length, 'leaders found');
      setTailors(list);
    } catch (e) {
      console.error('Error in fetchTailorsWithAssignedCounts:', e);
      setTailors([]);
    } finally {
      setLoadingTailors(false);
    }
  };

  const openImageGallery = (batchId: string, images: string[]) => {
    const batch = tailors.find(t => t.id === batchId);
    setGalleryBatchName(batch?.full_name || 'Batch');
    setGalleryImages(images);
    setImageGalleryOpen(true);
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
      let ordersMap: Record<string, { order_number?: string; customer_id?: string; mockup_image?: string; category_image?: string; size_type_id?: string | null }> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await (supabase as any)
          .from('orders')
          .select('id, order_number, customer_id')
          .in('id', orderIds as any);
        (orders || []).forEach((o: any) => { ordersMap[o.id] = { order_number: o.order_number, customer_id: o.customer_id }; });
        
        // Fetch order items to get product images (mockup or category) and size_type_id
        const { data: orderItems } = await (supabase as any)
          .from('order_items')
          .select('order_id, specifications, category_image_url, size_type_id')
          .in('order_id', orderIds as any);
        
        (orderItems || []).forEach((item: any) => {
          if (!ordersMap[item.order_id]) return;
          
          // Try to get mockup image from specifications
          let mockupImage = null;
          try {
            const specs = typeof item.specifications === 'string' ? JSON.parse(item.specifications) : item.specifications;
            if (specs?.mockup_images && Array.isArray(specs.mockup_images) && specs.mockup_images.length > 0) {
              mockupImage = specs.mockup_images[0];
            }
          } catch {}
          
          // Set mockup image if available, otherwise use category image
          if (mockupImage && !ordersMap[item.order_id].mockup_image) {
            ordersMap[item.order_id].mockup_image = mockupImage;
          }
          if (item.category_image_url && !ordersMap[item.order_id].category_image) {
            ordersMap[item.order_id].category_image = item.category_image_url;
          }
          // Store size_type_id (use first non-null value found)
          if (item.size_type_id && !ordersMap[item.order_id].size_type_id) {
            ordersMap[item.order_id].size_type_id = item.size_type_id;
          }
        });
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
        mockup_image: ordersMap[r.order_id]?.mockup_image,
        category_image: ordersMap[r.order_id]?.category_image,
        size_type_id: ordersMap[r.order_id]?.size_type_id || null,
        assignment_date: r.assignment_date,
        total_quantity: Number(r.total_quantity || 0),
        picked_quantity: Number(pickedByAssignment[r.assignment_id] || 0),
        rejected_quantity: Number(rejectedByAssignment[r.assignment_id] || 0),
        rejected_sizes: rejectedSizesByAssignment[r.assignment_id] || [],
        size_distributions: Array.isArray(r.size_distributions) ? r.size_distributions : [],
      }));
      // Show orders that have work to do: pending items OR rejected items needing replacement
      // Key insight: If picked >= total, then all assigned items are picked.
      // If there are rejected items but picked >= total, replacements have already been picked,
      // so we shouldn't show the card (the rejected items are already replaced).
      const pending = enriched.filter((o: any) => {
        const totalQty = Number(o.total_quantity || 0);
        const picked = Number(o.picked_quantity || 0);
        const rejected = Number(o.rejected_quantity || 0);
        
        // Pending items = assigned items not yet picked
        const pendingItems = Math.max(0, totalQty - picked);
        
        // Rejected items that need replacement
        // BUT: If picked >= total, then all items are picked, including replacements for rejected items
        // So we don't need to show rejected as needing replacement if picked >= total
        const rejectedNeedingReplacement = (picked < totalQty) ? rejected : 0;
        
        // Show card only if there are pending items OR rejected items needing replacement
        const remainingToPick = pendingItems + rejectedNeedingReplacement;
        return remainingToPick > 0;
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
      productImage: assignment.mockup_image || undefined,
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
        <div className="flex items-center gap-4">
          <BackButton to="/production" label="Back to Production" />
        </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-3 sm:gap-4">
                    {filteredTailors.map((t) => {
                      const pendingQty = Math.max(0, (t.assigned_quantity || 0) - (t.picked_quantity || 0));
                      return (
                        <Card key={t.id} className="border shadow-erp-md cursor-pointer hover:shadow-lg transition relative min-h-[280px] rounded-xl w-full" onClick={() => openBatchOrders(t.id)}>
                          <CardContent className="p-4 sm:p-5 relative h-full flex flex-col">
                            {/* Top Section: Avatar + Name + Batch Code */}
                            <div className="flex items-start gap-3 mb-6">
                              <Avatar className="w-20 h-20 flex-shrink-0">
                                <AvatarImage src={t.avatar_url || undefined} alt={t.full_name} />
                                <AvatarFallback className="text-base font-semibold">{t.full_name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-lg text-slate-900 truncate">{t.full_name}</div>
                                {t.batch_code && (
                                  <div className="text-sm text-muted-foreground mt-0.5">BATCH: {t.batch_code}</div>
                                )}
                              </div>
                            </div>

                            {/* Badges with Absolute Positioning */}
                            {/* Rejected Qty - Top Right */}
                            {t.rejected_quantity > 0 && (
                              <Badge 
                                className="absolute top-4 sm:top-5 right-4 sm:right-5 bg-red-500 hover:bg-red-600 text-white text-xs px-4 py-2 cursor-pointer z-10 shadow-sm rounded-full w-[180px] flex items-center justify-center" 
                                onClick={(e) => { e.stopPropagation(); openBatchRejectedDetails(t.id, t.full_name); }}
                                style={{ top: '16px' }}
                              >
                                Rejected Qty: {t.rejected_quantity}
                              </Badge>
                            )}

                            {/* Assigned Orders - Middle Left */}
                            <Badge 
                              className="absolute left-4 sm:left-5 bg-blue-100 text-blue-800 text-xs px-4 py-2 rounded-full w-[180px] flex items-center justify-center"
                              style={{ top: '50%', transform: 'translateY(-50%)' }}
                            >
                              Assigned Orders: {t.assigned_orders}
                            </Badge>

                            {/* Assigned Qty - Middle Right */}
                            {t.assigned_quantity > 0 && (
                              <Badge 
                                className="absolute right-4 sm:right-5 bg-purple-100 text-purple-800 text-xs px-4 py-2 rounded-full w-[180px] flex items-center justify-center"
                                style={{ top: '50%', transform: 'translateY(-50%)' }}
                              >
                                Assigned Qty: {t.assigned_quantity}
                              </Badge>
                            )}

                            {/* Pending Qty - Bottom Right */}
                            {pendingQty > 0 ? (
                              <Badge 
                                className="absolute bottom-4 sm:bottom-5 right-4 sm:right-5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-4 py-2 shadow-sm rounded-full w-[180px] flex items-center justify-center"
                                style={{ bottom: '16px' }}
                              >
                                Pending Qty: {pendingQty}
                              </Badge>
                            ) : pendingQty === 0 && t.assigned_quantity > 0 ? (
                              <Badge 
                                className="absolute bottom-4 sm:bottom-5 right-4 sm:right-5 bg-green-500 hover:bg-green-600 text-white text-xs px-4 py-2 shadow-sm rounded-full w-[180px] flex items-center justify-center gap-1.5"
                                style={{ bottom: '16px' }}
                              >
                                <Check className="h-3.5 w-3.5" />
                                All Completed
                              </Badge>
                            ) : null}

                            {/* Product Images Row - Bottom with Overlapping Circular Images */}
                            {t.order_images && t.order_images.length > 0 && (
                              <div className="flex items-center mt-auto pt-4 relative" style={{ height: '64px' }}>
                                {t.order_images.slice(0, 3).map((img, idx) => (
                                  <img 
                                    key={idx} 
                                    src={img} 
                                    alt={`Product ${idx + 1}`}
                                    className="w-16 h-16 rounded-full object-cover border-2 border-white flex-shrink-0 shadow-sm cursor-pointer"
                                    style={{ 
                                      marginLeft: idx > 0 ? '-16px' : '0',
                                      zIndex: 3 - idx,
                                      position: 'relative'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openImageGallery(t.id, t.order_images || []);
                                    }}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ))}
                                {t.order_images.length > 3 && (
                                  <div 
                                    className="relative w-16 h-16 rounded-full overflow-hidden cursor-pointer border-2 border-white flex-shrink-0 shadow-sm"
                                    style={{ 
                                      marginLeft: '-16px',
                                      zIndex: 0
                                    }}
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      openImageGallery(t.id, t.order_images || []); 
                                    }}
                                  >
                                    <img 
                                      src={t.order_images[3]} 
                                      alt="More products"
                                      className="w-full h-full object-cover blur-sm"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                                      <span className="text-white font-bold text-sm">+{t.order_images.length - 3}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {activeBatchId && (
                    <div className="mt-4 sm:mt-6 space-y-3">
                      <div className="text-sm sm:text-base font-medium">Orders for selected batch</div>
                      {loadingBatchOrders ? (
                        <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
                      ) : batchOrders.length === 0 ? (
                        <p className="text-sm sm:text-base text-muted-foreground">No pending orders for this batch.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                          {batchOrders.map((o) => {
                            // Calculate left to pick: pending items (assigned - picked) + rejected items needing replacement
                            const pending = Math.max(0, (o.total_quantity || 0) - (o.picked_quantity || 0));
                            const rejected = Number(o.rejected_quantity || 0);
                            const leftQuantity = pending + rejected;
                            return (
                              <Card 
                                key={o.assignment_id} 
                                className="border-0 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer bg-gradient-to-br from-white to-slate-50/50 overflow-hidden group"
                                onClick={() => openPickerForAssignment(o)}
                              >
                                <CardContent className="p-5 sm:p-6">
                                  <div className="flex flex-col gap-4">
                                    {/* Header with Image and Order Info */}
                                    <div className="flex items-start gap-4">
                                      {/* Circular Product Image */}
                                      <div className="flex-shrink-0">
                                        <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-slate-200 shadow-sm">
                                          <AvatarImage 
                                            src={o.mockup_image || undefined} 
                                            alt={o.order_number}
                                            className="object-cover"
                                          />
                                          <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 text-sm font-semibold">
                                            {o.order_number?.slice(-3) || 'N/A'}
                                          </AvatarFallback>
                                        </Avatar>
                                      </div>
                                      
                                      {/* Order Details */}
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-base sm:text-lg text-slate-900 truncate mb-1">
                                          Order #{o.order_number}
                                        </div>
                                        <div className="text-sm text-slate-600 truncate">
                                          {o.customer_name || 'Unknown Customer'}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Quantity Badges */}
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col">
                                          <span className="text-xs text-slate-500 mb-1">Total Qty</span>
                                          <Badge className="bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold px-3 py-1.5 w-fit">
                                            {o.total_quantity || 0}
                                          </Badge>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs text-slate-500 mb-1">Picked</span>
                                          <Badge className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-3 py-1.5 w-fit">
                                            {o.picked_quantity || 0}
                                          </Badge>
                                        </div>
                                      </div>
                                      
                                      {/* Left to Pick - Prominent Display */}
                                      <div className="flex flex-col pt-2">
                                        <span className="text-xs text-slate-500 mb-1.5 font-medium">Left to Pick</span>
                                        <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-base font-bold px-4 py-2 w-fit shadow-sm">
                                          {leftQuantity}
                                        </Badge>
                                      </div>
                                      
                                      {/* Rejected Quantity */}
                                      {o.rejected_quantity > 0 && (
                                        <div className="pt-1">
                                          <Badge 
                                            className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-3 py-1.5 w-fit cursor-pointer" 
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              setRejectedOrderNumber(o.order_number); 
                                              setRejectedItems(o.rejected_sizes || []); 
                                              setRejectedOpen(true); 
                                            }}
                                          >
                                            Rejected: {o.rejected_quantity}
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Size Distribution */}
                                    {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 && (
                                      <div className="pt-2 border-t border-slate-100">
                                        <div className="text-xs text-slate-500 mb-2 font-medium">Size Breakdown</div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {sortSizeDistributions(o.size_distributions, (o as any).size_type_id).map((sd: any) => (
                                            <Badge 
                                              key={sd.size_name} 
                                              variant="outline" 
                                              className="text-xs bg-slate-50 border-slate-200 text-slate-700 px-2 py-0.5"
                                            >
                                              {sd.size_name}: {sd.quantity || 0}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
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
                                      {sortSizes(Object.keys(product.size_quantities), product.size_type_id).map((size) => (
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {batchOrders.map((o) => {
                  // Calculate left to pick: pending items (assigned - picked) + rejected items needing replacement
                  const pending = Math.max(0, (o.total_quantity || 0) - (o.picked_quantity || 0));
                  const rejected = Number(o.rejected_quantity || 0);
                  const leftQuantity = pending + rejected;
                  return (
                    <Card 
                      key={o.assignment_id} 
                      className="border-0 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer bg-gradient-to-br from-white to-slate-50/50 overflow-hidden group"
                      onClick={() => { setOrdersDialogOpen(false); openPickerForAssignment(o); }}
                    >
                      <CardContent className="p-5 sm:p-6">
                        <div className="flex flex-col gap-4">
                          {/* Header with Image and Order Info */}
                          <div className="flex items-start gap-4">
                            {/* Circular Product Image */}
                            <div className="flex-shrink-0">
                              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-slate-200 shadow-sm">
                                <AvatarImage 
                                  src={o.mockup_image || undefined} 
                                  alt={o.order_number}
                                  className="object-cover"
                                />
                                <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 text-sm font-semibold">
                                  {o.order_number?.slice(-3) || 'N/A'}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            
                            {/* Order Details */}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-base sm:text-lg text-slate-900 truncate mb-1">
                                Order #{o.order_number}
                              </div>
                              <div className="text-sm text-slate-600 truncate">
                                {o.customer_name || 'Unknown Customer'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Quantity Badges */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col">
                                <span className="text-xs text-slate-500 mb-1">Total Qty</span>
                                <Badge className="bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold px-3 py-1.5 w-fit">
                                  {o.total_quantity || 0}
                                </Badge>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs text-slate-500 mb-1">Picked</span>
                                <Badge className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-3 py-1.5 w-fit">
                                  {o.picked_quantity || 0}
                                </Badge>
                              </div>
                            </div>
                            
                            {/* Left to Pick - Prominent Display */}
                            <div className="flex flex-col pt-2">
                              <span className="text-xs text-slate-500 mb-1.5 font-medium">Left to Pick</span>
                              <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-base font-bold px-4 py-2 w-fit shadow-sm">
                                {(() => {
                                  // Calculate left to pick: pending items (assigned - picked) + rejected items needing replacement
                                  const pending = Math.max(0, (o.total_quantity || 0) - (o.picked_quantity || 0));
                                  const rejected = Number(o.rejected_quantity || 0);
                                  return pending + rejected;
                                })()}
                              </Badge>
                            </div>
                            
                            {/* Rejected Quantity */}
                            {o.rejected_quantity > 0 && (
                              <div className="pt-1">
                                <Badge 
                                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-3 py-1.5 w-fit cursor-pointer" 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setRejectedOrderNumber(o.order_number); 
                                    setRejectedItems(o.rejected_sizes || []); 
                                    setRejectedOpen(true); 
                                  }}
                                >
                                  Rejected: {o.rejected_quantity}
                                </Badge>
                              </div>
                            )}
                          </div>
                          
                          {/* Size Distribution */}
                          {Array.isArray(o.size_distributions) && o.size_distributions.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                              <div className="text-xs text-slate-500 mb-2 font-medium">Size Breakdown</div>
                              <div className="flex flex-wrap gap-1.5">
                                {sortSizeDistributions(o.size_distributions, (o as any).size_type_id).map((sd: any) => {
                                  const sizeLeft = (sd.quantity || 0) - (sd.picked_quantity || 0);
                                  return (
                                    <Badge 
                                      key={sd.size_name} 
                                      variant="outline" 
                                      className="text-xs bg-slate-50 border-slate-200 text-slate-700 px-2 py-0.5"
                                    >
                                      {sd.size_name}: {sd.quantity || 0} ({sizeLeft} left)
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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

        {/* Image Gallery Dialog */}
        <Dialog open={imageGalleryOpen} onOpenChange={setImageGalleryOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Product Images - {galleryBatchName}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mt-4">
              {galleryImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square">
                  <img 
                    src={img} 
                    alt={`Product ${idx + 1}`}
                    className="w-full h-full object-cover rounded border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ))}
            </div>
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
            productImage={pickerContext.productImage}
          />
        )}

        {/* Bin Selection Dialog */}
        <Dialog open={binSelectionDialogOpen} onOpenChange={(open) => {
          setBinSelectionDialogOpen(open);
          if (!open) {
            setSelectedBinsBySize({});
            setAvailableBins([]);
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Select Bin for Picklist</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Assign bins for each required size. Choose a bin that has sufficient on-hand quantity.
              </DialogDescription>
            </DialogHeader>
            {loadingBins ? (
              <p className="text-sm text-muted-foreground py-4">Loading available bins...</p>
            ) : sizeList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No size information available for this product. Please verify product metadata.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-24 sm:w-28 text-slate-900 font-semibold">Size</TableHead>
                        <TableHead className="w-28 sm:w-32 text-slate-900 font-semibold text-center">Required Qty</TableHead>
                        <TableHead className="text-slate-900 font-semibold">Select Bin</TableHead>
                        <TableHead className="w-28 sm:w-32 text-slate-900 font-semibold text-center">Available</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sizeList.map((size) => {
                        const { requiredQty, options } = sizeBinOptions[size];
                        const selection = selectedBinsBySize[size];
                        const selectedBinId = selection?.bin.bin_id ?? "";
                        const availableQty = selection?.detail?.quantity ?? 0;
                        const insufficient = selection ? availableQty < requiredQty : false;

                        return (
                          <TableRow key={size} className="align-top">
                            <TableCell className="font-semibold text-slate-900">{size}</TableCell>
                            <TableCell className="text-center text-slate-700 font-medium">{requiredQty}</TableCell>
                            <TableCell>
                              {options.length > 0 ? (
                                <div className="space-y-2">
                                  <Select
                                    value={selectedBinId}
                                    onValueChange={(value) => handleSizeBinSelect(size, value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Choose a bin..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {options.map(({ bin, detail }) => (
                                        <SelectItem key={`${size}-${bin.bin_id}`} value={bin.bin_id}>
                                          <div className="flex flex-col items-start gap-1 py-0.5">
                                            <span className="font-medium">{bin.bin_code}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {formatBinLocation(bin)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              Available: {detail.quantity}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {selection && (
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                                      <div className="text-xs text-slate-600">
                                        <div className="font-medium text-slate-700">{selection.bin.bin_code}</div>
                                        <div>{formatBinLocation(selection.bin)}</div>
                                      </div>
                                      {sizeList.length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs"
                                          onClick={() => handleApplyBinToAllSizes(size)}
                                        >
                                          Use for all sizes
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-destructive bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                  No bins with this size available
                                </div>
                              )}
                            </TableCell>
                            <TableCell className={`text-center font-semibold ${insufficient ? 'text-red-600' : 'text-slate-700'}`}>
                              {selection ? availableQty : '--'}
                              {insufficient && (
                                <div className="text-xs font-medium">Short by {requiredQty - availableQty}</div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {sizesWithoutOptions.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Bins for the following sizes are not available: {sizesWithoutOptions.join(', ')}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setBinSelectionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmBinSelection}
                    disabled={!allSizesSelected || sizesWithoutOptions.length > 0}
                  >
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
            setPicklistData({ product: null, order: null, bin: null, binsBySize: null });
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
                .print-content table {
                  page-break-inside: auto;
                }
                .print-content thead {
                  display: table-header-group;
                }
                .print-content tr {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                .print-content .sticky {
                  position: static !important;
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
              <DialogDescription className="text-sm text-muted-foreground">
                Review the selected bins and size allocations before printing the picklist.
              </DialogDescription>
            </DialogHeader>
            {picklistData.product && picklistSizeEntries.length > 0 && (
              <div className="space-y-5 print-content">
                {/* Company Header with Logo */}
                <div className="flex justify-between items-start border-b-2 border-slate-300 pb-4 mb-4 print:border-b-2 print:pb-3 print:mb-3">
                  <div className="flex items-center gap-4">
                    {(company as any)?.logo_url && (
                      <img
                        src={(company as any).logo_url}
                        alt="Company Logo"
                        className="w-20 h-20 sm:w-24 sm:h-24 object-contain print:w-20 print:h-20"
                        style={{ maxWidth: '80px', maxHeight: '80px' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div>
                      <div className="text-xl font-bold text-slate-900 print:text-lg">
                        {company?.company_name || 'Company Name'}
                      </div>
                      {company?.address && (
                        <div className="text-xs text-slate-600 print:text-xs">
                          {company.address}
                        </div>
                      )}
                      <div className="text-xs text-slate-600 print:text-xs">
                        {company?.gstin && `GSTIN: ${company.gstin}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900 print:text-base">PICKLIST</div>
                    <div className="text-xs text-slate-600 print:text-xs">
                      {new Date().toLocaleDateString('en-IN', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </div>
                  </div>
                </div>

                {/* Product Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b print:pb-3 print:border-b">
                  <div className="flex items-center gap-4">
                    {picklistData.product.image_url && (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative shadow-sm print:w-16 print:h-16">
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
                      <div className="text-base font-semibold text-slate-900 print:text-sm print:font-bold mb-1">
                        {picklistData.product.product_name}
                      </div>
                      <div className="text-sm text-slate-600 print:text-xs">
                        Total Quantity: <span className="font-semibold text-slate-900">{picklistData.product.total_quantity}</span>
                      </div>
                      <div className="text-sm text-slate-600 print:text-xs">
                        Orders: <span className="font-semibold text-slate-900">{picklistData.product.orders.length}</span>
                      </div>
                      <div className="text-sm text-slate-600 print:text-xs">
                        Unique Bins:{' '}
                        <span className="font-semibold text-slate-900">
                          {uniqueSelectedBins.length > 0 ? uniqueSelectedBins.map((bin) => bin.bin_code).join(', ') : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900 print:text-sm">Bin Allocations</div>
                  <div className="overflow-x-auto rounded-md border border-slate-200 print:border-slate-300">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 print:bg-slate-50">
                          <TableHead className="text-slate-900 font-semibold w-24 sm:w-28 print:w-20">Size</TableHead>
                          <TableHead className="text-slate-900 font-semibold text-center w-28 sm:w-32 print:w-24">Required Qty</TableHead>
                          <TableHead className="text-slate-900 font-semibold print:min-w-[80px]">Bin</TableHead>
                          <TableHead className="text-slate-900 font-semibold print:min-w-[200px]">Location</TableHead>
                          <TableHead className="text-slate-900 font-semibold text-center w-28 sm:w-32 print:w-24">Available</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {picklistSizeEntries.map(({ size, requiredQty, selection }) => {
                          const availableQty = selection?.detail?.quantity ?? 0;
                          const insufficient = availableQty < requiredQty;
                          return (
                            <TableRow key={size} className="print:break-inside-avoid">
                              <TableCell className="font-semibold text-slate-900 print:text-sm">{size}</TableCell>
                              <TableCell className="text-center text-slate-700 font-medium print:text-sm">{requiredQty}</TableCell>
                              <TableCell className="text-slate-800 font-medium print:text-sm">{selection?.bin.bin_code || '—'}</TableCell>
                              <TableCell className="text-slate-600 text-sm print:text-xs">
                                {selection ? formatBinLocation(selection.bin) : '—'}
                              </TableCell>
                              <TableCell className={`text-center font-semibold print:text-sm ${insufficient ? 'text-red-600' : 'text-slate-700'}`}>
                                {selection ? availableQty : '—'}
                                {insufficient && (
                                  <div className="text-xs font-medium print:text-xs">
                                    Short by {requiredQty - availableQty}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900 print:text-sm">Order Details</div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold text-slate-900 sticky left-0 bg-slate-50 z-10 w-48 print:static print:bg-slate-50">
                            Order Number
                          </TableHead>
                          <TableHead className="font-semibold text-slate-900 sticky left-[192px] bg-slate-50 z-10 min-w-[180px] print:static print:bg-slate-50">
                            Bin(s)
                          </TableHead>
                          {picklistSizeEntries.map(({ size }) => (
                            <TableHead key={size} className="font-semibold text-slate-900 text-center min-w-[80px] print:min-w-[60px]">
                              {size}
                            </TableHead>
                          ))}
                          <TableHead className="font-semibold text-slate-900 text-center bg-blue-50 print:bg-blue-50">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                    <TableBody>
                      {picklistData.product.orders.map((order) => {
                        const rowTotal = Object.values(order.size_quantities).reduce(
                          (sum, qty) => sum + (Number(qty) || 0),
                          0
                        );
                        const binSummary = picklistSizeEntries
                          .filter(({ size }) => (order.size_quantities[size] || 0) > 0)
                          .map(({ size, selection }) => `${size}: ${selection?.bin.bin_code || '—'}`)
                          .join(', ');
                        return (
                          <TableRow key={order.order_id} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                            <TableCell className="font-medium text-slate-900 sticky left-0 bg-white z-10 print:static print:bg-white">
                              {order.order_number}
                            </TableCell>
                            <TableCell className="text-slate-800 sticky left-[192px] bg-white z-10 text-sm print:static print:bg-white">
                              {binSummary || '—'}
                            </TableCell>
                            {picklistSizeEntries.map(({ size }) => (
                              <TableCell key={size} className="text-center print:text-center">
                                {order.size_quantities[size] || 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-semibold bg-blue-50 print:bg-blue-50">
                              {rowTotal}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-slate-100 font-semibold print:bg-slate-100">
                        <TableCell className="font-semibold text-slate-900 sticky left-0 bg-slate-100 z-10 print:static print:bg-slate-100">
                          Total
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 sticky left-[192px] bg-slate-100 z-10 text-sm print:static print:bg-slate-100">
                          {uniqueSelectedBins.length > 0
                            ? uniqueSelectedBins.map((bin) => bin.bin_code).join(', ')
                            : '—'}
                        </TableCell>
                        {picklistSizeEntries.map(({ size }) => {
                          const colTotal = picklistData.product!.orders.reduce(
                            (sum, order) => sum + (Number(order.size_quantities[size]) || 0),
                            0
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
                        {sortSizes(Object.keys(selectedProductDetail.size_quantities), selectedProductDetail.size_type_id).map((size) => (
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
                        const sortedSizes = sortSizes(Object.keys(selectedProductDetail.size_quantities), selectedProductDetail.size_type_id);
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


