import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Search, Trash2, ListPlus } from 'lucide-react';
import { logInventoryAddition } from '@/utils/inventoryLogging';
import { cn } from '@/lib/utils';
import {
  type FabricMasterPickerRow,
  FABRIC_GSM_EMPTY_SELECT_VALUE,
  colorVariantsForFabricNameAndGsm,
  gsmValuesForFabricName,
  uniqueFabricNameBases,
} from '@/utils/fabricMasterPicker';

type Zone = 'RECEIVING_ZONE' | 'STORAGE';

const FABRIC_CATALOG_PAGE_SIZE = 1000;

async function fetchAllFabricMasterForPicker(): Promise<FabricMasterPickerRow[]> {
  let all: FabricMasterPickerRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error, count } = await supabase
      .from('fabric_master')
      .select('id, fabric_code, fabric_name, color, gsm, hex, status', { count: 'exact' })
      .order('fabric_name')
      .range(from, from + FABRIC_CATALOG_PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (data as FabricMasterPickerRow[]) || [];
    all = [...all, ...rows];

    if (count != null) {
      hasMore = all.length < count;
    } else {
      hasMore = rows.length === FABRIC_CATALOG_PAGE_SIZE;
    }
    from += FABRIC_CATALOG_PAGE_SIZE;
  }

  return all;
}

type ItemRow = {
  id: string;
  item_code: string;
  item_name: string;
  color?: string | null;
};

type BinRow = {
  id: string;
  bin_code: string;
  location_type: string;
};

/** One row queued for save (fabric or item + qty + unit). */
export type PendingInventoryLine = {
  key: string;
  itemType: 'FABRIC' | 'ITEM';
  itemId: string;
  itemName: string;
  itemCode: string;
  color: string | null;
  /** Fabric variant GSM (for display / traceability). */
  gsm?: string | null;
  quantity: number;
  unit: string;
};

export interface AddRawInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

