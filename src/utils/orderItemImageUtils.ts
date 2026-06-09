/** Normalize a single image entry (URL string or `{ url }` object) from DB/form data. */
export function normalizeOrderImageUrl(entry: unknown): string | null {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    return trimmed;
  }
  if (typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    for (const key of ['url', 'publicUrl', 'public_url', 'src', 'href']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/** First usable URL from a mockup/reference array (column or specifications). */
export function firstOrderImageUrlFromArray(arr: unknown): string | null {
  if (!Array.isArray(arr)) return null;
  for (const entry of arr) {
    const url = normalizeOrderImageUrl(entry);
    if (url) return url;
  }
  return null;
}

function mockupUrlsFromSpecifications(specifications: unknown): string[] {
  try {
    let specs = specifications;
    if (typeof specs === 'string') specs = JSON.parse(specs);
    if (!specs || typeof specs !== 'object') return [];
    const fromMockup = firstOrderImageUrlFromArray((specs as { mockup_images?: unknown }).mockup_images);
    return fromMockup ? [fromMockup] : [];
  } catch {
    return [];
  }
}

function referenceUrlFromSpecifications(specifications: unknown): string | null {
  try {
    let specs = specifications;
    if (typeof specs === 'string') specs = JSON.parse(specs);
    if (!specs || typeof specs !== 'object') return null;
    return firstOrderImageUrlFromArray((specs as { reference_images?: unknown }).reference_images);
  } catch {
    return null;
  }
}

/**
 * Utility function to get the display image for an order item.
 * Priority: mockup_images (column) > mockup_images (specifications) > category_image_url
 * For readymade orders: Always use category_image_url (skip mockup images)
 * 
 * @param item - Order item object with potential image sources
 * @param order - Optional order object to check order_type
 * @returns Image URL string or null if no image is available
 */
export function getOrderItemDisplayImage(item: any, order?: any): string | null {
  if (!item) return null;

  // Check if this is a readymade order
  let isReadymade = false;
  
  // Check order object first (if provided)
  if (order && order.order_type === 'readymade') {
    isReadymade = true;
  }
  
  // Also check specifications for order_type (for readymade orders)
  if (!isReadymade) {
    try {
      let specifications = item.specifications;
      
      // Parse if specifications is a string
      if (typeof specifications === 'string') {
        specifications = JSON.parse(specifications);
      }
      
      if (specifications && typeof specifications === 'object') {
        if (specifications.order_type === 'readymade') {
          isReadymade = true;
        }
      }
    } catch (error) {
      // If parsing fails, continue
    }
  }

  // For readymade orders, prioritize class_image (the image shown when selecting class)
  if (isReadymade) {
    try {
      let specifications = item.specifications;
      if (typeof specifications === 'string') {
        specifications = JSON.parse(specifications);
      }
      if (specifications && typeof specifications === 'object' && specifications.class_image) {
        const classImage = specifications.class_image;
        if (typeof classImage === 'string' && classImage.trim()) {
          return classImage.trim();
        }
      }
    } catch (error) {
      // If parsing fails, continue to fallback
    }
    
    // Fallback to category_image_url if class_image is not available
    if (item.category_image_url && typeof item.category_image_url === 'string' && item.category_image_url.trim()) {
      return item.category_image_url.trim();
    }
    return null;
  }

  // For custom orders, use mockup images if available (do NOT fall back to category_image_url)
  const fromColumn = firstOrderImageUrlFromArray(item.mockup_images);
  if (fromColumn) return fromColumn;

  const fromSpecs = mockupUrlsFromSpecifications(item.specifications)[0];
  if (fromSpecs) return fromSpecs;

  // For custom orders, do NOT fall back to category_image_url - return null if no mockup
  return null;
}

const PLACEHOLDER_ORDER_IMAGE = '/placeholder-category.svg';

/**
 * Thumbnail for QC / Dispatch cards: uses {@link getOrderItemDisplayImage} (mockups + specs + readymade class image),
 * then for custom orders falls back to category_image_url when no mockup exists.
 */
export function getOrderItemListThumbnailUrl(
  item: any,
  order?: { order_type?: string | null }
): string | null {
  const primary = getOrderItemDisplayImage(item, order);
  if (primary) return primary;

  const isReadymade = order?.order_type === 'readymade';
  if (!isReadymade) {
    const ref =
      firstOrderImageUrlFromArray(item?.reference_images) ||
      referenceUrlFromSpecifications(item?.specifications);
    if (ref) return ref;
  }

  if (
    !isReadymade &&
    item?.category_image_url &&
    typeof item.category_image_url === 'string' &&
    item.category_image_url.trim()
  ) {
    return item.category_image_url.trim();
  }
  return null;
}

export function getOrderCardPlaceholderSrc(): string {
  return PLACEHOLDER_ORDER_IMAGE;
}

/**
 * Helper function for form context where mockup_images might be File objects
 * This handles both File objects (before upload) and URL strings (after upload)
 * 
 * @param item - Product or order item with potential File objects or URLs
 * @returns Image URL string, File object, or null
 */
export function getOrderItemDisplayImageForForm(item: any): string | File | null {
  if (!item) return null;

  // Priority 1: Check mockup_images array (could be File objects or URLs)
  if (item.mockup_images && Array.isArray(item.mockup_images) && item.mockup_images.length > 0) {
    const firstMockup = item.mockup_images[0];
    // Return File object if it's a File (form context before upload)
    if (firstMockup instanceof File) {
      return firstMockup;
    }
    // Return URL string if it's a string
    if (typeof firstMockup === 'string' && firstMockup.trim()) {
      return firstMockup.trim();
    }
  }

  // Priority 2: Check mockup_images in specifications (usually URLs after upload)
  try {
    let specifications = item.specifications;
    
    if (typeof specifications === 'string') {
      specifications = JSON.parse(specifications);
    }
    
    if (specifications && typeof specifications === 'object') {
      const mockupImages = specifications.mockup_images;
      if (Array.isArray(mockupImages) && mockupImages.length > 0) {
        const firstMockup = mockupImages[0];
        if (firstMockup && typeof firstMockup === 'string' && firstMockup.trim()) {
          return firstMockup.trim();
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing specifications for mockup images:', error);
  }

  // For form context, do NOT fall back to category_image_url - return null if no mockup
  return null;
}

/**
 * Get display image URL from a File object or URL string
 * Useful for rendering images in form contexts
 */
export function getImageSrcFromFileOrUrl(image: string | File | null): string | null {
  if (!image) return null;
  
  if (image instanceof File) {
    return URL.createObjectURL(image);
  }
  
  if (typeof image === 'string') {
    return image;
  }
  
  return null;
}
