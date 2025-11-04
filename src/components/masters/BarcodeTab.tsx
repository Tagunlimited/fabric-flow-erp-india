import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { generateBarcodeLabelsPDF, PrintSettings } from '@/utils/barcodeLabelPDF';
import { generateCode128BarcodeImage } from '@/utils/barcodeUtils';
import { Search, Filter, Download, Settings, X } from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id?: string;
  sku?: string;
  class?: string;
  color?: string;
  size?: string;
  name?: string;
  category?: string;
}

interface ProductWithBarcode extends Product {
  barcodeUrl?: string;
  barcodeLoading?: boolean;
}

interface BarcodeTabProps {
  products: Product[];
}

export function BarcodeTab({ products: allProducts }: BarcodeTabProps) {
  const { toast: toastHook } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [productsWithBarcodes, setProductsWithBarcodes] = useState<Record<string, ProductWithBarcode>>({});
  
  // Filter states
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [nameFilter, setNameFilter] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');
  
  // Print settings dialog
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  
  // Load saved print settings from localStorage
  const loadSavedPrintSettings = (): PrintSettings => {
    try {
      const saved = localStorage.getItem('barcode-print-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate and merge with defaults
        return {
          pageSize: parsed.pageSize || 'a4',
          customWidth: parsed.customWidth,
          customHeight: parsed.customHeight,
          marginTop: parsed.marginTop ?? 10,
          marginBottom: parsed.marginBottom ?? 10,
          marginLeft: parsed.marginLeft ?? 10,
          marginRight: parsed.marginRight ?? 10,
          labelsPerRow: parsed.labelsPerRow ?? 4,
          labelSpacingHorizontal: parsed.labelSpacingHorizontal ?? 2,
          labelSpacingVertical: parsed.labelSpacingVertical ?? 2,
        };
      }
    } catch (error) {
      console.error('Error loading saved print settings:', error);
    }
    // Default settings
    return {
      pageSize: 'a4',
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      labelsPerRow: 4,
      labelSpacingHorizontal: 2,
      labelSpacingVertical: 2,
    };
  };

  const [printSettings, setPrintSettings] = useState<PrintSettings>(loadSavedPrintSettings());

  // Save print settings to localStorage
  const savePrintSettings = (settings: PrintSettings) => {
    try {
      localStorage.setItem('barcode-print-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving print settings:', error);
    }
  };

  // Get unique categories and classes for filters
  const categories = useMemo(() => {
    const cats = new Set<string>();
    allProducts.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [allProducts]);

  const classes = useMemo(() => {
    const cls = new Set<string>();
    allProducts.forEach(p => {
      if (p.class) cls.add(p.class);
    });
    return Array.from(cls).sort();
  }, [allProducts]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allProducts];

    if (categoryFilter) {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    if (nameFilter.trim()) {
      const searchTerm = nameFilter.toLowerCase();
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(searchTerm) ||
        p.sku?.toLowerCase().includes(searchTerm)
      );
    }

    if (classFilter) {
      filtered = filtered.filter(p => p.class === classFilter);
    }

    setFilteredProducts(filtered);
    // Clear selection when filters change
    setSelectedProducts(new Set());
  }, [categoryFilter, nameFilter, classFilter, allProducts]);

  // Auto-generate barcodes for products with SKUs
  useEffect(() => {
    const generateBarcodes = async () => {
      // Only process products that need barcode generation
      const productsToGenerate = filteredProducts.filter(product => {
        if (!product.id || !product.sku || !product.sku.trim()) return false;
        // Check if already generated or currently loading
        const existing = productsWithBarcodes[product.id];
        return !existing?.barcodeUrl && !existing?.barcodeLoading;
      });

      if (productsToGenerate.length === 0) return;

      // Mark all as loading first
      const loadingState: Record<string, ProductWithBarcode> = {};
      productsToGenerate.forEach(product => {
        if (product.id) {
          loadingState[product.id] = {
            ...product,
            barcodeLoading: true
          };
        }
      });
      setProductsWithBarcodes(prev => ({ ...prev, ...loadingState }));

      // Generate barcodes in parallel (but with reasonable batch size)
      const batchSize = 5;
      for (let i = 0; i < productsToGenerate.length; i += batchSize) {
        const batch = productsToGenerate.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (product) => {
            if (!product.id) return;
            
            try {
              // Generate barcode image
              const barcodeImg = await generateCode128BarcodeImage(product.sku!, {
                width: 2,
                height: 40,
                margin: 5
              });
              
              // Get data URL from image
              const canvas = document.createElement('canvas');
              canvas.width = barcodeImg.width;
              canvas.height = barcodeImg.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(barcodeImg, 0, 0);
                const barcodeUrl = canvas.toDataURL('image/png');
                
                setProductsWithBarcodes(prev => ({
                  ...prev,
                  [product.id]: {
                    ...product,
                    barcodeUrl,
                    barcodeLoading: false
                  }
                }));
              }
            } catch (error) {
              console.error(`Error generating barcode for ${product.sku}:`, error);
              setProductsWithBarcodes(prev => ({
                ...prev,
                [product.id]: {
                  ...product,
                  barcodeLoading: false
                }
              }));
            }
          })
        );
      }
    };

    generateBarcodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProducts]);

  const handleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredProducts.map(p => p.id).filter(Boolean) as string[]);
      setSelectedProducts(allIds);
    } else {
      setSelectedProducts(new Set());
    }
  };

  const allSelected = filteredProducts.length > 0 && 
    filteredProducts.every(p => p.id && selectedProducts.has(p.id));
  const someSelected = filteredProducts.some(p => p.id && selectedProducts.has(p.id));

  const clearFilters = () => {
    setCategoryFilter('');
    setNameFilter('');
    setClassFilter('');
  };

  const handleGeneratePDF = async () => {
    if (selectedProducts.size === 0) {
      toast.error('Please select at least one product');
      return;
    }

    const selectedProductsList = filteredProducts.filter(p => 
      p.id && selectedProducts.has(p.id)
    );

    // Validate all selected products have SKU
    const missingSku = selectedProductsList.filter(p => !p.sku || !p.sku.trim());
    if (missingSku.length > 0) {
      toast.error(`${missingSku.length} selected product(s) are missing SKU values. Please add SKUs before generating barcodes.`);
      return;
    }

    try {
      setLoading(true);
      await generateBarcodeLabelsPDF(selectedProductsList, printSettings);
      // Save print settings after successful PDF generation
      savePrintSettings(printSettings);
      toast.success(`Successfully generated barcode labels for ${selectedProductsList.length} product(s)`);
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error(error.message || 'Failed to generate barcode labels PDF');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductsList = filteredProducts.filter(p => 
    p.id && selectedProducts.has(p.id)
  );

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category-filter">Category</Label>
              <Select value={categoryFilter || "all"} onValueChange={(value) => setCategoryFilter(value === "all" ? "" : value)}>
                <SelectTrigger id="category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name-filter">Name / SKU</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="name-filter"
                  placeholder="Search by name or SKU..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-filter">Class</Label>
              <Select value={classFilter || "all"} onValueChange={(value) => setClassFilter(value === "all" ? "" : value)}>
                <SelectTrigger id="class-filter">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(cls => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex items-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Products ({filteredProducts.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrintSettingsOpen(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Print Settings
              </Button>
              <Button
                onClick={handleGeneratePDF}
                disabled={selectedProducts.size === 0 || loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate PDF ({selectedProducts.size} selected)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {allProducts.length === 0
                  ? 'No products available. Please add products in the Product Master tab.'
                  : 'No products match the selected filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Barcode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const productWithBarcode = productsWithBarcodes[product.id || ''] || product;
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={product.id ? selectedProducts.has(product.id) : false}
                            onCheckedChange={() => product.id && handleSelectProduct(product.id)}
                            disabled={!product.sku || !product.sku.trim()}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{product.sku || '-'}</TableCell>
                        <TableCell>{product.name || '-'}</TableCell>
                        <TableCell>{product.class || '-'}</TableCell>
                        <TableCell>{product.size || '-'}</TableCell>
                        <TableCell>{product.color || '-'}</TableCell>
                        <TableCell>{product.category || '-'}</TableCell>
                        <TableCell>
                          {product.sku && product.sku.trim() ? (
                            productWithBarcode.barcodeLoading ? (
                              <div className="w-32 h-12 bg-muted animate-pulse rounded flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">Generating...</span>
                              </div>
                            ) : productWithBarcode.barcodeUrl ? (
                              <img
                                src={productWithBarcode.barcodeUrl}
                                alt={`Barcode for ${product.sku}`}
                                className="h-12 w-auto max-w-32 object-contain"
                                style={{ imageRendering: 'crisp-edges' }}
                              />
                            ) : (
                              <div className="w-32 h-12 bg-muted rounded flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">Error</span>
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">No SKU</span>
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

      {/* Print Settings Dialog */}
      <Dialog open={printSettingsOpen} onOpenChange={setPrintSettingsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Print Settings</DialogTitle>
            <DialogDescription>
              Configure page size, margins, and label spacing for barcode labels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page-size">Page Size</Label>
                <Select
                  value={printSettings.pageSize}
                  onValueChange={(value: 'a4' | 'letter' | 'custom') => 
                    setPrintSettings({ ...printSettings, pageSize: value })
                  }
                >
                  <SelectTrigger id="page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                    <SelectItem value="letter">Letter (8.5" × 11")</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {printSettings.pageSize === 'custom' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="custom-width">Width (mm)</Label>
                    <Input
                      id="custom-width"
                      type="number"
                      value={printSettings.customWidth || 210}
                      onChange={(e) =>
                        setPrintSettings({
                          ...printSettings,
                          customWidth: parseFloat(e.target.value) || 210
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-height">Height (mm)</Label>
                    <Input
                      id="custom-height"
                      type="number"
                      value={printSettings.customHeight || 297}
                      onChange={(e) =>
                        setPrintSettings({
                          ...printSettings,
                          customHeight: parseFloat(e.target.value) || 297
                        })
                      }
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="labels-per-row">Labels Per Row</Label>
                <Input
                  id="labels-per-row"
                  type="number"
                  min="1"
                  max="6"
                  value={printSettings.labelsPerRow}
                  onChange={(e) =>
                    setPrintSettings({
                      ...printSettings,
                      labelsPerRow: parseInt(e.target.value) || 4
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Margins (mm)</Label>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="margin-top" className="text-xs">Top</Label>
                  <Input
                    id="margin-top"
                    type="number"
                    value={printSettings.marginTop}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        marginTop: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="margin-bottom" className="text-xs">Bottom</Label>
                  <Input
                    id="margin-bottom"
                    type="number"
                    value={printSettings.marginBottom}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        marginBottom: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="margin-left" className="text-xs">Left</Label>
                  <Input
                    id="margin-left"
                    type="number"
                    value={printSettings.marginLeft}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        marginLeft: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="margin-right" className="text-xs">Right</Label>
                  <Input
                    id="margin-right"
                    type="number"
                    value={printSettings.marginRight}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        marginRight: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Label Spacing (mm)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="spacing-horizontal" className="text-xs">Horizontal</Label>
                  <Input
                    id="spacing-horizontal"
                    type="number"
                    value={printSettings.labelSpacingHorizontal}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        labelSpacingHorizontal: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="spacing-vertical" className="text-xs">Vertical</Label>
                  <Input
                    id="spacing-vertical"
                    type="number"
                    value={printSettings.labelSpacingVertical}
                    onChange={(e) =>
                      setPrintSettings({
                        ...printSettings,
                        labelSpacingVertical: parseFloat(e.target.value) || 0
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setPrintSettingsOpen(false)}
              >
                Close
              </Button>
              <Button 
                onClick={() => {
                  savePrintSettings(printSettings);
                  setPrintSettingsOpen(false);
                  toast.success('Print settings saved successfully');
                }}
              >
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
