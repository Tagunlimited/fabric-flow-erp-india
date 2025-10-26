import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, CheckCircle2, Package, Users, FileText } from 'lucide-react';
import { useBomPOWizard } from '@/hooks/useBomPOWizard';
import { BomItemOrderStatus } from '@/services/bomPOTracking';
import { BomItemSelectionStep } from './BomItemSelectionStep';
import { SupplierAssignmentStep } from './SupplierAssignmentStep';
import { POReviewStep } from './POReviewStep';
import { trackBomPOItems, validateOrderQuantities } from '@/services/bomPOTracking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BomToPOWizardProps {
  bomId: string;
  bomNumber: string;
  bomItems: BomItemOrderStatus[];
  onComplete: (createdPOs: string[]) => void;
  onCancel: () => void;
}

export function BomToPOWizard({
  bomId,
  bomNumber,
  bomItems,
  onComplete,
  onCancel
}: BomToPOWizardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [createdPOs, setCreatedPOs] = useState<string[]>([]);

  const {
    currentStep,
    selectedItems,
    supplierAssignments,
    poGroups,
    errors,
    selectedItemsCount,
    canProceed,
    isStepComplete,
    initializeSelectedItems,
    toggleItemSelection,
    selectAllAvailable,
    clearAllSelections,
    addSupplierAssignment,
    updateSupplierAssignment,
    removeSupplierAssignment,
    splitItemToSupplier,
    groupAssignmentsBySupplier,
    validateCurrentStep,
    nextStep,
    prevStep,
    goToStep,
    resetWizard
  } = useBomPOWizard(bomItems);

  // Initialize wizard when component mounts
  useEffect(() => {
    initializeSelectedItems();
  }, [initializeSelectedItems]);

  // Function to generate PO number
  const generatePONumber = async () => {
    try {
      // Get the latest PO number from database
      const { data: latestPO, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .like('po_number', 'TUC/PO/%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching latest PO:', error);
        // Fallback to 0001 if there's an error
        return 'TUC/PO/0001';
      }

      if (!latestPO || latestPO.length === 0) {
        // No existing PO found, start from 0001
        return 'TUC/PO/0001';
      }

      // Extract the number from the latest PO
      const latestNumber = latestPO[0].po_number;
      const match = latestNumber.match(/TUC\/PO\/(\d+)/);
      
      if (match) {
        const currentNumber = parseInt(match[1], 10);
        const nextNumber = currentNumber + 1;
        return `TUC/PO/${nextNumber.toString().padStart(4, '0')}`;
      } else {
        // If format doesn't match, start from 0001
        return 'TUC/PO/0001';
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
      // Fallback to 0001 if there's an error
      return 'TUC/PO/0001';
    }
  };

  const handleCreatePOs = async () => {
    try {
      setIsCreating(true);
      
      // Validate quantities before creating POs
      const validationItems = supplierAssignments.map(assignment => ({
        bomItemId: assignment.bomItemId,
        quantity: assignment.quantity
      }));
      
      const validation = await validateOrderQuantities(bomId, validationItems);
      if (!validation.valid) {
        toast.error('Validation failed: ' + validation.errors.join(', '));
        return;
      }

      const createdPOIds: string[] = [];

      // Create POs for each supplier group
      for (const group of poGroups) {
        try {
          // Generate PO number for this group
          const poNumber = await generatePONumber();
          
          // Create the purchase order
          const { data: poData, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
              bom_id: bomId,
              supplier_id: group.supplierId,
              po_number: poNumber,
              order_date: new Date().toISOString().split('T')[0],
              expected_delivery_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
              status: 'pending',
              total_amount: 0, // No pricing in multi-supplier PO
              notes: `Created from BOM ${bomNumber} - Multi-supplier PO creation`
            })
            .select()
            .single();

          if (poError) throw poError;

          const poId = poData.id;
          createdPOIds.push(poId);

          // Create purchase order items
          const poItems = group.items.map(item => {
            // Find the corresponding BOM item to get all attributes
            const bomItem = bomItems.find(bi => bi.bom_item_id === item.bomItemId);
            
            // Determine item type based on category
            const itemType = bomItem?.category === 'Fabric' ? 'fabric' : 'item';
            
            // Base item data
            const baseItem = {
              po_id: poId,
              item_type: itemType,
              item_id: bomItem?.item_id || null,
              item_name: item.itemName,
              item_image_url: bomItem?.image_url || null,
              quantity: item.quantity,
              unit_of_measure: bomItem?.unit_of_measure || 'pcs',
              notes: item.remarks || null
            };
            
            // Add fabric-specific attributes if it's a fabric item
            if (itemType === 'fabric' && bomItem) {
              // Store fabric details in item_name and notes since fabric columns don't exist
              const fabricDetails = [
                bomItem.fabric_name,
                bomItem.fabric_color,
                bomItem.fabric_gsm
              ].filter(Boolean).join(' - ');
              
              return {
                ...baseItem,
                item_name: fabricDetails || item.itemName,
                notes: (item.remarks || '') + (fabricDetails ? ` | Fabric: ${fabricDetails}` : '')
              };
            }
            
            // Add item-specific attributes if it's a regular item
            if (itemType === 'item' && bomItem?.item_attributes) {
              // Store item details in notes field since additional columns don't exist
              const itemDetails = [
                bomItem.item_attributes.description,
                bomItem.item_attributes.size,
                bomItem.item_attributes.color,
                bomItem.item_attributes.material
              ].filter(Boolean).join(' | ');
              
              return {
                ...baseItem,
                notes: (item.remarks || '') + (itemDetails ? ` | ${itemDetails}` : '')
              };
            }
            
            // Default case
            return baseItem;
          });

          const { data: poItemsData, error: poItemsError } = await supabase
            .from('purchase_order_items')
            .insert(poItems)
            .select();

          if (poItemsError) throw poItemsError;

          // Create tracking records
          const trackingItems = group.items.map((item, index) => ({
            bomItemId: item.bomItemId,
            poItemId: poItemsData[index].id,
            quantity: item.quantity
          }));

          await trackBomPOItems(poId, bomId, trackingItems);

        } catch (error) {
          console.error(`Error creating PO for supplier ${group.supplierName}:`, error);
          toast.error(`Failed to create PO for ${group.supplierName}`);
          throw error;
        }
      }

      setCreatedPOs(createdPOIds);
      toast.success(`Successfully created ${createdPOIds.length} purchase order${createdPOIds.length !== 1 ? 's' : ''}`);
      onComplete(createdPOIds);

    } catch (error) {
      console.error('Error creating purchase orders:', error);
      toast.error('Failed to create purchase orders');
    } finally {
      setIsCreating(false);
    }
  };

  const stepTitles = [
    'Select Items',
    'Assign Suppliers',
    'Review & Create'
  ];

  const stepIcons = [
    Package,
    Users,
    FileText
  ];

  const progressPercentage = (currentStep / 3) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Create Purchase Orders from BOM</h1>
        <p className="text-muted-foreground">
          BOM: <span className="font-medium">{bomNumber}</span>
        </p>
      </div>

      {/* Progress Indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Step {currentStep} of 3</span>
                <span>{Math.round(progressPercentage)}% Complete</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>

            {/* Step Indicators */}
            <div className="flex justify-between">
              {stepTitles.map((title, index) => {
                const stepNumber = index + 1;
                const isActive = currentStep === stepNumber;
                const isCompleted = currentStep > stepNumber;
                const Icon = stepIcons[index];

                return (
                  <div
                    key={stepNumber}
                    className={`flex flex-col items-center space-y-2 ${
                      isActive ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        isActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : isCompleted
                          ? 'border-green-600 bg-green-600 text-white'
                          : 'border-muted-foreground bg-background'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-center max-w-24">
                      {title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6 max-h-[70vh] overflow-y-auto">
          {currentStep === 1 && (
            <BomItemSelectionStep
              selectedItems={selectedItems}
              onToggleItem={toggleItemSelection}
              onSelectAll={selectAllAvailable}
              onClearAll={clearAllSelections}
              errors={errors}
            />
          )}

          {currentStep === 2 && (
            <SupplierAssignmentStep
              selectedItems={selectedItems.filter(item => item.selected)}
              supplierAssignments={supplierAssignments}
              onAddAssignment={addSupplierAssignment}
              onUpdateAssignment={updateSupplierAssignment}
              onRemoveAssignment={removeSupplierAssignment}
              onSplitItem={splitItemToSupplier}
              errors={errors}
            />
          )}

          {currentStep === 3 && (
            <POReviewStep
              poGroups={poGroups}
              onEdit={() => goToStep(2)}
              onCreatePOs={handleCreatePOs}
              isCreating={isCreating}
              errors={errors}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={currentStep === 1 ? onCancel : prevStep}
          disabled={isCreating}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {currentStep === 1 ? 'Cancel' : 'Previous'}
        </Button>

        <div className="flex gap-2">
          {currentStep < 3 && (
            <Button
              onClick={nextStep}
              disabled={!canProceed || isCreating}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Step Summary */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Items Selected</p>
              <p className="text-2xl font-bold">{selectedItemsCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Suppliers</p>
              <p className="text-2xl font-bold">{poGroups.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Purchase Orders</p>
              <p className="text-2xl font-bold">{poGroups.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
