import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';

interface BomItem {
  id: string;
  item_name: string;
  category: string;
  required_qty: number;
  required_unit: string;
  in_stock: number;
  stock_unit: string;
  image_url?: string;
}

interface BomDisplayCardProps {
  orderId: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  totalOrderQty: number;
  bomItems: BomItem[];
  onViewClick?: () => void;
}

export function BomDisplayCard({
  orderId,
  productId,
  productName,
  productImageUrl,
  totalOrderQty,
  bomItems,
  onViewClick
}: BomDisplayCardProps) {
  console.log('BomDisplayCard received bomItems:', bomItems);
  console.log('BomDisplayCard bomItems length:', bomItems?.length || 0);
  console.log('BomDisplayCard productName:', productName);
  console.log('BomDisplayCard totalOrderQty:', totalOrderQty);
  console.log('BomDisplayCard productImageUrl:', productImageUrl);
  
  if (bomItems && bomItems.length > 0) {
    console.log('First BOM item:', bomItems[0]);
    console.log('All BOM items:', bomItems.map(item => ({
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      required_qty: item.required_qty,
      image_url: item.image_url
    })));
  }
  
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side - Product Image */}
          <div className="flex flex-col items-center">
            <div className="w-64 h-80 bg-gray-100 rounded-lg overflow-hidden mb-4">
              {productImageUrl ? (
                <img 
                  src={productImageUrl} 
                  alt={productName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                  <span className="text-gray-500 text-sm">No Image</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Order Details and BOM */}
          <div className="space-y-6">
            {/* Order Information */}
            <div className="space-y-2">
              <div className="text-sm text-gray-600">ORDER ID: {orderId}</div>
              <div className="text-sm text-gray-600">Product ID: {productId}</div>
            </div>

            {/* Total Order Quantity */}
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1">Total Order Qty</div>
              <div className="text-2xl font-bold text-blue-600">{totalOrderQty} Pcs</div>
            </div>

            {/* Bills of Material Table */}
            <div className="space-y-3">
              <div className="text-lg font-semibold text-gray-700">BILLS OF MATERIAL</div>
              
              <div className="border-2 border-dashed border-blue-200 rounded-lg p-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Image</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Item Category</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Required Qty</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">In Stock</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">To Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500">
                            <div className="flex flex-col items-center space-y-2">
                              <span>No BOM items found</span>
                              <span className="text-xs">This BOM may not have been saved with items yet</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        bomItems.map((item, index) => (
                          <tr key={item.id || index} className="border-b last:border-b-0">
                            <td className="py-3 px-3">
                              <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                                {item.image_url ? (
                                  <img 
                                    src={item.image_url} 
                                    alt={item.item_name}
                                    className="w-full h-full object-cover rounded"
                                    onError={(e) => {
                                      console.log('BOM Display Card - Image failed to load:', item.image_url);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                    onLoad={() => console.log('BOM Display Card - Image loaded successfully:', item.image_url)}
                                  />
                                ) : (
                                  <span className="text-sm text-gray-400">IMG</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-sm">
                              <div className="font-medium">{item.item_name}</div>
                              <div className="text-xs text-gray-500">({item.category})</div>
                            </td>
                            <td className="py-3 px-3 text-sm">
                              <span className="text-orange-500 font-medium">
                                {item.required_qty} {item.required_unit}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-sm">
                              <span className="text-green-600 font-medium">
                                {item.in_stock} {item.stock_unit}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-sm">
                              <span className="text-red-600 font-medium">
                                {Math.max(item.required_qty - item.in_stock, 0)} {item.required_unit}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* View Button */}
            <div className="flex justify-end">
              <Button 
                onClick={onViewClick}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
              >
                <Eye className="w-4 h-4 mr-2" />
                VIEW
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
