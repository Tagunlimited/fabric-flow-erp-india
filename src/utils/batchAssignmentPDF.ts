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
    tailorType: 'single_needle' | 'overlock_flatlock';
    sizeDistributions: { size: string; quantity: number }[];
    pricePerPiece: number;
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
  stitchingPrices: {
    single_needle: number;
    overlock_flatlock: number;
  };
  customizations: {
    branding?: any;
    addons?: any;
    special_instructions?: string;
  };
  dueDate?: string;
}

export async function generateBatchAssignmentPDF(data: BatchAssignmentPDFData): Promise<void> {
  console.log('🚀 Starting PDF generation with data:', data);
  
  try {
    // Convert company logo to base64
    let logoBase64 = '';
    if (data.companySettings.logo_url) {
      try {
        console.log('📸 Converting logo to base64...');
        logoBase64 = await convertImageToBase64WithCache(data.companySettings.logo_url);
        console.log('✅ Logo converted successfully');
      } catch (error) {
        console.warn('⚠️ Failed to convert logo to base64:', error);
      }
    } else {
      console.log('ℹ️ No logo URL provided');
    }

    // Create HTML template
    console.log('📝 Creating HTML template...');
    const htmlContent = createHTMLTemplate(data, logoBase64);
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

    // Convert to canvas
    console.log('🖼️ Converting HTML to canvas...');
    const canvas = await html2canvas(tempDiv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 800,
      height: tempDiv.scrollHeight,
      logging: true
    });
    console.log('✅ Canvas created successfully');

    // Remove temporary div
    document.body.removeChild(tempDiv);
    console.log('✅ Temporary div removed from DOM');

    // Create PDF
    console.log('📄 Creating PDF...');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
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

function createHTMLTemplate(data: BatchAssignmentPDFData, logoBase64: string): string {
  const currentDate = new Date().toLocaleDateString('en-IN');
  
  return `
    <div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px;">
        <div style="flex: 1;">
          ${logoBase64 ? `<img src="${logoBase64}" style="max-width: 150px; max-height: 80px;" alt="Company Logo">` : '<div style="width: 150px; height: 80px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;">LOGO</div>'}
        </div>
        <div style="text-align: right; flex: 1;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold;">${data.companySettings.company_name || 'Company Name'}</h1>
          <p style="margin: 5px 0; font-size: 12px;">${data.companySettings.address || 'Address'}</p>
          <p style="margin: 5px 0; font-size: 12px;">${data.companySettings.city || 'City'}, ${data.companySettings.state || 'State'} - ${data.companySettings.pincode || 'Pincode'}</p>
          <p style="margin: 5px 0; font-size: 12px;">GSTIN: ${data.companySettings.gstin || 'GSTIN'}</p>
          <p style="margin: 5px 0; font-size: 12px;">Phone: ${data.companySettings.contact_phone || 'Phone'} | Email: ${data.companySettings.contact_email || 'Email'}</p>
        </div>
      </div>

      <!-- Title -->
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #2563eb;">BATCH ASSIGNMENT SHEET</h2>
      </div>

      <!-- Order Information -->
      <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">Order Information</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <strong>Order Number:</strong> ${data.orderNumber}<br>
            <strong>Customer:</strong> ${data.customerName}<br>
            <strong>Date:</strong> ${currentDate}
          </div>
          <div>
            <strong>Due Date:</strong> ${data.dueDate || 'Not specified'}<br>
            <strong>Total Batches:</strong> ${data.batchAssignments.length}<br>
            <strong>Total Pieces:</strong> ${data.batchAssignments.reduce((sum, batch) => 
              sum + batch.sizeDistributions.reduce((batchSum, size) => batchSum + size.quantity, 0), 0
            )}
          </div>
        </div>
      </div>

      <!-- Product Details -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">Product Details</h3>
        ${data.orderItems && data.orderItems.length > 0 ? data.orderItems.map(item => {
          const displayImage = getOrderItemDisplayImage(item);
          return `
          <div style="display: flex; align-items: center; margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
            ${displayImage ? 
              `<img src="${displayImage}" style="width: 60px; height: 60px; object-fit: cover; margin-right: 15px; border-radius: 3px;" alt="Product">` : 
              '<div style="width: 60px; height: 60px; background: #f0f0f0; margin-right: 15px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #666;">IMG</div>'
            }
            <div style="flex: 1;">
              <div style="font-weight: bold; margin-bottom: 5px;">${item.product_categories?.category_name || 'Product'}</div>
              <div style="font-size: 12px; color: #666;">
                ${item.fabrics ? `Fabric: ${item.fabrics.name}${item.fabrics.description ? ` - ${item.fabrics.description}` : ''}` : 'Fabric: Not specified'}<br>
                Description: ${item.product_description || 'No description'}
              </div>
            </div>
          </div>
        `;
        }).join('') : '<div style="padding: 10px; color: #666;">No product details available</div>'}
      </div>

      <!-- Customizations -->
      ${data.customizations.branding || data.customizations.addons || data.customizations.special_instructions ? `
        <div style="margin-bottom: 25px;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">Customizations</h3>
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
            ${data.customizations.branding ? `
              <div style="margin-bottom: 10px;">
                <strong>Branding:</strong> ${JSON.stringify(data.customizations.branding)}
              </div>
            ` : ''}
            ${data.customizations.addons ? `
              <div style="margin-bottom: 10px;">
                <strong>Addons:</strong> ${JSON.stringify(data.customizations.addons)}
              </div>
            ` : ''}
            ${data.customizations.special_instructions ? `
              <div>
                <strong>Special Instructions:</strong> ${data.customizations.special_instructions}
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Batch Assignments -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #333;">Batch Assignments</h3>
        ${data.batchAssignments.map((batch, index) => {
          const batchTotal = batch.sizeDistributions.reduce((sum, size) => sum + size.quantity, 0);
          const batchEarnings = batch.sizeDistributions.reduce((sum, size) => sum + (size.quantity * batch.pricePerPiece), 0);
          
          return `
            <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
              <div style="background: #f8f9fa; padding: 10px; border-bottom: 1px solid #ddd;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong style="font-size: 14px;">Batch ${index + 1}: ${batch.batchName}</strong><br>
                    <span style="font-size: 12px; color: #666;">Leader: ${batch.batchLeaderName} | Type: ${batch.tailorType.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 12px; color: #666;">Total Pieces: ${batchTotal}</div>
                    <div style="font-size: 14px; font-weight: bold; color: #2563eb;">₹${batchEarnings.toFixed(2)}</div>
                  </div>
                </div>
              </div>
              <div style="padding: 15px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                  <thead>
                    <tr style="background: #f8f9fa;">
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Size</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Quantity</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Price/Pc</th>
                      <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${batch.sizeDistributions.map(size => `
                      <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">${size.size}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${size.quantity}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">₹${batch.pricePerPiece.toFixed(2)}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">₹${(size.quantity * batch.pricePerPiece).toFixed(2)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Summary -->
      <div style="margin-top: 30px; padding: 15px; background: #e7f3ff; border-radius: 5px; border-left: 4px solid #2563eb;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">Summary</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <strong>Total Pieces:</strong> ${data.batchAssignments.reduce((sum, batch) => 
              sum + batch.sizeDistributions.reduce((batchSum, size) => batchSum + size.quantity, 0), 0
            )}
          </div>
          <div>
            <strong>Total Estimated Earnings:</strong> ₹${data.batchAssignments.reduce((sum, batch) => 
              sum + batch.sizeDistributions.reduce((batchSum, size) => batchSum + (size.quantity * batch.pricePerPiece), 0), 0
            ).toFixed(2)}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 15px;">
        <p>This batch assignment sheet was generated on ${currentDate}</p>
        <p>Please ensure all batch leaders receive their respective assignments and understand the requirements.</p>
      </div>
    </div>
  `;
}