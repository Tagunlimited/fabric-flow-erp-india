# Fabric Master Bulk Upload Guide

## Overview
This guide explains how to use the bulk upload feature for the new Fabric Master system. The bulk upload allows you to add multiple fabrics at once using a CSV file.

## Template Structure

The CSV template includes the following 16 fields:

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `fabric_code` | ✅ Yes | Unique identifier for the fabric | FAB001 |
| `fabric_description` | ❌ No | Detailed description of the fabric | Premium Cotton Jersey Fabric for T-shirts |
| `fabric_name` | ✅ Yes | Name of the fabric | Cotton Jersey |
| `fabric_for_supplier` | ❌ No | Supplier-specific fabric name (shown in purchase orders) | Cotton Jersey PO Name |
| `type` | ❌ No | Type or category of fabric | Cotton, Polyester, Denim |
| `color` | ❌ No | Color name | Black, White, Blue |
| `hex` | ❌ No | Hexadecimal color code | #000000, #FFFFFF |
| `gsm` | ❌ No | Grams per square meter | 180, 200, 250 |
| `uom` | ❌ No | Unit of measure | meters, yards, kg, pieces |
| `rate` | ❌ No | Price rate per unit | 150.00, 200.50 |
| `hsn_code` | ❌ No | HSN code for taxation | 5208, 5407 |
| `gst` | ❌ No | GST percentage | 18.00, 12.00 |
| `image` | ❌ No | Image URL (public URL) | https://example.com/image.jpg |
| `inventory` | ❌ No | Current stock quantity | 100, 50, 200 |
| `supplier1` | ❌ No | Primary supplier name | ABC Textiles |
| `supplier2` | ❌ No | Secondary supplier name | XYZ Fabrics |

## Sample Data

```csv
fabric_code,fabric_description,fabric_name,fabric_for_supplier,type,color,hex,gsm,uom,rate,hsn_code,gst,image,inventory,supplier1,supplier2
FAB001,Premium Cotton Jersey Fabric for T-shirts,Cotton Jersey,,Cotton,Black,#000000,180,meters,150.00,5208,18.00,,100,ABC Textiles,XYZ Fabrics
FAB002,Soft Polyester Blend Material,Poly Blend,Poly Blend Supplier Name,Polyester,White,#FFFFFF,200,meters,120.00,5407,18.00,,75,DEF Suppliers,GHI Textiles
FAB003,Heavy Denim Fabric for Jeans,Denim Fabric,,Denim,Blue,#0066CC,250,meters,200.00,5209,18.00,,50,JKL Denim Mills,MNO Textiles
```

## Field Guidelines

### Required Fields
- **fabric_code**: Must be unique across all fabrics. Use a consistent format like FAB001, FAB002, etc.
- **fabric_name**: The display name for the fabric. Should be descriptive and clear.

### Optional Fields
- **fabric_description**: Detailed description of the fabric properties and use cases
- **fabric_for_supplier**: Supplier-specific name for the fabric. This will be displayed in purchase orders instead of the fabric name. Leave empty if not needed.
- **type**: Common fabric types include Cotton, Polyester, Denim, Silk, Wool, etc.
- **color**: Standard color names (Black, White, Red, Blue, Green, etc.)
- **hex**: Color code in hexadecimal format (#RRGGBB). Use online color pickers to get accurate codes.
- **gsm**: Fabric weight in grams per square meter. Common values: 120-300
- **uom**: Unit of measure. Options: meters, yards, kg, pieces
- **rate**: Price per unit. Use decimal format (150.00, not 150)
- **hsn_code**: HSN code for GST purposes. Common codes: 5208 (Cotton), 5407 (Synthetic)
- **gst**: GST percentage. Use decimal format (18.00 for 18%)
- **image**: Public URL to fabric image. Leave empty if no image available
- **inventory**: Current stock quantity. Use numeric values only
- **supplier1**: Primary supplier name
- **supplier2**: Secondary supplier name

## Upload Process

1. **Download Template**: Click "Download Template CSV" button
2. **Fill Data**: Open the CSV file in Excel, Google Sheets, or any text editor
3. **Add Your Data**: Replace the sample data with your actual fabric information
4. **Save as CSV**: Ensure the file is saved in CSV format
5. **Upload**: Select the CSV file and click "Upload"

## Validation Rules

- **fabric_code**: Must be unique and not empty
- **fabric_name**: Must not be empty
- **hex**: Must be in valid hexadecimal format (#RRGGBB) if provided
- **rate**: Must be a valid number if provided
- **gst**: Must be a valid number between 0-100 if provided
- **inventory**: Must be a valid number if provided

## Common Issues and Solutions

### Issue: "Missing required columns" error
**Solution**: Ensure your CSV has the exact column names as in the template. Check for typos.

### Issue: "fabric_code already exists" error
**Solution**: Each fabric_code must be unique. Check for duplicates in your CSV file.

### Issue: Invalid hex color format
**Solution**: Use proper hexadecimal format (#RRGGBB). Examples: #000000, #FF0000, #00FF00

### Issue: Invalid numeric values
**Solution**: Ensure rate, gst, and inventory fields contain only numbers (no text or special characters)

## Tips for Success

1. **Start Small**: Test with 5-10 fabrics first before uploading large batches
2. **Check Data**: Review your CSV file for completeness and accuracy
3. **Backup**: Keep a backup of your original data
4. **Consistent Format**: Use consistent naming conventions for fabric codes
5. **Image URLs**: Ensure image URLs are publicly accessible if you're using them

## Support

If you encounter issues with the bulk upload:
1. Check the error message for specific field issues
2. Verify your CSV format matches the template exactly
3. Ensure all required fields are filled
4. Contact support if problems persist

---

**Note**: The bulk upload feature is designed to make fabric management efficient. Take time to prepare your data properly for the best results.
