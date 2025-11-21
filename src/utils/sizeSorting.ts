/**
 * Utility functions for sorting sizes based on size_type configuration
 */

export interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
  size_order?: Record<string, number>; // { "S": 1, "M": 2, "L": 3, ... }
  image_url?: string;
  created_at: string;
}

/**
 * Get sorted sizes for a given size type
 * If size_order is defined, uses that order. Otherwise, returns sizes as-is.
 * 
 * @param sizeType - The size type object with available_sizes and optional size_order
 * @returns Array of sizes sorted according to size_order
 */
export function getSortedSizes(sizeType: SizeType | null | undefined): string[] {
  if (!sizeType || !sizeType.available_sizes || sizeType.available_sizes.length === 0) {
    return [];
  }

  // If no size_order is defined, return sizes as-is
  if (!sizeType.size_order || Object.keys(sizeType.size_order).length === 0) {
    return [...sizeType.available_sizes];
  }

  // Sort sizes based on size_order
  const sorted = [...sizeType.available_sizes].sort((a, b) => {
    const orderA = sizeType.size_order![a] ?? 999; // Default to 999 if not found
    const orderB = sizeType.size_order![b] ?? 999;
    return orderA - orderB;
  });

  return sorted;
}

/**
 * Get sorted sizes from a size type ID
 * Fetches the size type and returns sorted sizes
 * 
 * @param sizeTypeId - The ID of the size type
 * @param sizeTypes - Array of all size types (to avoid extra fetch)
 * @returns Array of sorted sizes
 */
export function getSortedSizesById(
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): string[] {
  if (!sizeTypeId) return [];
  
  const sizeType = sizeTypes.find(st => st.id === sizeTypeId);
  return getSortedSizes(sizeType);
}

/**
 * Sort an array of size names based on a size type's order
 * 
 * @param sizes - Array of size names to sort
 * @param sizeType - The size type with size_order configuration
 * @returns Sorted array of sizes
 */
export function sortSizesByType(sizes: string[], sizeType: SizeType | null | undefined): string[] {
  if (!sizeType || !sizes || sizes.length === 0) {
    return [...sizes];
  }

  // If no size_order is defined, return sizes as-is
  if (!sizeType.size_order || Object.keys(sizeType.size_order).length === 0) {
    return [...sizes];
  }

  // Sort sizes based on size_order
  return [...sizes].sort((a, b) => {
    const orderA = sizeType.size_order![a] ?? 999;
    const orderB = sizeType.size_order![b] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Create size_order object from an array of sizes
 * Automatically assigns order based on array index (1-based)
 * 
 * @param sizes - Array of size names in desired order
 * @returns Object mapping size names to their order
 */
export function createSizeOrder(sizes: string[]): Record<string, number> {
  const order: Record<string, number> = {};
  sizes.forEach((size, index) => {
    if (size && size.trim()) {
      order[size.trim()] = index + 1;
    }
  });
  return order;
}

/**
 * Sort sizes from sizes_quantities object based on size_type
 * This is used when displaying sizes from order items
 * 
 * @param sizesQuantities - Object with size names as keys and quantities as values
 * @param sizeTypeId - The size type ID to get sort order from
 * @param sizeTypes - Array of all size types
 * @returns Array of [size, quantity] tuples sorted by size_order
 */
export function sortSizesQuantities(
  sizesQuantities: Record<string, number> | null | undefined,
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): Array<[string, number]> {
  if (!sizesQuantities || Object.keys(sizesQuantities).length === 0) {
    return [];
  }

  const sizeType = sizeTypeId ? sizeTypes.find(st => st.id === sizeTypeId) : null;
  
  // If we have a size type with size_order, use it
  if (sizeType && sizeType.size_order && Object.keys(sizeType.size_order).length > 0) {
    return Object.entries(sizesQuantities).sort(([sizeA], [sizeB]) => {
      const orderA = sizeType.size_order![sizeA] ?? 999;
      const orderB = sizeType.size_order![sizeB] ?? 999;
      return orderA - orderB;
    });
  }

  // Fallback: sort alphabetically
  return Object.entries(sizesQuantities).sort(([a], [b]) => a.localeCompare(b));
}

