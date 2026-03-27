import { formatCurrency } from '@/lib/utils';
import { calculateSizeBasedTotal } from '@/utils/priceCalculation';
import { sortSizesQuantities as sortSizesQuantitiesUtil, sortSizesByMasterOrder } from '@/utils/sizeSorting';

export type OrderForSummaryPrint = {
  order_type?: string | null;
  gst_rate?: number | null;
};

export type CategoryMap = Record<string, { category_name?: string }>;
export type FabricMap = Record<string, { name?: string }>;

function parseSpecifications(item: any): Record<string, any> {
  try {
    return typeof item.specifications === 'string'
      ? JSON.parse(item.specifications)
      : item.specifications || {};
  } catch {
    return item.specifications || {};
  }
}

function sortSizesLocal(
  sizes: { [key: string]: number },
  sizeTypeId: string | null | undefined,
  sizeTypesMap: Record<string, any>
): Array<[string, number]> {
  const filteredEntries = Object.entries(sizes).filter(([_, qty]) => Number(qty) > 0);
  if (filteredEntries.length === 0) return [];

  const sizeTypesArray = Object.values(sizeTypesMap);
  const sizeNames = filteredEntries.map(([size]) => size);
  const sortedSizeNames = sortSizesByMasterOrder(sizeNames, sizeTypeId || null, sizeTypesArray);
  const sortedMap = new Map(filteredEntries.map(([k, v]) => [k, Number(v)]));
  const sorted: Array<[string, number]> = [];
  sortedSizeNames.forEach((sizeName) => {
    if (sortedMap.has(sizeName)) {
      sorted.push([sizeName, sortedMap.get(sizeName)!]);
      sortedMap.delete(sizeName);
    }
  });
  sortedMap.forEach((qty, sizeName) => {
    sorted.push([sizeName, qty]);
  });
  return sorted;
}

function collectBrandingItems(item: any, specs: Record<string, any>): any[] {
  if (specs.branding_items && Array.isArray(specs.branding_items) && specs.branding_items.length > 0) {
    return specs.branding_items;
  }
  if (item.branding_items && Array.isArray(item.branding_items) && item.branding_items.length > 0) {
    return item.branding_items;
  }
  return [];
}

function filterValidBranding(brandingItems: any[]) {
  const hasBrandingPdf = brandingItems.some(
    (b: any) =>
      b &&
      typeof b === 'object' &&
      ((b.branding_type && String(b.branding_type).trim() !== '') ||
        (b.placement && String(b.placement).trim() !== '') ||
        (b.measurement && String(b.measurement).trim() !== ''))
  );
  const validBrandingItemsPdf = hasBrandingPdf
    ? brandingItems.filter(
        (b: any) =>
          b &&
          typeof b === 'object' &&
          ((b.branding_type && String(b.branding_type).trim() !== '') ||
            (b.placement && String(b.placement).trim() !== '') ||
            (b.measurement && String(b.measurement).trim() !== ''))
      )
    : [];
  return validBrandingItemsPdf;
}

