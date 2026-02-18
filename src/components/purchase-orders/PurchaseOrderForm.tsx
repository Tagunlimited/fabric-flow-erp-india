import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Plus, ExternalLink, X, ArrowLeft, Printer, Download, Share2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ProductImage } from '@/components/ui/OptimizedImage';
import { convertImageToBase64WithCache, createFallbackLogo } from '@/utils/imageUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { PendingItem, PendingItemGroup, getPendingItemPlaceholder, usePendingPoItems } from '@/hooks/usePendingPoItems';

type CompanySettings = {
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  logo_url?: string;
  authorized_signatory_url?: string;
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
  unit_of_measure?: string;
  remarks?: string;
  notes?: string;
  item_color?: string | null;
  attributes?: Record<string, any> | null;
  fabricSelections?: { color: string; gsm: string; quantity: number }[];
  itemSelections?: { id: string; label: string; image_url?: string | null; quantity: number }[];
  item_category?: string | null;
  // Fabric-specific fields
  fabric_name?: string;
  fabric_for_supplier?: string | null;
  fabric_color?: string;
  fabric_gsm?: string;
  // Pending BOM linkage
  bom_item_id?: string;
  bom_id?: string;
  bom_number?: string;
  product_name?: string | null;
};

type PurchaseOrder = {
  id?: string;
  po_number?: string;
  supplier_id: string;
  order_date: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  terms_conditions?: string;
  notes?: string;
  delivery_address?: string;
  expected_delivery_date?: string;
  // Transporter details
  preferred_transporter?: string;
  transport_remark?: string;
};

