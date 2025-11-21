import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSortedSizes } from '@/utils/sizeSorting';

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
  size_order?: Record<string, number>;
  image_url?: string;
  created_at: string;
}

interface SizeTypeSelectorProps {
  sizeTypes: SizeType[];
  selectedSizeTypeId: string;
  onSelect: (sizeTypeId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SizeTypeSelector({ 
  sizeTypes, 
  selectedSizeTypeId, 
  onSelect, 
  open, 
  onOpenChange 
}: SizeTypeSelectorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Reset current index when dialog opens
  useEffect(() => {
    if (open) {
      const selectedIndex = sizeTypes.findIndex(st => st.id === selectedSizeTypeId);
      setCurrentIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedSizeTypeId, sizeTypes]);

  const handlePrevious = () => {
    setCurrentIndex(prev => prev > 0 ? prev - 1 : sizeTypes.length - 1);
  };

  const handleNext = () => {
    setCurrentIndex(prev => prev < sizeTypes.length - 1 ? prev + 1 : 0);
  };

  const handleSizeTypeSelect = (sizeTypeId: string) => {
    onSelect(sizeTypeId);
    onOpenChange(false);
  };

  const currentSizeType = sizeTypes[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Size Type</DialogTitle>
          <DialogDescription>
            Choose a size type for your product. Use the navigation arrows to browse through available options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Main Card Display */}
          <div className="relative">
            {/* Navigation Arrows */}
            <Button
              variant="outline"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white"
              onClick={handlePrevious}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white"
              onClick={handleNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            {/* Current Size Type Card */}
            {currentSizeType && (
              <Card className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                  {/* Image Section */}
                  <div className="aspect-square bg-white rounded-lg border flex items-center justify-center">
                    {currentSizeType.image_url ? (
                      <img
                        src={currentSizeType.image_url}
                        alt={currentSizeType.size_name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <ImageIcon className="w-16 h-16 mb-4" />
                        <span className="text-lg">No Image</span>
                      </div>
                    )}
                  </div>

                  {/* Details Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-2xl font-bold mb-2">{currentSizeType.size_name}</h3>
                      <p className="text-muted-foreground">
                        Available sizes for this size type
                      </p>
                    </div>

                    {/* Available Sizes */}
                    <div className="space-y-3">
                      <h4 className="font-semibold">Available Sizes:</h4>
                      <div className="flex flex-wrap gap-2">
                        {getSortedSizes(currentSizeType).map((size, index) => (
                          <Badge key={index} variant="outline" className="text-sm px-3 py-1">
                            {size}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={() => handleSizeTypeSelect(currentSizeType.id)}
                        className="flex-1"
                        variant={selectedSizeTypeId === currentSizeType.id ? "default" : "outline"}
                      >
                        {selectedSizeTypeId === currentSizeType.id ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Selected
                          </>
                        ) : (
                          'Select This Size Type'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Thumbnail Navigation */}
          <div className="space-y-3">
            <h4 className="font-semibold text-center">Browse All Size Types</h4>
            <div 
              ref={sliderRef}
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ 
                scrollbarWidth: 'none', 
                msOverflowStyle: 'none'
              }}
            >
              {sizeTypes.map((sizeType, index) => (
                <Card
                  key={sizeType.id}
                  className={cn(
                    "flex-shrink-0 w-32 cursor-pointer transition-all duration-200 hover:shadow-md",
                    index === currentIndex ? "ring-2 ring-primary shadow-md" : "hover:shadow-sm"
                  )}
                  onClick={() => setCurrentIndex(index)}
                >
                  <CardContent className="p-3">
                    <div className="aspect-square bg-white rounded border mb-2 flex items-center justify-center">
                      {sizeType.image_url ? (
                        <img
                          src={sizeType.image_url}
                          alt={sizeType.size_name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium truncate">{sizeType.size_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sizeType.available_sizes.length} sizes
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Current Position Indicator */}
          <div className="flex justify-center gap-2">
            {sizeTypes.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  index === currentIndex ? "bg-primary" : "bg-gray-300"
                )}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
