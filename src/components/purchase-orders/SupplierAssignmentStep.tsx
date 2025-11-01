import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, Trash2, Users, Calculator, AlertTriangle } from 'lucide-react';
import { SupplierAssignment } from '@/hooks/useBomPOWizard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  supplier_name: string;
  contact_person: string;
  email: string;
  phone: string;
}

interface SupplierAssignmentStepProps {
  selectedItems: Array<{
    bomItemId: string;
    itemName: string;
    remainingQuantity: number;
    selected: boolean;
  }>;
  supplierAssignments: SupplierAssignment[];
  onAddAssignment: (bomItemId: string) => void;
  onUpdateAssignment: (assignmentId: string, updates: Partial<Omit<SupplierAssignment, 'id' | 'bomItemId' | 'itemName' | 'maxQuantity'>>) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onSplitItem: (bomItemId: string) => void;
  errors: string[];
}

export function SupplierAssignmentStep({
  selectedItems,
  supplierAssignments,
  onAddAssignment,
  onUpdateAssignment,
  onRemoveAssignment,
  onSplitItem,
  errors
}: SupplierAssignmentStepProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // Load suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        console.log('Fetching suppliers from supplier_master table...');
        const { data, error } = await supabase
          .from('supplier_master')
          .select('id, supplier_name, contact_person, email, phone')
          .eq('enabled', true)
          .order('supplier_name');

        if (error) {
          console.error('Error fetching suppliers:', error);
          throw error;
        }
        
        console.log('Suppliers fetched:', data);
        setSuppliers(data || []);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        // Show error to user
        toast.error('Failed to load suppliers. Please try again.');
      } finally {
        setLoadingSuppliers(false);
      }
    };

    fetchSuppliers();
  }, []);

  // Group assignments by item
  const assignmentsByItem = selectedItems
    .filter(item => item.selected)
    .map(item => ({
      ...item,
      assignments: supplierAssignments.filter(assignment => assignment.bomItemId === item.bomItemId)
    }));

  // Calculate totals per supplier (quantity only)
  const supplierTotals = new Map<string, { name: string; totalQuantity: number; itemCount: number }>();
  supplierAssignments.forEach(assignment => {
    if (assignment.supplierId && assignment.supplierName) {
      const current = supplierTotals.get(assignment.supplierId) || { name: assignment.supplierName, totalQuantity: 0, itemCount: 0 };
      current.totalQuantity += assignment.quantity;
      current.itemCount += 1;
      supplierTotals.set(assignment.supplierId, current);
    }
  });

  const handleSupplierChange = (assignmentId: string, supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    onUpdateAssignment(assignmentId, {
      supplierId,
      supplierName: supplier?.supplier_name || ''
    });
  };

  const handleQuantityChange = (assignmentId: string, quantity: number) => {
    onUpdateAssignment(assignmentId, { quantity });
  };


  const handleRemarksChange = (assignmentId: string, remarks: string) => {
    onUpdateAssignment(assignmentId, { remarks });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Assign Suppliers & Quantities</h2>
        <p className="text-muted-foreground">
          Select suppliers and specify quantities for each item. You can split quantities across multiple suppliers.
        </p>
        {loadingSuppliers && (
          <p className="text-sm text-blue-600 mt-2">Loading suppliers...</p>
        )}
        {!loadingSuppliers && suppliers.length === 0 && (
          <p className="text-sm text-red-600 mt-2">No suppliers found. Please add suppliers first.</p>
        )}
        {!loadingSuppliers && suppliers.length > 0 && (
          <p className="text-sm text-green-600 mt-2">{suppliers.length} suppliers available</p>
        )}
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

      {/* Items and Assignments */}
      <div className="space-y-6 max-h-96 overflow-y-auto pr-2">
        {assignmentsByItem.map((item) => (
          <Card key={item.bomItemId} className="overflow-hidden">
            <CardHeader className="bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{item.itemName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Remaining quantity: <span className="font-medium text-green-600">{item.remainingQuantity}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddAssignment(item.bomItemId)}
                    disabled={item.remainingQuantity === 0}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Supplier
                  </Button>
                  {item.assignments.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSplitItem(item.bomItemId)}
                      disabled={item.remainingQuantity === 0}
                    >
                      Split to Another
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {item.assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No suppliers assigned yet</p>
                  <p className="text-sm">Click "Add Supplier" to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {item.assignments.map((assignment, index) => {
                    const totalQuantityAssigned = item.assignments.reduce((sum, a) => sum + a.quantity, 0);
                    const exceedsRemaining = totalQuantityAssigned > item.remainingQuantity;
                    
                    return (
                      <Card key={assignment.id} className={`${exceedsRemaining ? 'border-red-200 bg-red-50' : ''}`}>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Supplier Selection */}
                            <div className="space-y-2">
                              <Label>Supplier *</Label>
                              <Select
                                value={assignment.supplierId}
                                onValueChange={(value) => handleSupplierChange(assignment.id, value)}
                                disabled={loadingSuppliers}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                  {suppliers.length === 0 ? (
                                    <SelectItem value="" disabled>
                                      {loadingSuppliers ? 'Loading suppliers...' : 'No suppliers available'}
                                    </SelectItem>
                                  ) : (
                                    suppliers.map((supplier) => (
                                      <SelectItem key={supplier.id} value={supplier.id}>
                                        {supplier.supplier_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              {assignment.supplierName && (
                                <p className="text-xs text-muted-foreground">
                                  {suppliers.find(s => s.id === assignment.supplierId)?.contact_person}
                                </p>
                              )}
                            </div>

                            {/* Quantity */}
                            <div className="space-y-2">
                              <Label>Quantity *</Label>
                              <Input
                                type="number"
                                min="0"
                                max={item.remainingQuantity}
                                value={assignment.quantity}
                                onChange={(e) => handleQuantityChange(assignment.id, Number(e.target.value))}
                                className={assignment.quantity > item.remainingQuantity ? 'border-red-300' : ''}
                              />
                              <p className="text-xs text-muted-foreground">
                                Max: {item.remainingQuantity}
                              </p>
                            </div>

                          </div>

                          {/* Remarks */}
                          <div className="mt-4 space-y-2">
                            <Label>Remarks (Optional)</Label>
                            <Textarea
                              placeholder="Add any special instructions or notes..."
                              value={assignment.remarks}
                              onChange={(e) => handleRemarksChange(assignment.id, e.target.value)}
                              rows={2}
                            />
                          </div>

                          {/* Validation Warning */}
                          {exceedsRemaining && (
                            <div className="mt-4 flex items-center gap-2 p-3 bg-red-100 border border-red-200 rounded-md">
                              <AlertTriangle className="w-4 h-4 text-red-600" />
                              <p className="text-sm text-red-800">
                                Total assigned quantity ({totalQuantityAssigned}) exceeds remaining quantity ({item.remainingQuantity})
                              </p>
                            </div>
                          )}

                          {/* Remove Button */}
                          <div className="mt-4 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRemoveAssignment(assignment.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Supplier Summary */}
      {supplierTotals.size > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Supplier Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(supplierTotals.entries()).map(([supplierId, data]) => (
                <div key={supplierId} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div>
                    <p className="font-medium">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.itemCount} item{data.itemCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">{data.totalQuantity}</p>
                    <p className="text-sm text-muted-foreground">Total quantity</p>
                  </div>
                </div>
              ))}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Total Items:</p>
                  <p className="font-bold text-xl">
                    {Array.from(supplierTotals.values()).reduce((sum, data) => sum + data.totalQuantity, 0)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Instructions</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Select a supplier for each item you want to order</li>
                <li>• Specify the quantity for each assignment</li>
                <li>• Use "Split to Another" to assign the same item to multiple suppliers</li>
                <li>• Total quantity per item cannot exceed the remaining quantity</li>
                <li>• All required fields (marked with *) must be filled</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
