import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface PartAddon {
  id: string;
  part_id: string;
  addon_name: string;
  addon_value: string | null;
  price_adjustment: number;
  sort_order: number;
  image_url?: string | null;
  image_alt_text?: string | null;
}

interface AddonSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (addon: PartAddon) => void;
  addons: PartAddon[];
  partName: string;
}

export function AddonSelectionDialog({ 
  isOpen, 
  onClose, 
  onSelect, 
  addons, 
  partName 
}: AddonSelectionDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAddon, setSelectedAddon] = useState<PartAddon | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setSelectedAddon(null);
    }
  }, [isOpen]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : addons.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < addons.length - 1 ? prev + 1 : 0));
  };

  const handleSelect = () => {
    if (selectedAddon) {
      onSelect(selectedAddon);
      onClose();
    }
  };

  const handleCardClick = (addon: PartAddon) => {
    setSelectedAddon(addon);
  };

  if (addons.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No Addons Available</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-muted-foreground">No addons are available for {partName}.</p>
            <Button onClick={onClose} className="mt-4">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentAddon = addons[currentIndex];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-center">
            Select {partName} Option
          </DialogTitle>
          <div className="text-center text-sm text-muted-foreground">
            {currentIndex + 1} of {addons.length} options
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Main Card Display */}
          <div className="relative">
            <div 
              className={`relative bg-white border-2 rounded-xl p-6 transition-all duration-300 cursor-pointer ${
                selectedAddon?.id === currentAddon.id 
                  ? 'border-blue-500 shadow-lg scale-105' 
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
              onClick={() => handleCardClick(currentAddon)}
            >
              {/* Selection Indicator */}
              {selectedAddon?.id === currentAddon.id && (
                <div className="absolute top-4 right-4 bg-blue-500 text-white rounded-full p-1">
                  <Check className="w-4 h-4" />
                </div>
              )}

              <div className="flex flex-col items-center space-y-4">
                {/* Image */}
                {currentAddon.image_url && (
                  <div className="relative">
                    <img
                      src={currentAddon.image_url}
                      alt={currentAddon.image_alt_text || currentAddon.addon_name}
                      className="w-48 h-48 object-cover rounded-xl border-2 border-gray-100 shadow-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    {/* Image placeholder if no image */}
                    {!currentAddon.image_url && (
                      <div className="w-48 h-48 bg-gray-100 rounded-xl border-2 border-gray-200 flex items-center justify-center">
                        <span className="text-gray-400 text-lg">No Image</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Addon Name */}
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {currentAddon.addon_name}
                  </h3>
                  
                  {/* Alt Text */}
                  {currentAddon.image_alt_text && (
                    <p className="text-sm text-gray-600 mb-3">
                      {currentAddon.image_alt_text}
                    </p>
                  )}

                  {/* Price Impact */}
                  {currentAddon.price_adjustment !== 0 && (
                    <Badge 
                      variant={currentAddon.price_adjustment > 0 ? 'default' : 'secondary'}
                      className="text-sm px-3 py-1"
                    >
                      ₹{currentAddon.price_adjustment > 0 ? '+' : ''}{currentAddon.price_adjustment}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation Arrows */}
            {addons.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white shadow-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white shadow-lg"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          {/* Thumbnail Strip */}
          {addons.length > 1 && (
            <div className="flex justify-center space-x-3 overflow-x-auto pb-2">
              {addons.map((addon, index) => (
                <button
                  key={addon.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg border-2 transition-all duration-200 ${
                    index === currentIndex
                      ? 'border-blue-500 shadow-md scale-105'
                      : 'border-gray-200 hover:border-gray-300 hover:scale-102'
                  }`}
                >
                  {addon.image_url ? (
                    <img
                      src={addon.image_url}
                      alt={addon.addon_name}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xs text-gray-400">No Image</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSelect}
              disabled={!selectedAddon}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Select Option
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
