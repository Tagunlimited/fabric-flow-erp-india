import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { convertImageToBase64WithCache } from '@/utils/imageUtils';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';

interface BatchAssignmentPDFData {
  orderNumber: string;
  customerName: string;
  orderItems: any[];
  batchAssignments: {
    batchName: string;
    batchLeaderName: string;
    batchLeaderAvatarUrl?: string;
    tailorType: 'single_needle' | 'overlock_flatlock';
    sizeDistributions: { size: string; quantity: number }[];
    snRate: number;
    ofRate: number;
    totalEarning: number;
    assignedQuantity: number;
  }[];
  companySettings: {
    company_name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    logo_url?: string;
    gstin: string;
    contact_phone: string;
    contact_email: string;
  };
  salesManager?: {
    name: string;
    avatarUrl?: string;
  };
  customizations: Array<{
    partId?: string;
    partName?: string;
    selectedAddonId?: string;
    selectedAddonName?: string;
    selectedAddonImageUrl?: string;
    selectedAddonImageAltText?: string;
    customValue?: string;
    quantity?: number;
    priceImpact?: number;
  }>;
  dueDate?: string;
}

export async function generateBatchAssignmentPDF(data: BatchAssignmentPDFData): Promise<void> {
  console.log('🚀 Starting PDF generation with data:', data);
  
  try {
    // Helper function to compress images
    const compressImageToBase64 = async (imageUrl: string, maxWidth: number, maxHeight?: number): Promise<string> => {
      try {
        const url = await convertImageToBase64WithCache(imageUrl);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        return new Promise((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
            
            if (maxHeight && height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            } else {
              reject(new Error('Failed to get canvas context'));
            }
          };
          img.onerror = reject;
        });
      } catch (error) {
        console.warn('Failed to compress image:', error);
        throw error;
      }
    };

    // Convert company logo to base64 with compression
    let logoBase64 = '';
    if (data.companySettings.logo_url) {
      try {
        console.log('📸 Converting logo to base64...');
        logoBase64 = await compressImageToBase64(data.companySettings.logo_url, 150);
        console.log('✅ Logo converted and compressed successfully');
      } catch (error) {
        console.warn('⚠️ Failed to convert logo to base64:', error);
      }
    } else {
      console.log('ℹ️ No logo URL provided');
    }

    // Convert sales manager avatar
    let salesManagerAvatarBase64 = '';
    if (data.salesManager?.avatarUrl) {
      try {
        salesManagerAvatarBase64 = await compressImageToBase64(data.salesManager.avatarUrl, 80, 80);
      } catch (error) {
        console.warn('⚠️ Failed to convert sales manager avatar:', error);
      }
    }

    // Convert batch leader avatars and product images
    const batchLeaderAvatars: Record<string, string> = {};
    for (const batch of data.batchAssignments) {
      if (batch.batchLeaderAvatarUrl) {
        try {
          batchLeaderAvatars[batch.batchName] = await compressImageToBase64(batch.batchLeaderAvatarUrl, 100, 100);
        } catch (error) {
          console.warn(`⚠️ Failed to convert batch leader avatar for ${batch.batchName}:`, error);
        }
      }
    }

    // Convert product images
    const productImages: Record<string, string> = {};
    for (const item of data.orderItems) {
      const displayImage = getOrderItemDisplayImage(item);
      if (displayImage) {
        try {
          productImages[item.id] = await compressImageToBase64(displayImage, 120, 120);
        } catch (error) {
          console.warn(`⚠️ Failed to convert product image for item ${item.id}:`, error);
        }
      }
    }

    // Convert customization images
    const customizationImages: Record<string, string> = {};
    for (const cust of data.customizations) {
      if (cust.selectedAddonImageUrl) {
        const key = cust.selectedAddonImageUrl;
        if (!customizationImages[key]) {
          try {
            customizationImages[key] = await compressImageToBase64(cust.selectedAddonImageUrl, 60, 60);
          } catch (error) {
            console.warn(`⚠️ Failed to convert customization image:`, error);
          }
        }
      }
    }

    // Create HTML template
    console.log('📝 Creating HTML template...');
    const htmlContent = createHTMLTemplate(data, {
      logoBase64,
      salesManagerAvatarBase64,
      batchLeaderAvatars,
      productImages,
      customizationImages
    });
    console.log('✅ HTML template created');
    
    // Create a temporary div to render the HTML
    console.log('🎨 Creating temporary div for rendering...');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '800px';
    tempDiv.style.backgroundColor = 'white';
    tempDiv.style.fontFamily = 'Arial, sans-serif';
    tempDiv.style.fontSize = '12px';
    tempDiv.style.lineHeight = '1.4';
    tempDiv.style.padding = '20px';
    document.body.appendChild(tempDiv);
    console.log('✅ Temporary div created and added to DOM');

    // Wait a bit for the DOM to render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Convert to canvas with lower scale for smaller file size
    console.log('🖼️ Converting HTML to canvas...');
    const canvas = await html2canvas(tempDiv, {
      scale: 1.5, // Reduced from 2 to reduce file size
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 800,
      height: tempDiv.scrollHeight,
      logging: false,
      imageTimeout: 15000
    });
    console.log('✅ Canvas created successfully');

    // Remove temporary div
    document.body.removeChild(tempDiv);
    console.log('✅ Temporary div removed from DOM');

    // Compress image to JPEG with quality for smaller file size
    const compressImage = (canvas: HTMLCanvasElement, quality: number = 0.7): string => {
      return canvas.toDataURL('image/jpeg', quality);
    };

    // Create PDF
    console.log('📄 Creating PDF...');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    // Use compressed JPEG instead of PNG
    const compressedImage = compressImage(canvas, 0.7);
    pdf.addImage(compressedImage, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(compressedImage, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    console.log('✅ PDF created successfully');

    // Generate filename and download
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `Batch-Assignment-${data.orderNumber}-${currentDate}.pdf`;
    console.log('💾 Downloading PDF with filename:', filename);
    pdf.save(filename);
    console.log('🎉 PDF generation completed successfully!');

  } catch (error) {
    console.error('❌ Error generating batch assignment PDF:', error);
    throw error;
  }
}

interface ImageCache {
  logoBase64: string;
  salesManagerAvatarBase64: string;
  batchLeaderAvatars: Record<string, string>;
  productImages: Record<string, string>;
  customizationImages: Record<string, string>;
}

function createHTMLTemplate(data: BatchAssignmentPDFData, images: ImageCache): string {
  const currentDate = new Date().toLocaleDateString('en-IN');
  const deliveryDate = data.dueDate 
    ? new Date(data.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Not specified';
  
  // Get first product item for display
  const firstProduct = data.orderItems && data.orderItems.length > 0 ? data.orderItems[0] : null;
  const productImage = firstProduct && images.productImages[firstProduct.id] 
    ? images.productImages[firstProduct.id]
    : null;
  const productName = firstProduct?.product_categories?.category_name || 'Product';

  return `
    <div style="padding: 20px; font-family: Arial, sans-serif; color: #333; background: white;">
      <!-- Header Section -->
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="margin: 0 0 5px 0; font-size: 24px; font-weight: bold;">${data.companySettings.company_name || 'Company Name'}</h1>
        <h2 style="margin: 0; font-size: 18px; font-weight: bold;">Batch Assignment Sheet</h2>
      </div>

      <!-- Order Info and Sales Manager -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid #ddd;">
        <!-- Left: Order Details -->
        <div style="flex: 1;">
          <div style="margin-bottom: 5px;">
            <strong>Order No:</strong> ${data.orderNumber}
          </div>
          <div>
            <strong>Delivery Date:</strong> ${deliveryDate}
          </div>
        </div>
        
        <!-- Right: Sales Manager -->
        <div style="flex: 1; text-align: right;">
          <div style="margin-bottom: 5px; font-weight: bold;">Sales Manager</div>
          ${data.salesManager ? `
            <div style="display: inline-flex; flex-direction: column; align-items: center;">
              ${images.salesManagerAvatarBase64 
                ? `<img src="${images.salesManagerAvatarBase64}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 5px; border: 2px solid #ddd;" alt="Sales Manager">`
                : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #e0e0e0; display: flex; align-items: center; justify-content: center; margin-bottom: 5px; font-size: 20px; font-weight: bold; color: #666;">${data.salesManager.name.charAt(0).toUpperCase()}</div>`
              }
              <div style="font-size: 12px; text-align: center;">${data.salesManager.name}</div>
            </div>
          ` : '<div style="font-size: 12px; color: #666;">Not assigned</div>'}
        </div>
      </div>

      <!-- Batch Assignment Cards -->
      ${data.batchAssignments.map((batch, index) => {
        const batchLeaderAvatar = images.batchLeaderAvatars[batch.batchName] || '';
        
        // Get all sizes and their quantities
        const allSizes = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
        const sizeQuantities: Record<string, number> = {};
        batch.sizeDistributions.forEach(sd => {
          sizeQuantities[sd.size] = sd.quantity;
        });

        return `
          <div style="margin-bottom: 30px; border: 2px solid #ddd; border-radius: 8px; padding: 15px; page-break-inside: avoid;">
            <!-- Batch Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd;">
              <div>
                <div style="font-size: 11px; color: #666; margin-bottom: 3px;">Order No: ${data.orderNumber}</div>
                <div style="font-size: 16px; font-weight: bold;">BAT-${index + 1}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">Total Earning: INR ${batch.totalEarning.toFixed(0)}</div>
                <div style="font-size: 12px; font-weight: bold; margin-bottom: 3px;">Assigned Qty: ${batch.assignedQuantity} Pcs</div>
                <div style="font-size: 11px; color: #666;">SN: ${batch.snRate}, OF: ${batch.ofRate}</div>
              </div>
            </div>

            <!-- Batch Body: 2-Column Layout -->
            <div style="display: flex; gap: 20px;">
              <!-- Left Column -->
              <div style="flex: 1;">
                <!-- Batch Leader -->
                <div style="margin-bottom: 20px;">
                  <div style="display: flex; flex-direction: column; align-items: center;">
                    ${batchLeaderAvatar 
                      ? `<img src="${batchLeaderAvatar}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; border: 2px solid #ddd;" alt="Batch Leader">`
                      : `<div style="width: 100px; height: 100px; border-radius: 50%; background: #e0e0e0; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; font-size: 32px; font-weight: bold; color: #666; border: 2px solid #ddd;">${batch.batchLeaderName.charAt(0).toUpperCase()}</div>`
                    }
                    <div style="font-size: 13px; font-weight: bold; text-align: center;">${batch.batchLeaderName}</div>
                  </div>
                </div>

                <!-- Product Mockup -->
                <div style="margin-top: 20px;">
                  ${productImage 
                    ? `<img src="${productImage}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 5px; border: 1px solid #ddd; display: block; margin: 0 auto 8px;" alt="Product">`
                    : `<div style="width: 120px; height: 120px; background: #f0f0f0; border-radius: 5px; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; font-size: 10px; color: #666;">IMG</div>`
                  }
                  <div style="font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 3px;">${productName}</div>
                  <div style="font-size: 11px; color: #666; text-align: center;">Product Description</div>
                </div>
              </div>

              <!-- Right Column -->
              <div style="flex: 1;">
                <!-- Size Distribution Table -->
                <div style="margin-bottom: 20px;">
                  <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 8px;">
                    ${allSizes.map(size => `
                      <div style="text-align: center; padding: 8px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 3px; font-weight: bold; font-size: 12px;">
                        ${size}
                      </div>
                    `).join('')}
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px;">
                    ${allSizes.map(size => `
                      <div style="text-align: center; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;">
                        ${sizeQuantities[size] || 0}
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Customizations -->
                ${data.customizations && data.customizations.length > 0 ? `
                  <div>
                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 10px;">Customizations</div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                      ${data.customizations.map((cust, custIdx) => {
                        const custImage = cust.selectedAddonImageUrl && images.customizationImages[cust.selectedAddonImageUrl]
                          ? images.customizationImages[cust.selectedAddonImageUrl]
                          : null;
                        const label = cust.partName || 'Customization';
                        const value = cust.selectedAddonName || cust.customValue || '';
                        
                        return `
                          <div style="display: flex; align-items: center; gap: 10px;">
                            ${custImage
                              ? `<img src="${custImage}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 5px; border: 1px solid #ddd;" alt="${label}">`
                              : `<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 5px; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #666;">IMG</div>`
                            }
                            <div>
                              <div style="font-size: 11px; font-weight: bold;">${label}:</div>
                              <div style="font-size: 10px; color: #666;">${value}</div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : '<div style="font-size: 11px; color: #999;">No customizations</div>'}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}