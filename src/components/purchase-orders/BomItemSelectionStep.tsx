import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { BomItemStatusBadge } from './BomItemStatusBadge';
import { QuantityProgress } from './QuantityProgress';
import { SelectedBomItem } from '@/hooks/useBomPOWizard';

interface BomItemSelectionStepProps {
  selectedItems: SelectedBomItem[];
  onToggleItem: (bomItemId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  errors: string[];
}

export function BomItemSelectionStep({
  selectedItems,
  onToggleItem,
  onSelectAll,
  onClearAll,
  errors
}: BomItemSelectionStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_ordered' | 'partial' | 'complete'>('all');

  // Filter items based on search and status
  const filteredItems = selectedItems.filter(item => {
    const matchesSearch = item.itemName.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'not_ordered') {
      matchesStatus = item.totalOrdered === 0;
    } else if (statusFilter === 'partial') {
      matchesStatus = item.totalOrdered > 0 && item.totalOrdered < item.totalRequired;
    } else if (statusFilter === 'complete') {
      matchesStatus = item.totalOrdered === item.totalRequired;
    }

    return matchesSearch && matchesStatus;
  });

  const selectedCount = selectedItems.filter(item => item.selected).length;
  const availableCount = selectedItems.filter(item => item.remainingQuantity > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Select Items to Order</h2>
        <p className="text-muted-foreground">
          Choose which BOM items you want to create purchase orders for
        </p>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All ({selectedItems.length})
              </Button>
              <Button
                variant={statusFilter === 'not_ordered' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('not_ordered')}
              >
                Not Ordered ({selectedItems.filter(item => item.totalOrdered === 0).length})
              </Button>
              <Button
                variant={statusFilter === 'partial' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('partial')}
              >
                Partial ({selectedItems.filter(item => item.totalOrdered > 0 && item.totalOrdered < item.totalRequired).length})
              </Button>
              <Button
                variant={statusFilter === 'complete' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('complete')}
              >
                Complete ({selectedItems.filter(item => item.totalOrdered === item.totalRequired).length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection Actions */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={availableCount === 0}
          >
            Select All Available ({availableCount})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={selectedCount === 0}
          >
            Clear All
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {selectedCount} of {availableCount} available items selected
        </div>
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Please fix the following issues:</h4>
                <ul className="mt-2 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index} className="text-sm text-red-700">• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items List */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No items found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filter criteria'
                    : 'No items available in this BOM'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => (
            <Card 
              key={item.bomItemId} 
              className={`transition-all duration-200 ${
                item.selected 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : 'hover:shadow-md'
              } ${item.remainingQuantity === 0 ? 'opacity-60' : ''}`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div className="pt-1">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => onToggleItem(item.bomItemId)}
                      disabled={item.remainingQuantity === 0}
                    />
                  </div>

                  {/* Item Image - Only show if image exists */}
                  {item.image_url ? (
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 rounded-lg border overflow-hidden bg-muted/30">
                        <img
                          src={item.image_url}
                          alt={item.itemName}
                          className="w-full h-full object-cover"
                          onLoad={() => {
                            console.log('Image loaded successfully:', item.image_url, 'for item:', item.itemName);
                          }}
                          onError={(e) => {
                            console.log('Image failed to load:', item.image_url, 'for item:', item.itemName);
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.style.display = 'none';
                          }}
                        />
                      </div>
                      {item.category && (
                        <div className="text-xs text-center mt-1 text-muted-foreground">
                          {item.category}
                        </div>
                      )}
                      {/* Debug info */}
                      <div className="text-xs text-center mt-1 text-red-500">
                        {item.image_url ? 'Has URL' : 'No URL'}
                      </div>
                    </div>
                  ) : null}

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{item.itemName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <BomItemStatusBadge
                            totalOrdered={item.totalOrdered}
                            totalRequired={item.totalRequired}
                          />
                          {item.remainingQuantity === 0 && (
                            <Badge variant="outline" className="text-gray-500">
                              Fully Ordered
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quantity Progress */}
                    <div className="mb-4">
                      <QuantityProgress
                        ordered={item.totalOrdered}
                        total={item.totalRequired}
                        showNumbers={true}
                      />
                    </div>

                    {/* Item Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Required:</span>
                        <div className="font-medium">{item.totalRequired}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Already Ordered:</span>
                        <div className="font-medium text-orange-600">{item.totalOrdered}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remaining:</span>
                        <div className={`font-medium ${item.remainingQuantity > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {item.remainingQuantity}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <div className="font-medium">
                          {item.remainingQuantity === 0 ? 'Complete' : 
                           item.totalOrdered === 0 ? 'Not Started' : 'In Progress'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selection Indicator */}
                  {item.selected && (
                    <div className="flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Summary */}
      {selectedCount > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-medium">
                  {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for ordering
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Ready to proceed to supplier assignment
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
