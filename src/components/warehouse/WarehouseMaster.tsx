import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Building, 
  Plus, 
  Search, 
  TreePine, 
  Grid3X3, 
  MapPin,
  Package,
  Archive,
  Truck,
  BarChart3,
  Settings
} from 'lucide-react';
import { Warehouse, Floor, Rack, Bin, WarehouseStats, LocationType, LOCATION_TYPE_CONFIGS } from '@/types/warehouse';
import { WarehouseTreeView } from './WarehouseTreeView';
import { WarehouseGridView } from './WarehouseGridView';
import { WarehouseForm } from './WarehouseForm';
import { FloorForm } from './FloorForm';
import { RackForm } from './RackForm';
import { BinForm } from './BinForm';
import { supabase } from '@/integrations/supabase/client';

export const WarehouseMaster: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('tree');
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [stats, setStats] = useState<WarehouseStats>({
    totalWarehouses: 0,
    totalFloors: 0,
    totalRacks: 0,
    totalBins: 0,
    activeWarehouses: 0,
    activeFloors: 0,
    activeRacks: 0,
    activeBins: 0,
    locationTypeDistribution: {
      PICKING: 0,
      BULK_STORAGE: 0,
      QUARANTINE: 0,
      RETURNS: 0,
      FABRIC_STORAGE: 0,
      TRIMS_STORAGE: 0,
      GARMENT_STORAGE: 0
    }
  });

  // Form states
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [showRackForm, setShowRackForm] = useState(false);
  const [showBinForm, setShowBinForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const { toast } = useToast();

  // Load warehouses with full hierarchy
  const loadWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load warehouses
      const { data: warehousesData, error: warehousesError } = await supabase
        .from('warehouses')
        .select(`
          *,
          floors (
            *,
            racks (
              *,
              bins (*)
            )
          )
        `)
        .order('name');

      if (warehousesError) throw warehousesError;

      setWarehouses(warehousesData || []);
      calculateStats(warehousesData || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load warehouses',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Calculate warehouse statistics
  const calculateStats = (warehousesData: Warehouse[]) => {
    let totalFloors = 0;
    let totalRacks = 0;
    let totalBins = 0;
    let activeWarehouses = 0;
    let activeFloors = 0;
    let activeRacks = 0;
    let activeBins = 0;
    const locationTypeDistribution: Record<LocationType, number> = {
      RECEIVING_ZONE: 0,
      STORAGE: 0,
      DISPATCH_ZONE: 0
    };

    warehousesData.forEach(warehouse => {
      if (warehouse.is_active) activeWarehouses++;
      
      warehouse.floors?.forEach(floor => {
        totalFloors++;
        if (floor.is_active) activeFloors++;
        
        floor.racks?.forEach(rack => {
          totalRacks++;
          if (rack.is_active) activeRacks++;
          rack.bins?.forEach(bin => {
            totalBins++;
            if (bin.is_active) activeBins++;
            locationTypeDistribution[bin.location_type]++;
          });
        });
      });
    });

    setStats({
      totalWarehouses: warehousesData.length,
      totalFloors,
      totalRacks,
      totalBins,
      activeWarehouses,
      activeFloors,
      activeRacks,
      activeBins,
      locationTypeDistribution
    });
  };

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  // Handle form submissions
  const handleWarehouseSubmit = async (data: any) => {
    try {
      if (editingItem && editingItem.id) {
        // Update existing warehouse
        const { error } = await supabase
          .from('warehouses')
          .update(data)
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Warehouse updated successfully' });
      } else {
        // Create new warehouse
        const { error } = await supabase
          .from('warehouses')
          .insert(data);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Warehouse created successfully' });
      }
      
      setShowWarehouseForm(false);
      setEditingItem(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error saving warehouse:', error);
      toast({
        title: 'Error',
        description: 'Failed to save warehouse',
        variant: 'destructive',
      });
    }
  };

  const handleFloorSubmit = async (data: any) => {
    try {
      if (editingItem && editingItem.id) {
        // Update existing floor
        const { error } = await supabase
          .from('floors')
          .update(data)
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Floor updated successfully' });
      } else {
        // Create new floor
        const { error } = await supabase
          .from('floors')
          .insert(data);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Floor created successfully' });
      }
      
      setShowFloorForm(false);
      setEditingItem(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error saving floor:', error);
      toast({
        title: 'Error',
        description: 'Failed to save floor',
        variant: 'destructive',
      });
    }
  };

  const handleRackSubmit = async (data: any) => {
    try {
      if (editingItem && editingItem.id) {
        // Update existing rack
        const { error } = await supabase
          .from('racks')
          .update(data)
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Rack updated successfully' });
      } else {
        // Create new rack
        const { error } = await supabase
          .from('racks')
          .insert(data);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Rack created successfully' });
      }
      
      setShowRackForm(false);
      setEditingItem(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error saving rack:', error);
      toast({
        title: 'Error',
        description: 'Failed to save rack',
        variant: 'destructive',
      });
    }
  };

  const handleBinSubmit = async (data: any) => {
    try {
      if (editingItem && editingItem.id) {
        // Update existing bin
        const { error } = await supabase
          .from('bins')
          .update(data)
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Bin updated successfully' });
      } else {
        // Create new bin
        const { error } = await supabase
          .from('bins')
          .insert(data);
        
        if (error) throw error;
        toast({ title: 'Success', description: 'Bin created successfully' });
      }
      
      setShowBinForm(false);
      setEditingItem(null);
      loadWarehouses();
    } catch (error) {
      console.error('Error saving bin:', error);
      toast({
        title: 'Error',
        description: 'Failed to save bin',
        variant: 'destructive',
      });
    }
  };

  // Handle delete operations
  const handleDelete = async (type: string, id: string) => {
    try {
      // Map the type to the correct table name
      // Handle both singular and plural forms
      const tableName = type === 'warehouse' || type === 'warehouses' ? 'warehouses' : 
                       type === 'floor' || type === 'floors' ? 'floors' :
                       type === 'rack' || type === 'racks' ? 'racks' :
                       type === 'bin' || type === 'bins' ? 'bins' : type;
      
      console.log(`Attempting to delete ${type} (ID: ${id}) from table: ${tableName}`);
      
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }
      
      // Get the singular form for the success message
      const singularType = type === 'warehouses' ? 'warehouse' :
                          type === 'floors' ? 'floor' :
                          type === 'racks' ? 'rack' :
                          type === 'bins' ? 'bin' : type;
      
      console.log(`Successfully deleted ${singularType} with ID: ${id}`);
      toast({ title: 'Success', description: `${singularType} deleted successfully` });
      loadWarehouses();
    } catch (error) {
      console.error(`Error deleting ${type} (ID: ${id}):`, error);
      toast({
        title: 'Error',
        description: `Failed to delete ${type}. ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  // Handle edit operations
  const handleEdit = (item: any, type: string) => {
    setEditingItem(item);
    switch (type) {
      case 'warehouse':
        setShowWarehouseForm(true);
        break;
      case 'floor':
        setShowFloorForm(true);
        break;
      case 'rack':
        setShowRackForm(true);
        break;
      case 'bin':
        setShowBinForm(true);
        break;
    }
  };

  // Handle add operations
  const handleAdd = (type: string, parentData?: any) => {
    setEditingItem(null);
    switch (type) {
      case 'warehouse':
        setShowWarehouseForm(true);
        break;
      case 'floor':
        setEditingItem({ warehouse_id: parentData?.id });
        setShowFloorForm(true);
        break;
      case 'rack':
        setEditingItem({ floor_id: parentData?.id });
        setShowRackForm(true);
        break;
      case 'bin':
        setEditingItem({ rack_id: parentData?.id });
        setShowBinForm(true);
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading warehouses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Warehouse Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your warehouse locations and storage facilities
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleAdd('warehouse')} className="bg-gradient-to-r from-blue-500 to-purple-500">
            <Plus className="w-4 h-4 mr-2" />
            Add Warehouse
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Total Warehouses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{stats.totalWarehouses}</div>
            <p className="text-xs text-blue-600">{stats.activeWarehouses} active</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Total Floors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{stats.totalFloors}</div>
            <p className="text-xs text-green-600">{stats.activeFloors} active</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700">Total Racks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-900">{stats.totalRacks}</div>
            <p className="text-xs text-yellow-600">{stats.activeRacks} active</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">Total Bins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{stats.totalBins}</div>
            <p className="text-xs text-purple-600">{stats.activeBins} active</p>
          </CardContent>
        </Card>
      </div>

      {/* Location Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Storage Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(LOCATION_TYPE_CONFIGS).map(([type, config]) => (
              <div key={type} className="text-center">
                <div className={`w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center mx-auto mb-2`}>
                  <Package className={`w-6 h-6 ${config.color}`} />
                </div>
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-lg font-bold">{stats.locationTypeDistribution[type as LocationType]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search warehouses, floors, racks, or bins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tree" className="flex items-center gap-2">
            <TreePine className="w-4 h-4" />
            Tree View
          </TabsTrigger>
          <TabsTrigger value="grid" className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4" />
            Grid View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4">
          <WarehouseTreeView
            warehouses={warehouses}
            searchTerm={searchTerm}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
          />
        </TabsContent>

        <TabsContent value="grid" className="space-y-4">
          <WarehouseGridView
            warehouses={warehouses}
            searchTerm={searchTerm}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
          />
        </TabsContent>
      </Tabs>

      {/* Forms */}
      {showWarehouseForm && (
        <WarehouseForm
          open={showWarehouseForm}
          onOpenChange={setShowWarehouseForm}
          onSubmit={handleWarehouseSubmit}
          editingItem={editingItem}
        />
      )}

      {showFloorForm && (
        <FloorForm
          open={showFloorForm}
          onOpenChange={setShowFloorForm}
          onSubmit={handleFloorSubmit}
          editingItem={editingItem}
          warehouses={warehouses}
        />
      )}

      {showRackForm && (
        <RackForm
          open={showRackForm}
          onOpenChange={setShowRackForm}
          onSubmit={handleRackSubmit}
          editingItem={editingItem}
          warehouses={warehouses}
        />
      )}

      {showBinForm && (
        <BinForm
          open={showBinForm}
          onOpenChange={setShowBinForm}
          onSubmit={handleBinSubmit}
          editingItem={editingItem}
          warehouses={warehouses}
        />
      )}
    </div>
  );
};
