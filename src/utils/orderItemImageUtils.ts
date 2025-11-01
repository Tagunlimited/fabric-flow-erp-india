/**
 * Utility function to get the display image for an order item.
 * Priority: mockup_images (column) > mockup_images (specifications) > category_image_url
 * 
 * @param item - Order item object with potential image sources
 * @returns Image URL string or null if no image is available
 */
export function getOrderItemDisplayImage(item: any): string | null {
  if (!item) return null;

  // Priority 1: Check mockup_images column (TEXT[] array)
  if (item.mockup_images && Array.isArray(item.mockup_images) && item.mockup_images.length > 0) {
    const firstMockup = item.mockup_images[0];
    if (firstMockup && typeof firstMockup === 'string' && firstMockup.trim()) {
      return firstMockup.trim();
    }
  }

  // Priority 2: Check mockup_images in specifications JSONB
  try {
    let specifications = item.specifications;
    
    // Parse if specifications is a string
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
    // If parsing fails, continue to fallback
    console.warn('Error parsing specifications for mockup images:', error);
  }

  // Priority 3: Fallback to category_image_url
  if (item.category_image_url && typeof item.category_image_url === 'string' && item.category_image_url.trim()) {
    return item.category_image_url.trim();
  }

  return null;
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

  // Priority 3: Fallback to category_image_url
  if (item.category_image_url && typeof item.category_image_url === 'string' && item.category_image_url.trim()) {
    return item.category_image_url.trim();
  }

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
