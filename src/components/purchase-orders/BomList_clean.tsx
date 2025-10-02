import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
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
          bom_items:bom_record_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching BOMs:', error);
        toast.error('Failed to fetch BOMs');
        return;
      }

      console.log('Fetched BOMs:', data);
      setBoms(data || []);
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
            
            if (!fabricResult.error && fabricResult.data?.image) {
              imageUrl = fabricResult.data.image;
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
            
            if (!itemResult.error && (itemResult.data?.image || itemResult.data?.image_url)) {
              imageUrl = itemResult.data.image || itemResult.data.image_url;
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
          in_stock: item.stock,
          stock_unit: item.unit_of_measure,
          image_url: imageUrl || item.item?.image_url || item.item?.image || null
        };
      })
    );
    
    setProcessedBomItems(processedItems);
  };

  const viewBomDetails = async (bom: BomRecord) => {
    console.log('Opening BOM Details for:', bom);
    console.log('BOM Items:', bom.bom_items);
    console.log('BOM Items Length:', bom.bom_items?.length || 0);
    console.log('BOM ID:', bom.id);
    console.log('BOM Product Name:', bom.product_name);
    
    if (bom.bom_items && bom.bom_items.length > 0) {
      console.log('First BOM item:', bom.bom_items[0]);
      console.log('All BOM items:', bom.bom_items.map(item => ({
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
    await processBomItemsWithImages(bom.bom_items || []);
  };

  const editBom = (bom: BomRecord) => {
    navigate(`/bom/${bom.id}/edit`);
  };

  const createPurchaseOrderFromBom = (bom: BomRecord) => {
    // Navigate to purchase order creation with BOM data
    navigate('/procurement/po/new', { 
      state: { 
        bomData: bom,
        bomItems: processedBomItems 
      } 
    });
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
                              {bom.bom_items?.length || 0} items
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
