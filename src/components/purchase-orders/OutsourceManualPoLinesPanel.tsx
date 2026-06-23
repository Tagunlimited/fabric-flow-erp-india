import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import {
  buildEmptySizesForType,
  getAllowedSizesForType,
  normalizeSizesByAllowed,
  OUTSOURCE_MANUAL_ENTRY_MODE,
  sumSizesQuantities,
} from '@/lib/orderLineSizes';
import type { SizeType } from '@/utils/sizeSorting';

export type OutsourceManualPoLine = {
  id?: string;
  item_type: 'product';
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
  unit_of_measure?: string;
  remarks?: string;
  sales_order_item_id?: string | null;
  size_type_id?: string | null;
  sizes_quantities?: Record<string, number>;
  entry_mode: typeof OUTSOURCE_MANUAL_ENTRY_MODE;
  fabric_gsm?: string;
  item_color?: string | null;
};

export function createEmptyOutsourceManualLine(
  options?: { sales_order_item_id?: string | null }
): OutsourceManualPoLine {
  return {
    item_type: 'product',
    item_id: '',
    item_name: '',
    item_image_url: null,
    quantity: 0,
    unit_of_measure: 'pcs',
    sales_order_item_id: options?.sales_order_item_id ?? null,
    size_type_id: null,
    sizes_quantities: { Total: 0 },
    entry_mode: OUTSOURCE_MANUAL_ENTRY_MODE,
    fabric_gsm: '',
    item_color: '',
  };
}

type OutsourceManualPoLinesPanelProps = {
  lines: OutsourceManualPoLine[];
  onChange: (lines: OutsourceManualPoLine[]) => void;
  readOnly?: boolean;
  sizeTypes: SizeType[];
  defaultSalesOrderItemId?: string | null;
};

export function OutsourceManualPoLinesPanel({
  lines,
  onChange,
  readOnly = false,
  sizeTypes,
  defaultSalesOrderItemId,
}: OutsourceManualPoLinesPanelProps) {
  const updateLine = (index: number, patch: Partial<OutsourceManualPoLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  const addLine = () => {
    onChange([...lines, createEmptyOutsourceManualLine()]);
  };

  const handleSizeTypeChange = (index: number, sizeTypeId: string) => {
    const nextId = sizeTypeId === '__none__' ? null : sizeTypeId;
    const allowed = getAllowedSizesForType(nextId, sizeTypes);
    const sizes =
      allowed.length > 0
        ? buildEmptySizesForType(nextId, sizeTypes)
        : { Total: lines[index]?.quantity || 0 };
    updateLine(index, {
      size_type_id: nextId,
      sizes_quantities: sizes,
      quantity: sumSizesQuantities(sizes),
    });
  };

  const handleSizeQtyChange = (index: number, size: string, raw: string) => {
    const line = lines[index];
    const allowed = getAllowedSizesForType(line.size_type_id, sizeTypes);
    const nextSizes = normalizeSizesByAllowed(
      { ...(line.sizes_quantities || {}), [size]: Number(raw) || 0 },
      allowed.length > 0 ? allowed : [size]
    );
    if (allowed.length === 0 && size === 'Total') {
      nextSizes.Total = Number(raw) || 0;
    }
    updateLine(index, {
      sizes_quantities: nextSizes,
      quantity: sumSizesQuantities(nextSizes),
    });
  };

  const displayLines =
    lines.length > 0
      ? lines
      : readOnly
        ? []
        : [createEmptyOutsourceManualLine({ sales_order_item_id: defaultSalesOrderItemId })];

  if (readOnly && displayLines.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No outsource product lines on this purchase order.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {displayLines.map((line, index) => {
        const allowedSizes = getAllowedSizesForType(line.size_type_id, sizeTypes);
        const sizeKeys =
          allowedSizes.length > 0 ? allowedSizes : Object.keys(line.sizes_quantities || { Total: 0 });
        const totalQty = sumSizesQuantities(line.sizes_quantities || {});

        return (
          <Card key={line.id || `outsource-line-${index}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Product line {index + 1}</CardTitle>
                {!readOnly && displayLines.length > 1 ? (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product name</Label>
                  <Input
                    value={line.item_name}
                    disabled={readOnly}
                    placeholder="e.g. School Pant, Zipper, Bottle, Bag"
                    onChange={(e) => updateLine(index, { item_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Size type</Label>
                  <Select
                    value={line.size_type_id || '__none__'}
                    disabled={readOnly}
                    onValueChange={(v) => handleSizeTypeChange(index, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select size type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No size breakdown (Total only)</SelectItem>
                      {sizeTypes.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.size_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>GSM</Label>
                  <Input
                    value={line.fabric_gsm || ''}
                    disabled={readOnly}
                    placeholder="e.g. 180"
                    onChange={(e) => updateLine(index, { fabric_gsm: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    value={line.item_color || ''}
                    disabled={readOnly}
                    placeholder="e.g. Navy Blue"
                    onChange={(e) => updateLine(index, { item_color: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-3">
                  {sizeKeys.map((size) => (
                    <div key={size} className="w-24 space-y-1">
                      <Label className="text-xs text-center block">{size}</Label>
                      <Input
                        type="number"
                        min={0}
                        disabled={readOnly}
                        className="text-center"
                        value={line.sizes_quantities?.[size] ?? 0}
                        onChange={(e) => handleSizeQtyChange(index, size, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total quantity: <span className="font-semibold text-foreground">{totalQty}</span> pcs
                </p>
              </div>

              <div className="space-y-2">
                <Label>Remarks (optional)</Label>
                <Textarea
                  value={line.remarks || ''}
                  disabled={readOnly}
                  rows={2}
                  placeholder="Vendor notes, colour, specs…"
                  onChange={(e) => updateLine(index, { remarks: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!readOnly ? (
        <Button type="button" variant="outline" onClick={addLine}>
          <Plus className="h-4 w-4 mr-2" />
          Add product line
        </Button>
      ) : null}
    </div>
  );
}

export function validateOutsourceManualLines(lines: OutsourceManualPoLine[]): string | null {
  const active = lines.filter((l) => l.entry_mode === OUTSOURCE_MANUAL_ENTRY_MODE);
  if (!active.length) return 'Add at least one product line.';
  for (let i = 0; i < active.length; i++) {
    const line = active[i];
    if (!String(line.item_name || '').trim()) {
      return `Product line ${i + 1}: enter a product name.`;
    }
    const total = sumSizesQuantities(line.sizes_quantities || {});
    if (total <= 0) {
      return `Product line ${i + 1}: enter at least one size quantity.`;
    }
  }
  return null;
}
