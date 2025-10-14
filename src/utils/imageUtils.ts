/**
 * Utility functions for image handling and conversion
 */

/**
 * Converts an image URL to base64 data URL
 * @param imageUrl - The URL of the image to convert
 * @returns Promise<string> - Base64 data URL or null if conversion fails
 */
export const convertImageToBase64 = async (imageUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => {
        reject(new Error('Failed to convert image to base64'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return null;
  }
};

/**
 * Converts an image URL to base64 with caching
 * @param imageUrl - The URL of the image to convert
 * @param cache - Optional cache object to store converted images
 * @returns Promise<string> - Base64 data URL or null if conversion fails
 */
export const convertImageToBase64WithCache = async (
  imageUrl: string, 
  cache: Map<string, string> = new Map()
): Promise<string | null> => {
  // Check cache first
  if (cache.has(imageUrl)) {
    return cache.get(imageUrl)!;
  }
  
  // Convert and cache
  const base64 = await convertImageToBase64(imageUrl);
  if (base64) {
    cache.set(imageUrl, base64);
  }
  
  return base64;
};

/**
 * Preloads multiple images and converts them to base64
 * @param imageUrls - Array of image URLs to preload
 * @returns Promise<Map<string, string>> - Map of URL to base64 data URL
 */
export const preloadImagesAsBase64 = async (imageUrls: string[]): Promise<Map<string, string>> => {
  const cache = new Map<string, string>();
  
  const promises = imageUrls.map(async (url) => {
    const base64 = await convertImageToBase64WithCache(url, cache);
    return { url, base64 };
  });
  
  await Promise.all(promises);
  return cache;
};

/**
 * Creates a fallback base64 image for when logo loading fails
 * @param text - Text to display in the fallback image
 * @param width - Width of the fallback image
 * @param height - Height of the fallback image
 * @returns string - Base64 data URL of the fallback image
 */
export const createFallbackLogo = (text: string = 'LOGO', width: number = 200, height: number = 60): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return '';
  }
  
  // Background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);
  
  // Border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);
  
  // Text
  ctx.fillStyle = '#666';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  
  return canvas.toDataURL();
};
