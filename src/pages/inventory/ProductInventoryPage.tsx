import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErpLayout } from '@/components/ErpLayout';
import { ReceivingZoneInventory } from '@/components/warehouse/ReceivingZoneInventory';
import { StorageZoneInventory } from '@/components/warehouse/StorageZoneInventory';
import { InventoryTransferModal } from '@/components/warehouse/InventoryTransferModal';
import { InventoryAdjustment } from '@/components/masters/InventoryAdjustment';
import { WarehouseInventory } from '@/types/warehouse-inventory';
import { supabase } from '@/integrations/supabase/client';
import { Package, Search, Image as ImageIcon, X, ChevronLeft, ChevronRight, Archive, Truck, ArrowRightLeft, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Product {
  id: string;
  sku?: string;
  class?: string;
  name?: string;
  brand?: string;
  category?: string;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('products');
  const [selectedInventory, setSelectedInventory] = useState<WarehouseInventory | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [totals, setTotals] = useState({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadTotals();
    
    // Realtime subscription for warehouse inventory
    const channel = supabase
      .channel('product_inventory_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'warehouse_inventory',
        filter: 'item_type=eq.PRODUCT'
      } as any, () => {
        loadTotals();
        loadProducts(); // Reload products to get updated current_stock
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
      loadTotals();
      loadProducts();
    };
    window.addEventListener('warehouse-inventory-updated', handler as any);

    return () => {
      window.removeEventListener('warehouse-inventory-updated', handler as any);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

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
          product.category?.toLowerCase().includes(searchLower)
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
        .select('id, sku, class, name, brand, category, main_image, image_url, image1, image2, images, current_stock, created_at')
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

  const loadTotals = async () => {
    try {
      // Fetch totals for PRODUCT items only
      const { data, error } = await supabase
        .from('warehouse_inventory' as any)
        .select(`
          quantity,
          status,
          item_type,
          bin:bin_id (
            id,
            location_type
          )
        `)
        .eq('item_type', 'PRODUCT');
      
      if (error) {
        console.error('Error fetching product inventory totals:', error);
        setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
        return;
      }
      
      const rows = (data as any) || [];
      
      const receivingQty = rows
        .filter((r: any) => r.status === 'RECEIVED' && r.bin?.location_type === 'RECEIVING_ZONE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const storageQty = rows
        .filter((r: any) => r.status === 'IN_STORAGE' && r.bin?.location_type === 'STORAGE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const dispatchQty = rows
        .filter((r: any) => r.status === 'READY_TO_DISPATCH' && r.bin?.location_type === 'DISPATCH_ZONE')
        .reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const allQty = rows.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      
      setTotals({ receiving: receivingQty, storage: storageQty, dispatch: dispatchQty, all: allQty });
    } catch (error) {
      console.error('Error in loadTotals:', error);
      setTotals({ receiving: 0, storage: 0, dispatch: 0, all: 0 });
    }
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

  return (
    <ErpLayout>
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
              onClick={() => setAdjustmentDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Inventory Adjustment
            </Button>
            <Badge variant="outline" className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {filteredProducts.length} Products
            </Badge>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by SKU, Name, Class, Brand, or Category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-2">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products ({filteredProducts.length})
            </TabsTrigger>
            <TabsTrigger value="warehouse" className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Warehouse ({totals.all})
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Product Inventory</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
                <p className="text-muted-foreground">Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'No products found matching your search.' : 'No products found in inventory.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Image</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Inventory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const imageUrl = getProductImage(product);
                      const images = getAllProductImages(product);
                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            {imageUrl ? (
                              <div 
                                className="relative w-20 h-20 rounded border overflow-hidden bg-muted flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => handleImageClick(product)}
                              >
                                <img
                                  src={imageUrl}
                                  alt={product.name || 'Product'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.parentElement) {
                                      e.currentTarget.parentElement.innerHTML = '<div class="w-20 h-20 rounded border bg-muted flex items-center justify-center"><svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                                    }
                                  }}
                                />
                                {images.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 rounded">
                                    {images.length}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-20 h-20 rounded border bg-muted flex items-center justify-center">
                                <ImageIcon className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => handleSkuClick(product)}
                              className="font-mono font-medium text-primary hover:underline cursor-pointer"
                            >
                              {product.sku || '-'}
                            </button>
                          </TableCell>
                          <TableCell>
                            {product.class ? (
                              <Badge variant="secondary">{product.class}</Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {product.name || '-'}
                          </TableCell>
                          <TableCell>
                            {product.brand || '-'}
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="outline">{product.category}</Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.current_stock !== undefined && product.current_stock !== null ? (
                              <Badge 
                                variant={product.current_stock > 0 ? 'default' : 'secondary'}
                                className="font-mono"
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
          </TabsContent>

          {/* Warehouse Tab */}
          <TabsContent value="warehouse" className="space-y-6">
            {/* Warehouse Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Receiving Zone</p>
                      <p className="text-2xl font-bold">{Math.round(totals.receiving)}</p>
                      <p className="text-xs text-muted-foreground">Total quantity received</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Archive className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Storage Zone</p>
                      <p className="text-2xl font-bold">{Math.round(totals.storage)}</p>
                      <p className="text-xs text-muted-foreground">Total quantity in storage</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Truck className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Dispatch Zone</p>
                      <p className="text-2xl font-bold">{Math.round(totals.dispatch)}</p>
                      <p className="text-xs text-muted-foreground">Total quantity ready to dispatch</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Package className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Items</p>
                      <p className="text-2xl font-bold">{Math.round(totals.all)}</p>
                      <p className="text-xs text-muted-foreground">Total quantity across zones</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Warehouse Zone Badges */}
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                Receiving Zone
              </Badge>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="flex items-center gap-1">
                <Archive className="h-3 w-3" />
                Storage Zone
              </Badge>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="flex items-center gap-1">
                <Truck className="h-3 w-3" />
                Dispatch Zone
              </Badge>
            </div>

            {/* Warehouse Tabs */}
            <Tabs defaultValue="receiving" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="receiving" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Receiving Zone ({totals.receiving})
                </TabsTrigger>
                <TabsTrigger value="storage" className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Storage Zone ({totals.storage})
                </TabsTrigger>
                <TabsTrigger value="dispatch" className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Dispatch Zone ({totals.dispatch})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="receiving" className="space-y-4">
                <ReceivingZoneInventory
                  onTransferItem={handleTransferItem}
                  onViewDetails={handleViewDetails}
                  itemType="PRODUCT"
                />
              </TabsContent>

              <TabsContent value="storage" className="space-y-4">
                <StorageZoneInventory 
                  onViewDetails={handleViewDetails}
                  itemType="PRODUCT"
                />
              </TabsContent>

              <TabsContent value="dispatch" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      Dispatch Zone Inventory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Dispatch zone inventory coming soon...</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Items ready for dispatch will appear here
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

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
      </div>
    </ErpLayout>
  );
};

export default ProductInventoryPage;
