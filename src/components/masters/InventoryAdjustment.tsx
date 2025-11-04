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
  Package
} from 'lucide-react';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inventory Adjustment</h2>
          <p className="text-muted-foreground">Adjust product inventory quantities with full audit trail</p>
        </div>
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

