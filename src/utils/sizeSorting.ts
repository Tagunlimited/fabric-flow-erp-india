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

/**
 * Get size order mapping from a size type ID
 * 
 * @param sizeTypeId - The size type ID
 * @param sizeTypes - Array of all size types
 * @returns Size order mapping object or null if not found
 */
export function getSizeOrderFromTypeId(
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): Record<string, number> | null {
  if (!sizeTypeId) return null;
  
  const sizeType = sizeTypes.find(st => st.id === sizeTypeId);
  if (!sizeType || !sizeType.size_order || Object.keys(sizeType.size_order).length === 0) {
    return null;
  }
  
  return sizeType.size_order;
}

/**
 * Sort an array of size names using master order from size type
 * Works without needing the full size type object
 * 
 * @param sizes - Array of size names to sort
 * @param sizeTypeId - Optional size type ID to get order from
 * @param sizeTypes - Array of all size types
 * @returns Sorted array of sizes
 */
export function sortSizesByMasterOrder(
  sizes: string[],
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): string[] {
  if (!sizes || sizes.length === 0) return [...sizes];
  
  const sizeOrder = getSizeOrderFromTypeId(sizeTypeId, sizeTypes);
  
  if (sizeOrder && Object.keys(sizeOrder).length > 0) {
    return [...sizes].sort((a, b) => {
      const normalizedA = normalizeSizeName(a);
      const normalizedB = normalizeSizeName(b);
      
      const orderA = sizeOrder[normalizedA] ?? sizeOrder[a] ?? 999;
      const orderB = sizeOrder[normalizedB] ?? sizeOrder[b] ?? 999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // If same order, fallback to alphabetical
      return a.localeCompare(b);
    });
  }
  
  // No size order available, try to detect size type from sizes
  const detectedSizeType = detectSizeTypeFromSizes(sizes, sizeTypes);
  if (detectedSizeType && detectedSizeType.size_order) {
    return sortSizesByMasterOrder(sizes, detectedSizeType.id, sizeTypes);
  }
  
  // Final fallback: use default order
  return getFallbackSizeOrder(sizes);
}

/**
 * Sort size distribution objects (arrays with size_name property) using master order
 * 
 * @param distributions - Array of objects with size_name property
 * @param sizeTypeId - Optional size type ID to get order from
 * @param sizeTypes - Array of all size types
 * @returns Sorted array of distributions
 */
export function sortSizeDistributionsByMasterOrder<T extends { size_name: string }>(
  distributions: T[],
  sizeTypeId: string | null | undefined,
  sizeTypes: SizeType[]
): T[] {
  if (!distributions || distributions.length === 0) return [...distributions];
  
  const sizes = distributions.map(d => d.size_name);
  const sortedSizes = sortSizesByMasterOrder(sizes, sizeTypeId, sizeTypes);
  
  // Create a map for quick lookup
  const distributionMap = new Map<string, T[]>();
  distributions.forEach(d => {
    const key = d.size_name;
    if (!distributionMap.has(key)) {
      distributionMap.set(key, []);
    }
    distributionMap.get(key)!.push(d);
  });
  
  // Rebuild array in sorted order
  const sorted: T[] = [];
  sortedSizes.forEach(size => {
    const items = distributionMap.get(size) || [];
    sorted.push(...items);
    distributionMap.delete(size); // Remove to avoid duplicates
  });
  
  // Add any remaining items that weren't in the sorted order
  distributionMap.forEach(items => {
    sorted.push(...items);
  });
  
  return sorted;
}

/**
 * Detect size type from a list of sizes by matching against available_sizes
 * 
 * @param sizes - Array of size names
 * @param sizeTypes - Array of all size types
 * @returns Detected size type or null
 */
export function detectSizeTypeFromSizes(
  sizes: string[],
  sizeTypes: SizeType[]
): SizeType | null {
  if (!sizes || sizes.length === 0 || !sizeTypes || sizeTypes.length === 0) {
    return null;
  }
  
  // Normalize sizes for comparison
  const normalizedSizes = sizes.map(s => normalizeSizeName(s));
  
  let bestMatch: SizeType | null = null;
  let bestMatchCount = 0;
  
  for (const sizeType of sizeTypes) {
    if (!sizeType.available_sizes || sizeType.available_sizes.length === 0) continue;
    
    const normalizedAvailable = sizeType.available_sizes.map(s => normalizeSizeName(s));
    const matchCount = normalizedSizes.filter(s => normalizedAvailable.includes(s)).length;
    
    // If this size type contains all the sizes, it's a perfect match
    if (matchCount === normalizedSizes.length && matchCount > bestMatchCount) {
      bestMatch = sizeType;
      bestMatchCount = matchCount;
    } else if (matchCount > bestMatchCount && matchCount >= normalizedSizes.length * 0.7) {
      // 70% match threshold for partial matches
      bestMatch = sizeType;
      bestMatchCount = matchCount;
    }
  }
  
  return bestMatch;
}

/**
 * Normalize size name for consistent matching
 * Handles case, whitespace, and common variations
 * 
 * @param size - Size name to normalize
 * @returns Normalized size name
 */
export function normalizeSizeName(size: string | null | undefined): string {
  if (!size) return '';
  return size.trim().toUpperCase()
    .replace(/[-_]/g, '') // Remove hyphens and underscores
    .replace(/\s+/g, ''); // Remove whitespace
}

/**
 * Get fallback size order when size type is unknown
 * Uses a default ordering for common sizes
 * 
 * @param sizes - Array of size names to sort
 * @returns Sorted array of sizes
 */
export function getFallbackSizeOrder(sizes: string[]): string[] {
  if (!sizes || sizes.length === 0) return [];
  
  // Default size order for common sizes
  const defaultOrder: Record<string, number> = {
    'XS': 1, 'XXS': 1, '2XS': 1,
    'S': 2, 'SMALL': 2,
    'M': 3, 'MEDIUM': 3,
    'L': 4, 'LARGE': 4,
    'XL': 5, 'X-L': 5,
    '2XL': 6, 'XXL': 6, '2-XL': 6,
    '3XL': 7, 'XXXL': 7, '3-XL': 7,
    '4XL': 8, 'XXXXL': 8, '4-XL': 8,
    '5XL': 9, 'XXXXXL': 9, '5-XL': 9,
    // Numeric sizes (waist/inches)
    '28': 1, '30': 2, '32': 3, '34': 4, '36': 5, '38': 6,
    '40': 7, '42': 8, '44': 9, '46': 10, '48': 11, '50': 12,
    // Kids sizes
    '0-2YRS': 1, '0-2 YRS': 1, '3-4YRS': 2, '3-4 YRS': 2,
    '5-6YRS': 3, '5-6 YRS': 3, '7-8YRS': 4, '7-8 YRS': 4,
    '9-10YRS': 5, '9-10 YRS': 5, '11-12YRS': 6, '11-12 YRS': 6,
    '13-14YRS': 7, '13-14 YRS': 7, '15-16YRS': 8, '15-16 YRS': 8,
  };
  
  return [...sizes].sort((a, b) => {
    const normalizedA = normalizeSizeName(a);
    const normalizedB = normalizeSizeName(b);
    
    const orderA = defaultOrder[normalizedA] || defaultOrder[a.toUpperCase()] || 999;
    const orderB = defaultOrder[normalizedB] || defaultOrder[b.toUpperCase()] || 999;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    // Try numeric comparison for sizes like "28", "30", etc.
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    
    // Final fallback: alphabetical
    return a.localeCompare(b);
  });
}

