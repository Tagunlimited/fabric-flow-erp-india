import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { parseOrderLineSpecifications, type OrderSizeRow } from '@/lib/orderLineSizes';
import {
  fetchWarehouseStockForProduct,
  sortCatalogForOrderSize,
  stockProductLabel,
  type StockProductRow,
  type WarehouseStockRow,
} from '@/lib/stockFulfillmentCatalog';
import { sortSizesByMasterOrder } from '@/utils/sizeSorting';

export type StockSizeMapping = {
  orderSize: string;
  orderQty: number;
  productMasterId: string;
  wiId: string;
  qty: string;
};

type Props = {
  lineId: string;
  sizeRows: OrderSizeRow[];
  sizeTypeId?: string | null;
  sizeTypes: { id: string; size_name: string; available_sizes: string[]; size_order?: Record<string, number> }[];
  catalog: StockProductRow[];
  catalogLoading: boolean;
  mappings: StockSizeMapping[];
  onChange: (lineId: string, mappings: StockSizeMapping[]) => void;
};

export function buildInitialStockMappings(sizeRows: OrderSizeRow[]): StockSizeMapping[] {
  return sizeRows.map((r) => ({
    orderSize: r.size,
    orderQty: r.qty,
    productMasterId: '',
    wiId: '',
    qty: String(r.qty),
  }));
}

/** Apply saved specifications.stock_fulfillment.by_size onto default per-size rows. */
export function mappingsMatchSizeRows(mappings: StockSizeMapping[], sizeRows: OrderSizeRow[]): boolean {
  if (mappings.length !== sizeRows.length) return false;
  return sizeRows.every((sr) =>
    mappings.some((m) => m.orderSize === sr.size && m.orderQty === sr.qty)
  );
}

export function hydrateStockMappings(
  sizeRows: OrderSizeRow[],
  specifications?: unknown
): StockSizeMapping[] {
  const base = buildInitialStockMappings(sizeRows);
  const specs = parseOrderLineSpecifications(specifications);
  const saved = specs.stock_fulfillment as
    | {
        by_size?: {
          order_size?: string;
          product_master_id?: string;
          warehouse_inventory_id?: string;
          quantity?: number;
        }[];
      }
    | undefined;
  const bySize = new Map(
    (saved?.by_size || [])
      .filter((s) => s?.order_size)
      .map((s) => [String(s.order_size), s])
  );
  if (bySize.size === 0) return base;
  return base.map((m) => {
    const s = bySize.get(m.orderSize);
    if (!s) return m;
    return {
      ...m,
      productMasterId: String(s.product_master_id || ''),
      wiId: String(s.warehouse_inventory_id || ''),
      qty: String(s.quantity ?? m.orderQty),
    };
  });
}

export function inventoryPayloadFromMappings(
  mappings: StockSizeMapping[]
): { warehouse_inventory_id: string; quantity: number }[] {
  return mappings
    .filter((m) => m.wiId && Number(m.qty) > 0)
    .map((m) => ({ warehouse_inventory_id: m.wiId, quantity: Number(m.qty) }));
}

export function validateStockMappings(mappings: StockSizeMapping[]): string | null {
  let totalNeed = 0;
  let totalReserve = 0;

  for (const m of mappings) {
    if (m.orderQty <= 0) continue;
    totalNeed += m.orderQty;
    if (!m.productMasterId) return `Select a stock product for size ${m.orderSize}`;
    if (!m.wiId) return `Select warehouse stock for size ${m.orderSize}`;
    const qty = Number(m.qty);
    if (!(qty > 0)) return `Enter reserve quantity for size ${m.orderSize}`;
    if (qty > m.orderQty) {
      return `Reserve qty for size ${m.orderSize} cannot exceed need (${m.orderQty})`;
    }
    totalReserve += qty;
  }

  if (totalNeed > 0 && totalReserve > totalNeed) {
    return `Total reserve (${totalReserve}) cannot exceed line need (${totalNeed})`;
  }
  return null;
}

