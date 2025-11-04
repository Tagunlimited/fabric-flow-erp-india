import jsPDF from 'jspdf';
import { generateCode128Barcode } from './barcodeUtils';

export interface PrintSettings {
  pageSize: 'a4' | 'letter' | 'custom';
  customWidth?: number;  // mm
  customHeight?: number; // mm
  marginTop: number;     // mm
  marginBottom: number;  // mm
  marginLeft: number;    // mm
  marginRight: number;   // mm
  labelsPerRow: number;
  labelSpacingHorizontal: number; // mm
  labelSpacingVertical: number;   // mm
}

export interface Product {
  sku?: string;
  class?: string;
  size?: string;
  name?: string;
  color?: string;
  category?: string;
}

// Label dimensions: 2" x 1" = 50.8mm x 25.4mm
const LABEL_WIDTH_MM = 50.8;
const LABEL_HEIGHT_MM = 25.4;

/**
 * Converts inches to millimeters
 */
function inchesToMM(inches: number): number {
  return inches * 25.4;
}

/**
 * Gets page dimensions in millimeters
 */
function getPageDimensions(settings: PrintSettings): { width: number; height: number } {
  switch (settings.pageSize) {
    case 'a4':
      return { width: 210, height: 297 }; // A4: 210mm x 297mm
    case 'letter':
      return { width: 215.9, height: 279.4 }; // US Letter: 8.5" x 11"
    case 'custom':
      return {
        width: settings.customWidth || 210,
        height: settings.customHeight || 297
      };
    default:
      return { width: 210, height: 297 };
  }
}

/**
 * Calculates usable area for labels (excluding margins)
 */
function getUsableArea(
  pageWidth: number,
  pageHeight: number,
  settings: PrintSettings
): { width: number; height: number } {
  return {
    width: pageWidth - settings.marginLeft - settings.marginRight,
    height: pageHeight - settings.marginTop - settings.marginBottom
  };
}

/**
 * Generates barcode labels PDF
 */
export async function generateBarcodeLabelsPDF(
  products: Product[],
  settings: PrintSettings
): Promise<void> {
  if (!products || products.length === 0) {
    throw new Error('No products selected for barcode generation');
  }

  // Validate all products have SKU
  const invalidProducts = products.filter(p => !p.sku || !p.sku.trim());
  if (invalidProducts.length > 0) {
    throw new Error(`${invalidProducts.length} product(s) are missing SKU values`);
  }

  // Get page dimensions
  const pageDimensions = getPageDimensions(settings);
  const usableArea = getUsableArea(
    pageDimensions.width,
    pageDimensions.height,
    settings
  );

  // Calculate how many labels fit per row and column
  const labelsPerRow = Math.floor(
    (usableArea.width + settings.labelSpacingHorizontal) /
    (LABEL_WIDTH_MM + settings.labelSpacingHorizontal)
  );
  
  const labelsPerColumn = Math.floor(
    (usableArea.height + settings.labelSpacingVertical) /
    (LABEL_HEIGHT_MM + settings.labelSpacingVertical)
  );

  const labelsPerPage = labelsPerRow * labelsPerColumn;

  if (labelsPerPage === 0) {
    throw new Error('Page margins are too large. No labels can fit on the page.');
  }

  // Create PDF document
  const pdf = new jsPDF({
    orientation: pageDimensions.width > pageDimensions.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: settings.pageSize === 'custom' && settings.customWidth && settings.customHeight
      ? [settings.customWidth, settings.customHeight]
      : settings.pageSize
  });

  let currentPage = 0;
  let labelIndex = 0;

  // Process all products
  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    // Calculate position on current page
    const row = Math.floor((labelIndex % labelsPerPage) / labelsPerRow);
    const col = labelIndex % labelsPerRow;

    // Check if we need a new page
    if (labelIndex > 0 && labelIndex % labelsPerPage === 0) {
      pdf.addPage();
      currentPage++;
    }

    // Calculate label position (including margins)
    const x = settings.marginLeft + col * (LABEL_WIDTH_MM + settings.labelSpacingHorizontal);
    const y = settings.marginTop + row * (LABEL_HEIGHT_MM + settings.labelSpacingVertical);

    // Draw label border (optional, helps with cutting)
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.1);
    pdf.rect(x, y, LABEL_WIDTH_MM, LABEL_HEIGHT_MM);

    // Set font and colors
    pdf.setTextColor(0, 0, 0);

    // Product Name (bold, larger font at top)
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    const productName = (product.name || 'N/A').substring(0, 30); // Limit length
    pdf.text(productName, x + LABEL_WIDTH_MM / 2, y + 3, {
      align: 'center',
      maxWidth: LABEL_WIDTH_MM - 2
    });

    // Class | Size (medium font)
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const classSize = `${product.class || 'N/A'} | ${product.size || 'N/A'}`;
    pdf.text(classSize, x + LABEL_WIDTH_MM / 2, y + 7, {
      align: 'center',
      maxWidth: LABEL_WIDTH_MM - 2
    });

    // Color (smaller font)
    pdf.setFontSize(7);
    const color = product.color || 'N/A';
    pdf.text(color, x + LABEL_WIDTH_MM / 2, y + 10, {
      align: 'center',
      maxWidth: LABEL_WIDTH_MM - 2
    });

    // Generate barcode
    try {
      const barcodeDataUrl = await generateCode128Barcode(product.sku!, {
        width: 1.5,
        height: 35,
        format: 'PNG',
        margin: 5
      });

      // Convert data URL to Image
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = barcodeDataUrl;
      });

      // Add barcode image to PDF
      // Position: Center of label, below text, above SKU
      // Calculate barcode dimensions to fit in label (max 40mm width, 10mm height)
      const maxBarcodeWidthMM = 40;
      const maxBarcodeHeightMM = 10;
      const barcodeAspectRatio = img.height / img.width;
      
      // Calculate size to fit within max dimensions while maintaining aspect ratio
      let barcodeWidthMM = maxBarcodeWidthMM;
      let barcodeHeightMM = barcodeWidthMM * barcodeAspectRatio;
      if (barcodeHeightMM > maxBarcodeHeightMM) {
        barcodeHeightMM = maxBarcodeHeightMM;
        barcodeWidthMM = barcodeHeightMM / barcodeAspectRatio;
      }
      
      const barcodeX = x + LABEL_WIDTH_MM / 2 - barcodeWidthMM / 2;
      const barcodeY = y + 13;
      
      pdf.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidthMM, barcodeHeightMM);

      // SKU text below barcode (small, readable)
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      const skuText = `SKU: ${product.sku}`;
      pdf.text(skuText, x + LABEL_WIDTH_MM / 2, y + LABEL_HEIGHT_MM - 2, {
        align: 'center',
        maxWidth: LABEL_WIDTH_MM - 2
      });
    } catch (error: any) {
      console.error(`Error generating barcode for SKU ${product.sku}:`, error);
      // Still add the label with text, but show error message
      pdf.setFontSize(6);
      pdf.setTextColor(255, 0, 0);
      pdf.text(`Barcode Error: ${product.sku}`, x + LABEL_WIDTH_MM / 2, y + 18, {
        align: 'center',
        maxWidth: LABEL_WIDTH_MM - 2
      });
    }

    labelIndex++;
  }

  // Save PDF
  pdf.save(`barcode-labels-${new Date().toISOString().split('T')[0]}.pdf`);
}
