import React, { useState, useEffect, Fragment } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  X,
  Save,
  History,
  Barcode,
  AlertCircle,
  Package,
  Upload,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  getAdjustmentReasons,
  createAdjustmentReason,
  searchProducts,
  getProductBySKU,
  getProductStock,
  getBinsForProduct,
  createInventoryAdjustment,
  getAdjustmentHistory,
  type AdjustmentReason,
  type AdjustmentItem,
  type BinInfo,
  type BinAdjustment
} from '@/utils/inventoryAdjustmentAPI';

interface Product {
  id: string;
  sku?: string;
  name?: string;
  class?: string;
  color?: string;
  size?: string;
  category?: string;
  brand?: string;
  current_stock?: number;
}

export function InventoryAdjustment() {
  const { user, profile } = useAuth();
  const { toast: toastHook } = useToast();

  // State
  const [adjustmentType, setAdjustmentType] = useState<'ADD' | 'REMOVE' | 'REPLACE'>('ADD');
  const [reasonId, setReasonId] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  
  // Reason management
  const [reasons, setReasons] = useState<AdjustmentReason[]>([]);
  const [newReasonName, setNewReasonName] = useState<string>('');
  const [newReasonDescription, setNewReasonDescription] = useState<string>('');
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [reasonLoading, setReasonLoading] = useState(false);

  // Product search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [searchLoading, setSearchLoading] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<InventoryAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Save
  const [saving, setSaving] = useState(false);

  // Bulk Upload
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // Load reasons on mount
  useEffect(() => {
    loadReasons();
    loadHistory();
  }, []);

  const loadReasons = async () => {
    try {
      const data = await getAdjustmentReasons();
      setReasons(data);
    } catch (error: any) {
      console.error('Error loading reasons:', error);
      toast.error('Failed to load adjustment reasons');
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const data = await getAdjustmentHistory({ limit: 50 });
      setHistory(data);
    } catch (error: any) {
      console.error('Error loading history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCreateReason = async () => {
    if (!newReasonName.trim()) {
      toast.error('Please enter a reason name');
      return;
    }

    try {
      setReasonLoading(true);
      const newReason = await createAdjustmentReason(newReasonName.trim(), newReasonDescription.trim() || undefined);
      setReasons([...reasons, newReason]);
      setReasonId(newReason.id);
      setNewReasonName('');
      setNewReasonDescription('');
      setShowReasonDialog(false);
      toast.success('Reason created successfully');
    } catch (error: any) {
      console.error('Error creating reason:', error);
      toast.error(error.message || 'Failed to create reason');
    } finally {
      setReasonLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const results = await searchProducts(query);
      setSearchResults(results);
    } catch (error: any) {
      console.error('Error searching products:', error);
      toast.error('Failed to search products');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleBarcodeScan = async (sku: string) => {
    if (!sku.trim()) return;

    try {
      const product = await getProductBySKU(sku.trim());
      if (!product) {
        toast.error(`Product with SKU "${sku}" not found`);
        return;
      }

      await addProductToItems(product);
      setBarcodeInput('');
    } catch (error: any) {
      console.error('Error looking up product:', error);
      toast.error('Failed to lookup product');
    }
  };

  const handleBarcodeInputChange = (value: string) => {
    setBarcodeInput(value);
    // Auto-submit when Enter is pressed (barcode scanners usually send Enter)
    if (value.includes('\n') || value.endsWith('\r')) {
      const sku = value.trim().replace(/\n|\r/g, '');
      handleBarcodeScan(sku);
    }
  };

  const addProductToItems = async (product: Product) => {
    if (!product.id || !product.sku) {
      toast.error('Invalid product data');
      return;
    }

    // Check if product already in items
    const existingIndex = items.findIndex(item => item.product_id === product.id);

    if (existingIndex >= 0) {
      // Increment quantity by 1 if already exists (for barcode scanning)
      const existingItem = items[existingIndex];
      setItems(items.map((item, idx) => 
        idx === existingIndex
          ? { ...item, adjustment_quantity: item.adjustment_quantity + 1 }
          : item
      ));
      toast.success(`${product.name || product.sku} quantity incremented`);
      return;
    }

    // Get current stock
    let currentStock = product.current_stock || 0;
    try {
      currentStock = await getProductStock(product.id);
    } catch (error) {
      console.error('Error fetching stock:', error);
    }

    // Fetch bins for this product
    let bins: BinInfo[] = [];
    try {
      bins = await getBinsForProduct(product.id, product.sku);
    } catch (error) {
      console.error('Error fetching bins:', error);
    }

    // Calculate quantities based on adjustment type
    let adjustmentQty = 1;
    let afterQty = currentStock;
    let replaceQty: number | undefined;

    if (adjustmentType === 'ADD') {
      afterQty = currentStock + adjustmentQty;
    } else if (adjustmentType === 'REMOVE') {
      if (currentStock < adjustmentQty) {
        toast.error(`Insufficient stock. Available: ${currentStock}`);
        return;
      }
      afterQty = currentStock - adjustmentQty;
    } else if (adjustmentType === 'REPLACE') {
      replaceQty = currentStock; // Default to current stock, user can change
      afterQty = currentStock;
      adjustmentQty = 0; // Will be calculated when user sets new quantity
    }

    const newItem: AdjustmentItem = {
      product_id: product.id,
      sku: product.sku,
      product_name: product.name || product.sku,
      product_class: product.class,
      product_color: product.color,
      product_size: product.size,
      product_category: product.category,
      product_brand: product.brand,
      quantity_before: currentStock,
      adjustment_quantity: adjustmentQty,
      quantity_after: afterQty,
      replace_quantity: replaceQty,
      unit: 'pcs',
      bins: bins, // Available bins with quantities
      bin_adjustments: [], // Will be populated automatically on save
      selected_bin_ids: new Set<string>() // Track selected bins for this item
    };

    setItems([...items, newItem]);
    toast.success(`${product.name || product.sku} added to adjustment`);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const item = items[index];
    let newAfterQty = item.quantity_before;
    let adjustmentQty = quantity;
    let replaceQty: number | undefined;

    if (adjustmentType === 'ADD') {
      newAfterQty = item.quantity_before + quantity;
      adjustmentQty = quantity;
    } else if (adjustmentType === 'REMOVE') {
      if (quantity > item.quantity_before) {
        toast.error(`Cannot remove more than available stock (${item.quantity_before})`);
        return;
      }
      newAfterQty = item.quantity_before - quantity;
      adjustmentQty = quantity;
    } else if (adjustmentType === 'REPLACE') {
      newAfterQty = quantity;
      replaceQty = quantity;
      // For REPLACE, adjustment_quantity should be the absolute difference
      adjustmentQty = Math.abs(quantity - item.quantity_before);
    }

    setItems(items.map((itm, idx) => 
      idx === index
        ? { 
            ...itm, 
            adjustment_quantity: adjustmentQty,
            replace_quantity: replaceQty,
            quantity_after: newAfterQty
          }
        : itm
    ));
  };

  const toggleBinSelection = (itemIndex: number, binId: string) => {
    const item = items[itemIndex];
    const selectedBinIds = item.selected_bin_ids || new Set<string>();
    const newSelectedBinIds = new Set(selectedBinIds);
    
    if (newSelectedBinIds.has(binId)) {
      newSelectedBinIds.delete(binId);
    } else {
      newSelectedBinIds.add(binId);
    }
    
    setItems(items.map((itm, idx) => 
      idx === itemIndex
        ? { ...itm, selected_bin_ids: newSelectedBinIds }
        : itm
    ));
  };

  // Calculate and distribute quantities across selected bins
  const calculateBinAdjustments = (item: AdjustmentItem): BinAdjustment[] => {
    const selectedBinIds = item.selected_bin_ids || new Set<string>();
    if (selectedBinIds.size === 0) {
      return [];
    }

    const binAdjustments: BinAdjustment[] = [];
    const selectedBins = item.bins?.filter(b => selectedBinIds.has(b.bin_id)) || [];

    if (adjustmentType === 'ADD') {
      // Distribute the total adjustment quantity evenly across selected bins
      const totalAdjustment = item.adjustment_quantity;
      const numBins = selectedBins.length;
      const baseQtyPerBin = Math.floor(totalAdjustment / numBins);
      const remainder = totalAdjustment % numBins;

      selectedBins.forEach((bin, index) => {
        const adjustmentQty = baseQtyPerBin + (index < remainder ? 1 : 0);
        binAdjustments.push({
          bin_id: bin.bin_id,
          bin_code: bin.bin_code,
          quantity_before: bin.current_quantity,
          adjustment_quantity: adjustmentQty,
          quantity_after: bin.current_quantity + adjustmentQty
        });
      });
    } else if (adjustmentType === 'REMOVE') {
      // Remove from selected bins based on available quantity
      let totalAdjustment = item.adjustment_quantity;
      
      for (const bin of selectedBins) {
        if (totalAdjustment <= 0) break;
        
        const removableQty = Math.min(totalAdjustment, bin.current_quantity);
        if (removableQty > 0) {
          binAdjustments.push({
            bin_id: bin.bin_id,
            bin_code: bin.bin_code,
            quantity_before: bin.current_quantity,
            adjustment_quantity: removableQty,
            quantity_after: bin.current_quantity - removableQty
          });
          totalAdjustment -= removableQty;
        }
      }

      if (totalAdjustment > 0) {
        throw new Error(`Not enough stock in selected bins to remove ${totalAdjustment} more. Available in selected bins: ${item.bins!.filter(b => selectedBinIds.has(b.bin_id)).reduce((sum, b) => sum + b.current_quantity, 0)}`);
      }
    } else if (adjustmentType === 'REPLACE') {
      // Distribute target quantity evenly across selected bins
      const targetTotalQty = item.replace_quantity ?? item.quantity_after;
      const numBins = selectedBins.length;
      const baseQtyPerBin = Math.floor(targetTotalQty / numBins);
      const remainder = targetTotalQty % numBins;

      selectedBins.forEach((bin, index) => {
        const targetQty = baseQtyPerBin + (index < remainder ? 1 : 0);
        const adjustmentQty = targetQty - bin.current_quantity;
        
        binAdjustments.push({
          bin_id: bin.bin_id,
          bin_code: bin.bin_code,
          quantity_before: bin.current_quantity,
          adjustment_quantity: Math.abs(adjustmentQty),
          quantity_after: targetQty
        });
      });
    }

    return binAdjustments;
  };

  const handleSave = async () => {
    // Validation
    if (items.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    if (!reasonId && !customReason.trim()) {
      toast.error('Please select or enter a reason');
      return;
    }

    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    // Validate quantities and bin selections
    const itemsWithBinAdjustments = [];
    
    for (const item of items) {
      if (adjustmentType === 'ADD' && item.adjustment_quantity <= 0) {
        toast.error(`Invalid quantity for ${item.sku}. Quantity must be greater than 0.`);
        return;
      }

      if (adjustmentType === 'REMOVE') {
        if (item.adjustment_quantity <= 0) {
          toast.error(`Invalid quantity for ${item.sku}. Quantity must be greater than 0.`);
          return;
        }
        if (item.adjustment_quantity > item.quantity_before) {
          toast.error(`Cannot remove ${item.adjustment_quantity} from ${item.sku}. Available: ${item.quantity_before}`);
          return;
        }
      }

      if (adjustmentType === 'REPLACE') {
        if (item.replace_quantity === undefined || item.replace_quantity < 0) {
          toast.error(`Invalid replace quantity for ${item.sku}`);
          return;
        }
        // Update adjustment_quantity to be the absolute difference
        const diff = Math.abs(item.replace_quantity - item.quantity_before);
        item.adjustment_quantity = diff;
        item.quantity_after = item.replace_quantity;
      }

      // Check if bins are selected
      const selectedBinIds = item.selected_bin_ids || new Set<string>();
      if (selectedBinIds.size === 0) {
        toast.error(`Please select at least one bin for ${item.sku}`);
        return;
      }

      // Calculate bin adjustments automatically
      try {
        const binAdjustments = calculateBinAdjustments(item);
        itemsWithBinAdjustments.push({
          ...item,
          bin_adjustments: binAdjustments
        });
      } catch (error: any) {
        toast.error(error.message || `Error calculating bin adjustments for ${item.sku}`);
        return;
      }
    }

    try {
      setSaving(true);
      await createInventoryAdjustment(
        adjustmentType,
        itemsWithBinAdjustments,
        reasonId || undefined,
        customReason.trim() || undefined,
        notes.trim() || undefined,
        user.id,
        user.email || undefined
      );

      toast.success(`Inventory adjustment completed successfully`);
      
      // Reset form
      setItems([]);
      setReasonId('');
      setCustomReason('');
      setNotes('');
      setSearchQuery('');
      setBarcodeInput('');
      
      // Reload history
      await loadHistory();
    } catch (error: any) {
      console.error('Error saving adjustment:', error);
      toast.error(error.message || 'Failed to save adjustment');
    } finally {
      setSaving(false);
    }
  };

  // Download template for bulk upload
  const handleDownloadTemplate = () => {
    // Create Excel workbook with multiple sheets
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Data Entry Template
    const dataHeaders = ['SKU', 'Quantity', 'Adjustment Type', 'Reason Name', 'Bin IDs', 'Notes'];
    const sampleRows = [
      ['NC-APEX-L', '10', 'ADD', 'Sold on Amazon', 'BIN1,BIN2', 'First adjustment'],
      ['NC-APEX-L', '5', 'REMOVE', 'Damaged Goods', 'BIN1', 'Damaged items removed'],
      ['NC-DOT-WH-S', '20', 'REPLACE', 'Stock Correction', 'BIN2', 'Corrected stock count']
    ];
    
    const dataSheet = [dataHeaders, ...sampleRows];
    const wsData = XLSX.utils.aoa_to_sheet(dataSheet);
    
    // Style the header row
    wsData['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 10 }, // Quantity
      { wch: 18 }, // Adjustment Type
      { wch: 20 }, // Reason Name
      { wch: 25 }, // Bin IDs
      { wch: 30 }  // Notes
    ];
    
    XLSX.utils.book_append_sheet(workbook, wsData, 'Data Entry');

    // Sheet 2: Instructions
    const instructions = [
      ['INVENTORY ADJUSTMENT BULK UPLOAD - INSTRUCTIONS'],
      [''],
      ['GENERAL INFORMATION'],
      ['This template allows you to adjust inventory for multiple products at once.'],
      ['You can include the same SKU multiple times if adjusting different bins.'],
      [''],
      ['REQUIRED FIELDS'],
      ['SKU', 'Product SKU code (must exist in product master)'],
      ['Quantity', 'Adjustment quantity (must be greater than 0)'],
      [''],
      ['OPTIONAL FIELDS'],
      ['Adjustment Type', 'ADD, REMOVE, or REPLACE (defaults to selected type in UI)'],
      ['Reason Name', 'Reason for adjustment (will create custom reason if not found)'],
      ['Bin IDs', 'Comma-separated bin IDs or codes (e.g., BIN1,BIN2)'],
      ['Notes', 'Additional notes for this adjustment'],
      [''],
      ['ADJUSTMENT TYPES'],
      ['ADD', 'Increases inventory by the specified quantity'],
      ['REMOVE', 'Decreases inventory by the specified quantity (validates available stock)'],
      ['REPLACE', 'Sets inventory to the specified quantity'],
      [''],
      ['BIN IDS'],
      ['- If left empty, all available bins for the product will be selected'],
      ['- You can specify multiple bins separated by commas'],
      ['- Use bin codes (e.g., BIN1) or bin IDs'],
      ['- Same SKU can appear in multiple rows with different bin combinations'],
      [''],
      ['VALIDATION RULES'],
      ['- SKU must exist in product master'],
      ['- Quantity must be greater than 0'],
      ['- For REMOVE: Quantity cannot exceed available stock'],
      ['- Bin IDs must be valid for the product'],
      ['- Duplicate rows (same SKU + same bins) are not allowed'],
      [''],
      ['EXAMPLES'],
      ['Row 1:', 'NC-APEX-L, 10, ADD, Sold on Amazon, BIN1, First sale'],
      ['Row 2:', 'NC-APEX-L, 5, REMOVE, Damaged, BIN2, Damaged items'],
      ['Row 3:', 'NC-DOT-WH-S, 20, REPLACE, Stock Correction, BIN1,BIN2, Corrected count']
    ];
    
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, wsInstructions, 'Instructions');

    // Sheet 3: Allowed Values
    const allowedValues = [
      ['ALLOWED VALUES AND ENUMS'],
      [''],
      ['ADJUSTMENT TYPE'],
      ['Value', 'Description'],
      ['ADD', 'Add inventory - increases stock'],
      ['REMOVE', 'Remove inventory - decreases stock'],
      ['REPLACE', 'Replace inventory - sets to specific quantity'],
      [''],
      ['COMMON REASON NAMES'],
      ['Sold on Amazon', 'Items sold through Amazon'],
      ['Sold on Website', 'Items sold through company website'],
      ['Damaged Goods', 'Items damaged and removed'],
      ['Expired', 'Items expired and removed'],
      ['Stock Correction', 'Correction to inventory count'],
      ['Returned', 'Items returned by customers'],
      ['Lost', 'Items lost in warehouse'],
      ['Found', 'Items found in warehouse'],
      ['Theft', 'Items stolen'],
      ['Internal Use', 'Items used internally'],
      [''],
      ['BIN ID FORMAT'],
      ['Format', 'Example', 'Description'],
      ['Single Bin', 'BIN1', 'Adjust one specific bin'],
      ['Multiple Bins', 'BIN1,BIN2,BIN3', 'Comma-separated list of bins'],
      ['Bin Code', 'BIN1', 'Use bin code (recommended)'],
      ['Bin UUID', 'uuid-here', 'Use bin UUID if known'],
      [''],
      ['QUANTITY FORMAT'],
      ['Type', 'Example', 'Description'],
      ['Integer', '10', 'Whole numbers (recommended)'],
      ['Decimal', '10.5', 'Decimal values allowed'],
      ['Positive Only', '10', 'Must be greater than 0'],
      [''],
      ['NOTES'],
      ['- Maximum 1000 characters recommended'],
      ['- Multiple notes from different rows will be combined'],
      ['- Special characters are allowed']
    ];
    
    const wsValues = XLSX.utils.aoa_to_sheet(allowedValues);
    wsValues['!cols'] = [
      { wch: 25 }, // Column 1
      { wch: 30 }, // Column 2
      { wch: 50 }  // Column 3
    ];
    XLSX.utils.book_append_sheet(workbook, wsValues, 'Allowed Values');

    // Download as Excel file
    XLSX.writeFile(workbook, 'inventory_adjustment_template.xlsx');
    
    // Also create a CSV version for users who prefer CSV
    const csvHeaders = ['SKU', 'Quantity', 'Adjustment Type', 'Reason Name', 'Bin IDs', 'Notes'];
    const csvSampleRows = [
      ['NC-APEX-L', '10', 'ADD', 'Sold on Amazon', 'BIN1,BIN2', 'First adjustment'],
      ['NC-APEX-L', '5', 'REMOVE', 'Damaged Goods', 'BIN1', 'Damaged items removed'],
      ['NC-DOT-WH-S', '20', 'REPLACE', 'Stock Correction', 'BIN2', 'Corrected stock count']
    ];
    
    const csvContent = [
      csvHeaders.join(','),
      ...csvSampleRows.map(row => row.join(',')),
      '',
      '=== INSTRUCTIONS ===',
      '',
      'REQUIRED FIELDS:',
      'SKU - Product SKU code (must exist in product master)',
      'Quantity - Adjustment quantity (must be greater than 0)',
      '',
      'OPTIONAL FIELDS:',
      'Adjustment Type - ADD, REMOVE, or REPLACE (defaults to selected type in UI)',
      'Reason Name - Reason for adjustment',
      'Bin IDs - Comma-separated bin IDs or codes (e.g., BIN1,BIN2)',
      'Notes - Additional notes',
      '',
      'IMPORTANT:',
      '- Same SKU can appear in multiple rows with different bins',
      '- Duplicate rows (same SKU + same bins) are not allowed',
      '- For REMOVE: Quantity cannot exceed available stock',
      '- If Bin IDs is empty, all available bins will be selected',
      '',
      'ALLOWED VALUES:',
      'Adjustment Type: ADD, REMOVE, REPLACE',
      'Common Reasons: Sold on Amazon, Damaged Goods, Stock Correction, etc.',
      'Bin IDs: Use bin codes (BIN1, BIN2) or comma-separated for multiple bins'
    ].join('\n');

    // Create a download link for CSV as well
    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const csvLink = document.createElement('a');
    const csvUrl = URL.createObjectURL(csvBlob);
    csvLink.setAttribute('href', csvUrl);
    csvLink.setAttribute('download', 'inventory_adjustment_template.csv');
    csvLink.style.visibility = 'hidden';
    document.body.appendChild(csvLink);
    csvLink.click();
    document.body.removeChild(csvLink);
  };

  // Handle bulk upload
  const handleBulkUpload = async () => {
    if (!bulkFile) {
      setBulkError('Please select a file');
      return;
    }

    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const fileExtension = bulkFile.name.split('.').pop()?.toLowerCase();
      let rows: any[] = [];

      if (fileExtension === 'csv') {
        const text = await bulkFile.text();
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim()
        });
        rows = result.data.filter((row: any) =>
          Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== "")
        );
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const arrayBuffer = await bulkFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { raw: false });
      } else {
        throw new Error('Unsupported file format. Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      }

      if (!rows.length) {
        throw new Error('No valid rows found in file');
      }

      // Process each row and add products to items
      const processedItems: AdjustmentItem[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const sku = row.SKU?.toString().trim();
        const quantity = parseFloat(row.Quantity?.toString().replace(/[^0-9.-]/g, '') || '0');
        const rowAdjustmentType = (row['Adjustment Type']?.toString().trim().toUpperCase() || adjustmentType) as 'ADD' | 'REMOVE' | 'REPLACE';
        const reasonName = row['Reason Name']?.toString().trim();
        const binIdsStr = row['Bin IDs']?.toString().trim();
        const rowNotes = row.Notes?.toString().trim();

        if (!sku) {
          errors.push(`Row ${i + 2}: SKU is required`);
          continue;
        }

        if (!quantity || quantity <= 0) {
          errors.push(`Row ${i + 2}: Quantity must be greater than 0`);
          continue;
        }

        try {
          // Get product by SKU
          const product = await getProductBySKU(sku);
          if (!product) {
            errors.push(`Row ${i + 2}: Product with SKU "${sku}" not found`);
            continue;
          }

          // Get current stock
          let currentStock = product.current_stock || 0;
          try {
            currentStock = await getProductStock(product.id);
          } catch (error) {
            console.error('Error fetching stock:', error);
          }

          // Fetch bins for this product FIRST (before we try to use them)
          let bins: BinInfo[] = [];
          try {
            bins = await getBinsForProduct(product.id, product.sku || '');
          } catch (error) {
            console.error('Error fetching bins:', error);
          }

          // Allow same SKU in multiple rows if bins are different
          // Check if this exact combination (product + bins) already exists
          const selectedBinIdsSet = new Set<string>();
          if (binIdsStr) {
            const binIdList = binIdsStr.split(',').map(id => id.trim()).filter(Boolean);
            for (const binId of binIdList) {
              const bin = bins.find(b => b.bin_id === binId || b.bin_code === binId);
              if (bin) {
                selectedBinIdsSet.add(bin.bin_id);
              }
            }
          } else {
            // If no bin IDs specified, select all bins
            if (bins.length > 0) {
              bins.forEach(bin => selectedBinIdsSet.add(bin.bin_id));
            }
          }

          // Check if this exact product + bin combination already exists in processed items
          const binIdsArray = Array.from(selectedBinIdsSet).sort().join(',');
          const existingIndex = processedItems.findIndex(item => {
            if (item.product_id !== product.id) return false;
            const itemBinIdsArray = Array.from(item.selected_bin_ids || new Set()).sort().join(',');
            return itemBinIdsArray === binIdsArray;
          });
          
          if (existingIndex >= 0) {
            errors.push(`Row ${i + 2}: Product "${sku}" with the same bin combination already added`);
            continue;
          }

          // Calculate quantities based on adjustment type
          let adjustmentQty = quantity;
          let afterQty = currentStock;
          let replaceQty: number | undefined;

          if (rowAdjustmentType === 'ADD') {
            afterQty = currentStock + adjustmentQty;
          } else if (rowAdjustmentType === 'REMOVE') {
            if (currentStock < adjustmentQty) {
              errors.push(`Row ${i + 2}: Insufficient stock for "${sku}". Available: ${currentStock}`);
              continue;
            }
            afterQty = currentStock - adjustmentQty;
          } else if (rowAdjustmentType === 'REPLACE') {
            replaceQty = adjustmentQty;
            afterQty = adjustmentQty;
            adjustmentQty = Math.abs(adjustmentQty - currentStock);
          }

          // Set reason if provided
          if (reasonName) {
            const matchingReason = reasons.find(r => r.reason_name.toLowerCase() === reasonName.toLowerCase());
            if (matchingReason) {
              setReasonId(matchingReason.id);
            } else {
              setCustomReason(reasonName);
              setReasonId('');
            }
          }

          // Set notes if provided
          if (rowNotes) {
            setNotes(prev => prev ? `${prev}\n${rowNotes}` : rowNotes);
          }

          // Use the bin IDs we already parsed above
          const selectedBinIds = selectedBinIdsSet;
          
          // Validate bin IDs if explicitly provided
          if (binIdsStr) {
            const binIdList = binIdsStr.split(',').map(id => id.trim()).filter(Boolean);
            const invalidBins: string[] = [];
            for (const binId of binIdList) {
              const bin = bins.find(b => b.bin_id === binId || b.bin_code === binId);
              if (!bin) {
                invalidBins.push(binId);
              }
            }
            if (invalidBins.length > 0) {
              errors.push(`Row ${i + 2}: Invalid bin IDs for "${sku}": ${invalidBins.join(', ')}`);
              continue;
            }
          } else {
            // If no bin IDs specified, select all bins
            if (bins.length > 0) {
              bins.forEach(bin => selectedBinIds.add(bin.bin_id));
            } else {
              errors.push(`Row ${i + 2}: No bins found for product "${sku}". Please specify bin IDs.`);
              continue;
            }
          }

          const newItem: AdjustmentItem = {
            product_id: product.id,
            sku: product.sku || sku,
            product_name: product.name || product.sku || sku,
            product_class: product.class,
            product_color: product.color,
            product_size: product.size,
            product_category: product.category,
            product_brand: product.brand,
            quantity_before: currentStock,
            adjustment_quantity: adjustmentQty,
            quantity_after: afterQty,
            replace_quantity: replaceQty,
            unit: 'pcs',
            bins: bins,
            bin_adjustments: [],
            selected_bin_ids: selectedBinIds
          };

          processedItems.push(newItem);
        } catch (error: any) {
          errors.push(`Row ${i + 2}: ${error.message || 'Error processing row'}`);
        }
      }

      if (errors.length > 0 && processedItems.length === 0) {
        throw new Error(`All rows failed:\n${errors.join('\n')}`);
      }

      if (processedItems.length === 0) {
        throw new Error('No valid items to process');
      }

      // Add processed items to the items list
      setItems(prev => [...prev, ...processedItems]);

      // Set adjustment type if all rows use the same type
      const uniqueTypes = new Set(rows.map(r => r['Adjustment Type']?.toString().trim().toUpperCase() || adjustmentType));
      if (uniqueTypes.size === 1) {
        setAdjustmentType(Array.from(uniqueTypes)[0] as 'ADD' | 'REMOVE' | 'REPLACE');
      }

      setBulkSuccess(`Successfully processed ${processedItems.length} item(s)${errors.length > 0 ? `. ${errors.length} error(s) occurred.` : ''}`);
      if (errors.length > 0) {
        setBulkError(errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''));
      }

      // Close dialog after a delay
      setTimeout(() => {
        setShowBulkUpload(false);
        setBulkFile(null);
        setBulkError(null);
        setBulkSuccess(null);
      }, errors.length > 0 ? 5000 : 2000);
    } catch (error: any) {
      console.error('Bulk upload error:', error);
      setBulkError(error.message || 'Failed to process bulk upload');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inventory Adjustment</h2>
          <p className="text-muted-foreground">Adjust product inventory quantities with full audit trail</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBulkUpload(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowHistory(true);
              loadHistory();
            }}
          >
            <History className="w-4 h-4 mr-2" />
            View History
          </Button>
        </div>
      </div>

      {/* Adjustment Type */}
      <Card>
        <CardHeader>
          <CardTitle>Adjustment Type</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={adjustmentType} onValueChange={(value: any) => {
            setAdjustmentType(value);
            setItems([]); // Clear items when type changes
          }}>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ADD" id="add" />
                <Label htmlFor="add" className="font-normal cursor-pointer">
                  <span className="font-semibold text-green-600">Add</span> - Increase inventory
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="REMOVE" id="remove" />
                <Label htmlFor="remove" className="font-normal cursor-pointer">
                  <span className="font-semibold text-red-600">Remove</span> - Decrease inventory
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="REPLACE" id="replace" />
                <Label htmlFor="replace" className="font-normal cursor-pointer">
                  <span className="font-semibold text-blue-600">Replace</span> - Set specific quantity
                </Label>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Reason */}
      <Card>
        <CardHeader>
          <CardTitle>Reason</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={reasonId || "custom"} onValueChange={(value) => {
                if (value !== "custom") {
                  setReasonId(value);
                  setCustomReason('');
                } else {
                  setReasonId('');
                }
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Reason</SelectItem>
                  {reasons.map(reason => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.reason_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setShowReasonDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Reason
              </Button>
            </div>

            {(!reasonId || reasonId === "custom") && (
              <div>
                <Label htmlFor="custom-reason">Custom Reason</Label>
                <Input
                  id="custom-reason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Enter custom reason..."
                />
              </div>
            )}

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this adjustment..."
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Search / Barcode Scan */}
      <Card>
        <CardHeader>
          <CardTitle>Add Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Barcode Input */}
            <div>
              <Label htmlFor="barcode-input">Scan Barcode or Enter SKU</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="barcode-input"
                    value={barcodeInput}
                    onChange={(e) => handleBarcodeInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && barcodeInput.trim()) {
                        handleBarcodeScan(barcodeInput.trim());
                      }
                    }}
                    placeholder="Scan barcode or type SKU and press Enter..."
                    className="pl-10"
                    autoFocus
                  />
                </div>
                <Button
                  onClick={() => {
                    if (barcodeInput.trim()) {
                      handleBarcodeScan(barcodeInput.trim());
                    }
                  }}
                  disabled={!barcodeInput.trim()}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tip: Each scan will add or increment quantity for that product
              </p>
            </div>

            {/* Search Input */}
            <div>
              <Label htmlFor="search-input">Or Search Products</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="search-input"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                  }}
                  placeholder="Search by SKU, name, class, color..."
                  className="pl-10"
                />
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
                  {searchResults.map(product => (
                    <div
                      key={product.id}
                      className="p-2 hover:bg-muted cursor-pointer border-b last:border-0"
                      onClick={() => addProductToItems(product)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{product.name || product.sku}</div>
                          <div className="text-sm text-muted-foreground">
                            SKU: {product.sku} | Stock: {product.current_stock || 0}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Adjustment Items ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>
                      {adjustmentType === 'REPLACE' ? 'New Quantity' : 'Adjustment Qty'}
                    </TableHead>
                    {adjustmentType === 'REPLACE' && <TableHead>Change</TableHead>}
                    <TableHead>After</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const hasBins = item.bins && item.bins.length > 0;
                    const binAdjustments = item.bin_adjustments || [];
                    
                    return (
                      <Fragment key={`${item.product_id}-${index}`}>
                        <TableRow>
                          <TableCell className="font-mono">{item.sku}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell>{item.product_class || '-'}</TableCell>
                          <TableCell>{item.product_color || '-'}</TableCell>
                          <TableCell>{item.product_size || '-'}</TableCell>
                          <TableCell>{item.product_category || '-'}</TableCell>
                          <TableCell>{item.quantity_before}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={adjustmentType === 'REPLACE' ? (item.replace_quantity ?? item.quantity_before) : item.adjustment_quantity}
                              onChange={(e) => updateItemQuantity(index, parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          {adjustmentType === 'REPLACE' && (
                            <TableCell>
                              <Badge variant={item.replace_quantity! >= item.quantity_before ? "default" : "destructive"}>
                                {item.replace_quantity! >= item.quantity_before ? '+' : '-'}
                                {Math.abs((item.replace_quantity ?? item.quantity_before) - item.quantity_before)}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant={item.quantity_after >= item.quantity_before ? "default" : "destructive"}>
                              {item.quantity_after}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* Bins Display - Always Visible */}
                        <TableRow>
                          <TableCell colSpan={adjustmentType === 'REPLACE' ? 11 : 10} className="bg-muted/20 p-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4" />
                                  <span className="font-semibold">Bins for {item.product_name}</span>
                                  <Badge variant="outline">
                                    {item.bins!.length} bin{item.bins!.length !== 1 ? 's' : ''} available
                                  </Badge>
                                  {(item.selected_bin_ids?.size || 0) > 0 && (
                                    <Badge variant="default">
                                      {item.selected_bin_ids!.size} selected
                                    </Badge>
                                  )}
                                </div>
                                <Badge variant="outline" className="ml-auto">
                                  Total in bins: {item.bins!.reduce((sum, b) => sum + b.current_quantity, 0)} pcs
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {hasBins ? item.bins!.map((bin) => {
                                  const selectedBinIds = item.selected_bin_ids || new Set<string>();
                                  const isSelected = selectedBinIds.has(bin.bin_id);
                                  
                                  // Calculate preview values if selected - based on all selected bins
                                  let previewAdjustment = null;
                                  if (isSelected && selectedBinIds.size > 0) {
                                    try {
                                      const tempAdjustments = calculateBinAdjustments(item);
                                      previewAdjustment = tempAdjustments.find(ba => ba.bin_id === bin.bin_id);
                                    } catch (error) {
                                      // Preview calculation failed, will show error on save
                                      previewAdjustment = null;
                                    }
                                  }
                                  
                                  return (
                                    <Card key={bin.bin_id} className={`border-2 ${isSelected ? 'border-primary bg-primary/5' : 'border-border'} transition-colors`}>
                                      <CardContent className="p-4 space-y-3">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                  if (checked !== isSelected) {
                                                    toggleBinSelection(index, bin.bin_id);
                                                  }
                                                }}
                                                className="mt-0.5"
                                              />
                                              <div className="font-semibold text-sm">{bin.bin_code}</div>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5 ml-6">
                                              {bin.warehouse_name && (
                                                <div className="font-medium text-foreground">{bin.warehouse_name}</div>
                                              )}
                                              {bin.floor_number && (
                                                <div>Floor {bin.floor_number}</div>
                                              )}
                                              {bin.rack_code && (
                                                <div>Rack: {bin.rack_code}</div>
                                              )}
                                              {bin.location_type && (
                                                <Badge variant="outline" className="mt-1 text-xs">
                                                  {bin.location_type.replace('_', ' ')}
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                          <div className="flex justify-between items-center text-sm bg-muted/50 p-2 rounded">
                                            <span className="text-muted-foreground">Current Inventory:</span>
                                            <span className="font-semibold text-lg">{bin.current_quantity} pcs</span>
                                          </div>
                                          
                                          {isSelected && previewAdjustment && (
                                            <div className="pt-2 border-t space-y-1 bg-muted/30 p-2 rounded">
                                              <div className="text-xs font-medium text-primary mb-1">Preview:</div>
                                              <div className="flex justify-between text-xs">
                                                <span className="text-muted-foreground">Will Adjust:</span>
                                                <Badge variant={adjustmentType === 'REMOVE' ? 'destructive' : 'default'}>
                                                  {adjustmentType === 'ADD' ? '+' : adjustmentType === 'REMOVE' ? '-' : '±'}
                                                  {previewAdjustment.adjustment_quantity}
                                                </Badge>
                                              </div>
                                              <div className="flex justify-between text-xs font-semibold">
                                                <span className="text-muted-foreground">After Adjustment:</span>
                                                <span className="text-primary">{previewAdjustment.quantity_after} pcs</span>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {!isSelected && (
                                            <div className="text-xs text-muted-foreground text-center py-1">
                                              Select to include in adjustment
                                            </div>
                                          )}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                }) : (
                                  <div className="col-span-full text-center py-4 text-muted-foreground text-sm">
                                    No bins found. Please ensure bins are created in Warehouse Master.
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving || items.length === 0}
                className="bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Adjustment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Reason Dialog */}
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Adjustment Reason</DialogTitle>
            <DialogDescription>
              Add a new reason that can be used for inventory adjustments
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason-name">Reason Name *</Label>
              <Input
                id="reason-name"
                value={newReasonName}
                onChange={(e) => setNewReasonName(e.target.value)}
                placeholder="e.g., Sold on Amazon"
              />
            </div>
            <div>
              <Label htmlFor="reason-description">Description</Label>
              <Textarea
                id="reason-description"
                value={newReasonDescription}
                onChange={(e) => setNewReasonDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReasonDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateReason} disabled={reasonLoading || !newReasonName.trim()}>
                {reasonLoading ? 'Creating...' : 'Create Reason'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Upload Inventory Adjustment</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file to adjust multiple products at once
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-file">Select File (CSV or Excel)</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="bulk-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkFile(file);
                      setBulkError(null);
                      setBulkSuccess(null);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  type="button"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Template
                </Button>
              </div>
              {bulkFile && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{bulkFile.name}</span>
                  <span className="text-xs">({(bulkFile.size / 1024).toFixed(2)} KB)</span>
                </div>
              )}
            </div>

            {bulkSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                {bulkSuccess}
              </div>
            )}

            {bulkError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {bulkError}
              </div>
            )}

            <div className="bg-muted/50 p-4 rounded-md text-sm space-y-2">
              <p className="font-semibold">File Format:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>SKU</strong> (required) - Product SKU code</li>
                <li><strong>Quantity</strong> (required) - Adjustment quantity</li>
                <li><strong>Adjustment Type</strong> (optional) - ADD, REMOVE, or REPLACE (defaults to selected type)</li>
                <li><strong>Reason Name</strong> (optional) - Reason for adjustment</li>
                <li><strong>Bin IDs</strong> (optional) - Comma-separated bin IDs or codes</li>
                <li><strong>Notes</strong> (optional) - Additional notes</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkUpload(false);
                  setBulkFile(null);
                  setBulkError(null);
                  setBulkSuccess(null);
                }}
                disabled={bulkLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkUpload}
                disabled={bulkLoading || !bulkFile}
              >
                {bulkLoading ? (
                  <>
                    <Package className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Process
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adjustment History</DialogTitle>
            <DialogDescription>
              View past inventory adjustments
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="text-center py-8">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No adjustments found</div>
          ) : (
            <div className="space-y-4">
              {history.map(adjustment => (
                <Card key={adjustment.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {adjustment.adjustment_type} Adjustment
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {new Date(adjustment.adjustment_date).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={adjustment.status === 'COMPLETED' ? 'default' : 'secondary'}>
                        {adjustment.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Reason:</span>{' '}
                        {adjustment.reason_id 
                          ? (adjustment as any).reason?.reason_name 
                          : adjustment.custom_reason || 'N/A'}
                      </div>
                      {adjustment.notes && (
                        <div>
                          <span className="font-medium">Notes:</span> {adjustment.notes}
                        </div>
                      )}
                      {adjustment.items && adjustment.items.length > 0 && (
                        <div>
                          <span className="font-medium">Items:</span> {adjustment.items.length}
                          <Table className="mt-2">
                            <TableHeader>
                              <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Before</TableHead>
                                <TableHead>Change</TableHead>
                                <TableHead>After</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(adjustment.items as any[]).map((item: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono">{item.sku}</TableCell>
                                  <TableCell>{item.quantity_before}</TableCell>
                                  <TableCell>
                                    {adjustment.adjustment_type === 'ADD' && '+'}
                                    {adjustment.adjustment_type === 'REMOVE' && '-'}
                                    {item.adjustment_quantity}
                                  </TableCell>
                                  <TableCell>{item.quantity_after}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

