import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Users, 
  Package, 
  CheckCircle2, 
  Edit3,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { POGroup } from '@/hooks/useBomPOWizard';

interface POReviewStepProps {
  poGroups: POGroup[];
  onEdit: () => void;
  onCreatePOs: () => void;
  isCreating: boolean;
  errors: string[];
}

export function POReviewStep({
  poGroups,
  onEdit,
  onCreatePOs,
  isCreating,
  errors
}: POReviewStepProps) {
  const totalItems = poGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Review Purchase Orders</h2>
        <p className="text-muted-foreground">
          Review the purchase orders that will be created. Each supplier will get a separate PO.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Purchase Orders</p>
                <p className="text-2xl font-bold">{poGroups.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Suppliers</p>
                <p className="text-2xl font-bold">{poGroups.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>
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

      {/* Purchase Orders Preview */}
      <div className="space-y-6 max-h-96 overflow-y-auto pr-2">
        {poGroups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No purchase orders to create</h3>
                <p className="text-muted-foreground">
                  Please go back and assign suppliers to items
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          poGroups.map((group, index) => (
            <Card key={group.supplierId} className="overflow-hidden">
              <CardHeader className="bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{group.supplierName}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Purchase Order #{index + 1}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-lg font-semibold">
                    {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Item</th>
                          <th className="text-right py-2 font-medium">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, itemIndex) => (
                          <tr key={`${item.bomItemId}-${itemIndex}`} className="border-b">
                            <td className="py-3">
                              <div>
                                <p className="font-medium">{item.itemName}</p>
                                {item.remarks && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    <span className="font-medium">Remarks:</span> {item.remarks}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-right">
                              <Badge variant="outline">{item.quantity}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PO Summary */}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted-foreground">
                      {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {group.items.reduce((sum, item) => sum + item.quantity, 0)} units
                      </p>
                      <p className="text-sm text-muted-foreground">Total Quantity</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>


      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6">
        <Button
          variant="outline"
          onClick={onEdit}
          disabled={isCreating}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Edit
        </Button>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onEdit}
            disabled={isCreating}
            className="flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Edit Assignments
          </Button>
          
          <Button
            onClick={onCreatePOs}
            disabled={isCreating || poGroups.length === 0}
            className="flex items-center gap-2"
            size="lg"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating POs...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Create {poGroups.length} Purchase Order{poGroups.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Instructions */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-800 mb-2">Ready to Create</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• {poGroups.length} purchase order{poGroups.length !== 1 ? 's' : ''} will be created</li>
                <li>• Each supplier will receive a separate PO</li>
                <li>• All items will be tracked against the original BOM</li>
                <li>• You can create additional POs for remaining items later</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
