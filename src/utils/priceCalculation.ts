/**
 * Calculate total price from size quantities and size prices
 * If a size has a custom price in sizePrices, use it; otherwise use defaultPrice
 */
export function calculateSizeBasedTotal(
  sizesQuantities: { [size: string]: number },
  sizePrices: { [size: string]: number } | undefined,
  defaultPrice: number
): number {
  let total = 0;
  Object.entries(sizesQuantities || {}).forEach(([size, qty]) => {
    // Use custom price if it exists and is different from default, otherwise use default
    const storedPrice = sizePrices?.[size];
    const sizePrice = storedPrice !== undefined && storedPrice !== defaultPrice ? storedPrice : defaultPrice;
    total += qty * sizePrice;
  });
  return total;
}

/**
 * Calculate average unit price from size-based pricing
 */
export function calculateAverageUnitPrice(
  sizesQuantities: { [size: string]: number },
  sizePrices: { [size: string]: number } | undefined,
  defaultPrice: number
): number {
  const total = calculateSizeBasedTotal(sizesQuantities, sizePrices, defaultPrice);
  const totalQty = Object.values(sizesQuantities || {}).reduce((sum, qty) => sum + qty, 0);
  return totalQty > 0 ? total / totalQty : defaultPrice;
}

/**
 * Initialize size prices with default price
 */
export function initializeSizePrices(
  sizes: string[],
  defaultPrice: number
): { [size: string]: number } {
  const sizePrices: { [size: string]: number } = {};
  sizes.forEach(size => {
    sizePrices[size] = defaultPrice;
  });
  return sizePrices;
}

/** Parse `order_items.specifications` whether stored as object or JSON string. */
export function parseOrderItemSpecifications(item: any): Record<string, any> {
  const raw = item?.specifications;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') || {};
    } catch {
      return {};
    }
  }
  return raw;
}

/**
 * Line subtotal for one order item (size-wise or qty × unit), merging row + specifications JSON.
 */
export function calculateOrderItemAmount(item: any): number {
  if (!item) return 0;
  const specs = parseOrderItemSpecifications(item);

  const sizesQ: Record<string, number> =
    item.sizes_quantities != null && Object.keys(item.sizes_quantities).length > 0
      ? item.sizes_quantities
      : (specs.sizes_quantities || {});

  // Prefer specifications.size_prices when that key exists (saved source of truth). The
  // order_items.size_prices column was historically not updated on edit and stayed stale.
  let sizeP: { [size: string]: number } | undefined;
  if (Object.prototype.hasOwnProperty.call(specs, 'size_prices')) {
    sizeP = specs.size_prices;
  } else {
    sizeP = item.size_prices;
  }
  if (sizeP != null && typeof sizeP === 'object' && Object.keys(sizeP).length === 0) {
    sizeP = undefined;
  }

  const defaultPrice = Number(item.price ?? item.unit_price ?? 0);
  const qty = Number(item.quantity ?? 0);

  if (sizesQ && Object.keys(sizesQ).length > 0) {
    return calculateSizeBasedTotal(sizesQ, sizeP, defaultPrice);
  }
  return qty * defaultPrice;
}

/**
 * Calculate order summary (subtotal, GST, grand total) from order items
 * Handles size-based pricing and backward compatibility
 */
export function calculateOrderSummary(orderItems: any[], order: any | null) {
  let subtotal = 0;
  let gstAmount = 0;
  orderItems.forEach(item => {
    const amount = calculateOrderItemAmount(item);
    subtotal += amount;
    const specs = parseOrderItemSpecifications(item);
    const gstRate = item.gst_rate ?? specs.gst_rate ?? (order?.gst_rate ?? 0);
    gstAmount += (amount * gstRate) / 100;
  });

  return { subtotal, gstAmount, grandTotal: subtotal + gstAmount };
}

