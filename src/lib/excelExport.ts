import * as XLSX from 'xlsx';

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  data: any[];
  headers?: string[];
}

export const exportToExcel = (options: ExcelExportOptions) => {
  try {
    const { filename, sheetName = 'Sheet1', data, headers } = options;
    
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // If headers are provided, add them as the first row
    let exportData = data;
    if (headers && headers.length > 0) {
      exportData = [headers, ...data];
    }
    
    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generate Excel file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return false;
  }
};

export const exportInventoryOverview = (data: any[]) => {
  const headers = [
    'Item ID',
    'Item Name',
    'Category',
    'Current Stock',
    'Min Stock Level',
    'Max Stock Level',
    'Unit Price',
    'Total Value',
    'Last Updated',
    'Status'
  ];
  
  return exportToExcel({
    filename: 'inventory_overview',
    sheetName: 'Inventory Overview',
    data,
    headers
  });
};

export const exportProductCategories = (data: any[]) => {
  const headers = [
    'Category ID',
    'Category Name',
    'Description',
    'Image URL',
    'Fabrics',
    'Created At'
  ];
  
  return exportToExcel({
    filename: 'product_categories',
    sheetName: 'Product Categories',
    data,
    headers
  });
};

export const exportFabrics = (data: any[]) => {
  const headers = [
    'Fabric ID',
    'Fabric Code',
    'Fabric Name',
    'Type',
    'Color',
    'GSM',
    'UOM',
    'Rate',
    'HSN Code',
    'GST %',
    'Inventory',
    'Supplier 1',
    'Supplier 2',
    'Created At'
  ];
  
  return exportToExcel({
    filename: 'fabrics',
    sheetName: 'Fabrics',
    data,
    headers
  });
};

export const exportSizeTypes = (data: any[]) => {
  const headers = [
    'Size Type ID',
    'Size Name',
    'Available Sizes',
    'Created At'
  ];
  
  return exportToExcel({
    filename: 'size_types',
    sheetName: 'Size Types',
    data,
    headers
  });
};

export const exportInventoryItems = (data: any[]) => {
  const headers = [
    'Item ID',
    'Item Name',
    'Item Type',
    'Category',
    'Color',
    'Size',
    'Current Stock',
    'Min Stock Level',
    'Max Stock Level',
    'Unit Price',
    'Total Value',
    'Supplier',
    'Last Updated',
    'Status'
  ];
  
  return exportToExcel({
    filename: 'inventory_items',
    sheetName: 'Inventory Items',
    data,
    headers
  });
};