type Supplier = {
  id: string;
  name: string;
  supplier_name?: string;
  supplier_code?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  gst_number?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_address_city?: string;
  billing_address_state?: string;
  billing_address_pincode?: string;
  pan?: string;
};

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
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
  const printRef = useRef<HTMLDivElement>(null);
  
  // Check for BOM data in URL params and location state
  const location = useLocation();
  const bomParam = searchParams.get('bom');
  const [bomData, setBomData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersMap, setSuppliersMap] = useState<Record<string, Supplier>>({});
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const logoCache = useRef<Map<string, string>>(new Map());
  const [po, setPo] = useState<PurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    delivery_address: '',
    expected_delivery_date: '',
  });
  const [items, setItems] = useState<LineItem[]>([]);
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; item_type?: string; uom?: string; type?: string; color?: string | null }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemTypeOptions, setItemTypeOptions] = useState<string[]>([]);

  const {
    pendingItems,
    fabricGroups,
    itemGroups,
    loading: pendingLoading,
    error: pendingError,
    refresh: refreshPending
  } = usePendingPoItems();

  const pendingPlaceholder = useMemo(() => getPendingItemPlaceholder(), []);

  const pendingSelectionMap = useMemo(() => {
    const map = new Map<string, LineItem>();
    items.forEach(item => {
      if (item.bom_item_id) {
        map.set(item.bom_item_id, item);
      }
    });
    return map;
  }, [items]);

  const itemColorMap = useMemo(() => {
    const map = new Map<string, string | null>();
    itemOptions.forEach(option => {
      if (option.id) {
        map.set(option.id, option.color || null);
      }
    });
    return map;
  }, [itemOptions]);

  const manualItems = useMemo(() => items.filter(item => !item.bom_item_id), [items]);
  const manualFabricItems = useMemo(
    () => manualItems.filter(item => item.item_type === 'fabric'),
    [manualItems]
  );
  const manualNonFabricItems = useMemo(
    () => manualItems.filter(item => item.item_type !== 'fabric'),
    [manualItems]
  );

  const formatQuantity = (value: number | string | null | undefined) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '0.00';
    }
    return num.toFixed(2);
  };

  const aggregatedSelectedItems = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        item_name: string;
        item_type: string;
        item_id?: string | null;
        unit_of_measure?: string;
        total_quantity: number;
        item_image_url?: string | null;
        fabric_name?: string;
        fabric_for_supplier?: string | null;
        fabric_color?: string;
        fabric_gsm?: string;
        item_color?: string | null;
        remarks: Set<string>;
      }
    >();
  
    items.forEach(item => {
      const qty = Number(item.quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) return;
      const unit = item.unit_of_measure || '';
      const itemType = (item.item_type || '').toLowerCase() || 'item';
      const identityKey =
        itemType === 'fabric'
          ? [
              'fabric',
              (item.fabric_name || item.item_name || '').toLowerCase(),
              (item.fabric_color || '').toLowerCase(),
              (item.fabric_gsm || '').toLowerCase(),
              unit.toLowerCase()
            ].join('|')
          : [
              'item',
              (item.item_id || item.item_name || '').toLowerCase(),
              unit.toLowerCase()
            ].join('|');

      const resolvedColor = item.item_color || (item.item_id ? itemColorMap.get(item.item_id) || null : null);
      const existing = grouped.get(identityKey);
      if (existing) {
        existing.total_quantity += qty;
        if (item.remarks) {
          existing.remarks.add(item.remarks);
        }
        if (item.notes) {
          existing.remarks.add(item.notes);
        }
        if (!existing.item_color && resolvedColor) {
          existing.item_color = resolvedColor;
        }
        if (!existing.fabric_color && item.fabric_color) {
          existing.fabric_color = item.fabric_color;
        }
        if (!existing.fabric_for_supplier && item.fabric_for_supplier) {
          existing.fabric_for_supplier = item.fabric_for_supplier;
        }
        if (!existing.item_id && item.item_id) {
          existing.item_id = item.item_id;
        }
      } else {
        const remarksSet = new Set<string>();
        if (item.remarks) {
          remarksSet.add(item.remarks);
        }
        if (item.notes) {
          remarksSet.add(item.notes);
        }
        grouped.set(identityKey, {
          key: identityKey,
          item_name: item.item_name,
          item_type: item.item_type || 'item',
          item_id: item.item_id || null,
          item_category: item.item_category || null,
          unit_of_measure: unit,
          total_quantity: qty,
          item_image_url: item.item_image_url,
          fabric_name: item.fabric_name,
          fabric_for_supplier: item.fabric_for_supplier || null,
          fabric_color: item.fabric_color,
          fabric_gsm: item.fabric_gsm,
          item_color: resolvedColor,
          remarks: remarksSet
        });
      }
    });

    return Array.from(grouped.values()).map(entry => ({
      ...entry,
      remarks: Array.from(entry.remarks).filter(Boolean).join(' | ')
    }));
  }, [items]);

  useEffect(() => {
    if (pendingError) {
      toast.error('Failed to load pending BOM items');
    }
  }, [pendingError]);

  const createLineItemFromPending = (pending: PendingItem): LineItem => {
    const typeKey = (pending.item_type || pending.category || '').toLowerCase();
    const isFabric = typeKey === 'fabric';
    return {
      item_type: isFabric ? 'fabric' : 'item',
      item_id: pending.item_id || '',
      item_name: pending.item_name,
      item_image_url: pending.image_url || null,
      quantity: Number(pending.remaining_quantity || pending.qty_total || 0),
      unit_of_measure: pending.unit || (isFabric ? 'kgs' : 'pcs'),
      remarks: '',
      item_category: pending.category || (isFabric ? 'Fabric' : null),
      item_color: pending.item_color || null,
      fabric_name: isFabric ? pending.fabric_name || pending.item_name : undefined,
      fabric_for_supplier: isFabric ? (pending as any).fabric_for_supplier || null : undefined,
      fabric_color: isFabric ? pending.fabric_color || undefined : undefined,
      fabric_gsm: isFabric ? pending.fabric_gsm || undefined : undefined,
      bom_item_id: pending.bom_item_id,
      bom_id: pending.bom_id,
      bom_number: pending.bom_number,
      product_name: pending.product_name
    };
  };

  const ensureLineItemFromPending = (pending: PendingItem) => {
    setItems(prev => {
      const idx = prev.findIndex(item => item.bom_item_id === pending.bom_item_id);
      if (idx >= 0) {
        const existing = prev[idx];
        const merged: LineItem = {
          ...createLineItemFromPending(pending),
          ...existing,
          quantity: existing.quantity ?? Number(pending.remaining_quantity || 0),
          unit_of_measure: existing.unit_of_measure || pending.unit || (existing.item_type === 'fabric' ? 'kgs' : 'pcs'),
          remarks: existing.remarks || existing.notes || '',
          item_color: existing.item_color || pending.item_color || null
        };
        const updated = [...prev];
        updated[idx] = merged;
        return updated;
      }
      return [...prev, createLineItemFromPending(pending)];
    });
  };

  const removeLineItemByBom = (bomItemId: string) => {
    setItems(prev => prev.filter(item => item.bom_item_id !== bomItemId));
  };

  const updateLineItemByBom = (bomItemId: string, updates: Partial<LineItem>) => {
    setItems(prev =>
      prev.map(item =>
        item.bom_item_id === bomItemId
          ? {
              ...item,
              ...updates
            }
          : item
      )
    );
  };

  const handleTogglePendingSelection = (pending: PendingItem, checked: boolean) => {
    if (checked) {
      ensureLineItemFromPending(pending);
    } else {
      removeLineItemByBom(pending.bom_item_id);
    }
  };

  const handleGroupSelection = (group: PendingItemGroup, checked: boolean) => {
    group.bomBreakdowns.forEach(item => {
      handleTogglePendingSelection(item, checked);
    });
  };

  const renderPendingSection = (title: string, groups: PendingItemGroup[]) => {
    const isFabric = title === 'Fabric';

    return (
    <Card key={title} className="border border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No pending {title.toLowerCase()} requirements.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => {
              const selectedCount = group.bomBreakdowns.filter(item =>
                pendingSelectionMap.has(item.bom_item_id)
              ).length;
              const groupChecked =
                selectedCount === 0
                  ? false
                  : selectedCount === group.bomBreakdowns.length
                    ? true
                    : ('indeterminate' as const);

              return (
              <div key={group.key} className="rounded-lg border border-dashed border-primary/30 p-4">
                {!isFabric && (
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={groupChecked}
                      onCheckedChange={value => handleGroupSelection(group, value === true)}
                      disabled={isReadOnly}
                    />
                    <ProductImage
                      src={group.imageUrl || pendingPlaceholder}
                      alt={group.displayName}
                      className="h-16 w-16 rounded object-cover"
                      fallbackText="IMG"
                    />
                    <div>
                      <div className="text-lg font-semibold">{group.displayName}</div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{group.type}</div>
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-3 gap-4 text-sm md:w-auto md:text-right">
                    <div>
                      <div className="text-muted-foreground">Required</div>
                      <div className="font-semibold">
                        {formatQuantity(group.totalRequired)} {group.unit || ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Ordered</div>
                      <div className="font-semibold">
                        {formatQuantity(group.totalOrdered)} {group.unit || ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Remaining</div>
                      <div className="font-semibold text-primary">
                        {formatQuantity(group.totalRemaining)} {group.unit || ''}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                <div className={`${isFabric ? '' : 'mt-4'} overflow-x-auto`}>
                  <Table>
                    <TableHeader>
                      <TableRow className="[&>th]:align-middle">
                        <TableHead className="w-[5%] text-center">Select</TableHead>
                        {isFabric ? (
                          <>
                            <TableHead className="text-left">Fabric (for supplier)</TableHead>
                            <TableHead className="text-left">Color</TableHead>
                            <TableHead className="text-left">GSM</TableHead>
                            <TableHead className="w-[15%] text-right">Order Qty</TableHead>
                            <TableHead className="w-[15%] text-center">Actions</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead className="w-[24%] text-left">BOM</TableHead>
                            <TableHead className="w-[10%] text-right">Required</TableHead>
                            <TableHead className="w-[10%] text-right">Ordered</TableHead>
                            <TableHead className="w-[10%] text-right">Remaining</TableHead>
                            <TableHead className="w-[12%] text-right">Order Qty</TableHead>
                            <TableHead className="w-[9%] text-center">UOM</TableHead>
                            <TableHead className="w-[15%] text-left">Remark</TableHead>
                            <TableHead className="w-[15%] text-center">Actions</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.bomBreakdowns
                        .slice()
                        .sort((a, b) => a.bom_number.localeCompare(b.bom_number))
                        .map(item => {
                          const selectedItem = pendingSelectionMap.get(item.bom_item_id);
                          const isSelected = Boolean(selectedItem);
                          const quantityValue = selectedItem
                            ? selectedItem.quantity
                            : Number(item.remaining_quantity || 0);
                          const unitValue =
                            selectedItem?.unit_of_measure || item.unit || group.unit || '';
                          const remarkValue = selectedItem?.remarks || '';

                          if (isFabric) {
                            return (
                              <TableRow key={item.bom_item_id} className="[&>td]:align-middle">
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={value =>
                                      handleTogglePendingSelection(item, value === true)
                                    }
                                    disabled={isReadOnly}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {item.fabric_for_supplier || item.fabric_name || item.item_name || 'N/A'}
                                </TableCell>
                                <TableCell>{item.fabric_color ?? 'N/A'}</TableCell>
                                <TableCell>{item.fabric_gsm ? `${item.fabric_gsm} GSM` : 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    value={quantityValue}
                                    onChange={e => {
                                      if (!isSelected) return;
                                      const value = parseFloat(e.target.value);
                                      updateLineItemByBom(item.bom_item_id, {
                                        quantity: Number.isFinite(value) ? value : 0
                                      });
                                    }}
                                    disabled={!isSelected || isReadOnly}
                                    className="text-right w-24"
                                    min={0}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => navigate(`/bom/${item.bom_id}`)}
                                    >
                                      View BOM
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeLineItemByBom(item.bom_item_id)}
                                      disabled={!isSelected || isReadOnly}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          }

                          return (
                            <TableRow key={item.bom_item_id} className="[&>td]:align-middle">
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={value =>
                                    handleTogglePendingSelection(item, value === true)
                                  }
                                  disabled={isReadOnly}
                                />
                              </TableCell>
                              <TableCell className="w-[24%]">
                                <div className="font-medium">{item.bom_number}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.product_name || 'Unnamed Product'}
                                </div>
                              </TableCell>
                              <TableCell className="w-[10%] text-right whitespace-nowrap tabular-nums">
                                {formatQuantity(item.qty_total)} {item.unit || ''}
                              </TableCell>
                              <TableCell className="w-[10%] text-right whitespace-nowrap tabular-nums">
                                {formatQuantity(item.total_ordered)} {item.unit || ''}
                              </TableCell>
                              <TableCell className="w-[10%] text-right whitespace-nowrap tabular-nums font-semibold text-primary">
                                {formatQuantity(item.remaining_quantity)} {item.unit || ''}
                              </TableCell>
                              <TableCell className="w-[10%] text-right whitespace-nowrap tabular-nums font-semibold text-primary">
                                {formatQuantity(item.remaining_quantity)} {item.unit || ''}
                              </TableCell>
                              <TableCell className="w-[12%] text-right">
                                <Input
                                  type="number"
                                  value={quantityValue}
                                  onChange={e => {
                                    if (!isSelected) return;
                                    const value = parseFloat(e.target.value);
                                    updateLineItemByBom(item.bom_item_id, {
                                      quantity: Number.isFinite(value) ? value : 0
                                    });
                                  }}
                                  disabled={!isSelected || isReadOnly}
                                  className="text-right"
                                  min={0}
                                />
                              </TableCell>
                              <TableCell className="w-[9%] text-center">
                                <Input
                                  value={unitValue}
                                  onChange={e => {
                                    if (!isSelected) return;
                                    updateLineItemByBom(item.bom_item_id, {
                                      unit_of_measure: e.target.value
                                    });
                                  }}
                                  disabled={!isSelected || isReadOnly}
                                  className="text-center"
                                />
                              </TableCell>
                              <TableCell className="w-[15%]">
                                <Input
                                  value={remarkValue}
                                  onChange={e => {
                                    if (!isSelected) return;
                                    updateLineItemByBom(item.bom_item_id, {
                                      remarks: e.target.value
                                    });
                                  }}
                                  disabled={!isSelected || isReadOnly}
                                  placeholder="Add remark"
                                />
                              </TableCell>
                              <TableCell className="w-[15%] text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/bom/${item.bom_id}`)}
                                  >
                                    View BOM
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeLineItemByBom(item.bom_item_id)}
                                    disabled={!isSelected || isReadOnly}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
                {isFabric && (
                  <div className="mt-2 flex items-center gap-2">
                    <Checkbox
                      checked={groupChecked}
                      onCheckedChange={value => handleGroupSelection(group, value === true)}
                      disabled={isReadOnly}
                    />
                    <span className="text-sm text-muted-foreground">Select all in this group</span>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
  };

  // Process BOM data from URL params
  useEffect(() => {
    if (bomParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(bomParam));
        setBomData(parsed);
        console.log('BOM data loaded from URL params:', parsed);
      } catch (e) {
        console.error('Failed to parse BOM data:', e);
      }
    }
  }, [bomParam]);

  // Process BOM data from location state
  useEffect(() => {
    if (location.state?.bomData) {
      console.log('BOM data received from location state:', location.state.bomData);
      console.log('BOM items received from location state:', location.state.bomItems);
      console.log('BOM items count:', location.state.bomItems?.length);
      console.log('BOM items details:', location.state.bomItems?.map((item: any) => ({
        item_name: item.item_name,
        item_type: item.item_type,
        category: item.category,
        qty_total: item.qty_total,
        to_order: item.to_order
      })));
      setBomData({
        ...location.state.bomData,
        items: location.state.bomItems || location.state.bomData.items || []
      });
    }
  }, [location.state]);

  // Load BOM data into form
  useEffect(() => {
    if (bomData && (fabricOptions.length > 0 || itemOptions.length > 0)) {
      console.log('Processing BOM data:', bomData);
      console.log('Fabric options loaded:', fabricOptions.length);
      console.log('Item options loaded:', itemOptions.length);
      // Pre-fill items from BOM data
      const bomItems = bomData.items || [];
      console.log('Processing BOM items:', {
        count: bomItems.length,
        items: bomItems.map((item: any) => ({
          item_name: item.item_name,
          item_type: item.item_type,
          category: item.category,
          qty_total: item.qty_total,
          to_order: item.to_order
        }))
      });
      const formattedItems = bomItems.map((item: any) => {
        console.log('Processing BOM item:', item);
        
        if (item.item_type === 'fabric' || item.category === 'Fabric') {
          // Handle fabric items with color and GSM
          const fabricSelections = item.fabricSelections || [];
          const firstSelection = fabricSelections[0] || {};
          
          // Parse fabric details from item_name if not available in separate fields
          let fabricName = item.fabric_name || firstSelection.fabric_name || '';
          let fabricColor = item.fabric_color || firstSelection.color || '';
          let fabricGsm = item.fabric_gsm || firstSelection.gsm || '';
          
          // If fabric details are not available, try to parse from item_name
          if (!fabricColor || !fabricGsm) {
            const itemNameParts = item.item_name?.split(' - ') || [];
            if (itemNameParts.length >= 3) {
              fabricName = fabricName || itemNameParts[0]?.trim();
              fabricColor = fabricColor || itemNameParts[1]?.trim();
              fabricGsm = fabricGsm || itemNameParts[2]?.replace('GSM', '').trim();
            }
          }
          
          console.log('Parsed fabric details:', {
            original: { fabric_name: item.fabric_name, fabric_color: item.fabric_color, fabric_gsm: item.fabric_gsm },
            parsed: { fabricName, fabricColor, fabricGsm },
            itemName: item.item_name
          });
          
        // Find the fabric in fabricOptions to get the GST rate and image
        let fabricOption = fabricOptions.find(f => 
          f.fabric_name === fabricName && 
          f.color === fabricColor && 
          f.gsm === fabricGsm
        );
        
        // If not found with exact match, try to find by fabric name only
        if (!fabricOption && fabricName) {
          fabricOption = fabricOptions.find(f => f.fabric_name === fabricName);
        }
        
        // If still not found, try to find by item name
        if (!fabricOption && item.item_name) {
          fabricOption = fabricOptions.find(f => f.fabric_name === item.item_name);
        }
          
          // Debug logging
          console.log('Processing fabric item:', {
            itemName: item.item_name,
            firstSelection,
            fabricOption,
            fabricOptionsCount: fabricOptions.length
          });
          
          return {
            item_type: 'fabric',
            item_id: item.item_id || '',
            item_name: fabricName || item.item_name || '',
            item_image_url: fabricOption?.image_url || item.item_image_url || null,
            quantity: item.qty_total || item.to_order || item.quantity || 0,
            unit_of_measure: item.unit_of_measure || 'Kgs',
            // Store fabric-specific data with parsed values
            fabric_name: fabricName || 'Unknown Fabric',
            fabric_for_supplier: fabricOption?.fabric_for_supplier || null,
            fabric_color: fabricColor || 'N/A',
            fabric_gsm: fabricGsm || 'N/A',
            fabricSelections: fabricSelections,
            attributes: {
              colorsList: fabricColor ? [fabricColor] : (fabricOption?.color ? [fabricOption.color] : []),
              gsmList: fabricGsm ? [fabricGsm] : (fabricOption?.gsm ? [fabricOption.gsm] : []),
              description: item.item_name || 'Fabric Item'
            }
          };
        } else {
          // Handle regular items
          // Find the item in itemOptions to get the GST rate, image, and type
          let itemOption = itemOptions.find(i => i.id === item.item_id);
          
          // If not found by ID, try to find by name
          if (!itemOption && item.item_name) {
            itemOption = itemOptions.find(i => i.label === item.item_name);
          }
          
          // If still not found, try partial name matching
          if (!itemOption && item.item_name) {
            itemOption = itemOptions.find(i => 
              i.label.toLowerCase().includes(item.item_name.toLowerCase()) ||
              item.item_name.toLowerCase().includes(i.label.toLowerCase())
            );
          }
          
          console.log(`Processing item ${item.item_name}:`, {
            itemId: item.item_id,
            itemOption: itemOption,
            itemOptionsCount: itemOptions.length,
            itemOptions: itemOptions.map(i => ({ id: i.id, name: i.label, image: i.image_url, type: i.item_type })),
            itemOptionFull: itemOption,
            originalImageUrl: item.item_image_url
          });
          
          return {
            item_type: 'item',
            item_id: item.item_id || '',
            item_name: item.item_name || '',
            item_image_url: itemOption?.image_url || item.item_image_url || null,
            quantity: item.qty_total || item.to_order || item.quantity || 0,
            unit_of_measure: item.unit_of_measure || 'pcs',
            item_category: itemOption?.item_type || item.item_category || null,
            itemSelections: item.itemSelections || []
          };
        }
      });
      
      // No pricing calculations needed for purchase orders
      const itemsWithTotals = formattedItems;
      setItems(itemsWithTotals);
      console.log('Items loaded from BOM:', itemsWithTotals);
    }
  }, [bomData, fabricOptions, itemOptions]);

  // Enrich existing items with options data when options are loaded
  useEffect(() => {
    if (items.length > 0 && (fabricOptions.length > 0 || itemOptions.length > 0)) {
      console.log('Enriching items with options data:', {
        itemsCount: items.length,
        fabricOptionsCount: fabricOptions.length,
        itemOptionsCount: itemOptions.length,
        items: items.map(i => ({ id: i.item_id, name: i.item_name, currentImage: i.item_image_url, currentType: i.item_category })),
        itemOptions: itemOptions.map(i => ({ id: i.id, name: i.label, image: i.image_url, type: i.item_type }))
      });
      
      const enrichedItems = items.map(item => {
        // Find the item in options to get additional data
        let itemOption = itemOptions.find(i => i.id === item.item_id);
        let fabricOption = null;
        
        // For fabric items, search by fabric details instead of item_id
        if (item.item_type === 'fabric' || item.category === 'Fabric') {
          fabricOption = fabricOptions.find(f => 
            f.fabric_name === item.fabric_name && 
            f.color === item.fabric_color && 
            f.gsm === item.fabric_gsm
          );
          
          // If not found with exact match, try by fabric name only
          if (!fabricOption && item.fabric_name) {
            fabricOption = fabricOptions.find(f => f.fabric_name === item.fabric_name);
          }
          
          // If still not found, try by item name
          if (!fabricOption && item.item_name) {
            fabricOption = fabricOptions.find(f => f.fabric_name === item.item_name);
          }
        } else {
          // For non-fabric items, search by ID
          fabricOption = fabricOptions.find(f => f.id === item.item_id);
        }
        
        // If not found by ID, try to find by name
        if (!itemOption && item.item_name) {
          itemOption = itemOptions.find(i => i.label === item.item_name);
        }
        
        // If still not found, try partial name matching
        if (!itemOption && item.item_name) {
          itemOption = itemOptions.find(i => 
            i.label.toLowerCase().includes(item.item_name.toLowerCase()) ||
            item.item_name.toLowerCase().includes(i.label.toLowerCase())
          );
        }
        if (!fabricOption && item.item_name) {
          fabricOption = fabricOptions.find(f => 
            f.fabric_name.toLowerCase().includes(item.item_name.toLowerCase()) ||
            item.item_name.toLowerCase().includes(f.fabric_name.toLowerCase())
          );
        }
        
        console.log(`Enriching item ${item.item_name}:`, {
          itemId: item.item_id,
          itemOption: itemOption,
          fabricOption: fabricOption,
          currentImage: item.item_image_url,
          currentType: item.item_category,
          itemOptionImage: itemOption?.image_url,
          itemOptionType: itemOption?.item_type,
          fabricOptionImage: fabricOption?.image_url,
          itemOptionFull: itemOption,
          fabricOptionFull: fabricOption
        });
        
        // Determine the best image URL to use
        const bestImageUrl = item.item_image_url || itemOption?.image_url || fabricOption?.image_url || null;
        
        return {
          ...item,
          // Ensure item_id is resolved from options if missing (prevents NOT NULL violations)
          item_id: item.item_id || itemOption?.id || fabricOption?.id || '',
          // Enrich with data from options if available and not already set
          item_image_url: bestImageUrl,
          item_category: item.item_category || itemOption?.item_type || itemOption?.type || 'Not specified',
          item_color: item.item_color || itemOption?.color || null,
          // Also update fabric-specific fields if this is a fabric item
          ...(item.item_type === 'fabric' && {
            fabric_color: item.fabric_color || fabricOption?.color || 'N/A',
            fabric_gsm: item.fabric_gsm || fabricOption?.gsm || 'N/A',
            fabric_name: item.fabric_name || fabricOption?.fabric_name || item.item_name,
            fabric_for_supplier: item.fabric_for_supplier || fabricOption?.fabric_for_supplier || null
          })
        };
      });
      
      // Only update if there are changes
      const hasChanges = enrichedItems.some((item, index) => 
        item.item_image_url !== items[index].item_image_url || 
        item.item_category !== items[index].item_category
      );
      
      console.log('Has changes:', hasChanges);
      
      if (hasChanges) {
        console.log('Updating items with enriched data');
        setItems(enrichedItems);
      }
    }
  }, [fabricOptions, itemOptions, items.length]); // Only depend on length to avoid infinite loops

  useEffect(() => {
    fetchSuppliers();
    fetchCompanySettings();
    fetchOptions();
    if (id) {
      fetchPurchaseOrder();
    }
  }, [id]);


  // Function to generate PO number with TUC/PO/ prefix starting from 0001
  const generatePONumber = async () => {
    try {
      // Get the latest PO number from database
      const { data: latestPO, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .like('po_number', 'TUC/PO/%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching latest PO:', error);
        // Fallback to 0001 if there's an error
        return 'TUC/PO/0001';
      }

      if (!latestPO || latestPO.length === 0) {
        // No existing PO found, start from 0001
        return 'TUC/PO/0001';
      }

      // Extract the number from the latest PO
      const latestNumber = latestPO[0].po_number;
      const match = latestNumber.match(/TUC\/PO\/(\d+)/);
      
      if (match) {
        const currentNumber = parseInt(match[1], 10);
        const nextNumber = currentNumber + 1;
        return `TUC/PO/${nextNumber.toString().padStart(4, '0')}`;
      } else {
        // If format doesn't match, start from 0001
        return 'TUC/PO/0001';
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
      // Fallback to 0001 if there's an error
      return 'TUC/PO/0001';
    }
  };

  // PDF Generation Functions
  const generatePDF = async () => {
    try {
      // Loading toast removed as requested
      
      // Ensure logo is converted to base64
      if (companySettings?.logo_url && !logoBase64) {
        await convertLogoToBase64(companySettings.logo_url);
      }
      
      console.log('PDF - Company Settings:', companySettings);
      console.log('PDF - Suppliers:', suppliers);
      console.log('PDF - Suppliers Map:', suppliersMap);
      console.log('PDF - PO Supplier ID:', po.supplier_id);
      console.log('PDF - Selected Supplier:', suppliersMap[po.supplier_id]);
      
      // Create a temporary div with the formatted content
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '210mm'; // A4 width
      tempDiv.style.backgroundColor = '#ffffff';
      tempDiv.style.padding = '20px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '12px';
      tempDiv.style.lineHeight = '1.4';
      
      const companyLogo = logoBase64 ? 
        `<img src="${logoBase64}" alt="Company Logo" style="max-height: 100px; max-width: 280px; display: block; object-fit: contain;">` : 
        `<div style="height: 100px; width: 280px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-weight: bold;">LOGO</div>`;
      
      const companyAddress = companySettings ? 
        `${companySettings.address || ''}${companySettings.city ? ', ' + companySettings.city : ''}${companySettings.state ? ', ' + companySettings.state : ''}${companySettings.pincode ? ' - ' + companySettings.pincode : ''}`.replace(/^,\s*/, '') : 
        'Company Address';
      
      // Generate aggregated line items table HTML
      const aggregatedItems = aggregatedSelectedItems.length > 0 ? aggregatedSelectedItems : items.map(item => ({
        key: item.id || item.item_id || item.item_name,
        item_name: item.item_name,
        remarks: [item.remarks, item.notes].filter(Boolean).join(' | '),
        item_type: item.item_type,
        item_id: item.item_id || null,
        item_category: item.item_category,
        fabric_color: item.fabric_color,
        fabric_gsm: item.fabric_gsm,
        fabric_for_supplier: item.fabric_for_supplier || null,
        item_color: item.item_color || (item.item_id ? itemColorMap.get(item.item_id) || null : null),
        quantity: item.quantity,
        unit_of_measure: item.unit_of_measure
      }));

      const lineItemsHTML = aggregatedItems.map(item => {
        // Debug logging for fabric items
        console.log('PDF - Aggregated item data:', item);
        
        // For fabric items, use fabric_for_supplier if available, otherwise use item_name
        const displayName = item.item_type === 'fabric' && item.fabric_for_supplier 
          ? item.fabric_for_supplier 
          : (item.item_name || 'N/A');
        
        return `
        <tr>
          <td>${displayName}</td>
          <td>${item.remarks || '-'}</td>
          <td>${item.item_type === 'fabric' ? 'Fabric' : (item.item_category || item.item_type || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_color || 'N/A') : (item.item_color || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_gsm || 'N/A') : '-'}</td>
          <td style="text-align: right;">${formatQuantity(item.total_quantity ?? item.quantity ?? 0)}</td>
          <td>${item.unit_of_measure || 'N/A'}</td>
        </tr>
      `;
      }).join('');
      
      // No GST summary or totals needed for purchase orders
      const gstSummary = '';
      const grandSubtotal = 0;
      const grandGstAmount = 0;
      const grandTotal = 0;
      
      // Convert number to words (simple implementation)
      const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        if (num === 0) return 'Zero';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
        if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
        if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
        return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
      };
      
      tempDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
          <div style="flex: 1; max-width: 50%;">
            ${companyLogo}
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">${companySettings?.company_name || 'Company Name'}</div>
            <div>${companyAddress}</div>
            <div>GSTIN: ${companySettings?.gstin || 'GST Number'}</div>
            <div>Phone: ${companySettings?.contact_phone || 'Phone Number'}</div>
            <div>Email: ${companySettings?.contact_email || 'Email Address'}</div>
          </div>
          <div style="text-align: right; flex: 1; max-width: 50%;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; text-align: center;">PURCHASE ORDER</div>
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">PO Number: ${po.po_number || 'Draft'}</div>
            <div>Date: ${po.order_date || new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>
          
        <div style="margin-bottom: 20px; display: flex; gap: 20px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Supplier Information</div>
            <div><strong>${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Supplier Name'}</strong></div>
            <div>Contact: ${suppliersMap[po.supplier_id]?.primary_contact_name || suppliersMap[po.supplier_id]?.name || 'Contact Person'}</div>
            <div>Phone: ${suppliersMap[po.supplier_id]?.primary_contact_phone || suppliersMap[po.supplier_id]?.phone || 'Phone'}</div>
            <div>Email: ${suppliersMap[po.supplier_id]?.primary_contact_email || suppliersMap[po.supplier_id]?.email || 'Email'}</div>
            <div>GST: ${suppliersMap[po.supplier_id]?.gst_number || 'GST Number'}</div>
            <div>PAN: ${suppliersMap[po.supplier_id]?.pan || 'PAN Number'}</div>
            <div>${suppliersMap[po.supplier_id]?.billing_address_line1 || 'Address'}</div>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Delivery Information</div>
            <div><strong>Delivery Address:</strong></div>
            <div>${po.delivery_address || companyAddress || 'Delivery Address'}</div>
            <div><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</div>
            
            ${po.preferred_transporter || po.transport_remark ? `
            <div style="margin-top: 15px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Transporter Details</div>
            ${po.preferred_transporter ? `<div><strong>Preferred Transporter:</strong> ${po.preferred_transporter}</div>` : ''}
            ${po.transport_remark ? `<div><strong>Transport Remark:</strong> ${po.transport_remark}</div>` : ''}
            ` : ''}
          </div>
          </div>
          
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
            <thead>
              <tr>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Item</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Remarks</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Type</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Color</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">GSM</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Quantity</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">UOM</th>
              </tr>
            </thead>
            <tbody>
            ${lineItemsHTML}
            </tbody>
          </table>
          
          
        <div style="margin-top: 30px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Terms & Conditions</div>
          <div>${po.terms_conditions || 'Standard terms and conditions apply.'}</div>
        </div>
        
        ${companySettings?.authorized_signatory_url ? `
        <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
          <div style="text-align: center;">
            <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">Authorized Signatory</div>
            <div style="margin-bottom: 10px;">
              <img src="${companySettings.authorized_signatory_url}" alt="Authorized Signatory" style="max-width: 180px; max-height: 60px; object-fit: contain;" />
            </div>
            <div style="border-top: 1px solid #000; width: 180px; margin: 0 auto;"></div>
          </div>
        </div>
        ` : ''}
        
      `;
      
      document.body.appendChild(tempDiv);
      
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: tempDiv.offsetWidth,
        height: tempDiv.offsetHeight
      });
      
      document.body.removeChild(tempDiv);
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const fileName = `Purchase_Order_${po.po_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      // Loading toasts removed as requested
      toast.success('PDF generated successfully!');
    } catch (error) {
      // Loading toasts removed as requested
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePrint = async () => {
    // Removed loading toast as requested
    
    // Ensure logo is converted to base64
    if (companySettings?.logo_url && !logoBase64) {
      await convertLogoToBase64(companySettings.logo_url);
    }
    
    // Loading toast removed as requested

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      console.log('Company Settings:', companySettings);
      console.log('Suppliers:', suppliers);
      console.log('Suppliers Map:', suppliersMap);
      console.log('PO Supplier ID:', po.supplier_id);
      console.log('Selected Supplier:', suppliersMap[po.supplier_id]);
      
      const companyLogo = logoBase64 ? 
        `<img src="${logoBase64}" alt="Company Logo" style="max-height: 100px; max-width: 280px; display: block; object-fit: contain;">` : 
        `<div style="height: 100px; width: 280px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-weight: bold;">LOGO</div>`;
      
      const companyAddress = companySettings ? 
        `${companySettings.address || ''}${companySettings.city ? ', ' + companySettings.city : ''}${companySettings.state ? ', ' + companySettings.state : ''}${companySettings.pincode ? ' - ' + companySettings.pincode : ''}`.replace(/^,\s*/, '') : 
        'Company Address';
      
      // Generate aggregated line items table HTML
      const aggregatedItems = aggregatedSelectedItems.length > 0 ? aggregatedSelectedItems : items.map(item => ({
        key: item.id || item.item_id || item.item_name,
        item_name: item.item_name,
        remarks: [item.remarks, item.notes].filter(Boolean).join(' | '),
        item_type: item.item_type,
        item_id: item.item_id || null,
        item_category: item.item_category,
        fabric_color: item.fabric_color,
        fabric_gsm: item.fabric_gsm,
        fabric_for_supplier: item.fabric_for_supplier || null,
        item_color: item.item_color || (item.item_id ? itemColorMap.get(item.item_id) || null : null),
        quantity: item.quantity,
        unit_of_measure: item.unit_of_measure
      }));

      const lineItemsHTML = aggregatedItems.map(item => {
        // Debug logging for fabric items
        console.log('Print - Aggregated item data:', item);
        
        // For fabric items, use fabric_for_supplier if available, otherwise use item_name
        const displayName = item.item_type === 'fabric' && item.fabric_for_supplier 
          ? item.fabric_for_supplier 
          : (item.item_name || 'N/A');
        
        return `
        <tr>
          <td>${displayName}</td>
          <td>${item.remarks || '-'}</td>
          <td>${item.item_type === 'fabric' ? 'Fabric' : (item.item_category || item.item_type || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_color || 'N/A') : (item.item_color || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_gsm || 'N/A') : '-'}</td>
          <td class="number-cell">${formatQuantity(item.total_quantity ?? item.quantity ?? 0)}</td>
          <td>${item.unit_of_measure || 'N/A'}</td>
        </tr>
      `;
      }).join('');
      
      // No GST summary or totals needed for purchase orders
      const gstSummary = '';
      const grandSubtotal = 0;
      const grandGstAmount = 0;
      const grandTotal = 0;
      
      // Convert number to words (simple implementation)
      const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        if (num === 0) return 'Zero';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
        if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
        if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
        return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
      };
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Order - ${po.po_number || 'Draft'}</title>
          <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                font-size: 12px;
                line-height: 1.4;
              }
              .print-header { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start;
                margin-bottom: 30px;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .company-info { 
                flex: 1; 
                max-width: 50%;
              }
              .po-info { 
                text-align: right; 
                flex: 1;
                max-width: 50%;
              }
              .company-name { 
                font-size: 18px; 
                font-weight: bold; 
                margin-bottom: 10px; 
              }
              .po-title { 
                font-size: 24px; 
                font-weight: bold; 
                margin-bottom: 10px; 
                text-align: right;
              }
              .po-number { 
                font-size: 14px; 
                font-weight: bold; 
                margin-bottom: 5px;
                text-align: right; 
              }
              .print-section { 
                margin-bottom: 20px; 
                display: flex;
                gap: 20px;
              }
              .section-left, .section-right { 
                flex: 1; 
              }
              .section-title { 
                font-weight: bold; 
                font-size: 14px; 
                margin-bottom: 10px; 
                border-bottom: 1px solid #ccc;
                padding-bottom: 5px;
              }
              .print-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px; 
                font-size: 11px;
              }
              .print-table th, .print-table td { 
                border: 1px solid #ddd; 
                padding: 6px; 
                text-align: left; 
                vertical-align: top;
              }
              .print-table th { 
                background-color: #f2f2f2; 
                font-weight: bold;
              }
              .print-table .image-cell { 
                width: 40px; 
                text-align: center; 
              }
              .print-table .image-cell img { 
                width: 30px; 
                height: 30px; 
                object-fit: cover; 
                border-radius: 3px;
              }
              .print-table .number-cell { 
                text-align: right; 
              }
              .gst-summary { 
                margin-top: 20px; 
              }
              .grand-total { 
                text-align: right; 
                font-weight: bold; 
                margin-top: 20px; 
                font-size: 14px;
                border-top: 2px solid #333;
                padding-top: 10px;
              }
              .amount-in-words { 
                font-style: italic; 
                margin-top: 5px; 
                font-size: 11px;
              }
              .terms-section { 
                margin-top: 30px; 
                page-break-inside: avoid;
              }
          </style>
        </head>
        <body>
            <div class="print-header">
              <div class="company-info">
                ${companyLogo}
                <div class="company-name">${companySettings?.company_name || 'Company Name'}</div>
                <div>${companyAddress}</div>
                <div>GSTIN: ${companySettings?.gstin || 'GST Number'}</div>
                <div>Phone: ${companySettings?.contact_phone || 'Phone Number'}</div>
                <div>Email: ${companySettings?.contact_email || 'Email Address'}</div>
              </div>
              <div class="po-info">
                <div class="po-title">PURCHASE ORDER</div>
                <div class="po-number">PO Number: ${po.po_number || 'Draft'}</div>
                <div style="text-align: right;">Date: ${po.order_date || new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>
          
            <div class="print-section">
              <div class="section-left">
                <div class="section-title">Supplier Information</div>
                <div><strong>${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Supplier Name'}</strong></div>
                <div>Contact: ${suppliersMap[po.supplier_id]?.primary_contact_name || suppliersMap[po.supplier_id]?.name || 'Contact Person'}</div>
                <div>Phone: ${suppliersMap[po.supplier_id]?.primary_contact_phone || suppliersMap[po.supplier_id]?.phone || 'Phone'}</div>
                <div>Email: ${suppliersMap[po.supplier_id]?.primary_contact_email || suppliersMap[po.supplier_id]?.email || 'Email'}</div>
                <div>GST: ${suppliersMap[po.supplier_id]?.gst_number || 'GST Number'}</div>
                <div>PAN: ${suppliersMap[po.supplier_id]?.pan || 'PAN Number'}</div>
                <div>${suppliersMap[po.supplier_id]?.billing_address_line1 || 'Address'}</div>
              </div>
              <div class="section-right">
                <div class="section-title">Delivery Information</div>
                <div><strong>Delivery Address:</strong></div>
                <div>${po.delivery_address || companyAddress || 'Delivery Address'}</div>
                <div><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</div>
                
                ${po.preferred_transporter || po.transport_remark ? `
                <div style="margin-top: 15px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Transporter Details</div>
                ${po.preferred_transporter ? `<div><strong>Preferred Transporter:</strong> ${po.preferred_transporter}</div>` : ''}
                ${po.transport_remark ? `<div><strong>Transport Remark:</strong> ${po.transport_remark}</div>` : ''}
                ` : ''}
              </div>
          </div>
          
            <table class="print-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Remarks</th>
                <th>Type</th>
                <th>Color</th>
                <th>GSM</th>
                <th>Quantity</th>
                <th>UOM</th>
              </tr>
            </thead>
            <tbody>
                ${lineItemsHTML}
            </tbody>
          </table>
          
          
            <div class="terms-section">
              <div class="section-title">Terms & Conditions</div>
              <div>${po.terms_conditions || 'Standard terms and conditions apply.'}</div>
            </div>
            
            ${companySettings?.authorized_signatory_url ? `
            <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
              <div style="text-align: center;">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">Authorized Signatory</div>
                <div style="margin-bottom: 10px;">
                  <img src="${companySettings.authorized_signatory_url}" alt="Authorized Signatory" style="max-width: 180px; max-height: 60px; object-fit: contain;" />
                </div>
                <div style="border-top: 1px solid #000; width: 180px; margin: 0 auto;"></div>
              </div>
            </div>
            ` : ''}
            
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Since we're using base64 images, they load immediately - no need to wait
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 100);
    };
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Purchase Order - ${po.po_number || 'Draft'}`,
      text: `Purchase Order ${po.po_number || 'Draft'} for ${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Unknown Supplier'}`,
      url: window.location.href
    };

    try {
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast.success('Purchase Order shared successfully!');
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Purchase Order link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast.error('Failed to share Purchase Order');
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_master')
        .select('*')
        .order('supplier_name');
      
      if (error) throw error;
      const mappedSuppliers = (data || []).map(supplier => ({
        id: supplier.id,
        name: supplier.supplier_name,
        supplier_name: supplier.supplier_name,
        supplier_code: supplier.supplier_code,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.billing_address,
        gstin: supplier.gst_number,
        gst_number: supplier.gst_number,
        primary_contact_name: supplier.contact_person,
        primary_contact_phone: supplier.phone,
        primary_contact_email: supplier.email,
        billing_address_line1: supplier.billing_address,
        billing_address_line2: null,
        billing_address_city: null,
        billing_address_state: null,
        billing_address_pincode: null,
        pan: supplier.pan
      }));
      
      setSuppliers(mappedSuppliers);
      
      // Create a map for easy lookup
      const map: Record<string, Supplier> = {};
      mappedSuppliers.forEach(supplier => {
        map[supplier.id] = supplier;
      });
      setSuppliersMap(map);
      
      console.log('Suppliers loaded:', data);
      console.log('Suppliers map:', map);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to load suppliers');
    }
  };

  const convertLogoToBase64 = async (logoUrl: string) => {
    try {
      const base64 = await convertImageToBase64WithCache(logoUrl, logoCache.current);
      if (base64) {
        setLogoBase64(base64);
      } else {
        // Use fallback logo if conversion fails
        setLogoBase64(createFallbackLogo('LOGO'));
      }
    } catch (error) {
      console.error('Error converting logo to base64:', error);
      setLogoBase64(createFallbackLogo('LOGO'));
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      setCompanySettings(data);
      
      // Convert logo to base64 if available
      if (data?.logo_url) {
        await convertLogoToBase64(data.logo_url);
      } else {
        setLogoBase64(createFallbackLogo('LOGO'));
      }
      
      // Auto-populate delivery address with company address if not set
      if (data && !po.delivery_address) {
        const companyAddress = [
          data.address,
          data.city,
          data.state,
          data.pincode
        ].filter(Boolean).join(', ');
        
        setPo(prev => ({
          ...prev,
          delivery_address: companyAddress
        }));
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
      setLogoBase64(createFallbackLogo('LOGO'));
    }
  };

  const fetchOptions = async () => {
    try {
      // Fetch fabrics with comprehensive error handling
      const { data: fabrics, error: fabricError } = await supabase
        .from('fabric_master')
        .select('id, fabric_name, color, gsm, image, fabric_description, fabric_for_supplier')
        .order('fabric_name');
      
      if (fabricError) {
        console.error('Error fetching fabrics:', fabricError);
        throw fabricError;
      }
      
      const mappedFabrics = (fabrics || []).map(f => ({
        id: f.id,
        label: `${f.fabric_name || 'Unknown'} - ${f.color || 'N/A'} - ${f.gsm || 'N/A'} GSM`,
        image_url: f.image || null,
        fabric_name: f.fabric_name || 'Unknown',
        fabric_for_supplier: f.fabric_for_supplier || null,
        color: f.color || 'N/A',
        gsm: f.gsm || 'N/A',
        description: f.fabric_description || '',
      }));
      console.log('Fabric options loaded:', {
        count: mappedFabrics.length,
        sample: mappedFabrics.slice(0, 3),
        withImages: mappedFabrics.filter(f => f.image_url).length,
        withColors: mappedFabrics.filter(f => f.color && f.color !== 'N/A').length,
        withGSM: mappedFabrics.filter(f => f.gsm && f.gsm !== 'N/A').length
      });
      setFabricOptions(mappedFabrics);
      console.log('Fabric options set:', mappedFabrics.length);

      // Fetch items with comprehensive error handling
      const { data: items, error: itemError } = await supabase
        .from('item_master')
        .select('id, item_name, item_type, image_url, image, uom, color')
        .order('item_name');
      
      if (itemError) {
        console.error('Error fetching items:', itemError);
        throw itemError;
      }
      
      const mappedItems = (items || []).map(i => ({
        id: i.id, 
        label: i.item_name || 'Unknown Item', 
        image_url: i.image_url || i.image || null, // Use image_url first, fallback to image
        item_type: i.item_type || 'item',
        type: i.item_type || 'item',
        uom: i.uom || 'pcs',
        color: i.color || null,
      }));
      console.log('Item options loaded:', {
        count: mappedItems.length,
        sample: mappedItems.slice(0, 3),
        withImages: mappedItems.filter(i => i.image_url).length,
        withTypes: mappedItems.filter(i => i.item_type).length
      });
      setItemOptions(mappedItems);
      console.log('Item options set:', mappedItems.length);
        
      // Get unique item types
      const types = [...new Set((items || []).map(i => i.item_type))];
        setItemTypeOptions(types);

      // Fetch products - try both tables with fallback
      let productData = [];
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, code')
          .order('name');
        
        if (error) throw error;
        productData = data || [];
      } catch (productError) {
        console.log('Products table not found, trying product_master...');
        try {
          const { data, error } = await supabase
        .from('product_master')
            .select('id, product_name as name, product_code as code')
        .order('product_name');
      
          if (error) throw error;
          productData = data || [];
        } catch (masterError) {
          console.log('No products table found, using empty array');
          productData = [];
        }
      }
      
      setProductOptions((productData || []).map(p => ({
        id: p.id,
        label: p.name,
        image_url: null // No image_url field in either table
      })));

    } catch (error) {
      console.error('Error fetching options:', error);
      toast.error('Failed to load options');
    }
  };

  const fetchPurchaseOrder = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
          .from('purchase_orders')
        .select('*')
        .eq('id', id)
          .single();
      
        if (error) throw error;
      
      setPo(data);
      
      // Fetch line items
      const { data: lineItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id);
      
      if (itemsError) throw itemsError;
      
      // Process line items - use existing GST data from database
      let trackingMap = new Map<string, any>();
      try {
        const { data: trackingData, error: trackingError } = await supabase
          .from('bom_po_items')
          .select(`
            po_item_id,
            bom_item_id,
            bom_id,
            ordered_quantity,
            bom_record_items (
              item_name,
              item_image_url,
              fabric_name,
              fabric_color,
              fabric_gsm,
              category
            )
          `)
          .eq('po_id', id);

        if (trackingError) {
          console.warn('Failed to load BOM tracking for PO', trackingError);
        } else {
          trackingMap = new Map((trackingData || []).map(entry => [entry.po_item_id, entry]));
        }
      } catch (trackingException) {
        console.warn('Unhandled error while loading BOM tracking for PO', trackingException);
      }

      // Fetch fabric_for_supplier for fabric items
      const fabricItems = (lineItems || []).filter(item => item.item_type === 'fabric');
      
      let fabricForSupplierMap = new Map<string, string | null>();
      if (fabricItems.length > 0) {
        try {
          // Try to fetch by item_id first (if it exists and is a fabric_id)
          const fabricIds = fabricItems
            .map(item => item.item_id)
            .filter(Boolean);
          
          if (fabricIds.length > 0) {
            const { data: fabricsDataById, error: fabricsErrorById } = await supabase
              .from('fabric_master')
              .select('id, fabric_for_supplier')
              .in('id', fabricIds);
            
            if (!fabricsErrorById && fabricsDataById) {
              fabricsDataById.forEach((fabric: any) => {
                fabricForSupplierMap.set(fabric.id, fabric.fabric_for_supplier || null);
              });
            }
          }
          
          // Also fetch by fabric_name, color, and gsm for items without item_id
          const fabricsToFetch = fabricItems.filter(item => {
            const hasId = item.item_id && fabricForSupplierMap.has(item.item_id);
            return !hasId && item.fabric_name;
          });
          
          if (fabricsToFetch.length > 0) {
            // Group by fabric_name, color, gsm to avoid duplicate queries
            const uniqueFabrics = new Map<string, { name: string; color: string | null; gsm: string | null }>();
            fabricsToFetch.forEach(item => {
              const key = `${item.fabric_name || ''}|${item.fabric_color || ''}|${item.fabric_gsm || ''}`;
              if (!uniqueFabrics.has(key)) {
                uniqueFabrics.set(key, {
                  name: item.fabric_name || '',
                  color: item.fabric_color || null,
                  gsm: item.fabric_gsm || null
                });
              }
            });
            
            // Fetch each unique fabric combination
            for (const [key, fabric] of uniqueFabrics.entries()) {
              let query = supabase
                .from('fabric_master')
                .select('fabric_for_supplier')
                .eq('fabric_name', fabric.name);
              
              if (fabric.color) {
                query = query.eq('color', fabric.color);
              }
              if (fabric.gsm) {
                query = query.eq('gsm', fabric.gsm);
              }
              
              const { data: fabricData, error: fabricError } = await query.limit(1).maybeSingle();
              
              if (!fabricError && fabricData) {
                // Store in map using the key so we can look it up later
                fabricForSupplierMap.set(key, (fabricData as any).fabric_for_supplier || null);
              }
            }
          }
        } catch (error) {
          console.warn('Failed to fetch fabric_for_supplier:', error);
        }
      }

      const processedItems = (lineItems || []).map(item => {
        const tracking = trackingMap.get(item.id);
        const bomRecord = tracking?.bom_record_items;
        
        // Get fabric_for_supplier - try by item_id first, then by fabric details
        let fabricForSupplier = null;
        if (item.item_type === 'fabric') {
          if (item.item_id && fabricForSupplierMap.has(item.item_id)) {
            fabricForSupplier = fabricForSupplierMap.get(item.item_id);
          } else if (item.fabric_name) {
            const key = `${item.fabric_name || ''}|${item.fabric_color || ''}|${item.fabric_gsm || ''}`;
            fabricForSupplier = fabricForSupplierMap.get(key) || null;
          }
        }
        
        return {
          ...item,
          item_type: item.item_type || 'item', // Ensure item_type is set
          // Map fabric-specific fields from database or BOM linkage
          fabric_name: item.fabric_name || bomRecord?.fabric_name || null,
          fabric_for_supplier: fabricForSupplier || null,
          fabric_color: item.fabric_color || bomRecord?.fabric_color || null,
          fabric_gsm: item.fabric_gsm || bomRecord?.fabric_gsm || null,
          item_color: item.item_color || null,
          item_image_url: item.item_image_url || bomRecord?.item_image_url || null,
          // Ensure proper field mapping
          type: item.item_type || 'item',
          quantity: item.quantity || 0,
          unit_of_measure: item.unit_of_measure || 'pcs',
          bom_item_id: item.bom_item_id || tracking?.bom_item_id || null,
          bom_id: item.bom_id || tracking?.bom_id || null,
        };
      });
      
      // No pricing calculations needed for purchase orders
      const itemsWithTotals = processedItems;
      setItems(itemsWithTotals);
      
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      toast.error('Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, ...updates };
        // No pricing calculations needed
        return updatedItem;
      }
      return item;
    }));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addItem = (type: 'fabric' | 'item' | 'product' = 'item') => {
    const newItem: LineItem = {
      item_type: type,
      item_id: '',
      item_name: '',
      item_image_url: null,
      quantity: 0,
      unit_of_measure: type === 'fabric' ? 'kgs' : 'pcs',
      item_color: null,
      item_category: type === 'item' ? null : undefined,
    };
    setItems(prev => [...prev, newItem]);
  };

  const getOptionsForType = (type: string) => {
    switch (type) {
      case 'fabric':
        return fabricOptions;
      case 'item':
        return itemOptions;
      case 'product':
        return productOptions;
      default:
        return [];
    }
  };

  const handleSelectName = (index: number, value: string) => {
    const type = items[index].item_type;
    const options = getOptionsForType(type);
    const selected = options.find(o => o.id === value);
    
    if (selected) {
      if (type === 'fabric') {
        updateItem(index, {
          item_id: selected.id,
          item_name: selected.label,
          item_image_url: selected.image_url,
          unit_of_measure: 'Kgs',
          fabric_name: (selected as any).fabric_name,
          fabric_color: (selected as any).color,
          fabric_gsm: (selected as any).gsm,
          attributes: {
            colorsList: [(selected as any).color],
            gsmList: [(selected as any).gsm],
            description: (selected as any).description
          }
          });
        } else {
        updateItem(index, {
          item_id: selected.id,
          item_name: selected.label,
          item_image_url: selected.image_url,
          unit_of_measure: selected.uom || 'pcs',
          item_color: (selected as any).color || null,
            });
          }
        }
  };

  const save = async () => {
    if (!po.supplier_id) {
      toast.error('Please select a supplier');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
        return;
      }

    try {
      setLoading(true);

      // No rate/amount calculations needed for purchase orders
      const itemsWithTotals = items;
      const grandTotal = 0; // No total amount for purchase orders
    
      // Ensure PO number is always generated
      // If creating from BOM, always generate new PO number to avoid conflicts
      const poNumber = (bomData?.id && !po.po_number) ? await generatePONumber() : (po.po_number || await generatePONumber());
      
      const poData = {
        supplier_id: po.supplier_id,
        order_date: po.order_date || new Date().toISOString().split('T')[0],
        status: po.status,
        terms_conditions: po.terms_conditions ?? null,
        notes: po.notes ?? null,
        po_number: poNumber, // Explicitly set PO number
        total_amount: grandTotal,
        delivery_address: (po.delivery_address && po.delivery_address.trim() !== '') ? po.delivery_address : null,
        expected_delivery_date: (po.expected_delivery_date && po.expected_delivery_date.trim() !== '') ? po.expected_delivery_date : null,
        // Transporter details
        preferred_transporter: (po.preferred_transporter && po.preferred_transporter.trim() !== '') ? po.preferred_transporter : null,
        transport_remark: (po.transport_remark && po.transport_remark.trim() !== '') ? po.transport_remark : null,
        // BOM reference
        bom_id: bomData?.id || null, // Link to BOM if created from BOM
      };

      console.log('🔧 TIMESTAMP:', new Date().toISOString(), 'PO Data being saved:', poData);
      console.log('🔧 PO Number in data:', poData.po_number);
      console.log('🔧 PO Number type:', typeof poData.po_number);
      console.log('🔧 BOM ID in data:', poData.bom_id);
      console.log('🔧 Expected delivery date:', po.expected_delivery_date);
      console.log('🔧 Expected delivery date processed:', poData.expected_delivery_date);
      
      // Check if there are existing POs with the same BOM ID
      if (poData.bom_id) {
        const { data: existingPOs, error: existingPOsError } = await supabase
          .from('purchase_orders')
          .select('id, po_number, created_at')
          .eq('bom_id', poData.bom_id);
        
        console.log('🔍 Existing POs with same BOM ID:', existingPOs);
        console.log('🔍 Existing POs count:', existingPOs?.length || 0);
      }

      let poId = po.id;

      // FORCE CREATE NEW PO - Don't update existing ones when coming from BOM
      if (bomData?.id) {
        // If creating from BOM, always create new PO (clear existing ID)
        console.log('🆕 Creating new PO from BOM - clearing existing PO ID');
        poId = null;
      }

      if (poId && !bomData?.id) {
        // Only update existing PO if it's NOT from a BOM
        console.log('🔄 Updating existing PO with ID:', poId);
        console.log('🔄 Update data:', poData);
        
        const { error: updateError } = await supabase
          .from('purchase_orders')
          .update(poData)
          .eq('id', poId);

        if (updateError) throw updateError;

        // Delete existing line items
        const { error: deleteError } = await supabase
          .from('purchase_order_items')
          .delete()
          .eq('po_id', poId);

        if (deleteError) throw deleteError;

        // Delete existing BOM tracking records for this PO
        const { error: deleteTrackingError } = await supabase
          .from('bom_po_items')
          .delete()
          .eq('po_id', poId);

        if (deleteTrackingError) throw deleteTrackingError;
    } else {
        // Create new PO
        console.log('🆕 Creating new PO with data:', poData);
        
        const { data: newPo, error: createError } = await supabase
          .from('purchase_orders')
          .insert(poData)
          .select()
          .single();

        if (createError) throw createError;
        poId = newPo.id;
      }

      if (!poId) {
        throw new Error('Failed to resolve purchase order ID after save.');
      }

      // Insert line items
      const lineItemsData = itemsWithTotals.map(item => ({
        po_id: poId, // Changed from purchase_order_id to po_id
        item_type: item.type || item.item_type || 'item', // Use correct field name with fallback
        item_id: item.item_id || null,
        item_name: item.item_name,
        item_image_url: item.item_image_url,
        quantity: item.quantity,
        unit_of_measure: item.unit_of_measure,
        remarks: item.remarks,
        // Add fabric-specific fields for fabric items
        ...(item.item_type === 'fabric' && {
          fabric_name: item.fabric_name || null,
          fabric_color: item.fabric_color || null,
          fabric_gsm: item.fabric_gsm || null,
          fabric_id: item.item_id || null // For fabric items, item_id is the fabric_id
        })
      }));

      console.log('Line items data being saved:', lineItemsData);
      console.log('First item type:', lineItemsData[0]?.item_type);
      console.log('First item type type:', typeof lineItemsData[0]?.item_type);

      const { data: insertedItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItemsData)
        .select('id');

      if (itemsError) throw itemsError;

      const trackingRecords = (insertedItems || [])
        .map((row, index) => {
          const source = itemsWithTotals[index];
          const quantityValue = Number(source?.quantity || 0);
          if (!source?.bom_item_id || !source?.bom_id || !Number.isFinite(quantityValue)) {
            return null;
          }
          return {
            bom_id: source.bom_id,
            bom_item_id: source.bom_item_id,
            po_id: poId,
            po_item_id: row.id,
            ordered_quantity: quantityValue
          };
        })
        .filter((record): record is {
          bom_id: string;
          bom_item_id: string;
          po_id: string;
          po_item_id: string;
          ordered_quantity: number;
        } => record !== null);

      if (trackingRecords.length > 0) {
        const { error: trackingInsertError } = await supabase
          .from('bom_po_items')
          .insert(trackingRecords);
        if (trackingInsertError) throw trackingInsertError;
      }

      toast.success('Purchase order saved successfully');
      navigate('/procurement/po');
      
      } catch (error) {
      console.error('Error saving purchase order:', error);
      toast.error('Failed to save purchase order');
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    let grandSubtotal = 0;
    let grandGstAmount = 0;
    const gstGroups: Record<string, { subtotal: number; gstAmount: number; total: number }> = {};
    const grandTotal = 0; // No pricing for purchase orders
    const amountInWords = numberToWords(Math.floor(grandTotal)) + ' Rupees Only';

    return {
      grandSubtotal,
      grandGstAmount,
      grandTotal,
      amountInWords,
      gstGroups,
    };
  }, [items]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/procurement/po')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
            </Button>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Edit Purchase Order' : isReadOnly ? 'View Purchase Order' : 'Create Purchase Order'}
          </h1>
        </div>
            <div className="flex gap-2">
              {/* Print/Export Buttons */}
              <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={generatePDF} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare} className="flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              
              {/* Action Buttons */}
              <Button variant="outline" onClick={() => navigate('/procurement/po')}>
                Cancel
              </Button>
              {!isReadOnly && (
                <Button onClick={save} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </div>

      {/* Printable Content */}
      <div ref={printRef} className="print-content">
      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier">Supplier *</Label>
              <Select 
                value={po.supplier_id} 
                onValueChange={(value) => setPo(prev => ({ ...prev, supplier_id: value }))}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="order_date">Order Date</Label>
              <Input
                id="order_date"
                type="date"
                value={po.order_date}
                onChange={(e) => setPo(prev => ({ ...prev, order_date: e.target.value }))}
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                value={po.status} 
                onValueChange={(value) => setPo(prev => ({ ...prev, status: value as any }))}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                value={po.po_number || ''}
                onChange={(e) => setPo(prev => ({ ...prev, po_number: e.target.value }))}
                disabled={isReadOnly}
                placeholder="TUC/PO/0001 (Auto-generated)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="delivery_address">Delivery Address</Label>
              <Textarea
                id="delivery_address"
                value={po.delivery_address || ''}
                onChange={(e) => setPo(prev => ({ ...prev, delivery_address: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Enter delivery address..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="expected_delivery_date">Expected Delivery Date</Label>
              <Input
                id="expected_delivery_date"
                type="date"
                value={po.expected_delivery_date || ''}
                onChange={(e) => setPo(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Transporter Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Transporter Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="preferred_transporter">Preferred Transporter</Label>
                <Input
                  id="preferred_transporter"
                  value={po.preferred_transporter || ''}
                  onChange={(e) => setPo(prev => ({ ...prev, preferred_transporter: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Enter preferred transporter..."
                />
              </div>

              <div>
                <Label htmlFor="transport_remark">Transport Remark</Label>
                <Input
                  id="transport_remark"
                  value={po.transport_remark || ''}
                  onChange={(e) => setPo(prev => ({ ...prev, transport_remark: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Enter transport remarks..."
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="terms_conditions">Terms & Conditions</Label>
            <Textarea 
              id="terms_conditions"
              value={po.terms_conditions || ''}
              onChange={(e) => setPo(prev => ({ ...prev, terms_conditions: e.target.value }))}
              disabled={isReadOnly}
              placeholder="Enter terms and conditions..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea 
              id="notes"
              value={po.notes || ''}
              onChange={(e) => setPo(prev => ({ ...prev, notes: e.target.value }))}
              disabled={isReadOnly}
              placeholder="Enter any additional notes..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pending BOM Selection */}
      {!isReadOnly && (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Pending BOM Items</h2>
            <p className="text-sm text-muted-foreground">
              Select the materials to include in this purchase order. Adjust quantities and remarks before saving.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {pendingSelectionMap.size} selected
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshPending().catch(() => {
                  // Errors handled via pendingError state and toast in effect.
                });
              }}
              disabled={pendingLoading}
              className="flex items-center gap-2"
            >
              {pendingLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </div>

        {pendingError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Failed to load pending BOM data. Review your connection and try refreshing.
          </div>
        )}

        {pendingLoading ? (
          <Card>
            <CardContent className="py-6 space-y-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {renderPendingSection('Fabric', fabricGroups)}
            {renderPendingSection('Item', itemGroups)}
          </div>
        )}
      </div>
      )}

      {/* Line Items */}
      <div className="space-y-6">
        {isReadOnly && (
          <Card>
            <CardHeader>
              <CardTitle>Selected Items</CardTitle>
            </CardHeader>
            <CardContent>
              {aggregatedSelectedItems.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No items captured for this purchase order.
                </div>
              ) : (
                <div className="space-y-4">
                  {aggregatedSelectedItems.map(item => (
                    <div
                      key={item.key}
                      className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        {item.item_image_url ? (
                        <ProductImage
                          src={item.item_image_url}
                          alt={item.item_name}
                          className="h-16 w-16 rounded object-cover"
                            showFallback={false}
                        />
                        ) : null}
                        <div>
                          <div className="text-lg font-semibold">
                            {item.item_type?.toLowerCase() === 'fabric' && item.fabric_for_supplier
                              ? item.fabric_for_supplier
                              : item.item_name}
                          </div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.item_type}
                          </div>
                          {item.item_type?.toLowerCase() === 'fabric' ? (
                            <div className="text-xs text-muted-foreground">
                              {[item.fabric_color, item.fabric_gsm ? `${item.fabric_gsm} GSM` : null]
                                .filter(Boolean)
                                .join(' • ')}
                            </div>
                          ) : (item.item_color || (item.item_id ? itemColorMap.get(item.item_id) || null : null)) ? (
                            <div className="text-xs text-muted-foreground">
                              {item.item_color || (item.item_id ? itemColorMap.get(item.item_id) || null : null)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 text-sm md:items-end">
                        <div>
                          <div className="text-muted-foreground">Total Quantity</div>
                          <div className="font-semibold">
                            {formatQuantity(item.total_quantity)} {item.unit_of_measure || ''}
                          </div>
                        </div>
                        {item.remarks && (
                          <div className="max-w-xl text-left md:text-right">
                            <div className="text-muted-foreground">Remarks</div>
                            <div>{item.remarks}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isReadOnly && (
          <>
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
            {manualFabricItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No fabrics added yet. Click + to add fabric.
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((it, idx) => {
                  if (it.item_type !== 'fabric' || it.bom_item_id) return null;
                  return (
                    <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Fabric: only fabric_for_supplier, color, gsm */}
                      <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4">
                          <Label className="text-sm font-medium">Fabric (for supplier)</Label>
                          <div className="text-sm font-medium">
                            {it.fabric_for_supplier || it.fabric_name || it.item_name || 'N/A'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-medium">Color</Label>
                          <div className="text-sm">
                            {it.fabric_color || 'N/A'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-medium">GSM</Label>
                          <div className="text-sm">
                            {it.fabric_gsm ? `${it.fabric_gsm} GSM` : 'N/A'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-medium">Qty</Label>
                          <Input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => {
                              const qty = parseFloat(e.target.value) || 0;
                              updateItem(idx, { quantity: qty });
                            }}
                            disabled={isReadOnly}
                            className="w-full text-right"
                            placeholder="Qty"
                          />
                        </div>
                        {!isReadOnly && (
                          <div className="col-span-2 flex items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeItem(idx)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
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
            {manualNonFabricItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items added yet. Click + to add item.
                          </div>
            ) : (
              <div className="space-y-4">
                {items.map((it, idx) => {
                  if (it.item_type !== 'item' || it.bom_item_id) return null;
                  return (
                    <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                      {/* Item Image - Only show if image exists */}
                      {it.item_image_url ? (
                      <ProductImage 
                        src={it.item_image_url} 
                        alt={it.item_name}
                        className="w-20 h-20 object-cover rounded"
                          showFallback={false}
                      />
                      ) : null}

                      {/* Item Details */}
                      <div className="flex-1 grid grid-cols-8 gap-4 items-center">
                        {/* Item Type */}
                        <div>
                          <Label className="text-sm font-medium">Item Type</Label>
                          {isReadOnly ? (
                            <div className="w-full p-2 border rounded-md bg-muted text-sm">
                              {it.item_type === 'fabric' ? 'Fabric' : (it.item_category || 'Not specified')}
                            </div>
                          ) : (
                                  <Select
                              value={it.item_category || ''} 
                                    onValueChange={(v) => {
                                updateItem(idx, { item_category: v, item_id: '', item_name: '', item_image_url: null, itemSelections: [] });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Item Type" value={it.item_category || ''} />
                                    </SelectTrigger>
                                    <SelectContent>
                                {itemTypeOptions.map((type) => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                          )}
                                </div>

                        {/* Item Name */}
                        <div>
                          <Label className="text-sm font-medium">Item Name</Label>
                          {isReadOnly ? (
                            <div className="w-full p-2 border rounded-md bg-muted text-sm font-medium">
                              {it.item_name || 'N/A'}
                            </div>
                          ) : (
                            <div className="text-sm font-medium">
                              {it.item_name || 'N/A'}
                            </div>
                          )}
                        </div>

                        {/* Quantity */}
                        <div>
                          <Label className="text-sm font-medium">Qty</Label>
                          {isReadOnly ? (
                            <div className="w-full p-2 border rounded-md bg-muted text-sm text-right">
                              {it.quantity}
                            </div>
                          ) : (
                            <Input 
                              type="number" 
                              value={it.quantity} 
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateItem(idx, { quantity: qty });
                              }}
                              className="w-full text-right" 
                              placeholder="Qty"
                            />
                          )}
                        </div>

                        {/* UOM */}
                        <div>
                          <Label className="text-sm font-medium">UOM</Label>
                          {isReadOnly ? (
                            <div className="w-full p-2 border rounded-md bg-muted text-sm">
                              {it.unit_of_measure || 'pcs'}
                            </div>
                          ) : (
                            <Input 
                              value={it.unit_of_measure || ''} 
                              onChange={(e) => {
                                updateItem(idx, { unit_of_measure: e.target.value });
                              }} 
                              className="w-full" 
                              placeholder="UOM"
                            />
                          )}
                        </div>

                        {/* Remarks */}
                        <div className="col-span-6">
                          <Label className="text-sm font-medium">Remarks</Label>
                          {isReadOnly ? (
                            <div className="w-full p-2 border rounded-md bg-muted text-sm">
                              {it.notes || it.remarks || '-'}
                            </div>
                          ) : (
                            <Input 
                              value={it.notes || it.remarks || ''} 
                              onChange={(e) => updateItem(idx, { notes: e.target.value })}
                              className="w-full" 
                              placeholder="Enter remarks for this item"
                            />
                          )}
                        </div>
                      </div>

                      {/* Remove Button */}
                      {!isReadOnly && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeItem(idx)}
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
          </>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">

        </CardContent>
      </Card>
      </div> {/* End of printRef */}
    </div>
  );
}
