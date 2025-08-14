import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, ArrowLeft, ExternalLink, X } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Supplier = { id: string; supplier_name: string; supplier_code: string };

type LineItem = {
  id?: string;
  item_type: 'fabric' | 'item' | 'product';
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
    itemSelections?: { id: string; label: string; image_url?: string | null; quantity: number }[];
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

export function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [po, setPo] = useState<PurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
  });
  const [items, setItems] = useState<LineItem[]>([]);
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; uom?: string | null; type?: string | null; gst_rate?: number | null }[]>([]);
  const [itemTypeOptions, setItemTypeOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);

  useEffect(() => {
    fetchSuppliers();
    fetchOptions();
    if (id) fetchExisting();
  }, [id]);

  // When item master options are available, backfill category/GST/image for loaded lines
  useEffect(() => {
    if (!itemOptions || itemOptions.length === 0) return;
    setItems((prev) => prev.map((it) => {
      if (it.item_type !== 'item') return it;
      // If category unset but we have an item_id, infer from options
      const opt = it.item_id ? itemOptions.find(o => o.id === it.item_id) : undefined;
      const next: any = { ...it };
      if (!next.item_category && opt?.type) {
        next.item_category = opt.type;
      }
      // Default gst_rate from item if missing
      if ((next.gst_rate == null || isNaN(Number(next.gst_rate))) && typeof opt?.gst_rate === 'number') {
        next.gst_rate = opt.gst_rate;
      }
      // UOM/Image defaults
      if (!next.unit_of_measure && opt?.uom) next.unit_of_measure = opt.uom;
      if (!next.item_image_url && opt?.image_url) next.item_image_url = opt.image_url;
      // Recompute totals if needed
      const qty = Number(next.quantity) || 0;
      const unitPrice = Number(next.unit_price) || 0;
      const totalPrice = qty * unitPrice;
      const gstRate = Number(next.gst_rate) || 0;
      const gstAmount = totalPrice * (gstRate / 100);
      const lineTotal = totalPrice + gstAmount;
      next.total_price = totalPrice;
      next.gst_amount = gstAmount;
      next.line_total = lineTotal;
      return next;
    }));
  }, [itemOptions]);

  const fetchSuppliers = async () => {
    const { data } = await supabase
      .from('supplier_master')
      .select('id, supplier_name, supplier_code')
      .order('supplier_name');
    setSuppliers((data as any) || []);
  };

  const parseFabricDetails = (name?: string): { color?: string; gsm?: string } => {
    if (!name) return {};
    const parts = name.split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      return { color: parts[1], gsm: parts[2] };
    }
    return {};
  };

  const fetchExisting = async () => {
    setLoading(true);
    try {
      const { data: header } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .single();
      if (header) setPo(header as any);
      const { data: lines } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id);
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
        if (row.item_type === 'item') {
          base.itemSelections = [{ id: row.item_id, label: row.item_name, image_url: row.item_image_url, quantity: row.quantity }];
        }
        return base;
      });
      // Populate fabric attributes (colors/gsm lists) for restored fabric lines
      const fabricIndices: number[] = [];
      restored.forEach((it, i) => { if (it.item_type === 'fabric' && it.item_id) fabricIndices.push(i); });
      if (fabricIndices.length > 0) {
        const populated = await Promise.all(fabricIndices.map(async (i) => {
          const it = restored[i];
          const { data: variants } = await supabase
            .from('fabric_variants')
            .select('color, gsm')
            .eq('fabric_id', it.item_id as any);
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
      setItems(restored);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const { data: fabrics } = await supabase
        .from('fabrics')
        .select('*')
        .order('name');
      setFabricOptions((fabrics || []).map((f: any) => ({ id: f.id, label: f.name, image_url: f.image_url || f.image || null })));

      // Items
      let { data: items } = await supabase
        .from('item_master')
        .select('*')
        .order('item_name', { ascending: true });
      // Fallback ordering if item_name missing
      if (!items || items.length === 0) {
        const res = await supabase.from('item_master').select('*');
        items = res.data || [];
      }
      setItemOptions((items || []).map((it: any) => ({
        id: it.id,
        label: it.item_name || it.name || it.item_code || 'Unnamed Item',
        image_url: it.image_url || it.image || null,
        uom: it.uom || it.unit_of_measure || null,
        type: it.item_type || null,
        gst_rate: typeof it.gst_rate === 'number' ? it.gst_rate : (it.gst_rate ? Number(it.gst_rate) : null)
      })));

      // distinct item_type list
      const typeSet = new Set<string>();
      (items || []).forEach((it: any) => { if (it.item_type) typeSet.add(it.item_type); });
      setItemTypeOptions(Array.from(typeSet));

      const { data: products } = await supabase
        .from('product_master')
        .select('id, name, images, image_url, product_name')
        .order('name');
      setProductOptions((products || []).map((p: any) => {
        const label = p.name || p.product_name;
        let img = p.image_url || null;
        if (!img && Array.isArray(p.images) && p.images.length > 0) img = p.images[0];
        if (!img && typeof p.images === 'string') img = p.images;
        return { id: p.id, label, image_url: img };
      }));
    } catch (e) {
      console.warn('Fetch options warning', e);
    }
  };

  const getOptionsForType = (t: LineItem['item_type']) => {
    if (t === 'fabric') return fabricOptions;
    if (t === 'product') return productOptions;
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

  const fetchAndSetAttributes = async (index: number, type: LineItem['item_type'], entityId: string) => {
    try {
      if (type === 'fabric') {
        const [{ data: fabric }, { data: variants }] = await Promise.all([
          supabase.from('fabrics').select('*').eq('id', entityId).maybeSingle(),
          supabase.from('fabric_variants').select('*').eq('fabric_id', entityId),
        ]);
        const colorSet = new Set<string>();
        const gsmSet = new Set<string>();
        (variants || []).forEach((r: any) => {
          if (r.color) colorSet.add(r.color);
          if (r.gsm) gsmSet.add(r.gsm);
        });
        const uomCandidate = (variants || []).find((v: any) => !!v.uom)?.uom || 'MTR';
        const attrs: Record<string, any> = {
          fabric_name: (fabric as any)?.name || '',
          fabric_gsm: (fabric as any)?.gsm || null,
          colorsList: Array.from(colorSet),
          gsmList: Array.from(gsmSet),
          description: (fabric as any)?.description || null,
        };
        updateItem(index, { attributes: attrs, unit_of_measure: uomCandidate, item_image_url: (fabric as any)?.image_url || (fabric as any)?.image || null, fabricSelections: [], quantity: 0 });
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
        updateItem(index, {
          attributes: attrs,
          unit_of_measure: (item as any)?.uom || (item as any)?.unit_of_measure || undefined,
          item_image_url: (item as any)?.image_url || (item as any)?.image || null,
          gst_rate: (item as any)?.gst_rate || 0,
          item_category: (item as any)?.item_type || null,
          itemSelections: []
        });
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
        updateItem(index, { attributes: attrs });
      }
    } catch (e) {
      console.warn('Failed to fetch attributes', e);
      updateItem(index, { attributes: null });
    }
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + (it.total_price || 0), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [items]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { item_type: 'item', item_id: '', item_name: '', quantity: 1, unit_price: 0, total_price: 0 },
    ]);
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const before = next[index];
      const after = { ...before, ...patch } as LineItem;
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
      after.total_price = (after.quantity || 0) * (after.unit_price || 0);
      // compute GST and line total
      const gstRate = (after.gst_rate ?? 0) / 100;
      after.gst_amount = after.total_price * gstRate;
      after.line_total = after.total_price + (after.gst_amount || 0);
      next[index] = after;
      return next;
    });
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
            supplier_id: po.supplier_id,
            order_date: po.order_date,
            expected_delivery_date: po.expected_delivery_date,
            delivery_address: po.delivery_address,
            terms_conditions: po.terms_conditions,
            status: po.status,
          })
          .select('id')
          .single();
        if (error) throw error;
        poId = inserted?.id;
      } else {
        await supabase
          .from('purchase_orders')
          .update({
            supplier_id: po.supplier_id,
            order_date: po.order_date,
            expected_delivery_date: po.expected_delivery_date,
            delivery_address: po.delivery_address,
            terms_conditions: po.terms_conditions,
            status: po.status,
          })
          .eq('id', poId);
        // clear existing lines to simplify
        await supabase.from('purchase_order_items').delete().eq('po_id', poId);
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
              item_type: 'item',
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
          .eq('id', poId)
          .single();
      }

      navigate('/procurement/po');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex gap-2">
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
                      {it.item_image_url ? (
                        <img src={it.item_image_url} className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={it.item_type} onValueChange={(v) => {
                        // reset selection when type changes
                        updateItem(idx, { item_type: v as any, item_id: '', item_name: '', item_image_url: null });
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
                        <Select value={it.item_type === 'item' ? (it.item_category ? `type-${it.item_category}` : (it.item_id || '')) : (it.item_id || '')} onValueChange={(v) => {
                          if (it.item_type === 'item' && v.startsWith('type-')) {
                            const chosenType = v.replace('type-', '');
                            // find default gst_rate for this item_type
                            const typeOpt = itemOptions.find(o => o.type === chosenType && typeof o.gst_rate === 'number');
                            updateItem(idx, { item_category: chosenType, itemSelections: [], gst_rate: typeOpt?.gst_rate ?? 0 });
                            return;
                          }
                          handleSelectName(idx, v);
                        }}>
                          <SelectTrigger className="w-80" disabled={isReadOnly}>
                            <SelectValue placeholder={`Select ${it.item_type}...`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(it.item_type === 'item' ? itemTypeOptions.map((label) => ({ id: `type-${label}`, label })) : getOptionsForType(it.item_type)).map((o) => (
                              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {it.item_type !== 'item' && !isReadOnly && (
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
                      {it.item_type === 'item' && (
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
                                <div className="col-span-7">
                                  <Select
                                    value={sel.id}
                                    onValueChange={(v) => {
                                      let opt = itemOptions.find(o => o.id === v);
                                      // If user selected an item_type, convert this row into an empty child row
                                      if (!opt && v.startsWith('type-')) {
                                        const chosenType = v.replace('type-', '');
                                        const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }];
                                        // replace current row with first concrete item of that type if available
                                        const concrete = itemOptions.find(o => o.type === chosenType);
                                        const next = base.map((row, i) => i === sidx ? { id: concrete?.id || '', label: concrete?.label || '', image_url: concrete?.image_url || null, quantity: row.quantity } : row);
                                        // set line preview image from first available
                                        const lineImg = (next[0]?.image_url) || it.item_image_url || null;
                                        updateItem(idx, { itemSelections: next, unit_of_measure: concrete?.uom || it.unit_of_measure, item_image_url: lineImg, gst_rate: (concrete?.gst_rate ?? it.gst_rate ?? 0) });
                                        return;
                                      }
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }];
                                      const next = base.map((row, i) => i === sidx ? { id: v, label: opt?.label || '', image_url: opt?.image_url || null, quantity: row.quantity } : row);
                                      // set uom if available from option
                                      const lineImg = (next[0]?.image_url) || it.item_image_url || null;
                                      updateItem(idx, { itemSelections: next, unit_of_measure: opt?.uom || it.unit_of_measure, item_image_url: lineImg, gst_rate: (opt?.gst_rate ?? it.gst_rate ?? 0) });
                                    }}
                                  >
                                    <SelectTrigger className="w-full" disabled={isReadOnly}>
                                      <SelectValue placeholder="Select item..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {itemOptions
                                        .filter(o => !it.item_category || o.type === it.item_category)
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
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }];
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
                                      const base = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }];
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
                                const next = it.itemSelections && it.itemSelections.length > 0 ? [...it.itemSelections] : [{ id: it.item_id || '', label: it.item_name || '', image_url: it.item_image_url || null, quantity: it.quantity || 0 }];
                                next.push({ id: '', label: '', image_url: null, quantity: 0 });
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
                      <Input value={it.unit_of_measure || ''} onChange={(e) => updateItem(idx, { unit_of_measure: e.target.value })} className="w-24" disabled={isReadOnly} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })} className="w-28" disabled={isReadOnly} />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Subtotal</Label>
              <div className="text-lg font-semibold">{totals.subtotal.toFixed(2)}</div>
            </div>
            <div>
              <Label>Tax (18%)</Label>
              <div className="text-lg font-semibold">{totals.tax.toFixed(2)}</div>
            </div>
            <div>
              <Label>Total</Label>
              <div className="text-lg font-semibold">{totals.total.toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


