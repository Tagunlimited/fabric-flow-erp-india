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

/**
 * Calculate order summary (subtotal, GST, grand total) from order items
 * Handles size-based pricing and backward compatibility
 */
export function calculateOrderSummary(orderItems: any[], order: any | null) {
  let subtotal = 0;
  let gstAmount = 0;
  orderItems.forEach(item => {
    let amount = 0;
    // Check if size-based pricing is available (new format)
    if (item.size_prices && item.sizes_quantities) {
      // New format: size-wise pricing
      amount = calculateSizeBasedTotal(
        item.sizes_quantities,
        item.size_prices,
        item.unit_price
      );
    } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
      // Also check in specifications (for backward compatibility)
      amount = calculateSizeBasedTotal(
        item.specifications.sizes_quantities,
        item.specifications.size_prices,
        item.unit_price
      );
    } else {
      // Old format: single unit_price (backward compatibility)
      amount = item.quantity * item.unit_price;
    }
    
    subtotal += amount;
    // Try to get GST rate from item.gst_rate first, then from specifications, then from order
    const gstRate = item.gst_rate ?? 
                   (item.specifications?.gst_rate) ?? 
                   (order?.gst_rate ?? 0);
    gstAmount += (amount * gstRate) / 100;
  });

  return { subtotal, gstAmount, grandTotal: subtotal + gstAmount };
}

