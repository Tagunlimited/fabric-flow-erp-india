# Batch Assignment PDF Generation Debug Guide

## Issue Description

The batch assignment PDF generation functionality is not working. This guide helps debug and fix the issue.

## Debugging Steps

### 1. Check Console Logs

When you try to create a batch assignment, check the browser console for these logs:

**Expected Success Flow:**
```
🚀 Starting PDF generation process...
📊 Fetching stitching prices...
✅ Pricing data fetched: {cutting_price_single_needle: 25.50, cutting_price_overlock_flatlock: 30.00}
📋 Fetching order details...
✅ Order data fetched: {order_items: [...], ...}
🏢 Fetching company settings...
✅ Company settings fetched: {company_name: "...", ...}
🔧 Preparing batch assignment data...
✅ Batch assignments prepared: [...]
✅ Customizations prepared: {...}
📄 Calling PDF generation function...
🚀 Starting PDF generation with data: {...}
📸 Converting logo to base64...
✅ Logo converted successfully
📝 Creating HTML template...
✅ HTML template created
🎨 Creating temporary div for rendering...
✅ Temporary div created and added to DOM
🖼️ Converting HTML to canvas...
✅ Canvas created successfully
✅ Temporary div removed from DOM
📄 Creating PDF...
✅ PDF created successfully
💾 Downloading PDF with filename: Batch-Assignment-TUC/25-26/OCT/003-2024-01-15.pdf
🎉 PDF generation completed successfully!
```

**Common Error Patterns:**
- `❌ Error fetching pricing data:` - Missing order_assignments data
- `❌ Error fetching order data:` - Missing order or order_items
- `❌ Error fetching company settings:` - Missing company_settings
- `❌ Error generating batch assignment PDF:` - PDF generation library issue

### 2. Test PDF Generation Independently

**Option A: Use Test Function**
1. Open browser console
2. Copy and paste the contents of `test_batch_assignment_pdf.js`
3. Run `testBatchAssignmentPDF()`
4. Check if PDF downloads successfully

**Option B: Manual Test**
1. Open browser console
2. Run this code:
```javascript
// Test basic PDF generation
const pdf = new jsPDF();
pdf.text('Test PDF', 20, 20);
pdf.save('test.pdf');
```

### 3. Check Dependencies

Verify these packages are installed:
```bash
npm list jspdf html2canvas
```

If missing, install them:
```bash
npm install jspdf html2canvas
```

### 4. Check Database Data

**Verify Required Tables Exist:**
```sql
-- Check if these tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN (
  'order_assignments',
  'orders', 
  'order_items',
  'company_settings'
);
```

**Check Data Availability:**
```sql
-- Check order_assignments data
SELECT * FROM order_assignments WHERE order_id = 'your-order-id';

-- Check company_settings
SELECT * FROM company_settings LIMIT 1;

-- Check order with items
SELECT o.*, oi.* FROM orders o 
LEFT JOIN order_items oi ON o.id = oi.order_id 
WHERE o.id = 'your-order-id';
```

### 5. Common Issues and Solutions

#### Issue 1: Missing Dependencies
**Error:** `jsPDF is not defined` or `html2canvas is not defined`
**Solution:** Install missing packages
```bash
npm install jspdf html2canvas
```

#### Issue 2: Missing Database Data
**Error:** `❌ Error fetching pricing data:`
**Solution:** Ensure order_assignments table has data for the order
```sql
INSERT INTO order_assignments (order_id, cutting_price_single_needle, cutting_price_overlock_flatlock)
VALUES ('your-order-id', 25.50, 30.00);
```

#### Issue 3: Missing Company Settings
**Error:** `❌ Error fetching company settings:`
**Solution:** Ensure company_settings table has data
```sql
INSERT INTO company_settings (company_name, address, city, state, pincode, gstin, contact_phone, contact_email)
VALUES ('Your Company', 'Address', 'City', 'State', '123456', 'GSTIN123', '+91 9876543210', 'email@company.com');
```

#### Issue 4: Canvas Generation Fails
**Error:** `❌ Error generating batch assignment PDF:`
**Solution:** Check browser compatibility and try alternative approach
```javascript
// Alternative PDF generation approach
const pdf = new jsPDF();
pdf.text('Batch Assignment Sheet', 20, 20);
pdf.text('Order: ' + orderNumber, 20, 30);
pdf.save('batch-assignment.pdf');
```

#### Issue 5: Image Loading Issues
**Error:** Logo or product images not loading
**Solution:** Check image URLs and CORS settings
```javascript
// Test image loading
const img = new Image();
img.onload = () => console.log('Image loaded successfully');
img.onerror = () => console.log('Image failed to load');
img.src = 'your-image-url';
```

### 6. Browser Compatibility

**Supported Browsers:**
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

**Check Browser Console:**
- Open Developer Tools (F12)
- Check Console tab for errors
- Check Network tab for failed requests

### 7. Alternative PDF Generation

If the current approach fails, try this simpler version:

```javascript
export async function generateSimpleBatchAssignmentPDF(data) {
  const pdf = new jsPDF();
  
  // Header
  pdf.setFontSize(20);
  pdf.text('BATCH ASSIGNMENT SHEET', 20, 20);
  
  // Order Info
  pdf.setFontSize(12);
  pdf.text(`Order: ${data.orderNumber}`, 20, 40);
  pdf.text(`Customer: ${data.customerName}`, 20, 50);
  
  // Batch Assignments
  let y = 70;
  data.batchAssignments.forEach((batch, index) => {
    pdf.text(`Batch ${index + 1}: ${batch.batchName}`, 20, y);
    pdf.text(`Leader: ${batch.batchLeaderName}`, 20, y + 10);
    pdf.text(`Type: ${batch.tailorType}`, 20, y + 20);
    
    batch.sizeDistributions.forEach(size => {
      pdf.text(`${size.size}: ${size.quantity} pcs @ ₹${batch.pricePerPiece}`, 30, y + 30);
      y += 10;
    });
    y += 20;
  });
  
  // Save PDF
  const filename = `Batch-Assignment-${data.orderNumber}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
}
```

### 8. Testing Checklist

- [ ] Console shows all success logs
- [ ] No error messages in console
- [ ] PDF downloads automatically
- [ ] PDF contains correct data
- [ ] Company logo appears (if available)
- [ ] Product images appear (if available)
- [ ] Batch assignments are correct
- [ ] Pricing calculations are accurate

### 9. Quick Fix Commands

**Reset PDF Generation:**
```bash
# Clear browser cache
# Hard refresh page (Ctrl+Shift+R)
# Check console for errors
```

**Reinstall Dependencies:**
```bash
npm uninstall jspdf html2canvas
npm install jspdf html2canvas
```

**Test Database Connection:**
```sql
-- Test basic queries
SELECT COUNT(*) FROM order_assignments;
SELECT COUNT(*) FROM company_settings;
SELECT COUNT(*) FROM orders;
```

## Next Steps

1. **Run the debugging steps above**
2. **Check console logs during batch assignment**
3. **Test with the independent test function**
4. **Verify all database data exists**
5. **Try the alternative PDF generation if needed**

If issues persist, provide the specific error messages from the console for further assistance.
