// Test function for batch assignment PDF generation
// This can be called from browser console to test PDF generation

import { generateBatchAssignmentPDF } from './src/utils/batchAssignmentPDF';

export const testBatchAssignmentPDF = async () => {
  console.log('🧪 Testing Batch Assignment PDF Generation...');
  
  const testData = {
    orderNumber: 'TUC/TEST/001',
    customerName: 'Test Customer',
    orderItems: [
      {
        product_category: {
          category_name: 'Polo T-shirt',
          category_image_url: 'https://via.placeholder.com/60x60/2563eb/ffffff?text=POLO'
        },
        fabric_master: {
          fabric_name: 'Cotton',
          color: 'Blue',
          gsm: '180',
          image: 'https://via.placeholder.com/60x60/3b82f6/ffffff?text=FABRIC'
        },
        product_description: 'Test polo shirt'
      }
    ],
    batchAssignments: [
      {
        batchName: 'Batch A',
        batchLeaderName: 'John Doe',
        tailorType: 'single_needle' as const,
        sizeDistributions: [
          { size: 'S', quantity: 5 },
          { size: 'M', quantity: 10 },
          { size: 'L', quantity: 8 }
        ],
        pricePerPiece: 25.50
      },
      {
        batchName: 'Batch B',
        batchLeaderName: 'Jane Smith',
        tailorType: 'overlock_flatlock' as const,
        sizeDistributions: [
          { size: 'XL', quantity: 6 },
          { size: '2XL', quantity: 4 }
        ],
        pricePerPiece: 30.00
      }
    ],
    companySettings: {
      company_name: 'Test Company',
      address: '123 Test Street',
      city: 'Test City',
      state: 'Test State',
      pincode: '123456',
      logo_url: 'https://via.placeholder.com/150x80/2563eb/ffffff?text=LOGO',
      gstin: 'TEST123456789',
      contact_phone: '+91 9876543210',
      contact_email: 'test@company.com'
    },
    stitchingPrices: {
      single_needle: 25.50,
      overlock_flatlock: 30.00
    },
    customizations: {
      branding: [
        {
          branding_type: 'Embroidery',
          position: 'Chest',
          colors: 'Blue, White'
        }
      ],
      addons: [
        {
          addon_name: 'Drawcord',
          quantity: 50,
          unit_price: 2.50
        }
      ],
      special_instructions: 'Handle with care, ensure quality stitching'
    },
    dueDate: '2024-02-15'
  };

  try {
    await generateBatchAssignmentPDF(testData);
    console.log('✅ Test PDF generation completed successfully!');
  } catch (error) {
    console.error('❌ Test PDF generation failed:', error);
  }
};

// Usage: Call testBatchAssignmentPDF() in browser console
console.log('📋 Test function available: testBatchAssignmentPDF()');
