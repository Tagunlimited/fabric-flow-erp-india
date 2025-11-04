// Import jsbarcode - Vite handles CommonJS to ES module conversion
// Using dynamic import at top level to ensure Vite processes it correctly
let JsBarcode: any;
let jsbarcodePromise: Promise<any> | null = null;

async function loadJsBarcode() {
  if (!JsBarcode) {
    if (!jsbarcodePromise) {
      jsbarcodePromise = import('jsbarcode').then(module => {
        // jsbarcode exports as default in some versions
        JsBarcode = module.default || module;
        return JsBarcode;
      }).catch(error => {
        console.error('Failed to load jsbarcode:', error);
        throw new Error('jsbarcode library failed to load. Please restart the dev server.');
      });
    }
    await jsbarcodePromise;
  }
  return JsBarcode;
}

/**
 * Validates if SKU is suitable for barcode generation
 * @param sku - The SKU string to validate
 * @returns true if valid, false otherwise
 */
export function validateBarcodeData(sku: string): boolean {
  if (!sku || typeof sku !== 'string') {
    return false;
  }
  
  // Code 128 supports ASCII characters, so most SKU formats should work
  // Check for empty string or only whitespace
  if (sku.trim().length === 0) {
    return false;
  }
  
  // Check if SKU is too long (Code 128 has practical limits)
  if (sku.length > 100) {
    return false;
  }
  
  return true;
}

/**
 * Generates a Code 128 barcode as a base64 PNG image
 * @param sku - The SKU to encode in the barcode
 * @param options - Optional barcode rendering options
 * @returns Promise resolving to base64 image data URL
 */
export async function generateCode128Barcode(
  sku: string,
  options?: {
    width?: number;
    height?: number;
    format?: 'PNG' | 'SVG';
    margin?: number;
  }
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!validateBarcodeData(sku)) {
        reject(new Error(`Invalid SKU for barcode generation: ${sku}`));
        return;
      }

      const {
        width = 2,
        height = 80,
        format = 'PNG',
        margin = 10
      } = options || {};

      // Load jsbarcode library
      const JsBarcodeLib = await loadJsBarcode();

      // Create a canvas element for rendering
      const canvas = document.createElement('canvas');
      
      // Generate barcode on canvas
      JsBarcodeLib(canvas, sku, {
        format: 'CODE128',
        width: width,
        height: height,
        margin: margin,
        displayValue: false, // We'll display SKU separately
        background: '#ffffff',
        lineColor: '#000000',
      });

      // Convert canvas to base64 PNG
      if (format === 'PNG') {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } else {
        // For SVG, we need a different approach
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcodeLib(svg, sku, {
          format: 'CODE128',
          width: width,
          height: height,
          margin: margin,
          displayValue: false,
          background: '#ffffff',
          lineColor: '#000000',
        });
        
        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgData)}`;
        resolve(svgDataUrl);
      }
    } catch (error: any) {
      console.error('Error generating barcode:', error);
      reject(new Error(`Failed to generate barcode: ${error.message || 'Unknown error'}`));
    }
  });
}

/**
 * Generates a Code 128 barcode as an Image element
 * Useful for rendering directly in the DOM
 * @param sku - The SKU to encode
 * @param options - Optional barcode rendering options
 * @returns Promise resolving to HTMLImageElement
 */
export async function generateCode128BarcodeImage(
  sku: string,
  options?: {
    width?: number;
    height?: number;
    margin?: number;
  }
): Promise<HTMLImageElement> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!validateBarcodeData(sku)) {
        reject(new Error(`Invalid SKU for barcode generation: ${sku}`));
        return;
      }

      const {
        width = 2,
        height = 80,
        margin = 10
      } = options || {};

      // Load jsbarcode library
      const JsBarcodeLib = await loadJsBarcode();
      const canvas = document.createElement('canvas');
      
      JsBarcodeLib(canvas, sku, {
        format: 'CODE128',
        width: width,
        height: height,
        margin: margin,
        displayValue: false,
        background: '#ffffff',
        lineColor: '#000000',
      });

      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to create image from canvas'));
      img.src = canvas.toDataURL('image/png');
    } catch (error: any) {
      console.error('Error generating barcode image:', error);
      reject(new Error(`Failed to generate barcode image: ${error.message || 'Unknown error'}`));
    }
  });
}