export function buildOrderLinePrintModel(
  item: any,
  order: OrderForSummaryPrint | null | undefined,
  sizeTypesMap: Record<string, any>
) {
  let sizePrices: { [size: string]: number } | undefined;
  let sizesQuantities: { [size: string]: number } | undefined;
  let sizeTypeId: string | null = null;

  if (item.size_prices && item.sizes_quantities) {
    sizePrices = item.size_prices;
    sizesQuantities = item.sizes_quantities;
    sizeTypeId = item.size_type_id || null;
  } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
    sizePrices = item.specifications.size_prices;
    sizesQuantities = item.specifications.sizes_quantities;
    sizeTypeId = item.specifications.size_type_id || null;
  }

  let amount = 0;
  if (sizePrices && sizesQuantities) {
    amount = calculateSizeBasedTotal(sizesQuantities, sizePrices, item.unit_price);
  } else {
    amount = Number(item.quantity || 0) * Number(item.unit_price || 0);
  }

  const gstRate = Number(item.gst_rate ?? item.specifications?.gst_rate ?? order?.gst_rate ?? 0);
  const gstAmt = (amount * gstRate) / 100;
  const total = amount + gstAmt;

  const sizePriceGroups: { [price: string]: { sizes: string[]; qty: number } } = {};
  if (sizesQuantities) {
    Object.entries(sizesQuantities).forEach(([size, qty]) => {
      if (Number(qty) > 0) {
        const sizePrice = sizePrices?.[size] ?? item.unit_price;
        const priceKey = Number(sizePrice).toFixed(2);
        if (!sizePriceGroups[priceKey]) {
          sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
        }
        sizePriceGroups[priceKey].sizes.push(size);
        sizePriceGroups[priceKey].qty += Number(qty);
      }
    });
  }

  const sortedPriceGroups = Object.entries(sizePriceGroups)
    .map(([price, data]) => {
      let sortedSizes: string[] = [];
      if (sizeTypeId && sizeTypesMap[sizeTypeId]) {
        const sizeTypesArray = Object.values(sizeTypesMap);
        const sorted = sortSizesQuantitiesUtil(
          data.sizes.reduce((acc, s) => ({ ...acc, [s]: 1 }), {}),
          sizeTypeId,
          sizeTypesArray
        );
        sortedSizes = sorted.map(([s]) => s);
      } else {
        sortedSizes = data.sizes.sort((a, b) => {
          const ord = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
          const indexA = ord.indexOf(a);
          const indexB = ord.indexOf(b);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
      }
      return { price: parseFloat(price), sizes: sortedSizes, qty: data.qty };
    })
    .sort((a, b) => a.price - b.price);

  const specs = parseSpecifications(item);
  const isReadymade = order?.order_type === 'readymade';
  const brandingItems = collectBrandingItems(item, specs);
  const validBrandingItemsPdf = filterValidBranding(brandingItems);

  return {
    sortedPriceGroups,
    amount,
    gstRate,
    gstAmt,
    total,
    specs,
    validBrandingItemsPdf,
    isReadymade,
    sizesQuantities,
    sizeTypeId,
  };
}

type ProductCellProps = {
  item: any;
  order: OrderForSummaryPrint | null | undefined;
  fabrics: FabricMap;
  productCategories: CategoryMap;
  sizeTypesMap: Record<string, any>;
  /** Invoice: product name first, fabric in parentheses; GSM not shown */
  invoiceProductLayout?: boolean;
};

export function OrderSummaryProductDetailsCell({
  item,
  order,
  fabrics,
  productCategories,
  sizeTypesMap,
  invoiceProductLayout = false,
}: ProductCellProps) {
  const { specs, validBrandingItemsPdf, isReadymade, sizeTypeId } = buildOrderLinePrintModel(
    item,
    order,
    sizeTypesMap
  );
  const fabricName =
    fabrics[item.fabric_id]?.name ||
    (item as any).fabric_name ||
    'Fabric';
  const fabricForInvoiceParen =
    fabrics[item.fabric_id]?.name || ((item as any).fabric_name as string | undefined) || null;

  return (
    <div className="break-words min-w-0 text-sm">
      {isReadymade ? (
          <>
            <div className="font-semibold">{specs.product_name || item.product_description}</div>
            <div className="text-sm text-gray-600">
              {specs.class && <span>Class: {specs.class}</span>}
              {specs.color && <span className="ml-2">Color: {specs.color}</span>}
              {specs.category && <span className="ml-2">Category: {specs.category}</span>}
            </div>
            {specs.sizes_quantities &&
              typeof specs.sizes_quantities === 'object' &&
              Object.keys(specs.sizes_quantities).length > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  Size-wise:{' '}
                  {sortSizesLocal(
                    specs.sizes_quantities,
                    item.size_type_id || specs.size_type_id,
                    sizeTypesMap
                  )
                    .map(([size, qty]) => `${size}(${qty})`)
                    .join(', ')}
                </div>
              )}
          </>
        ) : invoiceProductLayout ? (
          <>
            <div className="font-semibold">
              {item.product_description || '—'}
              {fabricForInvoiceParen ? ` (${fabricForInvoiceParen})` : ''}
            </div>
            {/* Invoice: category + color only; GSM not shown */}
            <div className="text-sm text-gray-600">
              {[
                productCategories[item.product_category_id]?.category_name,
                item.color != null && item.color !== '' ? `Color: ${item.color}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
              <div className="text-sm text-gray-600">
                Sizes:{' '}
                {sortSizesLocal(item.sizes_quantities, sizeTypeId || item.size_type_id, sizeTypesMap)
                  .map(([size, qty]) => `${size}(${qty})`)
                  .join(', ')}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-sm text-gray-600 font-semibold">
              {fabricName}
              {item.color != null && item.color !== '' ? ` - ${item.color}` : ''}
              {item.gsm ? `, ${item.gsm}GSM` : ''}
            </div>
            <div className="font-semibold">{item.product_description}</div>
            <div className="text-sm text-gray-600">
              {productCategories[item.product_category_id]?.category_name}
            </div>
            {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
              <div className="text-sm text-gray-600">
                Sizes:{' '}
                {sortSizesLocal(item.sizes_quantities, sizeTypeId || item.size_type_id, sizeTypesMap)
                  .map(([size, qty]) => `${size}(${qty})`)
                  .join(', ')}
              </div>
            )}
          </>
        )}

      {validBrandingItemsPdf.length > 0 && (
        <div className="mt-1">
          <div className="text-xs font-bold text-gray-900 mb-0.5">Branding Details:</div>
          <div className="space-y-0.5 text-xs text-gray-800">
            {validBrandingItemsPdf.map((b: any, i: number) => (
              <div key={i}>
                Type: {b.branding_type || 'N/A'} · Placement: {b.placement || 'N/A'} · Size:{' '}
                {b.measurement || 'N/A'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderSummaryQtyCell({
  item,
  order,
  sizeTypesMap,
  showUnitRates = true,
}: {
  item: any;
  order: OrderForSummaryPrint | null | undefined;
  sizeTypesMap: Record<string, any>;
  /** Delivery challan: size breakdown without ₹ rates */
  showUnitRates?: boolean;
}) {
  const { sortedPriceGroups } = buildOrderLinePrintModel(item, order, sizeTypesMap);
  return (
    <>
      <div className="font-semibold">{item.quantity} Pcs</div>
      {sortedPriceGroups.length > 0 && (
        <div className="text-xs text-gray-600 space-y-1 mt-1">
          {sortedPriceGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.sizes.join(', ')}: {group.qty}
              {showUnitRates ? ` @ ₹${group.price.toFixed(2)}` : ''}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function OrderSummaryPriceCell({
  item,
  order,
  sizeTypesMap,
}: {
  item: any;
  order: OrderForSummaryPrint | null | undefined;
  sizeTypesMap: Record<string, any>;
}) {
  const { sortedPriceGroups } = buildOrderLinePrintModel(item, order, sizeTypesMap);
  if (sortedPriceGroups.length > 0) {
    return (
      <div className="text-xs text-gray-700 space-y-1 text-right">
        {sortedPriceGroups.map((group, groupIndex) => (
          <div key={groupIndex}>₹{group.price.toFixed(2)}</div>
        ))}
      </div>
    );
  }
  return <span className="tabular-nums">{formatCurrency(item.unit_price)}</span>;
}

export function OrderSummaryFinancialCells({
  item,
  order,
  sizeTypesMap,
}: {
  item: any;
  order: OrderForSummaryPrint | null | undefined;
  sizeTypesMap: Record<string, any>;
}) {
  const { amount, gstRate, gstAmt, total } = buildOrderLinePrintModel(item, order, sizeTypesMap);
  return (
    <>
      <td className="border border-gray-400 px-4 py-3 align-middle text-right text-sm">
        {formatCurrency(amount)}
      </td>
      <td className="border border-gray-400 px-4 py-3 align-middle text-center text-sm">
        <div>{gstRate}%</div>
        <div>{formatCurrency(gstAmt)}</div>
      </td>
      <td className="border border-gray-400 px-4 py-3 align-middle text-right text-sm font-semibold">
        {formatCurrency(total)}
      </td>
    </>
  );
}

/** Build sizeTypes map from hook array (id → record) */
export function sizeTypesArrayToMap(sizeTypes: { id: string }[]): Record<string, any> {
  return (sizeTypes || []).reduce((acc: Record<string, any>, st: any) => {
    if (st?.id) acc[st.id] = st;
    return acc;
  }, {});
}
