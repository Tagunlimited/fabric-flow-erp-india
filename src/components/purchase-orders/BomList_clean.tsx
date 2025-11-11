import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Search, Eye, Edit, FileText, Plus } from 'lucide-react';
import { BomDisplayCard } from './BomDisplayCard';
import { toast } from 'sonner';

interface BomRecord {
  id: string;
  bom_number: string;
  product_name: string;
  product_image_url?: string;
  total_order_qty: number;
  created_at: string;
  order?: {
    order_number: string;
    customer?: {
      company_name: string;
    };
  };
  bom_items?: any[];
  bom_record_items?: any[];
}

export function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBom, setSelectedBom] = useState<BomRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [processedBomItems, setProcessedBomItems] = useState<any[]>([]);

  useEffect(() => {
    fetchBoms();
  }, []);

  const fetchBoms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bom_records')
        .select(`
          *,
          order:orders(
            order_number,
            customer:customers(company_name)
          ),
          bom_record_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching BOMs:', error);
        toast.error('Failed to fetch BOMs');
        return;
      }

      console.log('Fetched BOMs:', data);
      setBoms((data as any) || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to fetch BOMs');
    } finally {
      setLoading(false);
    }
  };

  const processBomItemsWithImages = async (bomItems: any[]) => {
    if (!bomItems || bomItems.length === 0) {
      setProcessedBomItems([]);
      return;
    }

    const fetchStockForBomItem = async (item: any) => {
      const category = (item?.category || '').toLowerCase();
      const itemTypeFilter = category === 'fabric' ? 'FABRIC' : 'ITEM';
      let resolvedQuantity = Number(item?.stock ?? 0) || 0;
      let resolvedUnit = item?.unit_of_measure || item?.required_unit || '';

      const fabricName = item?.fabric_name?.trim() || item?.item_name?.split(' - ')[0]?.trim();
      const normalizedItemName = item?.item_name?.trim();

      const fetchWarehouseInventory = async (
        configureQuery?: (query: any) => any
      ): Promise<any[] | null> => {
        try {
          let query = supabase
            .from('warehouse_inventory' as any)
            .select('quantity, unit, item_name, item_code')
            .eq('status', 'IN_STORAGE')
            .eq('item_type', itemTypeFilter);

          if (configureQuery) {
            query = configureQuery(query);
          }

          const { data, error } = await query;

          if (error) {
            console.warn('Failed to fetch warehouse inventory for BOM item', {
              itemId: item?.id,
              category,
              error
            });
            return null;
          }

          if (data && data.length > 0) {
            return data as any[];
          }
        } catch (err) {
          console.error('Unexpected error while fetching warehouse inventory for BOM item', {
            itemId: item?.id,
            err
          });
        }

        return null;
      };

      const warehouseInventoryStrategies: ((query: any) => any)[] = [];

      if (item?.item_id) {
        warehouseInventoryStrategies.push((query) => query.eq('item_id', item.item_id));
      }

      if (item?.item_code) {
        warehouseInventoryStrategies.push((query) => query.eq('item_code', item.item_code));
      }

      if (category === 'fabric') {
        if (fabricName) {
          warehouseInventoryStrategies.push((query) => query.eq('item_name', fabricName));
          warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${fabricName}%`));
        }
      } else if (normalizedItemName) {
        warehouseInventoryStrategies.push((query) => query.eq('item_name', normalizedItemName));
        warehouseInventoryStrategies.push((query) => query.ilike('item_name', `%${normalizedItemName}%`));
      }

      let inventoryRows: any[] | null = null;

      for (const strategy of warehouseInventoryStrategies) {
        inventoryRows = await fetchWarehouseInventory(strategy);
        if (inventoryRows && inventoryRows.length > 0) {
          break;
        }
      }

      if (!inventoryRows) {
        inventoryRows = await fetchWarehouseInventory();
      }

      if (inventoryRows && inventoryRows.length > 0) {
        resolvedQuantity = inventoryRows.reduce(
          (sum, row) => sum + Number(row?.quantity || 0),
          0
        );

        const unitFromRow = inventoryRows.find((row) => row?.unit)?.unit;
        if (unitFromRow) {
          resolvedUnit = unitFromRow;
        }
      } else if (category === 'fabric') {
        try {
          if (fabricName) {
            let fabricQuery = supabase
              .from('fabric_stock_summary' as any)
              .select('total_available, total_quantity, unit, color, gsm')
              .eq('fabric_name', fabricName);

            const fabricColor = item?.fabric_color?.trim();
            const fabricGsm = item?.fabric_gsm?.trim();

            if (fabricColor) {
              fabricQuery = fabricQuery.eq('color', fabricColor);
            }

            if (fabricGsm) {
              fabricQuery = fabricQuery.eq('gsm', fabricGsm);
            }

            const { data: fabricStockRows, error: fabricStockError } = await fabricQuery.limit(1);

            if (fabricStockError) {
              console.warn('Failed to fetch fabric stock summary for BOM item', {
                itemId: item?.id,
                fabricName,
                fabricColor,
                fabricGsm,
                error: fabricStockError
              });
            } else if (fabricStockRows && fabricStockRows.length > 0) {
              const fabricStock = fabricStockRows[0] as any;
              const available = Number(
                fabricStock?.total_available ?? fabricStock?.total_quantity ?? 0
              );
              if (!Number.isNaN(available)) {
                resolvedQuantity = available;
              }
              if (fabricStock?.unit) {
                resolvedUnit = fabricStock.unit;
              }
            } else {
              const { data: nameOnlyRows, error: nameOnlyError } = await supabase
                .from('fabric_stock_summary' as any)
                .select('total_available, total_quantity, unit')
                .eq('fabric_name', fabricName)
                .limit(1);

              if (nameOnlyError) {
                console.warn('Failed fallback fabric stock summary lookup for BOM item', {
                  itemId: item?.id,
                  fabricName,
                  error: nameOnlyError
                });
              } else if (nameOnlyRows && nameOnlyRows.length > 0) {
                const fabricStock = nameOnlyRows[0] as any;
                const available = Number(
                  fabricStock?.total_available ?? fabricStock?.total_quantity ?? 0
                );
                if (!Number.isNaN(available)) {
                  resolvedQuantity = available;
                }
                if (fabricStock?.unit) {
                  resolvedUnit = fabricStock.unit;
                }
              }
            }
          }
        } catch (error) {
          console.error('Unexpected error while resolving fabric stock summary for BOM item', {
            itemId: item?.id,
            error
          });
        }
      }

      return {
        quantity: resolvedQuantity,
        unit: resolvedUnit
      };
    };

    const processedItems = await Promise.all(
      bomItems.filter(item => {
        const isValid = item && item.id && (item.item_name || item.category);
        if (!isValid) {
          console.log('Filtering out invalid item:', item);
        }
        return isValid;
      }).map(async (item) => {
        console.log('Processing BOM item for display:', item);
        
        // Fetch image for the item
        let imageUrl = null;
        const stockInfo = await fetchStockForBomItem(item);
        
        if (item.category === 'Fabric') {
          // Fetch fabric image
          try {
            const fabricName = item.fabric_name || item.item_name?.split(' - ')[0] || '';
            const fabricColor = item.fabric_color || '';
            const fabricGsm = item.fabric_gsm || '';
            
            console.log('Fetching fabric image for:', { fabricName, fabricColor, fabricGsm });
            
            // Try exact match first
            let fabricResult = await supabase
              .from('fabric_master')
              .select('image')
              .eq('fabric_name', fabricName)
              .eq('color', fabricColor)
              .eq('gsm', fabricGsm)
              .single();
            
            if (fabricResult.error) {
              // Try partial match - just name
              fabricResult = await supabase
                .from('fabric_master')
                .select('image')
                .eq('fabric_name', fabricName)
                .single();
            }
            
            if (!fabricResult.error && (fabricResult.data as any)?.image) {
              imageUrl = (fabricResult.data as any).image;
              console.log('Found fabric image:', imageUrl);
            } else {
              console.log('No fabric image found:', fabricResult.error);
            }
          } catch (error) {
            console.log('Error fetching fabric image:', error);
          }
        } else if (item.item_id) {
          // Fetch item image
          try {
            console.log('Fetching item image for item_id:', item.item_id);
            
            const itemResult = await supabase
              .from('item_master')
              .select('image, image_url')
              .eq('id', item.item_id)
              .single();
            
            if (!itemResult.error && ((itemResult.data as any)?.image || (itemResult.data as any)?.image_url)) {
              imageUrl = (itemResult.data as any).image || (itemResult.data as any).image_url;
              console.log('Found item image:', imageUrl);
            } else {
              console.log('No item image found:', itemResult.error);
            }
          } catch (error) {
            console.log('Error fetching item image:', error);
          }
        }
        
        return {
          id: item.id,
          item_name: item.item_name,
          category: item.category,
          required_qty: item.qty_total,
          required_unit: item.unit_of_measure,
          in_stock: stockInfo.quantity,
          stock_unit: stockInfo.unit,
          image_url: imageUrl || item.item?.image_url || item.item?.image || null
        };
      })
    );
    
    setProcessedBomItems(processedItems);
  };

  const viewBomDetails = async (bom: BomRecord) => {
    console.log('Opening BOM Details for:', bom);
    console.log('BOM Items:', bom.bom_items);
    console.log('BOM Items Length:', bom.bom_record_items?.length || 0);
    console.log('BOM ID:', bom.id);
    console.log('BOM Product Name:', bom.product_name);
    
    if (bom.bom_record_items && bom.bom_record_items.length > 0) {
      console.log('First BOM item:', bom.bom_record_items[0]);
      console.log('All BOM items:', bom.bom_record_items.map(item => ({
        id: item.id,
        item_name: item.item_name,
        category: item.category,
        qty_total: item.qty_total
      })));
    } else {
      console.warn('No BOM items found for this BOM');
    }
    
    setSelectedBom(bom);
    setDetailDialogOpen(true);
    
    // Process BOM items with images
    await processBomItemsWithImages(bom.bom_record_items || []);
  };

  const editBom = (bom: BomRecord) => {
    navigate(`/bom/${bom.id}/edit`);
  };

  const createPurchaseOrderFromBom = (bom: BomRecord) => {
    const items = (bom.bom_record_items || []).map((it: any) => ({
      item_type: it.category === 'Fabric' ? 'fabric' : 'item',
      item_id: it.item_id || '',
      item_name: it.item_name || '',
      item_image_url: it.image_url || null,
      quantity: Number(it.qty_total || it.required_qty || 0),
      unit_price: 0,
      unit_of_measure: it.unit_of_measure || it.required_unit || 'pcs',
      gst_rate: it.gst_rate || 18,
      item_category: it.category || null,
      fabricSelections: it.fabricSelections || (
        it.category === 'Fabric'
          ? [{ color: it.fabric_color || '', gsm: it.fabric_gsm || '', quantity: Number(it.qty_total || 0) }]
          : []
      )
    }));

    const bomPayload = {
      id: bom.id,
      bom_number: bom.bom_number,
      product_name: bom.product_name,
      order_number: bom.order?.order_number,
      items
    } as any;

    const encoded = encodeURIComponent(JSON.stringify(bomPayload));
    navigate(`/procurement/po/new?bom=${encoded}`);
  };

  const filteredBoms = boms.filter(bom => {
    const term = searchTerm.toLowerCase();
    return (
      bom.bom_number?.toLowerCase().includes(term) ||
      bom.product_name?.toLowerCase().includes(term) ||
      bom.order?.order_number?.toLowerCase().includes(term) ||
      bom.order?.customer?.company_name?.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading BOMs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">BOM Management</h1>
          <p className="text-muted-foreground">Manage your Bills of Materials</p>
        </div>
        <Button onClick={() => navigate('/bom/create')}>
          <Plus className="w-4 h-4 mr-2" />
          Create BOM
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search BOMs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by BOM number, product name, order number, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* BOM List */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Records ({filteredBoms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredBoms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No BOMs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BOM Number</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoms.map((bom) => (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">{bom.bom_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          {bom.product_image_url && (
                            <img 
                              src={bom.product_image_url} 
                              alt={bom.product_name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{bom.product_name}</div>
                            <Badge variant="secondary" className="text-xs">
                              {bom.bom_record_items?.length || 0} items
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{bom.order?.order_number || 'N/A'}</TableCell>
                      <TableCell>{bom.order?.customer?.company_name || 'N/A'}</TableCell>
                      <TableCell>{bom.total_order_qty}</TableCell>
                      <TableCell>
                        {new Date(bom.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => viewBomDetails(bom)}
                            variant="outline"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => editBom(bom)}
                            variant="outline"
                            className="mr-2"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => createPurchaseOrderFromBom(bom)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Create PO
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BOM Details Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BOM Details</DialogTitle>
          </DialogHeader>
          {selectedBom && (
            <BomDisplayCard
              orderId={selectedBom.order?.order_number || ''}
              productId={`${selectedBom.order?.order_number}/1`}
              productName={selectedBom.product_name}
              productImageUrl={selectedBom.product_image_url}
              totalOrderQty={selectedBom.total_order_qty}
              bomItems={processedBomItems}
              onViewClick={() => {
                setDetailDialogOpen(false);
                createPurchaseOrderFromBom(selectedBom);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
