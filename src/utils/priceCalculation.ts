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

