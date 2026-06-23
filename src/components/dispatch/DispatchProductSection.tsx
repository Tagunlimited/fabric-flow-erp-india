import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  OrderMultiImagePanel,
  resolveOrderImageUrls,
} from '@/components/orders/OrderMultiImagePanel';
import type { DispatchProductLine } from '@/lib/dispatchProductBreakdown';
import { dispatchLineKey } from '@/lib/dispatchProductBreakdown';

type DispatchProductSectionProps = {
  line: DispatchProductLine;
  isReadymadeOrder: boolean;
  dispatchQtyByLine: Record<string, number>;
  onInc: (orderItemId: string, sizeName: string, delta: number, maxAllowed: number) => void;
  onSetDirect: (orderItemId: string, sizeName: string, value: number, maxAllowed: number) => void;
};

export function DispatchProductSection({
  line,
  isReadymadeOrder,
  dispatchQtyByLine,
  onInc,
  onSetDirect,
}: DispatchProductSectionProps) {
  const sizesWithRemaining = line.sizes.filter((s) => s.to_dispatch > 0);
  const summarySizes = sizesWithRemaining.length > 0 ? sizesWithRemaining : line.sizes;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
          <OrderMultiImagePanel
            urls={resolveOrderImageUrls(line.image_url ? [line.image_url] : [])}
            alt={line.label}
            variant="compact"
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm leading-snug">{line.label}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              Approved: {line.approved_total}
            </Badge>
            <Badge variant="outline" className="text-xs bg-orange-50">
              Dispatched: {line.dispatched_total}
            </Badge>
            <Badge variant="outline" className="text-xs bg-purple-50">
              Remaining: {line.remaining_total}
            </Badge>
          </div>
        </div>
      </div>

      {summarySizes.length > 0 ? (
        <>
          <div>
            <div className="text-xs font-medium mb-2">Remaining Pcs to Dispatch</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {summarySizes.map((r) => (
                <div key={r.size_name} className="border rounded p-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{r.size_name}</div>
                  <div className="text-base font-semibold">{r.to_dispatch}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {line.sizes.map((r) => {
              const maxAllowed = r.to_dispatch;
              const key = dispatchLineKey(line.order_item_id, r.size_name);
              const val = Number(dispatchQtyByLine[key] || 0);
              return (
                <div key={r.size_name} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="text-sm font-medium">
                      {isReadymadeOrder && r.size_name === 'Total'
                        ? 'Total Quantity'
                        : `Size ${r.size_name}`}
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {isReadymadeOrder
                        ? `Total: ${r.approved} • Dispatched: ${r.dispatched}`
                        : `Approved ${r.approved} • Dispatched ${r.dispatched}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onInc(line.order_item_id, r.size_name, -1, maxAllowed)}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      className="w-20 text-center"
                      value={val}
                      min={0}
                      max={maxAllowed}
                      onChange={(e) =>
                        onSetDirect(
                          line.order_item_id,
                          r.size_name,
                          Number(e.target.value || 0),
                          maxAllowed
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onInc(line.order_item_id, r.size_name, 1, maxAllowed)}
                    >
                      +
                    </Button>
                    <div className="text-xs text-muted-foreground ml-auto">Max {maxAllowed}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No pending quantities for this product.</p>
      )}
    </div>
  );
}
