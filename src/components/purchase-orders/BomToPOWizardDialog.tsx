import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { BomToPOWizard } from './BomToPOWizard';
import { getBomItemOrderStatus, getBomCompletionStatus } from '@/services/bomPOTracking';
import { BomItemOrderStatus } from '@/services/bomPOTracking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BomToPOWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bomId: string;
  bomNumber: string;
  onComplete?: (createdPOs: string[]) => void;
}

export function BomToPOWizardDialog({
  open,
  onOpenChange,
  bomId,
  bomNumber,
  onComplete
}: BomToPOWizardDialogProps) {
  const [bomItems, setBomItems] = useState<BomItemOrderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<{
    totalItems: number;
    orderedItems: number;
    completionPercentage: number;
    status: 'not_started' | 'in_progress' | 'completed';
  } | null>(null);

  // Load BOM items and status when dialog opens
  useEffect(() => {
    if (open && bomId) {
      loadBomData();
    }
  }, [open, bomId]);

  const loadBomData = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, get the BOM record to fetch the original order data
      const { data: bomRecord, error: bomRecordError } = await supabase
        .from('bom_records')
        .select(`
          id,
          order_id,
          product_name,
          product_image_url
        `)
        .eq('id', bomId)
        .single();

      if (bomRecordError) throw bomRecordError;

      // Load BOM items with full details
      const { data: bomItemsData, error: bomItemsError } = await supabase
        .from('bom_record_items')
        .select(`
          id,
          item_name,
          category,
          qty_total,
          unit_of_measure,
          item_id,
          item_code
        `)
        .eq('bom_id', bomId);

      if (bomItemsError) throw bomItemsError;

      // Fetch original order data to get fabric attributes
      let orderData = null;
      if (bomRecord.order_id) {
        try {
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
              id,
              order_items(
                id,
                product_description,
                fabric_id,
                color,
                gsm,
                fabric:fabric_master(
                  id,
                  fabric_name,
                  color,
                  gsm,
                  image
                )
              )
            `)
            .eq('id', bomRecord.order_id)
            .single();
          
          if (!orderError) {
            orderData = order;
          }
        } catch (error) {
          console.log('Could not fetch order data:', error);
        }
      }

      // Process BOM items with all attributes
      const processedItems = await Promise.all(
        (bomItemsData || []).map(async (item) => {
          console.log('Processing BOM item for wizard:', item);
          
          let imageUrl = null;
          let fabricName = '';
          let fabricColor = '';
          let fabricGsm = '';
          let itemAttributes: any = {};
          
          if (item.category === 'Fabric') {
            // For fabric items, try to get attributes from order data first
            if (orderData?.order_items) {
              const orderItem = orderData.order_items.find((oi: any) => 
                oi.product_description === item.item_name || 
                oi.fabric?.fabric_name === item.item_name
              );
              
              if (orderItem?.fabric) {
                fabricName = orderItem.fabric.fabric_name || '';
                fabricColor = orderItem.fabric.color || orderItem.color || '';
                fabricGsm = orderItem.fabric.gsm || orderItem.gsm || '';
                imageUrl = orderItem.fabric.image || null;
              }
            }
            
            // If not found in order data, try to derive from item name or fetch from fabric_master
            if (!fabricName) {
              // Try to parse fabric name from item_name (e.g., "Dotknit 180 GSM - Turquoise Blue - 180 GSM")
              const nameParts = item.item_name?.split(' - ') || [];
              fabricName = nameParts[0] || item.item_name || '';
              fabricColor = nameParts[1] || '';
              fabricGsm = nameParts[2] || '';
              
              console.log('🔍 Parsed fabric details from item name:', { 
                itemName: item.item_name, 
                parsedName: fabricName, 
                parsedColor: fabricColor, 
                parsedGsm: fabricGsm 
              });
            }
            
            // Fetch fabric details from fabric_master if we have fabric name
            if (fabricName && !imageUrl) {
              try {
                console.log('🔍 Fetching fabric details for:', { fabricName, fabricColor, fabricGsm });
                
                // First, let's see what fabrics are available
                const { data: allFabrics, error: listError } = await supabase
                  .from('fabric_master')
                  .select('fabric_name, color, gsm, image')
                  .limit(10);
                
                if (!listError && allFabrics) {
                  console.log('📋 Available fabrics:', allFabrics);
                }
                
                // Try multiple matching strategies
                let fabricResult = null;
                
                // Strategy 1: Exact match on all fields
                if (fabricName && fabricColor && fabricGsm) {
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .eq('fabric_name', fabricName)
                    .eq('color', fabricColor)
                    .eq('gsm', fabricGsm)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Exact match found:', fabricResult.data);
                  } else {
                    console.log('❌ Exact match failed:', fabricResult.error.message);
                  }
                }
                
                // Strategy 2: Match fabric name only
                if (fabricResult?.error && fabricName) {
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .eq('fabric_name', fabricName)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Name match found:', fabricResult.data);
                  } else {
                    console.log('❌ Name match failed:', fabricResult.error.message);
                  }
                }
                
                // Strategy 3: Fuzzy match - contains name
                if (fabricResult?.error && fabricName) {
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .ilike('fabric_name', `%${fabricName}%`)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Fuzzy match found:', fabricResult.data);
                  } else {
                    console.log('❌ Fuzzy match failed:', fabricResult.error.message);
                  }
                }
                
                // Strategy 4: Try without GSM in the name (for cases like "Dotknit 180 GSM")
                if (fabricResult?.error && fabricName.includes('GSM')) {
                  const nameWithoutGsm = fabricName.replace(/\s+\d+\s+GSM/i, '').trim();
                  console.log('🔍 Trying without GSM:', nameWithoutGsm);
                  
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .ilike('fabric_name', `%${nameWithoutGsm}%`)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Name without GSM match found:', fabricResult.data);
                  } else {
                    console.log('❌ Name without GSM match failed:', fabricResult.error.message);
                  }
                }
                
                // Strategy 5: Try matching by color only
                if (fabricResult?.error && fabricColor) {
                  console.log('🔍 Trying color match:', fabricColor);
                  
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .ilike('color', `%${fabricColor}%`)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Color match found:', fabricResult.data);
                  } else {
                    console.log('❌ Color match failed:', fabricResult.error.message);
                  }
                }
                
                // Strategy 6: Get any fabric with an image as last resort
                if (fabricResult?.error) {
                  console.log('🔍 Trying to get any fabric with image...');
                  
                  fabricResult = await supabase
                    .from('fabric_master')
                    .select('fabric_name, color, gsm, image')
                    .not('image', 'is', null)
                    .not('image', 'eq', '')
                    .limit(1)
                    .single();
                  
                  if (!fabricResult.error) {
                    console.log('✅ Found fabric with image:', fabricResult.data);
                  } else {
                    console.log('❌ No fabrics with images found:', fabricResult.error.message);
                  }
                }
                
                if (!fabricResult.error && fabricResult.data) {
                  fabricName = fabricResult.data.fabric_name || fabricName;
                  fabricColor = fabricResult.data.color || fabricColor;
                  fabricGsm = fabricResult.data.gsm || fabricGsm;
                  imageUrl = fabricResult.data.image || null;
                  console.log('✅ Found fabric details:', { fabricName, fabricColor, fabricGsm, imageUrl });
                } else {
                  console.log('❌ No fabric found in master table:', fabricResult.error);
                }
              } catch (error) {
                console.log('Error fetching fabric details:', error);
              }
            }
          } else if (item.item_id) {
            // For item items, fetch from item_master
            try {
              console.log('Fetching item details for item_id:', item.item_id);
              
              const itemResult = await supabase
                .from('item_master')
                .select('*')
                .eq('id', item.item_id)
                .single();
              
              if (!itemResult.error && itemResult.data) {
                const itemData = itemResult.data;
                imageUrl = itemData.image || itemData.image_url || null;
                
                // Store all item attributes
                itemAttributes = {
                  item_code: itemData.item_code,
                  description: itemData.description,
                  size: itemData.size,
                  color: itemData.color,
                  material: itemData.material,
                  weight: itemData.weight,
                  brand: itemData.brand,
                  current_stock: itemData.current_stock,
                  min_stock_level: itemData.min_stock_level,
                  lead_time: itemData.lead_time,
                  cost_price: itemData.cost_price,
                  gst_rate: itemData.gst_rate,
                  uom: itemData.uom,
                  type: itemData.type
                };
                
                console.log('Found item details:', itemAttributes);
              } else {
                console.log('No item found in master table:', itemResult.error);
              }
            } catch (error) {
              console.log('Error fetching item details:', error);
            }
          }
          
          // Use BOM product image as fallback if no specific image found
          if (!imageUrl && bomRecord?.product_image_url) {
            imageUrl = bomRecord.product_image_url;
            console.log('🔄 Using BOM product image as fallback:', imageUrl);
          }
          
          const result = {
            bom_id: bomId,
            bom_number: bomNumber,
            bom_item_id: item.id,
            item_name: item.item_name,
            total_required: item.qty_total || 0,
            total_ordered: 0, // Will be calculated by getBomItemOrderStatus
            remaining_quantity: item.qty_total || 0,
            image_url: imageUrl || null,
            // Fabric attributes
            fabric_name: fabricName,
            fabric_color: fabricColor,
            fabric_gsm: fabricGsm,
            // Item attributes
            item_attributes: itemAttributes,
            // Additional fields for PO creation
            item_id: item.item_id,
            item_code: item.item_code,
            category: item.category,
            unit_of_measure: item.unit_of_measure
          };
          
          console.log(`🔍 Processed ${item.category} item:`, {
            name: result.item_name,
            category: result.category,
            image_url: result.image_url,
            fabric_name: result.fabric_name
          });
          
          return result;
        })
      );

      const items: BomItemOrderStatus[] = processedItems;

      setBomItems(items);

      // Load completion status
      const status = await getBomCompletionStatus(bomId);
      setCompletionStatus(status);

    } catch (err) {
      console.error('Error loading BOM data:', err);
      setError('Failed to load BOM data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = (createdPOs: string[]) => {
    toast.success(`Successfully created ${createdPOs.length} purchase order${createdPOs.length !== 1 ? 's' : ''}`);
    onComplete?.(createdPOs);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleClose = () => {
    if (loading) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold">
                Create Purchase Orders
              </DialogTitle>
              <DialogDescription>
                Create multiple purchase orders from BOM {bomNumber} with item-level supplier selection
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto max-h-[80vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading BOM data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={loadBomData} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          ) : completionStatus?.status === 'completed' ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">BOM Fully Ordered</h3>
                <p className="text-muted-foreground mb-4">
                  All items in this BOM have been ordered. You can still create additional POs if needed.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleClose} variant="outline">
                    Close
                  </Button>
                  <Button onClick={() => setCompletionStatus(null)}>
                    Create Additional POs
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <BomToPOWizard
              bomId={bomId}
              bomNumber={bomNumber}
              bomItems={bomItems}
              onComplete={handleComplete}
              onCancel={handleCancel}
            />
          )}
        </div>

        {/* BOM Status Summary */}
        {completionStatus && completionStatus.status !== 'completed' && (
          <div className="flex-shrink-0 border-t bg-muted/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="font-medium">BOM Progress:</span>
                <span>
                  {completionStatus.orderedItems} of {completionStatus.totalItems} items ordered
                </span>
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${completionStatus.completionPercentage}%` }}
                  />
                </div>
                <span className="text-muted-foreground">
                  {completionStatus.completionPercentage}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                {completionStatus.status === 'not_started' && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                    Not Started
                  </span>
                )}
                {completionStatus.status === 'in_progress' && (
                  <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
                    In Progress
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