export const InventoryStockMappingPanel: React.FC<Props> = ({
  lineId,
  sizeRows,
  sizeTypeId,
  sizeTypes,
  catalog,
  catalogLoading,
  mappings,
  onChange,
}) => {
  const [productSearch, setProductSearch] = useState('');
  const [wiByProduct, setWiByProduct] = useState<Record<string, WarehouseStockRow[]>>({});
  const [wiLoading, setWiLoading] = useState<Record<string, boolean>>({});

  const sortedSizeLabels = useMemo(() => {
    const labels = sizeRows.map((r) => r.size);
    return sortSizesByMasterOrder(labels, sizeTypeId ?? null, sizeTypes as any);
  }, [sizeRows, sizeTypeId, sizeTypes]);

  const orderedMappings = useMemo(() => {
    const bySize = new Map(mappings.map((m) => [m.orderSize, m]));
    return sortedSizeLabels.map((size) => bySize.get(size)).filter(Boolean) as StockSizeMapping[];
  }, [mappings, sortedSizeLabels]);

  const loadWi = useCallback(
    async (productMasterId: string) => {
      if (!productMasterId || wiByProduct[productMasterId]) return;
      setWiLoading((p) => ({ ...p, [productMasterId]: true }));
      try {
        const rows = await fetchWarehouseStockForProduct(productMasterId);
        setWiByProduct((p) => ({ ...p, [productMasterId]: rows }));
      } catch (e) {
        console.error(e);
        toast.error('Failed to load warehouse stock for product');
      } finally {
        setWiLoading((p) => ({ ...p, [productMasterId]: false }));
      }
    },
    [wiByProduct]
  );

  useEffect(() => {
    for (const m of mappings) {
      if (m.productMasterId) void loadWi(m.productMasterId);
    }
  }, [mappings, loadWi]);

  const filteredCatalog = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((p) => {
      const blob = [p.sku, p.name, p.class, p.size, p.color, p.category].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [catalog, productSearch]);

  const patchRow = (orderSize: string, patch: Partial<StockSizeMapping>) => {
    const next = mappings.map((m) => (m.orderSize === orderSize ? { ...m, ...patch } : m));
    onChange(lineId, next);
  };

  return (
    <div className="space-y-3 pl-1 border-l-2 border-emerald-200 ml-1">
      <div>
        <p className="text-sm font-medium text-foreground">Map to warehouse stock</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose a listed product and bin row for each order size. Quantities reserve stock on save.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Search SKU, name, size, color…"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
        />
      </div>

      {catalogLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading product catalog…
        </div>
      ) : null}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[88px]">Order size</TableHead>
              <TableHead className="w-[72px]">Need</TableHead>
              <TableHead>Stock product</TableHead>
              <TableHead>Bin / lot</TableHead>
              <TableHead className="w-[88px]">Reserve</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderedMappings.map((row) => {
              const catalogForSize = sortCatalogForOrderSize(filteredCatalog, row.orderSize);
              const wiRows = row.productMasterId ? wiByProduct[row.productMasterId] || [] : [];
              const wiBusy = row.productMasterId ? wiLoading[row.productMasterId] : false;
              const selectedProduct = catalog.find((p) => p.id === row.productMasterId);

              return (
                <TableRow key={row.orderSize}>
                  <TableCell className="font-medium text-sm">{row.orderSize}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.orderQty}</TableCell>
                  <TableCell>
                    <select
                      className="flex h-9 w-full min-w-[200px] max-w-[280px] rounded-md border border-input bg-background px-2 text-sm"
                      value={row.productMasterId}
                      onChange={(e) => {
                        const productMasterId = e.target.value;
                        patchRow(row.orderSize, {
                          productMasterId,
                          wiId: '',
                          qty: String(row.orderQty),
                        });
                        if (productMasterId) void loadWi(productMasterId);
                      }}
                    >
                      <option value="">Select product…</option>
                      {catalogForSize.map((p) => (
                        <option key={p.id} value={p.id}>
                          {stockProductLabel(p)}
                          {p.current_stock != null ? ` (${p.current_stock} pcs)` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedProduct ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Master size: {selectedProduct.size || '—'}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <select
                      className="flex h-9 w-full min-w-[160px] max-w-[240px] rounded-md border border-input bg-background px-2 text-sm"
                      value={row.wiId}
                      disabled={!row.productMasterId || wiBusy}
                      onChange={(e) => patchRow(row.orderSize, { wiId: e.target.value })}
                    >
                      <option value="">{wiBusy ? 'Loading…' : 'Select bin…'}</option>
                      {wiRows.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.bin_code || w.item_name || w.id} — {w.quantity} pcs
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-9 w-20"
                      value={row.qty}
                      onChange={(e) => patchRow(row.orderSize, { qty: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => onChange(lineId, hydrateStockMappings(sizeRows))}
      >
        Reset mappings
      </Button>
    </div>
  );
};