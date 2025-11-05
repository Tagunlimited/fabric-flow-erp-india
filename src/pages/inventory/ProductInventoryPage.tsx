import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { InventoryTransferModal } from '@/components/warehouse/InventoryTransferModal';
import { InventoryAdjustment } from '@/components/masters/InventoryAdjustment';
import { WarehouseInventory } from '@/types/warehouse-inventory';
import { supabase } from '@/integrations/supabase/client';
import { Package, Search, Image as ImageIcon, X, ChevronLeft, ChevronRight, Settings, Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createInventoryAdjustment, getProductBySKU, getProductStock, getBinsForProduct } from '@/utils/inventoryAdjustmentAPI';
import type { AdjustmentItem } from '@/utils/inventoryAdjustmentAPI';

interface Product {
  id: string;
  sku?: string;
  class?: string;
  name?: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
  main_image?: string;
  image_url?: string;
  image1?: string;
  image2?: string;
  images?: string[];
  current_stock?: number;
  created_at?: string;
}

const ProductInventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedInventory, setSelectedInventory] = useState<WarehouseInventory | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [binInventoryModalOpen, setBinInventoryModalOpen] = useState(false);
  const [selectedProductForBins, setSelectedProductForBins] = useState<Product | null>(null);
  const [binInventoryData, setBinInventoryData] = useState<any[]>([]);
  const [loadingBinInventory, setLoadingBinInventory] = useState(false);
  const [bulkUploadDialogOpen, setBulkUploadDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [bulkUploadSuccess, setBulkUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
    
    // Realtime subscription for warehouse inventory
    const channel = supabase
      .channel('product_inventory_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'warehouse_inventory',
        filter: 'item_type=eq.PRODUCT'
      } as any, () => {
        loadProducts(); // Reload products to get updated current_stock
        if (binInventoryModalOpen && selectedProductForBins) {
          loadBinInventory(selectedProductForBins);
        }
        try { window.dispatchEvent(new CustomEvent('warehouse-inventory-updated')); } catch {}
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'product_master'
      } as any, () => {
        loadProducts(); // Reload products when current_stock is updated
      })
      .subscribe();

    const handler = () => {
      loadProducts();
      if (binInventoryModalOpen && selectedProductForBins) {
        loadBinInventory(selectedProductForBins);
      }
    };
    window.addEventListener('warehouse-inventory-updated', handler as any);

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [binInventoryModalOpen, selectedProductForBins]);

  useEffect(() => {
    // Filter products based on search term
    if (!searchTerm.trim()) {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(product => {
        const searchLower = searchTerm.toLowerCase();
        return (
          product.sku?.toLowerCase().includes(searchLower) ||
          product.name?.toLowerCase().includes(searchLower) ||
          product.class?.toLowerCase().includes(searchLower) ||
          product.brand?.toLowerCase().includes(searchLower) ||
          product.category?.toLowerCase().includes(searchLower) ||
          product.size?.toLowerCase().includes(searchLower) ||
          product.color?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredProducts(filtered);
    }
  }, [searchTerm, products]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_master')
        .select('id, sku, class, name, brand, category, size, color, main_image, image_url, image1, image2, images, current_stock, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching products:', error);
        toast.error('Failed to load products');
        return;
      }

      const productsData = (data as Product[]) || [];
      setProducts(productsData);
      setFilteredProducts(productsData);
    } catch (error) {
      console.error('Error loading products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const getProductImage = (product: Product): string | null => {
    return product.main_image || product.image_url || null;
  };

  const getAllProductImages = (product: Product): string[] => {
    const images: string[] = [];
    if (product.main_image) images.push(product.main_image);
    if (product.image_url && !images.includes(product.image_url)) images.push(product.image_url);
    if (product.image1 && !images.includes(product.image1)) images.push(product.image1);
    if (product.image2 && !images.includes(product.image2)) images.push(product.image2);
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach(img => {
        if (img && !images.includes(img)) images.push(img);
      });
    }
    return images;
  };

  const handleImageClick = (product: Product) => {
    const images = getAllProductImages(product);
    if (images.length > 0) {
      setSelectedProduct(product);
      setCurrentImageIndex(0);
      setImageGalleryOpen(true);
    }
  };

  const handleSkuClick = (product: Product) => {
    // Navigate to product master page
    navigate('/masters/products');
    // Store product ID in sessionStorage to potentially highlight it
    if (product.id) {
      sessionStorage.setItem('selectedProductId', product.id);
      sessionStorage.setItem('selectedProductSku', product.sku || '');
    }
  };

  const nextImage = () => {
    if (!selectedProduct) return;
    const images = getAllProductImages(selectedProduct);
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    if (!selectedProduct) return;
    const images = getAllProductImages(selectedProduct);
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const loadBinInventory = async (product: Product) => {
    if (!product.id) return;
    
    try {
      setLoadingBinInventory(true);
      const { data, error } = await supabase
        .from('warehouse_inventory')
        .select(`
          id,
          quantity,
          status,
          bin_id,
          bin:bin_id (
            id,
            bin_code,
            location_type,
            rack:rack_id (
              id,
              rack_code,
              floor:floor_id (
                id,
                floor_number,
                warehouse:warehouse_id (
                  id,
                  name,
                  code
                )
              )
            )
          )
        `)
        .eq('item_type', 'PRODUCT')
        .eq('item_id', product.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching bin inventory:', error);
        toast.error('Failed to load bin inventory');
        return;
      }
      
      const inventoryData = (data as any) || [];
      setBinInventoryData(inventoryData);
    } catch (error) {
      console.error('Error loading bin inventory:', error);
      toast.error('Failed to load bin inventory');
    } finally {
      setLoadingBinInventory(false);
    }
  };

  const handleInventoryClick = async (product: Product) => {
    setSelectedProductForBins(product);
    setBinInventoryModalOpen(true);
    await loadBinInventory(product);
  };

  const handleTransferItem = (inventory: WarehouseInventory) => {
    setSelectedInventory(inventory);
    setShowTransferModal(true);
  };

  const handleViewDetails = (inventory: WarehouseInventory) => {
    setSelectedInventory(inventory);
    setShowViewModal(true);
  };

  const handleTransferComplete = () => {
    setShowTransferModal(false);
    setSelectedInventory(null);
  };

  // Download bulk upload template
  const handleDownloadBulkTemplate = () => {
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
    wsData['!cols'] = [
      { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsData, 'Data Entry');

    // Sheet 2: Instructions
    const instructions = [
      ['BULK INVENTORY ADJUSTMENT - INSTRUCTIONS'],
      [''],
      ['REQUIRED FIELDS:'],
      ['SKU', 'Product SKU code (must exist in product master)'],
      ['Quantity', 'Adjustment quantity (must be greater than 0)'],
      [''],
      ['OPTIONAL FIELDS:'],
      ['Adjustment Type', 'ADD, REMOVE, or REPLACE (defaults to ADD)'],
      ['Reason Name', 'Reason for adjustment'],
      ['Bin IDs', 'Comma-separated bin IDs or codes (e.g., BIN1,BIN2)'],
      ['Notes', 'Additional notes'],
      [''],
      ['IMPORTANT:'],
      ['- Same SKU can appear in multiple rows with different bins'],
      ['- Duplicate rows (same SKU + same bins) are not allowed'],
      ['- For REMOVE: Quantity cannot exceed available stock'],
      ['- If Bin IDs is empty, all available bins will be selected']
    ];
    
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, wsInstructions, 'Instructions');

    XLSX.writeFile(workbook, 'inventory_adjustment_bulk_template.xlsx');
  };

  // Handle direct bulk upload (bypasses form UI)
  const handleDirectBulkUpload = async () => {
    if (!bulkFile || !user) {
      setBulkUploadError('Please select a file and ensure you are logged in');
      return;
    }

    setBulkUploading(true);
    setBulkUploadError(null);
    setBulkUploadSuccess(null);
    setBulkProgress(0);

    try {
      const fileExtension = bulkFile.name.split('.').pop()?.toLowerCase();
      let rows: any[] = [];

      // Parse file
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
        throw new Error('Unsupported file format. Please upload a CSV or Excel file.');
      }

      if (!rows.length) {
        throw new Error('No valid rows found in file');
      }

      setBulkProgress(10);

      // Process rows and create adjustments
      const processedItems: AdjustmentItem[] = [];
      const errors: string[] = [];
      const totalRows = rows.length;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const sku = row.SKU?.toString().trim();
        const quantity = parseFloat(row.Quantity?.toString().replace(/[^0-9.-]/g, '') || '0');
        const rowAdjustmentType = (row['Adjustment Type']?.toString().trim().toUpperCase() || 'ADD') as 'ADD' | 'REMOVE' | 'REPLACE';
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
          // Get product
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

          // Fetch bins
          let bins: any[] = [];
          try {
            bins = await getBinsForProduct(product.id, product.sku || '');
          } catch (error) {
            console.error('Error fetching bins:', error);
          }

          // Setup selected bins
          const selectedBinIdsSet = new Set<string>();
          if (binIdsStr) {
            const binIdList = binIdsStr.split(',').map(id => id.trim()).filter(Boolean);
            const invalidBins: string[] = [];
            for (const binId of binIdList) {
              const bin = bins.find(b => b.bin_id === binId || b.bin_code === binId);
              if (bin) {
                selectedBinIdsSet.add(bin.bin_id);
              } else {
                invalidBins.push(binId);
              }
            }
            if (invalidBins.length > 0) {
              errors.push(`Row ${i + 2}: Invalid bin ID(s) "${invalidBins.join(', ')}" for SKU "${sku}". Available bins: ${bins.map(b => b.bin_code).join(', ') || 'none'}`);
              // Continue to next row instead of breaking
              continue;
            }
          } else {
            // If no bin IDs specified, select all available bins
            if (bins.length > 0) {
              bins.forEach(bin => selectedBinIdsSet.add(bin.bin_id));
            }
            // If no bins available and no bin IDs specified, that's okay - adjustment will be product-level
          }

          // Calculate quantities
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
            replaceQty = quantity;
            afterQty = quantity;
            adjustmentQty = Math.abs(quantity - currentStock);
          }

          // Calculate bin adjustments if bins are selected
          let binAdjustments: any[] = [];
          if (selectedBinIdsSet.size > 0) {
            const selectedBins = bins.filter(b => selectedBinIdsSet.has(b.bin_id));
            
            if (rowAdjustmentType === 'ADD') {
              // Distribute evenly across selected bins
              const baseQtyPerBin = Math.floor(adjustmentQty / selectedBins.length);
              const remainder = adjustmentQty % selectedBins.length;
              selectedBins.forEach((bin, index) => {
                const binAdjQty = baseQtyPerBin + (index < remainder ? 1 : 0);
                binAdjustments.push({
                  bin_id: bin.bin_id,
                  bin_code: bin.bin_code,
                  quantity_before: bin.current_quantity,
                  adjustment_quantity: binAdjQty,
                  quantity_after: bin.current_quantity + binAdjQty
                });
              });
            } else if (rowAdjustmentType === 'REMOVE') {
              // Remove proportionally from selected bins
              let remainingQty = adjustmentQty;
              for (const bin of selectedBins) {
                if (remainingQty <= 0) break;
                const removableQty = Math.min(remainingQty, bin.current_quantity);
                if (removableQty > 0) {
                  binAdjustments.push({
                    bin_id: bin.bin_id,
                    bin_code: bin.bin_code,
                    quantity_before: bin.current_quantity,
                    adjustment_quantity: removableQty,
                    quantity_after: bin.current_quantity - removableQty
                  });
                  remainingQty -= removableQty;
                }
              }
            } else if (rowAdjustmentType === 'REPLACE') {
              // Distribute target quantity proportionally
              const totalCurrentQty = selectedBins.reduce((sum, b) => sum + b.current_quantity, 0);
              selectedBins.forEach(bin => {
                const proportion = totalCurrentQty > 0 ? bin.current_quantity / totalCurrentQty : 1 / selectedBins.length;
                const targetQty = Math.round(afterQty * proportion);
                binAdjustments.push({
                  bin_id: bin.bin_id,
                  bin_code: bin.bin_code,
                  quantity_before: bin.current_quantity,
                  adjustment_quantity: Math.abs(targetQty - bin.current_quantity),
                  quantity_after: targetQty
                });
              });
            }
          }

          // Create adjustment item
          const adjustmentItem: AdjustmentItem & { _adjustmentType?: 'ADD' | 'REMOVE' | 'REPLACE' } = {
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
            selected_bin_ids: selectedBinIdsSet,
            bin_adjustments: binAdjustments,
            _adjustmentType: rowAdjustmentType // Store the type for grouping
          };

          processedItems.push(adjustmentItem);
        } catch (error: any) {
          errors.push(`Row ${i + 2}: ${error.message || 'Error processing row'}`);
        }

        setBulkProgress(10 + ((i + 1) / totalRows) * 70);
      }

      if (processedItems.length === 0) {
        throw new Error(`All rows failed:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''}`);
      }

      setBulkProgress(80);

      // Group items by adjustment type for batch processing
      // Each adjustment needs to have the same type, so group by type
      const groupedByType = new Map<string, AdjustmentItem[]>();
      processedItems.forEach(item => {
        // Use stored adjustment type or determine from values
        const itemWithType = item as AdjustmentItem & { _adjustmentType?: 'ADD' | 'REMOVE' | 'REPLACE' };
        let itemType: 'ADD' | 'REMOVE' | 'REPLACE' = itemWithType._adjustmentType || 'ADD';
        
        // Fallback: determine from calculated values if not stored
        if (!itemWithType._adjustmentType) {
          if (item.replace_quantity !== undefined) {
            itemType = 'REPLACE';
          } else if (item.quantity_after < item.quantity_before) {
            itemType = 'REMOVE';
          } else if (item.quantity_after > item.quantity_before) {
            itemType = 'ADD';
          }
        }
        
        const key = itemType;
        if (!groupedByType.has(key)) {
          groupedByType.set(key, []);
        }
        // Remove the temporary _adjustmentType before storing
        const { _adjustmentType, ...cleanItem } = itemWithType;
        groupedByType.get(key)!.push(cleanItem);
      });

      // Create adjustments for each type group
      let successCount = 0;
      let failCount = 0;

      for (const [adjustmentType, items] of groupedByType.entries()) {
        try {
          // Process items in batches to avoid timeout
          const batchSize = 50;
          for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            
            await createInventoryAdjustment(
              adjustmentType as 'ADD' | 'REMOVE' | 'REPLACE',
              batch,
              undefined,
              'Bulk Upload - Direct Adjustment',
              `Bulk inventory adjustment: ${batch.length} item(s)`,
              user.id,
              user.email
            );
            successCount += batch.length;
            
            setBulkProgress(80 + ((i + batch.length) / items.length) * 15);
          }
        } catch (error: any) {
          console.error('Error creating adjustment:', error);
          failCount += items.length;
          errors.push(`Failed to create ${adjustmentType} adjustment for ${items.length} item(s): ${error.message}`);
        }
      }

      setBulkProgress(100);

      if (successCount > 0) {
        setBulkUploadSuccess(`Successfully processed ${successCount} item(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`);
        toast.success(`Bulk upload completed: ${successCount} items adjusted${failCount > 0 ? `, ${failCount} failed` : ''}`);
        await loadProducts(); // Refresh products
      }

      if (errors.length > 0 && successCount === 0) {
        throw new Error(errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''));
      } else if (errors.length > 0) {
        setBulkUploadError(errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''));
      }

      // Close dialog after delay
      setTimeout(() => {
        if (successCount > 0) {
          setBulkUploadDialogOpen(false);
          setBulkFile(null);
          setBulkProgress(0);
        }
      }, 3000);
    } catch (error: any) {
      console.error('Bulk upload error:', error);
      setBulkUploadError(error.message || 'Failed to process bulk upload');
      toast.error(error.message || 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <ErpLayout>
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="w-full px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Product Inventory</h1>
            <p className="text-muted-foreground mt-1">
              View and manage finished product inventory. Products use the same warehouse structure (bins, racks, floors) as raw materials.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setBulkUploadDialogOpen(true)}
              className="flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
            >
              <Upload className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
              Bulk Upload
            </Button>
            <Button
              variant="outline"
              onClick={() => setAdjustmentDialogOpen(true)}
              className="flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95"
            >
              <Settings className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              Inventory Adjustment
            </Button>
            <Badge 
              variant="outline" 
              className="flex items-center gap-1 transition-all duration-200 hover:scale-105 hover:shadow-sm cursor-default"
            >
              <Package className="h-3 w-3 transition-transform duration-200 hover:rotate-12" />
              {filteredProducts.length} Products
            </Badge>
          </div>
        </div>

        {/* Search */}
        <Card className="transition-all duration-200 hover:shadow-md">
          <CardContent className="pt-6">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 transition-all duration-200 group-focus-within:text-primary group-focus-within:scale-110" />
              <Input
                placeholder="Search by SKU, Name, Class, Brand, Color, Size, or Category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card className="transition-all duration-200 hover:shadow-lg">
          <CardHeader className="transition-colors duration-200 hover:bg-muted/30">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary transition-transform duration-200 hover:rotate-12" />
              Product Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
                <p className="text-muted-foreground animate-pulse">Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="relative inline-block">
                  <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4 transition-all duration-300 hover:scale-110 hover:rotate-12" />
                  <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
                </div>
                <p className="text-muted-foreground text-lg">
                  {searchTerm ? 'No products found matching your search.' : 'No products found in inventory.'}
                </p>
                {searchTerm && (
                  <Button
                    variant="ghost"
                    onClick={() => setSearchTerm('')}
                    className="mt-4 transition-all duration-200 hover:scale-105"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-muted/50 transition-colors">
                      <TableHead className="w-[120px]">Image</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Inventory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product, index) => {
                      const imageUrl = getProductImage(product);
                      const images = getAllProductImages(product);
                      return (
                        <TableRow 
                          key={product.id}
                          className="hover:bg-muted/50 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20 hover:shadow-sm"
                          style={{
                            animation: `fadeIn 0.3s ease-out ${index * 0.03}s both`
                          }}
                        >
                          <TableCell>
                            {imageUrl ? (
                              <div 
                                className="relative w-20 h-20 rounded-lg border-2 border-border overflow-hidden bg-muted flex items-center justify-center cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-primary/50"
                                onClick={() => handleImageClick(product)}
                              >
                                <img
                                  src={imageUrl}
                                  alt={product.name || 'Product'}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.parentElement) {
                                      e.currentTarget.parentElement.innerHTML = '<div class="w-20 h-20 rounded-lg border-2 border-border bg-muted flex items-center justify-center transition-colors hover:bg-muted/80"><svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                                    }
                                  }}
                                />
                                {images.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-md backdrop-blur-sm transition-all duration-200 group-hover:bg-black/80 group-hover:scale-110">
                                    {images.length}
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors duration-300" />
                              </div>
                            ) : (
                              <div className="w-20 h-20 rounded-lg border-2 border-border bg-muted flex items-center justify-center transition-all duration-200 hover:bg-muted/80 hover:border-primary/30">
                                <ImageIcon className="w-8 h-8 text-muted-foreground transition-transform duration-200 hover:scale-110" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleSkuClick(product)}
                              className="font-mono font-medium text-primary hover:text-primary/80 hover:underline cursor-pointer transition-all duration-200 hover:scale-105 inline-block"
                            >
                              {product.sku || '-'}
                            </button>
                          </TableCell>
                          <TableCell>
                            {product.class ? (
                              <Badge 
                                variant="secondary" 
                                className="transition-all duration-200 hover:scale-105 hover:shadow-sm cursor-default"
                              >
                                {product.class}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.color ? (
                              <Badge 
                                variant="secondary" 
                                className="transition-all duration-200 hover:scale-105 hover:shadow-sm cursor-default"
                              >
                                {product.color}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.size ? (
                              <Badge 
                                variant="secondary" 
                                className="transition-all duration-200 hover:scale-105 hover:shadow-sm cursor-default"
                              >
                                {product.size}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="transition-colors duration-200 hover:text-primary">
                              {product.name || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="transition-colors duration-200 hover:text-primary/80">
                              {product.brand || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge 
                                variant="outline" 
                                className="transition-all duration-200 hover:scale-105 hover:shadow-sm hover:border-primary/50 cursor-default"
                              >
                                {product.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.current_stock !== undefined && product.current_stock !== null ? (
                              <Badge 
                                variant={product.current_stock > 0 ? 'default' : 'secondary'}
                                className="font-mono cursor-pointer transition-all duration-200 hover:scale-110 hover:shadow-md active:scale-95"
                                onClick={() => handleInventoryClick(product)}
                              >
                                {product.current_stock} pcs
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transfer Modal */}
        <InventoryTransferModal
          open={showTransferModal}
          onOpenChange={setShowTransferModal}
          inventory={selectedInventory}
          onTransferComplete={handleTransferComplete}
        />

        {/* Image Gallery Dialog */}
        <Dialog open={imageGalleryOpen} onOpenChange={setImageGalleryOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="flex items-center justify-between">
                <span>{selectedProduct?.name || 'Product Images'}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setImageGalleryOpen(false)}
                  className="h-6 w-6"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            {selectedProduct && (() => {
              const images = getAllProductImages(selectedProduct);
              if (images.length === 0) {
                return (
                  <div className="flex items-center justify-center p-12">
                    <p className="text-muted-foreground">No images available</p>
                  </div>
                );
              }
              return (
                <div className="relative">
                  <div className="relative flex items-center justify-center bg-black/5 min-h-[400px]">
                    <img
                      src={images[currentImageIndex]}
                      alt={`${selectedProduct.name || 'Product'} - Image ${currentImageIndex + 1}`}
                      className="max-w-full max-h-[70vh] object-contain"
                      onError={(e) => {
                        e.currentTarget.src = '';
                        e.currentTarget.alt = 'Image failed to load';
                      }}
                    />
                    {images.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                          onClick={prevImage}
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                          onClick={nextImage}
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                      </>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div className="px-6 pb-6 pt-4">
                      <div className="flex items-center justify-center gap-2">
                        {images.map((img, index) => (
                          <button
                            key={index}
                            onClick={() => setCurrentImageIndex(index)}
                            className={`w-16 h-16 rounded border overflow-hidden ${
                              index === currentImageIndex
                                ? 'ring-2 ring-primary'
                                : 'opacity-60 hover:opacity-100'
                            } transition-opacity`}
                          >
                            <img
                              src={img}
                              alt={`Thumbnail ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                      <div className="text-center mt-2 text-sm text-muted-foreground">
                        Image {currentImageIndex + 1} of {images.length}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Inventory Adjustment Dialog */}
        <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Inventory Adjustment</DialogTitle>
            </DialogHeader>
            <InventoryAdjustment />
          </DialogContent>
        </Dialog>

        {/* Bulk Upload Dialog */}
        <Dialog open={bulkUploadDialogOpen} onOpenChange={setBulkUploadDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Bulk Upload Inventory Adjustment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulk-file">Select File (CSV or Excel)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="bulk-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBulkFile(file);
                        setBulkUploadError(null);
                        setBulkUploadSuccess(null);
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleDownloadBulkTemplate}
                    title="Download Template"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                {bulkFile && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {bulkFile.name} ({(bulkFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              {bulkUploadSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">{bulkUploadSuccess}</p>
                </div>
              )}

              {bulkUploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <p className="text-sm font-semibold text-red-800 mb-2">Errors:</p>
                  <p className="text-sm text-red-700 whitespace-pre-line">{bulkUploadError}</p>
                </div>
              )}

              {bulkUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing...</span>
                    <span>{Math.round(bulkProgress)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${bulkProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm font-semibold mb-2">File Format:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>SKU (required) - Product SKU code</li>
                  <li>Quantity (required) - Adjustment quantity</li>
                  <li>Adjustment Type (optional) - ADD, REMOVE, or REPLACE (defaults to ADD)</li>
                  <li>Reason Name (optional) - Reason for adjustment</li>
                  <li>Bin IDs (optional) - Comma-separated bin IDs or codes</li>
                  <li>Notes (optional) - Additional notes</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkUploadDialogOpen(false);
                    setBulkFile(null);
                    setBulkUploadError(null);
                    setBulkUploadSuccess(null);
                    setBulkProgress(0);
                  }}
                  disabled={bulkUploading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDirectBulkUpload}
                  disabled={!bulkFile || bulkUploading}
                  className="flex items-center gap-2"
                >
                  {bulkUploading ? (
                    <>
                      <Package className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload & Process
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bin-wise Inventory Modal */}
        <Dialog open={binInventoryModalOpen} onOpenChange={setBinInventoryModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Bin-wise Inventory - {selectedProductForBins?.sku || 'N/A'}
              </DialogTitle>
            </DialogHeader>
            {loadingBinInventory ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
                <p className="text-muted-foreground">Loading bin inventory...</p>
              </div>
            ) : binInventoryData.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No bin inventory found for this product.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Product Name</p>
                      <p className="font-semibold">{selectedProductForBins?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Inventory</p>
                      <p className="font-semibold">{selectedProductForBins?.current_stock || 0} pcs</p>
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bin Code</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Rack</TableHead>
                      <TableHead>Location Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {binInventoryData.map((item: any) => {
                      const bin = item.bin;
                      const rack = bin?.rack;
                      const floor = rack?.floor;
                      const warehouse = floor?.warehouse;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono">{bin?.bin_code || '-'}</TableCell>
                          <TableCell>{warehouse?.name || '-'}</TableCell>
                          <TableCell>Floor {floor?.floor_number || '-'}</TableCell>
                          <TableCell className="font-mono">{rack?.rack_code || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {bin?.location_type === 'STORAGE' ? 'Storage' :
                               bin?.location_type === 'RECEIVING_ZONE' ? 'Receiving' :
                               bin?.location_type === 'DISPATCH_ZONE' ? 'Dispatch' :
                               bin?.location_type || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.status === 'IN_STORAGE' ? 'default' : 'secondary'}>
                              {item.status || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(item.quantity || 0).toFixed(0)} pcs
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default ProductInventoryPage;
