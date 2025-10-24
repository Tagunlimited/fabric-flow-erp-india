import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
}

interface ProductCustomizationModalProps {
  productIndex: number;
  productCategoryId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (customizations: Customization[]) => void;
}

export function ProductCustomizationModal({
  productIndex,
  productCategoryId,
  isOpen,
  onClose,
  onSave
}: ProductCustomizationModalProps) {
  const [parts, setParts] = useState<ProductPart[]>([]);
  const [addons, setAddons] = useState<PartAddon[]>([]);
  const [customizations, setCustomizations] = useState<Customization[]>([]);
  const [loading, setLoading] = useState(false);
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

  const resetFormState = () => {
    setCustomizations([]);
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
      // Reset form state when modal opens
      resetFormState();
    }
  }, [isOpen, productCategoryId]);

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
        priceImpact: addon.price_adjustment
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
        quantity: quantity
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
    resetFormState();
    onClose();
  };

  const getAvailableAddons = (partId: string) => {
    return addons.filter(a => a.part_id === partId);
  };

  const getTotalPriceImpact = () => {
    return customizations.reduce((total, c) => total + (c.priceImpact || 0), 0);
  };

  const handleClose = () => {
    resetFormState();
    onClose();
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
                  <Label htmlFor="part-select">Select Part</Label>
                  <Select value={selectedPart} onValueChange={(value) => {
                    if (value === 'create_new') {
                      setShowCreatePartForm(true);
                    } else {
                      setSelectedPart(value);
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a part to customize" />
                    </SelectTrigger>
                    <SelectContent>
                      {parts
                        .filter(p => !customizations.some(c => c.partId === p.id))
                        .map((part) => (
                        <SelectItem key={part.id} value={part.id}>
                          {part.part_name} ({part.part_type})
                        </SelectItem>
                      ))}
                      <SelectItem value="create_new" className="text-blue-600">
                        <Plus className="w-4 h-4 mr-2 inline" />
                        Create New Part
                      </SelectItem>
                    </SelectContent>
                  </Select>
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
                        return (
                          <div>
                            <Label htmlFor="addon-select">Select Option</Label>
                            <Select value={selectedAddon} onValueChange={setSelectedAddon}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose an option" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailableAddons(part.id).map((addon) => (
                                  <SelectItem key={addon.id} value={addon.id}>
                                    <div className="flex items-center gap-3 w-full">
                                      {addon.image_url && (
                                        <img 
                                          src={addon.image_url} 
                                          alt={addon.image_alt_text || addon.addon_name}
                                          className="w-8 h-8 object-cover rounded border flex-shrink-0"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                          }}
                                        />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{addon.addon_name}</div>
                                        {addon.image_alt_text && (
                                          <div className="text-xs text-muted-foreground truncate">
                                            {addon.image_alt_text}
                                          </div>
                                        )}
                                      </div>
                                      {addon.price_adjustment !== 0 && (
                                        <Badge variant={addon.price_adjustment > 0 ? 'default' : 'secondary'} className="flex-shrink-0">
                                          ₹{addon.price_adjustment > 0 ? '+' : ''}{addon.price_adjustment}
                                        </Badge>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            
                            {/* Show create option button if no addons available */}
                            {getAvailableAddons(part.id).length === 0 && (
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
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}

                <Button onClick={handleAddCustomization} disabled={!selectedPart}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customization
                </Button>
              </div>

              {/* Current Customizations */}
              {customizations.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-medium">Current Customizations</h3>
                  {customizations.map((customization) => {
                    const selectedAddon = customization.partType === 'dropdown' 
                      ? addons.find(a => a.id === customization.selectedAddonId)
                      : null;
                    
                    return (
                      <div key={customization.partId} className="flex items-center gap-3 p-3 border rounded-lg">
                        {selectedAddon?.image_url && (
                          <img 
                            src={selectedAddon.image_url} 
                            alt={selectedAddon.image_alt_text || selectedAddon.addon_name}
                            className="w-12 h-12 object-cover rounded border flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{customization.partName}</div>
                          {customization.partType === 'dropdown' && selectedAddon && (
                            <div className="text-sm text-muted-foreground">
                              {selectedAddon.addon_name}
                              {selectedAddon.image_alt_text && (
                                <span className="ml-2 text-xs">({selectedAddon.image_alt_text})</span>
                              )}
                            </div>
                          )}
                          {customization.partType === 'number' && (
                            <div className="text-sm text-muted-foreground">
                              Quantity: {customization.quantity}
                            </div>
                          )}
                          {customization.priceImpact && customization.priceImpact !== 0 && (
                            <Badge variant={customization.priceImpact > 0 ? 'default' : 'secondary'} className="mt-1">
                              ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveCustomization(customization.partId)}
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
    </Dialog>
  );
}
