import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Minus, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AddonSelectionDialog } from './AddonSelectionDialog';

interface ProductPart {
  id: string;
  part_name: string;
  part_type: 'dropdown' | 'number';
  description: string | null;
}

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

interface Customization {
  partId: string;
  partName: string;
  partType: 'dropdown' | 'number';
  selectedAddonId?: string;
  selectedAddonName?: string;
  selectedAddonImageUrl?: string;
  selectedAddonImageAltText?: string;
  customValue?: string;
  quantity?: number;
  priceImpact?: number;
  colors?: Array<{ colorId: string; colorName: string; hex: string }>;
}

interface ProductCustomizationModalProps {
  productIndex: number;
  productCategoryId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (customizations: Customization[]) => void;
  initialCustomizations?: Customization[];
  fabricColor?: string;
}

export function ProductCustomizationModal({
  productIndex,
  productCategoryId,
  isOpen,
  onClose,
  onSave,
  initialCustomizations,
  fabricColor
}: ProductCustomizationModalProps) {
  const [parts, setParts] = useState<ProductPart[]>([]);
  const [addons, setAddons] = useState<PartAddon[]>([]);
  const [customizations, setCustomizations] = useState<Customization[]>([]);
  const [loading, setLoading] = useState(false);
  const [colors, setColors] = useState<Array<{id: string; color: string; hex: string}>>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentCustomizationIndex, setCurrentCustomizationIndex] = useState<number | null>(null);
  const [selectedColorsForPicker, setSelectedColorsForPicker] = useState<string[]>([]);
  const [selectedPart, setSelectedPart] = useState<string>('');
  const [selectedAddon, setSelectedAddon] = useState<string>('');
  const [numberValue, setNumberValue] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [showCreatePartForm, setShowCreatePartForm] = useState(false);
  const [showCreateAddonForm, setShowCreateAddonForm] = useState(false);
  const [newPartForm, setNewPartForm] = useState({
    part_name: '',
    part_type: 'dropdown' as 'dropdown' | 'number',
    description: ''
  });
  const [newAddonForm, setNewAddonForm] = useState({
    addon_name: '',
    sort_order: 1
  });

  // Addon selection dialog state
  const [showAddonSelection, setShowAddonSelection] = useState(false);
  const [selectedPartForAddon, setSelectedPartForAddon] = useState<ProductPart | null>(null);

  const resetFormState = (initial: Customization[] = []) => {
    setCustomizations(initial);
    setSelectedPart('');
    setSelectedAddon('');
    setNumberValue('');
    setQuantity(1);
    setShowCreatePartForm(false);
    setShowCreateAddonForm(false);
    setNewPartForm({
      part_name: '',
      part_type: 'dropdown',
      description: ''
    });
    setNewAddonForm({
      addon_name: '',
      sort_order: 1
    });
  };

  useEffect(() => {
    if (isOpen && productCategoryId) {
      fetchPartsForCategory();
      fetchColors();
      // Reset form state when modal opens
      if (initialCustomizations && initialCustomizations.length > 0) {
        resetFormState(initialCustomizations);
      } else {
        resetFormState([]);
      }
    }
  }, [isOpen, productCategoryId, initialCustomizations]);

  const fetchColors = async () => {
    try {
      const { data, error } = await supabase
        .from('colors')
        .select('*')
        .order('color', { ascending: true });
      
      if (error) throw error;
      setColors((data || []) as Array<{id: string; color: string; hex: string}>);
    } catch (error) {
      console.error('Error fetching colors:', error);
      toast.error('Failed to fetch colors');
    }
  };

  const fetchPartsForCategory = async () => {
    try {
      setLoading(true);
      
      // Fetch parts linked to this product category
      const { data, error } = await supabase
        .from('product_category_parts')
        .select(`
          product_parts!inner(
            id,
            part_name,
            part_type,
            description
          )
        `)
        .eq('product_category_id', productCategoryId)
        .eq('product_parts.is_active', true);

      if (error) throw error;

      const categoryParts = data?.map(item => item.product_parts) || [];
      setParts(categoryParts);

      // Fetch addons for dropdown parts
      if (categoryParts.length > 0) {
        const dropdownPartIds = categoryParts
          .filter(p => p.part_type === 'dropdown')
          .map(p => p.id);

        if (dropdownPartIds.length > 0) {
          const { data: addonsData, error: addonsError } = await supabase
            .from('part_addons')
            .select('*')
            .in('part_id', dropdownPartIds)
            .eq('is_active', true)
            .order('part_id, sort_order');

          if (addonsError) throw addonsError;
          setAddons(addonsData || []);
        }
      }
    } catch (error) {
      console.error('Error fetching parts:', error);
      toast.error('Failed to load customization options');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePart = async () => {
    if (!newPartForm.part_name.trim()) {
      toast.error('Please enter a part name');
      return;
    }

    try {
      // Create the part
      const { data: newPart, error: partError } = await supabase
        .from('product_parts')
        .insert([{
          part_name: newPartForm.part_name,
          part_type: newPartForm.part_type,
          description: newPartForm.description
        }])
        .select()
        .single();

      if (partError) throw partError;

      // Link part to the product category
      const { error: linkError } = await supabase
        .from('product_category_parts')
        .insert([{
          product_category_id: productCategoryId,
          part_id: newPart.id
        }]);

      if (linkError) throw linkError;

      // Refresh parts list
      await fetchPartsForCategory();
      
      // Select the newly created part
      setSelectedPart(newPart.id);
      setShowCreatePartForm(false);
      setNewPartForm({ part_name: '', part_type: 'dropdown', description: '' });
      
      // If it's a dropdown part, show addon creation form
      if (newPartForm.part_type === 'dropdown') {
        setShowCreateAddonForm(true);
        toast.success('Part created successfully. Now add an option for this part.');
      } else {
        toast.success('Part created successfully');
      }
    } catch (error) {
      console.error('Error creating part:', error);
      toast.error('Failed to create part');
    }
  };

  const handleCreateAddon = async () => {
    if (!newAddonForm.addon_name.trim() || !selectedPart) {
      toast.error('Please enter an addon name');
      return;
    }

    try {
      const { error } = await supabase
        .from('part_addons')
        .insert([{
          part_id: selectedPart,
          addon_name: newAddonForm.addon_name,
          addon_value: null,
          price_adjustment: 0,
          sort_order: newAddonForm.sort_order
        }]);

      if (error) throw error;

      // Refresh addons list
      await fetchPartsForCategory();
      
      // Reset form
      setNewAddonForm({ addon_name: '', sort_order: 1 });
      setShowCreateAddonForm(false);
      
      toast.success('Addon created successfully');
    } catch (error) {
      console.error('Error creating addon:', error);
      toast.error('Failed to create addon');
    }
  };

  const handleAddCustomization = () => {
    if (!selectedPart) {
      toast.error('Please select a part');
      return;
    }

    const part = parts.find(p => p.id === selectedPart);
    if (!part) return;

    if (part.part_type === 'dropdown') {
      if (!selectedAddon) {
        toast.error('Please select an option');
        return;
      }

      const addon = addons.find(a => a.id === selectedAddon);
      if (!addon) return;

      // Check if this part is already customized
      if (customizations.some(c => c.partId === part.id)) {
        toast.error('This part is already customized');
        return;
      }

      const newCustomization: Customization = {
        partId: part.id,
        partName: part.part_name,
        partType: 'dropdown',
        selectedAddonId: addon.id,
        selectedAddonName: addon.addon_name,
        selectedAddonImageUrl: addon.image_url || undefined,
        selectedAddonImageAltText: addon.image_alt_text || undefined,
        priceImpact: addon.price_adjustment,
        colors: getInitialColors()
      };

      setCustomizations([...customizations, newCustomization]);
    } else if (part.part_type === 'number') {
      // Check if this part is already customized
      if (customizations.some(c => c.partId === part.id)) {
        toast.error('This part is already customized');
        return;
      }

      const newCustomization: Customization = {
        partId: part.id,
        partName: part.part_name,
        partType: 'number',
        customValue: quantity.toString(),
        quantity: quantity,
        colors: getInitialColors()
      };

      setCustomizations([...customizations, newCustomization]);
    }

    // Reset form
    setSelectedPart('');
    setSelectedAddon('');
    setQuantity(1);
  };

  const handleRemoveCustomization = (partId: string) => {
    setCustomizations(customizations.filter(c => c.partId !== partId));
  };

  const handleSave = () => {
    onSave(customizations);
    resetFormState([]);
    onClose();
  };

  const getAvailableAddons = (partId: string) => {
    return addons.filter(a => a.part_id === partId);
  };

  const getTotalPriceImpact = () => {
    return customizations.reduce((total, c) => total + (c.priceImpact || 0), 0);
  };

  // Helper function to get initial colors array with fabric color as default
  const getInitialColors = (): Array<{ colorId: string; colorName: string; hex: string }> => {
    if (!fabricColor) return [];
    
    // Try to find fabric color in colors master
    const fabricColorMatch = colors.find(
      c => c.color.toLowerCase().trim() === fabricColor.toLowerCase().trim()
    );
    
    if (fabricColorMatch) {
      return [{
        colorId: fabricColorMatch.id,
        colorName: fabricColorMatch.color,
        hex: fabricColorMatch.hex
      }];
    }
    
    // If fabric color not found in master, create a temporary entry
    return [{
      colorId: '',
      colorName: fabricColor,
      hex: '#FFFFFF' // Default white if hex not available
    }];
  };

  const handleClose = () => {
    resetFormState(initialCustomizations || []);
    onClose();
  };

  // Color selection functions
  const handleOpenColorPicker = (customizationIndex: number) => {
    setCurrentCustomizationIndex(customizationIndex);
    const currentColors = customizations[customizationIndex]?.colors || [];
    const selectedIds: string[] = [];
    
    currentColors.forEach(color => {
      if (color.colorId) {
        selectedIds.push(color.colorId);
      } else if (fabricColor && color.colorName.toLowerCase() === fabricColor.toLowerCase()) {
        // Fabric color without colorId - use empty string marker
        selectedIds.push('');
      }
    });
    
    setSelectedColorsForPicker(selectedIds);
    setShowColorPicker(true);
  };

  const handleColorSelect = (colorId: string) => {
    setSelectedColorsForPicker(prev => {
      if (prev.includes(colorId)) {
        return prev.filter(id => id !== colorId);
      } else {
        return [...prev, colorId];
      }
    });
  };

  const handleConfirmColorSelection = () => {
    if (currentCustomizationIndex === null) return;
    
    const selectedColorsData = colors
      .filter(c => selectedColorsForPicker.includes(c.id))
      .map(c => ({
        colorId: c.id,
        colorName: c.color,
        hex: c.hex
      }));

    // Also include fabric color if it was selected but not in colors master
    if (fabricColor && selectedColorsForPicker.includes('')) {
      const fabricColorInSelected = selectedColorsData.find(
        c => c.colorName.toLowerCase() === fabricColor.toLowerCase()
      );
      if (!fabricColorInSelected) {
        selectedColorsData.push({
          colorId: '',
          colorName: fabricColor,
          hex: '#FFFFFF'
        });
      }
    }

    setCustomizations(prev => prev.map((cust, idx) => 
      idx === currentCustomizationIndex 
        ? { ...cust, colors: selectedColorsData }
        : cust
    ));

    setShowColorPicker(false);
    setCurrentCustomizationIndex(null);
    setSelectedColorsForPicker([]);
  };

  const handleRemoveColor = (customizationIndex: number, colorIndex: number) => {
    setCustomizations(prev => prev.map((cust, idx) => 
      idx === customizationIndex 
        ? { 
            ...cust, 
            colors: (cust.colors || []).filter((_, cIdx) => cIdx !== colorIndex)
          }
        : cust
    ));
  };

  // Addon selection dialog functions
  const handleOpenAddonSelection = (part: ProductPart) => {
    setSelectedPartForAddon(part);
    setShowAddonSelection(true);
  };

  const handleAddonSelect = (selectedAddon: PartAddon) => {
    if (!selectedPartForAddon) return;

    const newCustomization: Customization = {
      partId: selectedPartForAddon.id,
      partName: selectedPartForAddon.part_name,
      partType: 'dropdown',
      selectedAddonId: selectedAddon.id,
      selectedAddonName: selectedAddon.addon_name,
      selectedAddonImageUrl: selectedAddon.image_url || undefined,
      selectedAddonImageAltText: selectedAddon.image_alt_text || undefined,
      priceImpact: selectedAddon.price_adjustment,
      colors: getInitialColors()
      // Note: quantity is intentionally not set for dropdown type parts
    };

    setCustomizations([...customizations, newCustomization]);
    setShowAddonSelection(false);
    setSelectedPartForAddon(null);
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Customization</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center h-32">
            <div className="text-lg">Loading customization options...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Product Customization</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Available Parts */}
          {parts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No customization parts available for this product category.</p>
              <p className="text-sm mt-2">
                Go to Masters → Product Parts Manager to create parts and link them to this category.
              </p>
            </div>
          ) : (
            <>
              {/* Add New Customization */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-medium">Add Customization</h3>
                
                <div>
                  <Label>Select Part</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {parts
                        .filter(p => !customizations.some(c => c.partId === p.id))
                        .map((part) => (
                        <button
                          key={part.id}
                          onClick={() => setSelectedPart(part.id)}
                          className={`p-4 border-2 rounded-lg text-left transition-all duration-200 ${
                            selectedPart === part.id
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{part.part_name}</div>
                              <div className="text-sm text-gray-600 capitalize">
                                {part.part_type} type
                              </div>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${
                              selectedPart === part.id ? 'bg-blue-500' : 'bg-gray-300'
                            }`} />
                          </div>
                        </button>
                      ))}
                    
                    {/* Create New Part Card */}
                    <button
                      onClick={() => setShowCreatePartForm(true)}
                      className="p-4 border-2 border-dashed border-blue-300 rounded-lg text-left hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <Plus className="w-5 h-5 text-blue-600" />
                        <div>
                          <div className="font-medium text-blue-600">Create New Part</div>
                          <div className="text-sm text-blue-500">Add a new customization option</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Create New Part Form */}
                {showCreatePartForm && (
                  <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Create New Part</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowCreatePartForm(false);
                          setNewPartForm({ part_name: '', part_type: 'dropdown', description: '' });
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div>
                      <Label htmlFor="new-part-name">Part Name *</Label>
                      <Input
                        id="new-part-name"
                        value={newPartForm.part_name}
                        onChange={(e) => setNewPartForm(prev => ({ ...prev, part_name: e.target.value }))}
                        placeholder="e.g., Sleeve Length"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="new-part-type">Part Type *</Label>
                      <Select 
                        value={newPartForm.part_type} 
                        onValueChange={(value: 'dropdown' | 'number') => 
                          setNewPartForm(prev => ({ ...prev, part_type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dropdown">Dropdown (with options)</SelectItem>
                          <SelectItem value="number">Number Input</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="new-part-description">Description</Label>
                      <Input
                        id="new-part-description"
                        value={newPartForm.description}
                        onChange={(e) => setNewPartForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Optional description"
                      />
                    </div>
                    
                    <Button
                      type="button"
                      onClick={handleCreatePart}
                      disabled={!newPartForm.part_name.trim()}
                      className="w-full"
                    >
                      Create Part
                    </Button>
                  </div>
                )}

                {selectedPart && (
                  <>
                    {(() => {
                      const part = parts.find(p => p.id === selectedPart);
                      if (!part) return null;

                      if (part.part_type === 'dropdown') {
                        const availableAddons = getAvailableAddons(part.id);
                        return (
                          <div>
                            <Label>Select Option</Label>
                            {availableAddons.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                {availableAddons.map((addon) => {
                                  const isAlreadyAdded = customizations.some(c => c.partId === part.id && c.selectedAddonId === addon.id);
                                  return (
                                  <button
                                    key={addon.id}
                                    type="button"
                                    onClick={() => {
                                      if (isAlreadyAdded) {
                                        toast.error('This option is already added');
                                        return;
                                      }
                                      
                                      // Add customization immediately on single click
                                      const newCustomization: Customization = {
                                        partId: part.id,
                                        partName: part.part_name,
                                        partType: 'dropdown',
                                        selectedAddonId: addon.id,
                                        selectedAddonName: addon.addon_name,
                                        selectedAddonImageUrl: addon.image_url || undefined,
                                        selectedAddonImageAltText: addon.image_alt_text || undefined,
                                        priceImpact: addon.price_adjustment
                                        // Note: quantity is intentionally NOT set for dropdown type parts
                                      };

                                      setCustomizations([...customizations, newCustomization]);
                                      
                                      // Reset selection
                                      setSelectedPart('');
                                      setSelectedAddon('');
                                      
                                      toast.success('Option added successfully');
                                    }}
                                    disabled={isAlreadyAdded}
                                    className={`p-4 border-2 rounded-lg text-left transition-all duration-200 ${
                                      isAlreadyAdded
                                        ? 'border-green-500 bg-green-50'
                                        : 'border-gray-200 hover:border-blue-300 hover:shadow-sm hover:bg-blue-50'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* Addon Image */}
                                      <div className="flex-shrink-0">
                                        {addon.image_url ? (
                                          <img
                                            src={addon.image_url}
                                            alt={addon.image_alt_text || addon.addon_name}
                                            className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none';
                                            }}
                                          />
                                        ) : (
                                          <div className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                                            <span className="text-xs text-gray-400">No Image</span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Addon Details */}
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 truncate">
                                          {addon.addon_name}
                                        </div>
                                        {addon.image_alt_text && (
                                          <div className="text-xs text-gray-600 truncate mt-1">
                                            {addon.image_alt_text}
                                          </div>
                                        )}
                                      {addon.price_adjustment !== 0 && (
                                          <div className="mt-2">
                                            <Badge 
                                              variant={addon.price_adjustment > 0 ? 'default' : 'secondary'}
                                              className="text-xs"
                                            >
                                          ₹{addon.price_adjustment > 0 ? '+' : ''}{addon.price_adjustment}
                                        </Badge>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Selection Indicator */}
                                      <div className="flex-shrink-0 mt-1">
                                        {isAlreadyAdded ? (
                                          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                          </div>
                                        ) : (
                                          <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setShowCreateAddonForm(true)}
                                  className="w-full"
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Create Option
                                </Button>
                              </div>
                            )}
                            
                            {/* Create Addon Form */}
                            {showCreateAddonForm && (
                              <div className="mt-4 p-4 border rounded-lg bg-blue-50">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-medium text-blue-900">Create Option for "{part.part_name}"</h4>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowCreateAddonForm(false)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                                
                                <div className="space-y-3">
                                  <div>
                                    <Label htmlFor="new-addon-name">Option Name *</Label>
                                    <Input
                                      id="new-addon-name"
                                      value={newAddonForm.addon_name}
                                      onChange={(e) => setNewAddonForm(prev => ({ ...prev, addon_name: e.target.value }))}
                                      placeholder="e.g., Long Sleeve"
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="new-addon-sort">Sort Order *</Label>
                                    <Input
                                      id="new-addon-sort"
                                      type="number"
                                      value={newAddonForm.sort_order}
                                      onChange={(e) => setNewAddonForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                                      placeholder="1"
                                    />
                                  </div>
                                  
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      onClick={handleCreateAddon}
                                      disabled={!newAddonForm.addon_name.trim()}
                                      className="flex-1"
                                    >
                                      Create Option
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setShowCreateAddonForm(false)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } else if (part.part_type === 'number') {
                        return (
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="quantity">Quantity</Label>
                              <div className="flex items-center space-x-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <Input
                                  id="quantity"
                                  type="number"
                                  value={quantity}
                                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                                  className="w-20 text-center"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setQuantity(quantity + 1)}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            
                            {/* Add Customization Button for Number Type */}
                            <Button
                              type="button"
                              onClick={() => {
                                // Check if this part is already customized
                                if (customizations.some(c => c.partId === part.id)) {
                                  toast.error('This part is already customized');
                                  return;
                                }

                                const newCustomization: Customization = {
                                  partId: part.id,
                                  partName: part.part_name,
                                  partType: 'number',
                                  customValue: quantity.toString(),
                                  quantity: quantity,
                                  colors: getInitialColors()
                                };

                                setCustomizations([...customizations, newCustomization]);
                                
                                // Reset form
                                setSelectedPart('');
                                setQuantity(1);
                                
                                toast.success('Customization added successfully');
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Add Customization
                            </Button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}

              </div>

              {/* Current Customizations */}
              {customizations.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-medium">Current Customizations</h3>
                  {customizations.map((customization, customizationIndex) => {
                    const selectedAddon = customization.partType === 'dropdown' 
                      ? addons.find(a => a.id === customization.selectedAddonId)
                      : null;
                    
                    return (
                      <div key={customization.partId} className="flex items-start gap-4 p-4 border rounded-lg bg-white shadow-sm">
                        {selectedAddon?.image_url && (
                          <img 
                            src={selectedAddon.image_url} 
                            alt={selectedAddon.image_alt_text || selectedAddon.addon_name}
                            className="w-16 h-16 object-cover rounded-lg border-2 border-gray-100 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold text-gray-900">{customization.partName}</div>
                          {customization.partType === 'dropdown' && (
                            <div className="text-sm text-gray-600 mt-1">
                              {selectedAddon ? selectedAddon.addon_name : customization.selectedAddonName}
                              {selectedAddon?.image_alt_text && (
                                <span className="ml-2 text-xs text-gray-500">({selectedAddon.image_alt_text})</span>
                              )}
                            </div>
                          )}
                          {/* Only show quantity for number type parts, never for dropdown */}
                          {customization.partType !== 'dropdown' && customization.partType === 'number' && customization.quantity && customization.quantity > 0 && (
                            <div className="text-sm text-gray-600 mt-1">
                            Quantity: {customization.quantity}
                          </div>
                        )}
                          {customization.priceImpact !== undefined && customization.priceImpact !== null && customization.priceImpact !== 0 && (
                            <Badge variant={customization.priceImpact > 0 ? 'default' : 'secondary'} className="mt-2 text-xs">
                            ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                          </Badge>
                        )}
                          {/* Color Selection */}
                          <div className="mt-2 space-y-2">
                            <div className="text-xs font-medium text-gray-700">Colors:</div>
                            <div className="flex flex-wrap items-center gap-2">
                              {(customization.colors || []).map((color, colorIndex) => (
                                <Badge 
                                  key={colorIndex}
                                  variant="outline"
                                  className="flex items-center gap-1.5 px-2 py-1"
                                >
                                  <div 
                                    className="w-3 h-3 rounded-full border border-gray-300"
                                    style={{ backgroundColor: color.hex || '#FFFFFF' }}
                                  />
                                  <span className="text-xs">{color.colorName}</span>
                                  <button
                                    onClick={() => handleRemoveColor(customizationIndex, colorIndex)}
                                    className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenColorPicker(customizationIndex)}
                                className="h-7 text-xs"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Color
                              </Button>
                            </div>
                          </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveCustomization(customization.partId)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    );
                  })}
                  
                  {getTotalPriceImpact() !== 0 && (
                    <div className="pt-3 border-t">
                      <div className="flex justify-between font-medium">
                        <span>Total Price Impact:</span>
                        <span className={getTotalPriceImpact() > 0 ? 'text-green-600' : 'text-red-600'}>
                          ₹{getTotalPriceImpact() > 0 ? '+' : ''}{getTotalPriceImpact()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={customizations.length === 0}>
            Save Customizations
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Addon Selection Dialog */}
      {selectedPartForAddon && (
        <AddonSelectionDialog
          isOpen={showAddonSelection}
          onClose={() => {
            setShowAddonSelection(false);
            setSelectedPartForAddon(null);
          }}
          onSelect={handleAddonSelect}
          addons={getAvailableAddons(selectedPartForAddon.id)}
          partName={selectedPartForAddon.part_name}
        />
      )}

      {/* Color Picker Dialog */}
      <Dialog open={showColorPicker} onOpenChange={(open) => {
        if (!open) {
          setShowColorPicker(false);
          setCurrentCustomizationIndex(null);
          setSelectedColorsForPicker([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Colors</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {/* Include fabric color option if available and not in colors master */}
            {fabricColor && !colors.some(c => c.color.toLowerCase().trim() === fabricColor.toLowerCase().trim()) && (
              <div className="flex items-center space-x-2 p-2 border rounded-lg">
                <Checkbox
                  id="fabric-color"
                  checked={selectedColorsForPicker.includes('')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedColorsForPicker(prev => {
                        if (!prev.includes('')) {
                          return [...prev, ''];
                        }
                        return prev;
                      });
                    } else {
                      setSelectedColorsForPicker(prev => prev.filter(id => id !== ''));
                    }
                  }}
                />
                <label
                  htmlFor="fabric-color"
                  className="flex items-center gap-2 flex-1 cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-full border border-gray-300 bg-gray-100" />
                  <span className="text-sm font-medium">{fabricColor} (Fabric Color)</span>
                </label>
              </div>
            )}
            {/* Colors from master */}
            {colors.map((color) => {
              const isSelected = selectedColorsForPicker.includes(color.id);
              return (
                <div key={color.id} className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                  <Checkbox
                    id={`color-${color.id}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => handleColorSelect(color.id)}
                  />
                  <label
                    htmlFor={`color-${color.id}`}
                    className="flex items-center gap-2 flex-1 cursor-pointer"
                  >
                    <div 
                      className="w-6 h-6 rounded-full border border-gray-300"
                      style={{ backgroundColor: color.hex || '#FFFFFF' }}
                    />
                    <span className="text-sm font-medium">{color.color}</span>
                  </label>
                </div>
              );
            })}
            {colors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No colors available. Please add colors in the Color Master.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowColorPicker(false);
              setCurrentCustomizationIndex(null);
              setSelectedColorsForPicker([]);
            }}>
              Cancel
            </Button>
            <Button onClick={handleConfirmColorSelection}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
