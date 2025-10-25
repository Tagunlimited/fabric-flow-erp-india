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
  has_purchase_order?: boolean; // Track if PO already exists
}

export function BomList() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBom, setSelectedBom] = useState<BomRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [processedBomItems, setProcessedBomItems] = useState<any[]>([]);
  const [recentlyCreatedPOs, setRecentlyCreatedPOs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBoms();
  }, []);

  // Refresh BOMs when returning from PO creation
  useEffect(() => {
    const handleFocus = () => {
      console.log('Window focused - refreshing BOMs to check for new POs');
      fetchBoms();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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

      console.log('=== BOM FETCH DEBUG ===');
      console.log('Raw data from Supabase:', data);
      console.log('Number of BOMs fetched:', data?.length || 0);
      console.log('Data type:', typeof data);
      console.log('Is array:', Array.isArray(data));
      console.log('First BOM data structure:', data?.[0]);
      console.log('All BOM IDs:', (data as any)?.map((bom: any) => bom.id));
      console.log('All BOM Numbers:', (data as any)?.map((bom: any) => bom.bom_number));
      console.log('========================');

      // Check which BOMs already have purchase orders
      const bomIds = ((data as any) || []).map((bom: any) => bom.id);
      console.log('Checking for POs for BOM IDs:', bomIds);
      console.log('BOM details being checked:', ((data as any) || []).map((bom: any) => ({
        id: bom.id,
        bom_number: bom.bom_number,
        product_name: bom.product_name,
        order_id: bom.order_id,
        order_number: (bom as any).order?.order_number,
        order_data: (bom as any).order
      })));
      
      // Log the full order relationship for debugging
      if (data && data.length > 0) {
        console.log('Full order relationship data:', (data[0] as any).order);
      }
      
      const { data: existingPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('bom_id, po_number, created_at')
        .in('bom_id', bomIds)
        .not('bom_id', 'is', null);

      if (poError) {
        console.error('Error fetching purchase orders:', poError);
      }

      console.log('Existing POs found:', existingPOs);
      console.log('Number of POs found:', existingPOs?.length || 0);
      
      // Log detailed PO information
      if (existingPOs && existingPOs.length > 0) {
        console.log('Detailed PO information:');
        existingPOs.forEach((po: any, index: number) => {
          console.log(`PO ${index + 1}:`, {
            id: po.id,
            bom_id: po.bom_id,
            po_number: po.po_number,
            created_at: po.created_at
          });
        });
        
        // Check if these POs actually belong to this BOM
        console.log('=== BOM-PO RELATIONSHIP CHECK ===');
        console.log('Current BOM ID:', bomIds[0]);
        console.log('POs found for this BOM:');
        existingPOs.forEach((po: any) => {
          const belongsToThisBom = po.bom_id === bomIds[0];
          console.log(`PO ${po.po_number}: bom_id=${po.bom_id}, belongs_to_this_bom=${belongsToThisBom}`);
        });
        console.log('================================');
      }

      // Allow multiple POs per BOM - don't disable button based on existing POs
      // This allows users to create multiple purchase orders for the same BOM
      const validPOs = (existingPOs || []).filter((po: any) => bomIds.includes(po.bom_id));
      const bomIdsWithPO = new Set(); // Empty set - don't disable any buttons
      
      console.log('Valid POs for current BOMs:', validPOs.length);
      console.log('BOM IDs with valid POs:', Array.from(bomIdsWithPO));
      console.log('Allowing multiple POs per BOM - buttons will remain enabled');

      // Mark BOMs that already have purchase orders
      const bomsWithPOStatus = ((data as any) || []).map((bom: any) => {
        const hasPO = bomIdsWithPO.has(bom.id);
        console.log(`BOM ${bom.bom_number} (${bom.id}): has_purchase_order = ${hasPO}`);
        return {
          ...bom,
          has_purchase_order: hasPO
        };
      });

      console.log('Final BOMs with PO status:', bomsWithPOStatus.map((bom: any) => ({
        bom_number: bom.bom_number,
        has_purchase_order: bom.has_purchase_order
      })));

      setBoms(bomsWithPOStatus as any);
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

  const createPurchaseOrderFromBom = async (bom: BomRecord) => {
    console.log('Creating PO from BOM:', bom);
    console.log('BOM items to process:', bom.bom_record_items);
    console.log('BOM has_purchase_order status:', bom.has_purchase_order);
    
    // Double-check if this specific BOM actually has a PO
    const { data: specificPOs, error: specificPOError } = await supabase
      .from('purchase_orders')
      .select('id, po_number, created_at')
        .eq('bom_id', bom.id as any);
    
    console.log('Specific POs for this BOM:', specificPOs);
    console.log('Specific PO count:', specificPOs?.length || 0);
    
    if (specificPOs && specificPOs.length > 0) {
      console.warn('This BOM already has POs, but allowing creation of additional POs');
      console.log('Existing POs:', specificPOs);
      console.log('Creating additional PO for same BOM - this is allowed');
      // Don't return - allow creation of additional POs
    }
    
    // Process BOM items with images for PO creation
    const bomItems = bom.bom_record_items || [];
    console.log('Raw BOM items:', bomItems);
    console.log('BOM items detailed:', bomItems.map((item: any) => ({
      id: item.id,
      item_id: item.item_id,
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category,
      qty_total: item.qty_total,
      to_order: item.to_order,
      stock: item.stock,
      fabric_name: item.fabric_name,
      fabric_color: item.fabric_color,
      fabric_gsm: item.fabric_gsm
    })));
    
    if (bomItems.length === 0) {
      console.warn('No BOM items found for this BOM');
      toast.error('No BOM items found to create purchase order');
      return;
    }

    const filteredItems = bomItems.filter(item => {
      console.log('Filtering BOM item:', {
        item_id: item.item_id,
        item_name: item.item_name,
        qty_total: item.qty_total,
        to_order: item.to_order,
        category: item.category,
        fabric_name: item.fabric_name,
        has_item_id: !!item.item_id,
        has_item_name: !!item.item_name,
        has_fabric_name: !!item.fabric_name,
        has_quantity: !!(item.qty_total > 0 || item.to_order > 0)
      });
      
      // For fabric items, check fabric_name instead of item_id
      const isFabric = item.category === 'Fabric';
      const hasValidIdentifier = isFabric ? !!item.fabric_name : !!item.item_id;
      const hasValidName = isFabric ? !!item.fabric_name : !!item.item_name;
      
      return hasValidIdentifier && hasValidName && (item.qty_total != null || item.to_order != null);
    });
    
    console.log('Filtered items count:', filteredItems.length);
    console.log('Filtered items:', filteredItems.map((item: any) => ({
      item_name: item.item_name,
      item_type: item.item_type,
      category: item.category
    })));
    
    const processedItems = await Promise.all(
      filteredItems.map(async (item: any) => {
        let imageUrl = null;
        
        // Try to get image from BOM item first
        if (item.image_url) {
          imageUrl = item.image_url;
        } else if (item.item?.image_url) {
          imageUrl = item.item.image_url;
        } else if (item.item?.image) {
          imageUrl = item.item.image;
        } else {
          // Fetch image from fabric_master or item_master
          try {
            if (item.category === 'Fabric') {
              // For fabric items, use fabric_name, fabric_color, fabric_gsm to find the fabric
              const { data: fabricData } = await supabase
                .from('fabric_master')
                .select('image')
                .eq('fabric_name', item.fabric_name || item.item_name)
                .eq('color', item.fabric_color || '')
                .eq('gsm', item.fabric_gsm || '')
                .single();
              imageUrl = (fabricData as any)?.image || null;
              
              // If not found with exact match, try just fabric name
              if (!imageUrl && item.fabric_name) {
                const { data: fabricData2 } = await supabase
                  .from('fabric_master')
                  .select('image')
                  .eq('fabric_name', item.fabric_name)
                  .single();
                imageUrl = (fabricData2 as any)?.image || null;
              }
            } else {
              const { data: itemData } = await supabase
                .from('item_master')
                .select('image_url, image')
                .eq('id', item.item_id)
                .single();
              imageUrl = (itemData as any)?.image_url || (itemData as any)?.image || null;
            }
          } catch (error) {
            console.warn('Failed to fetch image for item:', item.item_name || item.fabric_name, error);
          }
        }

        return {
          ...item,
          image_url: imageUrl
        };
      })
    );

    console.log('Processed items for PO:', processedItems);

    const bomPayload = {
      id: bom.id,
      bom_number: bom.bom_number,
      product_name: bom.product_name,
      order_number: bom.order?.order_number,
      items: processedItems
    } as any;

    console.log('BOM payload for PO:', bomPayload);

    const encoded = encodeURIComponent(JSON.stringify(bomPayload));
    console.log('Navigating to PO form with BOM data');
    
    // Mark this BOM as having a PO created in this session
    setRecentlyCreatedPOs(prev => new Set([...prev, bom.id]));
    
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

  console.log('=== BOM FILTERING DEBUG ===');
  console.log('Total BOMs in state:', boms.length);
  console.log('Search term:', searchTerm);
  console.log('Filtered BOMs count:', filteredBoms.length);
  console.log('Filtered BOM IDs:', filteredBoms.map(bom => bom.id));
  console.log('===========================');

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
                  {filteredBoms.map((bom, index) => {
                    console.log(`Rendering BOM ${index + 1}:`, bom.id, bom.bom_number);
                    return (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">
                        {bom.bom_number || `BOM-${bom.id?.slice(-8) || 'N/A'}`}
                      </TableCell>
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
                            onClick={() => {
                              console.log('=== CREATE PO BUTTON CLICKED ===');
                              console.log('BOM ID:', bom.id);
                              console.log('BOM Number:', bom.bom_number);
                              console.log('Product Name:', bom.product_name);
                              console.log('has_purchase_order:', bom.has_purchase_order);
                              console.log('recently_created_po:', recentlyCreatedPOs.has(bom.id));
                              console.log('Button disabled:', bom.has_purchase_order || recentlyCreatedPOs.has(bom.id));
                              console.log('================================');
                              createPurchaseOrderFromBom(bom);
                            }}
                            disabled={bom.has_purchase_order || recentlyCreatedPOs.has(bom.id)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            {bom.has_purchase_order || recentlyCreatedPOs.has(bom.id) ? 'PO Created' : 'Create PO'}
                          </Button>
                        </div>
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