async function applyManualInventoryLine(args: {
  itemType: 'FABRIC' | 'ITEM';
  itemId: string;
  itemName: string;
  itemCode: string;
  color: string | null;
  quantity: number;
  unit: string;
  binId: string;
  zone: Zone;
  notes: string;
}): Promise<void> {
  const {
    itemType,
    itemId,
    itemName,
    itemCode,
    color,
    quantity: qty,
    unit,
    binId,
    zone,
    notes,
  } = args;

  const status = zone === 'RECEIVING_ZONE' ? 'RECEIVED' : 'IN_STORAGE';
  const now = new Date().toISOString();
  const kind = itemType === 'FABRIC' ? 'fabric' : 'item';

  let existing: any = null;
  const { data: byId } = await supabase
    .from('warehouse_inventory' as any)
    .select('*')
    .eq('item_id', itemId)
    .eq('bin_id', binId)
    .eq('status', status)
    .eq('item_type', itemType)
    .eq('unit', unit)
    .limit(1)
    .maybeSingle();

  if (byId) existing = byId;

  if (!existing && itemType !== 'FABRIC') {
    const { data: byCode } = await supabase
      .from('warehouse_inventory' as any)
      .select('*')
      .eq('item_code', itemCode)
      .eq('item_name', itemName)
      .eq('bin_id', binId)
      .eq('status', status)
      .eq('item_type', itemType)
      .eq('unit', unit)
      .limit(1)
      .maybeSingle();
    if (byCode) existing = byCode;
  }

  if (existing) {
    const newQty = Number(existing.quantity) + qty;
    const { data: updated, error: upErr } = await supabase
      .from('warehouse_inventory' as any)
      .update({
        quantity: newQty,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (upErr) throw upErr;

    await logInventoryAddition(
      updated.id,
      {
        item_type: kind,
        item_id: itemId,
        item_name: itemName,
        item_code: itemCode,
        unit,
      },
      qty,
      {
        bin_id: binId,
        status,
        color: color || undefined,
        action: 'CONSOLIDATED',
        old_quantity: Number(existing.quantity),
        new_quantity: newQty,
        notes: notes || 'Manual add — merged with existing bin line',
        reference_type: 'MANUAL',
      }
    );
    return;
  }

  const insertPayload: Record<string, unknown> = {
    grn_id: null,
    grn_item_id: null,
    item_type: itemType,
    item_id: itemId,
    item_name: itemName,
    item_code: itemCode,
    quantity: qty,
    unit,
    bin_id: binId,
    status,
    received_date: now,
    notes: notes || 'Manual raw inventory entry',
    updated_at: now,
  };

  if (zone === 'STORAGE') {
    insertPayload.moved_to_storage_date = now;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('warehouse_inventory' as any)
    .insert(insertPayload)
    .select()
    .single();

  if (insErr) throw insErr;

  await logInventoryAddition(
    inserted.id,
    {
      item_type: kind,
      item_id: itemId,
      item_name: itemName,
      item_code: itemCode,
      unit,
    },
    qty,
    {
      bin_id: binId,
      status,
      color: color || undefined,
      notes: notes || 'Manual raw inventory entry',
      reference_type: 'MANUAL',
    }
  );
}

export const AddRawInventoryModal: React.FC<AddRawInventoryModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [kind, setKind] = useState<'FABRIC' | 'ITEM'>('FABRIC');
  const [zone, setZone] = useState<Zone>('RECEIVING_ZONE');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState<ItemRow[]>([]);
  const [fabricCatalog, setFabricCatalog] = useState<FabricMasterPickerRow[]>([]);
  const [loadingFabricCatalog, setLoadingFabricCatalog] = useState(false);
  const [selectedBaseFabricId, setSelectedBaseFabricId] = useState('');
  const [selectedGsmSelectValue, setSelectedGsmSelectValue] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [bins, setBins] = useState<BinRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [binId, setBinId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('meters');
  const [notes, setNotes] = useState('');
  const [pendingLines, setPendingLines] = useState<PendingInventoryLine[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingBins, setLoadingBins] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fabricNameBases = useMemo(
    () => uniqueFabricNameBases(fabricCatalog),
    [fabricCatalog]
  );

  const selectedBaseFabric = useMemo(
    () => fabricCatalog.find((r) => r.id === selectedBaseFabricId) ?? null,
    [fabricCatalog, selectedBaseFabricId]
  );

  const gsmOptionsForFabric = useMemo(
    () =>
      selectedBaseFabric
        ? gsmValuesForFabricName(fabricCatalog, selectedBaseFabric.fabric_name)
        : [],
    [fabricCatalog, selectedBaseFabric]
  );

  const colorVariantsForPick = useMemo(
    () =>
      selectedBaseFabric && selectedGsmSelectValue
        ? colorVariantsForFabricNameAndGsm(
            fabricCatalog,
            selectedBaseFabric.fabric_name,
            selectedGsmSelectValue
          )
        : [],
    [fabricCatalog, selectedBaseFabric, selectedGsmSelectValue]
  );

  const selectedFabricVariant = useMemo(
    () => fabricCatalog.find((r) => r.id === selectedVariantId) ?? null,
    [fabricCatalog, selectedVariantId]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const resetDraft = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setItemSearchResults([]);
    setSelectedBaseFabricId('');
    setSelectedGsmSelectValue('');
    setSelectedVariantId('');
    setSelectedItem(null);
    setQuantity('');
  }, []);

  const resetForm = useCallback(() => {
    resetDraft();
    setBinId('');
    setNotes('');
    setPendingLines([]);
  }, [resetDraft]);

  useEffect(() => {
    if (!open) {
      resetForm();
      setKind('FABRIC');
      setZone('RECEIVING_ZONE');
      setUnit('meters');
      setFabricCatalog([]);
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || kind !== 'FABRIC') return;

    let cancelled = false;
    (async () => {
      try {
        setLoadingFabricCatalog(true);
        const rows = await fetchAllFabricMasterForPicker();
        if (!cancelled) setFabricCatalog(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          toast.error('Failed to load fabric catalog');
          setFabricCatalog([]);
        }
      } finally {
        if (!cancelled) setLoadingFabricCatalog(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, kind]);

  useEffect(() => {
    if (kind === 'FABRIC') {
      setUnit((u) => (u === 'pcs' ? 'meters' : u));
    } else {
      setUnit((u) => (u === 'meters' ? 'pcs' : u));
    }
  }, [kind]);

  const loadBins = useCallback(async (z: Zone) => {
    try {
      setLoadingBins(true);
      const { data, error } = await supabase
        .from('bins' as any)
        .select('id, bin_code, location_type')
        .eq('location_type', z)
        .eq('is_active', true as any)
        .order('bin_code');

      if (error) throw error;
      const list = ((data as unknown) as BinRow[]) || [];
      setBins(list);
      setBinId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to load bins');
      setBins([]);
      setBinId('');
    } finally {
      setLoadingBins(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadBins(zone);
  }, [open, zone, loadBins]);

  useEffect(() => {
    if (!open || kind !== 'ITEM' || debouncedSearch.length < 2) {
      setItemSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingSearch(true);
        const q = debouncedSearch
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_')
          .replace(/[(),]/g, '');
        const like = `%${q}%`;

        const { data, error } = await supabase
          .from('item_master')
          .select('id, item_code, item_name, color')
          .or(`item_name.ilike.${like},item_code.ilike.${like}`)
          .limit(25);

        if (error) throw error;
        if (!cancelled) setItemSearchResults((data as ItemRow[]) || []);
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('Search failed');
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, kind, debouncedSearch]);

  const addDraftToList = () => {
    const qty = Number(quantity);
    if (!binId) {
      toast.error('Select a bin');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Enter a valid quantity for this line');
      return;
    }

    const rawItem = kind === 'ITEM' ? selectedItem : null;
    if (kind === 'FABRIC') {
      if (!selectedFabricVariant) {
        toast.error('Select fabric, GSM, and color');
        return;
      }
    }
    if (kind === 'ITEM' && !rawItem) {
      toast.error('Select an item from search results');
      return;
    }

    const itemId =
      kind === 'FABRIC' ? selectedFabricVariant!.id : rawItem!.id;
    const itemName =
      kind === 'FABRIC' ? selectedFabricVariant!.fabric_name : rawItem!.item_name;
    const itemCode =
      kind === 'FABRIC'
        ? String(selectedFabricVariant!.fabric_code ?? '').trim() ||
          `FAB-${selectedFabricVariant!.id.slice(0, 8)}`
        : rawItem!.item_code;
    const color =
      kind === 'FABRIC'
        ? selectedFabricVariant!.color ?? null
        : rawItem?.color ?? null;
    const gsmLine =
      kind === 'FABRIC' ? selectedFabricVariant!.gsm ?? null : null;

    const line: PendingInventoryLine = {
      key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      itemType: kind,
      itemId,
      itemName,
      itemCode,
      color,
      gsm: gsmLine,
      quantity: qty,
      unit: unit.trim() || (kind === 'FABRIC' ? 'meters' : 'pcs'),
    };

    setPendingLines((prev) => {
      const dup = prev.find(
        (p) =>
          p.itemId === line.itemId &&
          p.itemType === line.itemType &&
          p.unit === line.unit
      );
      if (dup) {
        return prev.map((p) =>
          p.key === dup.key
            ? { ...p, quantity: p.quantity + line.quantity }
            : p
        );
      }
      return [...prev, line];
    });

    toast.success('Line added', {
      description:
        kind === 'FABRIC'
          ? `${itemName} · ${gsmLine ?? '—'} · ${color ?? '—'} · ${qty} ${line.unit}`
          : `${itemName} · ${qty} ${line.unit}`,
    });
    resetDraft();
  };

  const removePendingLine = (key: string) => {
    setPendingLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSubmit = async () => {
    if (!binId) {
      toast.error('Select a bin');
      return;
    }
    if (pendingLines.length === 0) {
      toast.error('Add at least one line with “Add to list”');
      return;
    }

    try {
      setSubmitting(true);
      const noteText = notes.trim();

      for (let i = 0; i < pendingLines.length; i++) {
        const line = pendingLines[i];
        try {
          await applyManualInventoryLine({
            itemType: line.itemType,
            itemId: line.itemId,
            itemName: line.itemName,
            itemCode: line.itemCode,
            color: line.color,
            quantity: line.quantity,
            unit: line.unit,
            binId,
            zone,
            notes: noteText,
          });
        } catch (e: any) {
          console.error(e);
          const msg = e?.message || e?.error_description || 'Could not save inventory';
          toast.error(`Stopped at line ${i + 1} (${line.itemCode}): ${msg}`);
          if (
            typeof e?.message === 'string' &&
            (e.message.includes('null value') || e.message.includes('violates foreign key'))
          ) {
            toast.error(
              'If the error mentions GRN columns, run the latest Supabase migration so manual rows can omit GRN links.'
            );
          }
          return;
        }
      }

      toast.success(
        pendingLines.length === 1
          ? 'Inventory updated'
          : `Saved ${pendingLines.length} lines`
      );
      try {
        window.dispatchEvent(new CustomEvent('warehouse-inventory-updated'));
      } catch {
        /* ignore */
      }
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 space-y-1">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Plus className="h-5 w-5 text-primary" />
            Add raw inventory
          </DialogTitle>
          <DialogDescription>
            For fabric: choose Product (fabric name), then GSM, then color — same masters as on the order page.
            For items: search and pick a line. Add quantities, then save in one go; duplicate master + unit merges
            quantities. Warehouse rows still merge with existing bin stock as before.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(560px,72vh)] px-6">
          <div className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type (for next line)</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as 'FABRIC' | 'ITEM');
                    setSelectedItem(null);
                    setSearch('');
                    setDebouncedSearch('');
                    setItemSearchResults([]);
                    setSelectedBaseFabricId('');
                    setSelectedGsmSelectValue('');
                    setSelectedVariantId('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FABRIC">Fabric</SelectItem>
                    <SelectItem value="ITEM">Item / trim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Zone</Label>
                <Select value={zone} onValueChange={(v) => setZone(v as Zone)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEIVING_ZONE">Receiving</SelectItem>
                    <SelectItem value="STORAGE">Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bin</Label>
              <Select
                value={binId}
                onValueChange={setBinId}
                disabled={loadingBins || bins.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingBins ? 'Loading bins…' : 'Select bin'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bins.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bin_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bins.length === 0 && !loadingBins && (
                <p className="text-xs text-muted-foreground">
                  No active bins for this zone. Add bins under Warehouse Master.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/15 p-3 space-y-3">
              <p className="text-sm font-medium">Add a line</p>

              {kind === 'FABRIC' ? (
                <div className="space-y-3">
                  {loadingFabricCatalog && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading fabric catalog…
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Fabric (Product)</Label>
                      <Select
                        value={selectedBaseFabricId || undefined}
                        onValueChange={(v) => {
                          setSelectedBaseFabricId(v);
                          setSelectedGsmSelectValue('');
                          setSelectedVariantId('');
                        }}
                        disabled={loadingFabricCatalog || fabricNameBases.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select fabric name" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {fabricNameBases.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.fabric_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>GSM</Label>
                      <Select
                        value={selectedGsmSelectValue || undefined}
                        onValueChange={(v) => {
                          setSelectedGsmSelectValue(v);
                          setSelectedVariantId('');
                        }}
                        disabled={!selectedBaseFabricId || gsmOptionsForFabric.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select GSM" />
                        </SelectTrigger>
                        <SelectContent>
                          {gsmOptionsForFabric.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g === FABRIC_GSM_EMPTY_SELECT_VALUE
                                ? 'No GSM (blank in master)'
                                : String(g)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Color</Label>
                      <Select
                        value={selectedVariantId || undefined}
                        onValueChange={setSelectedVariantId}
                        disabled={!selectedGsmSelectValue || colorVariantsForPick.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {colorVariantsForPick.map((row) => (
                            <SelectItem key={row.id} value={row.id}>
                              <div className="flex items-center gap-2">
                                {row.hex && (
                                  <div
                                    className="h-5 w-5 shrink-0 rounded-full border border-border"
                                    style={{
                                      backgroundColor: row.hex.startsWith('#')
                                        ? row.hex
                                        : `#${row.hex}`,
                                    }}
                                  />
                                )}
                                <span>{row.color || '—'}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!loadingFabricCatalog &&
                    selectedBaseFabricId &&
                    selectedGsmSelectValue &&
                    colorVariantsForPick.length === 0 && (
                      <p className="text-xs text-destructive">
                        No color variant for this fabric and GSM in the master. Check fabric_master rows.
                      </p>
                    )}
                  {selectedFabricVariant && (
                    <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-background px-3 py-2">
                      <span className="font-medium text-foreground">Line: </span>
                      {selectedFabricVariant.fabric_name}
                      {' · '}
                      {selectedFabricVariant.gsm
                        ? `${selectedFabricVariant.gsm} GSM`
                        : 'No GSM'}
                      {' · '}
                      {selectedFabricVariant.color || '—'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Search item (min. 2 characters)</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Item name or code…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  {selectedItem && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-background px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground">Selected </span>
                        <span className="font-medium">
                          {selectedItem.item_name} ({selectedItem.item_code})
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-xs"
                        onClick={() => setSelectedItem(null)}
                      >
                        Change
                      </Button>
                    </div>
                  )}

                  {loadingSearch && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </p>
                  )}
                  {!loadingSearch && debouncedSearch.length >= 2 && (
                    <ul className="rounded-md border border-border/80 bg-muted/30 divide-y max-h-36 overflow-y-auto">
                      {itemSearchResults.map((it) => (
                        <li key={it.id}>
                          <button
                            type="button"
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm hover:bg-muted/80 transition-colors',
                              selectedItem?.id === it.id && 'bg-primary/10'
                            )}
                            onClick={() => {
                              setSelectedItem(it);
                              setSearch('');
                              setDebouncedSearch('');
                              setItemSearchResults([]);
                            }}
                          >
                            <span className="font-medium">{it.item_name}</span>
                            <span className="text-muted-foreground text-xs ml-2">{it.item_code}</span>
                          </button>
                        </li>
                      ))}
                      {itemSearchResults.length === 0 && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">No items found</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="meters / pcs"
                  />
                </div>
                <div className="sm:col-span-1 col-span-2">
                  <Button type="button" variant="secondary" className="w-full gap-2" onClick={addDraftToList}>
                    <ListPlus className="h-4 w-4" />
                    Add to list
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Lines to save ({pendingLines.length})</Label>
                {pendingLines.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => setPendingLines([])}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              {pendingLines.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-3 py-6 text-center">
                  No lines yet. For fabric: pick name, GSM, color, then quantity. For items: search, pick a line, then
                  quantity. Click Add to list.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[72px]">Type</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-[100px]">Color</TableHead>
                        <TableHead className="w-[72px]">GSM</TableHead>
                        <TableHead className="text-right w-[100px]">Qty</TableHead>
                        <TableHead className="w-[80px]">Unit</TableHead>
                        <TableHead className="w-[52px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingLines.map((line) => (
                        <TableRow key={line.key}>
                          <TableCell className="text-xs font-medium">
                            {line.itemType === 'FABRIC' ? 'Fabric' : 'Item'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{line.itemCode}</TableCell>
                          <TableCell className="max-w-[180px] truncate" title={line.itemName}>
                            {line.itemName}
                          </TableCell>
                          <TableCell className="text-xs max-w-[100px] truncate" title={line.color ?? ''}>
                            {line.color ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {line.itemType === 'FABRIC' ? line.gsm ?? '—' : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                          <TableCell className="text-xs">{line.unit}</TableCell>
                          <TableCell className="p-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removePendingLine(line.key)}
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes (optional, applied to every line)</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Opening balance April 2026"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || pendingLines.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : pendingLines.length === 0 ? (
              'Save'
            ) : pendingLines.length === 1 ? (
              'Save 1 line'
            ) : (
              `Save ${pendingLines.length} lines`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
