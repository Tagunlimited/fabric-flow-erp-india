import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Archive, 
  Truck, 
  BarChart3,
  ArrowRightLeft
} from 'lucide-react';
import { ReceivingZoneInventory } from '@/components/warehouse/ReceivingZoneInventory';
import { InventoryTransferModal } from '@/components/warehouse/InventoryTransferModal';
import { WarehouseInventory } from '@/types/warehouse-inventory';
import { ErpLayout } from '@/components/ErpLayout';

const WarehouseInventoryPage: React.FC = () => {
  const [selectedInventory, setSelectedInventory] = useState<WarehouseInventory | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [activeTab, setActiveTab] = useState('receiving');

  const handleTransferItem = (inventory: WarehouseInventory) => {
    setSelectedInventory(inventory);
    setShowTransferModal(true);
  };

  const handleViewDetails = (inventory: WarehouseInventory) => {
    // TODO: Implement view details modal
    console.log('View details for:', inventory);
  };

  const handleTransferComplete = () => {
    // Refresh the inventory list
    setShowTransferModal(false);
    setSelectedInventory(null);
  };

  return (
    <ErpLayout>
      <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Warehouse Inventory Management</h1>
          <p className="text-muted-foreground">
            Track and manage GRN items across warehouse zones
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            Receiving Zone
          </Badge>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="flex items-center gap-1">
            <Archive className="h-3 w-3" />
            Storage Zone
          </Badge>
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Dispatch Zone
          </Badge>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Receiving Zone</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">Items received</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Archive className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Storage Zone</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">Items in storage</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dispatch Zone</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">Ready to dispatch</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">-</p>
                <p className="text-xs text-muted-foreground">All zones</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="receiving" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Receiving Zone
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Storage Zone
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Dispatch Zone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receiving" className="space-y-4">
          <ReceivingZoneInventory
            onTransferItem={handleTransferItem}
            onViewDetails={handleViewDetails}
          />
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Storage Zone Inventory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Storage zone inventory coming soon...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Items transferred from receiving zone will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Dispatch Zone Inventory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Dispatch zone inventory coming soon...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Items ready for dispatch will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transfer Modal */}
      <InventoryTransferModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        inventory={selectedInventory}
        onTransferComplete={handleTransferComplete}
      />
      </div>
    </ErpLayout>
  );
};

export default WarehouseInventoryPage;
