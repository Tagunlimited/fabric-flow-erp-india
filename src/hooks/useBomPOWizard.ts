import { useState, useCallback, useMemo } from 'react';
import { BomItemOrderStatus } from '@/services/bomPOTracking';

export interface SelectedBomItem {
  bomItemId: string;
  itemName: string;
  totalRequired: number;
  totalOrdered: number;
  remainingQuantity: number;
  selected: boolean;
}

export interface SupplierAssignment {
  id: string;
  bomItemId: string;
  itemName: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  remarks: string;
  maxQuantity: number;
}

export interface POGroup {
  supplierId: string;
  supplierName: string;
  items: SupplierAssignment[];
}

export interface WizardState {
  currentStep: number;
  selectedItems: SelectedBomItem[];
  supplierAssignments: SupplierAssignment[];
  poGroups: POGroup[];
  errors: string[];
}

const initialState: WizardState = {
  currentStep: 1,
  selectedItems: [],
  supplierAssignments: [],
  poGroups: [],
  errors: []
};

export function useBomPOWizard(bomItems: BomItemOrderStatus[]) {
  const [state, setState] = useState<WizardState>(initialState);

  // Initialize selected items from BOM items
  const initializeSelectedItems = useCallback(() => {
    const selectedItems: SelectedBomItem[] = bomItems.map(item => ({
      bomItemId: item.bom_item_id,
      itemName: item.item_name,
      totalRequired: item.total_required,
      totalOrdered: item.total_ordered,
      remainingQuantity: item.remaining_quantity,
      selected: false
    }));

    setState(prev => ({
      ...prev,
      selectedItems
    }));
  }, [bomItems]);

  // Toggle item selection
  const toggleItemSelection = useCallback((bomItemId: string) => {
    setState(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item =>
        item.bomItemId === bomItemId
          ? { ...item, selected: !item.selected }
          : item
      )
    }));
  }, []);

  // Select all available items
  const selectAllAvailable = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => ({
        ...item,
        selected: item.remainingQuantity > 0
      }))
    }));
  }, []);

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.map(item => ({
        ...item,
        selected: false
      }))
    }));
  }, []);

  // Add supplier assignment
  const addSupplierAssignment = useCallback((bomItemId: string) => {
    const selectedItem = state.selectedItems.find(item => 
      item.bomItemId === bomItemId && item.selected
    );
    
    if (!selectedItem) return;

    const newAssignment: SupplierAssignment = {
      id: `${bomItemId}-${Date.now()}`,
      bomItemId,
      itemName: selectedItem.itemName,
      supplierId: '',
      supplierName: '',
      quantity: 0,
      remarks: '',
      maxQuantity: selectedItem.remainingQuantity
    };

    setState(prev => ({
      ...prev,
      supplierAssignments: [...prev.supplierAssignments, newAssignment]
    }));
  }, [state.selectedItems]);

  // Update supplier assignment
  const updateSupplierAssignment = useCallback((
    assignmentId: string,
    updates: Partial<Omit<SupplierAssignment, 'id' | 'bomItemId' | 'itemName' | 'maxQuantity'>>
  ) => {
    setState(prev => ({
      ...prev,
      supplierAssignments: prev.supplierAssignments.map(assignment =>
        assignment.id === assignmentId
          ? { ...assignment, ...updates }
          : assignment
      )
    }));
  }, []);

  // Remove supplier assignment
  const removeSupplierAssignment = useCallback((assignmentId: string) => {
    setState(prev => ({
      ...prev,
      supplierAssignments: prev.supplierAssignments.filter(
        assignment => assignment.id !== assignmentId
      )
    }));
  }, []);

  // Split item to another supplier
  const splitItemToSupplier = useCallback((bomItemId: string) => {
    addSupplierAssignment(bomItemId);
  }, [addSupplierAssignment]);

  // Group assignments by supplier
  const groupAssignmentsBySupplier = useCallback(() => {
    const groups = new Map<string, POGroup>();

    state.supplierAssignments.forEach(assignment => {
      if (!assignment.supplierId || !assignment.supplierName) return;

      const key = assignment.supplierId;
      if (!groups.has(key)) {
        groups.set(key, {
          supplierId: assignment.supplierId,
          supplierName: assignment.supplierName,
          items: []
        });
      }

      const group = groups.get(key)!;
      group.items.push(assignment);
    });

    setState(prev => ({
      ...prev,
      poGroups: Array.from(groups.values())
    }));
  }, [state.supplierAssignments]);

  // Validate current step
  const validateCurrentStep = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (state.currentStep === 1) {
      const selectedCount = state.selectedItems.filter(item => item.selected).length;
      if (selectedCount === 0) {
        errors.push('Please select at least one item to order');
      }
    } else if (state.currentStep === 2) {
      const selectedItems = state.selectedItems.filter(item => item.selected);
      
      for (const item of selectedItems) {
        const assignments = state.supplierAssignments.filter(
          assignment => assignment.bomItemId === item.bomItemId
        );
        
        if (assignments.length === 0) {
          errors.push(`${item.itemName}: Please add at least one supplier assignment`);
          continue;
        }

        const totalQuantity = assignments.reduce((sum, assignment) => sum + assignment.quantity, 0);
        if (totalQuantity === 0) {
          errors.push(`${item.itemName}: Please specify quantities for supplier assignments`);
        } else if (totalQuantity > item.remainingQuantity) {
          errors.push(
            `${item.itemName}: Total quantity (${totalQuantity}) cannot exceed remaining quantity (${item.remainingQuantity})`
          );
        }

        for (const assignment of assignments) {
          if (!assignment.supplierId || !assignment.supplierName) {
            errors.push(`${item.itemName}: Please select a supplier`);
          }
          if (assignment.quantity <= 0) {
            errors.push(`${item.itemName}: Quantity must be greater than 0`);
          }
        }
      }
    }

    setState(prev => ({
      ...prev,
      errors
    }));

    return {
      valid: errors.length === 0,
      errors
    };
  }, [state.currentStep, state.selectedItems, state.supplierAssignments]);

  // Navigation functions
  const nextStep = useCallback(() => {
    const validation = validateCurrentStep();
    if (!validation.valid) return;

    if (state.currentStep === 2) {
      groupAssignmentsBySupplier();
    }

    setState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 3),
      errors: []
    }));
  }, [state.currentStep, validateCurrentStep, groupAssignmentsBySupplier]);

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1),
      errors: []
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step >= 1 && step <= 3) {
      setState(prev => ({
        ...prev,
        currentStep: step,
        errors: []
      }));
    }
  }, []);

  // Reset wizard
  const resetWizard = useCallback(() => {
    setState(initialState);
    initializeSelectedItems();
  }, [initializeSelectedItems]);

  // Computed values
  const selectedItemsCount = useMemo(() => 
    state.selectedItems.filter(item => item.selected).length,
    [state.selectedItems]
  );

  const canProceed = useMemo(() => {
    const validation = validateCurrentStep();
    return validation.valid;
  }, [validateCurrentStep]);

  const isStepComplete = useMemo(() => {
    switch (state.currentStep) {
      case 1:
        return selectedItemsCount > 0;
      case 2:
        return state.supplierAssignments.length > 0 && 
               state.supplierAssignments.every(a => a.supplierId && a.quantity > 0);
      case 3:
        return state.poGroups.length > 0;
      default:
        return false;
    }
  }, [state.currentStep, selectedItemsCount, state.supplierAssignments, state.poGroups]);

  return {
    // State
    ...state,
    
    // Computed values
    selectedItemsCount,
    canProceed,
    isStepComplete,
    
    // Actions
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
  };
}
