import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search, Building, Layers, Rows, Columns, Box } from "lucide-react";

interface Bin {
  id: string;
  name: string;
}

interface Side {
  id: string;
  name: 'Left' | 'Right';
  bins: Bin[];
}

interface Rack {
  id: string;
  name: string;
  sides: Side[];
}

interface Floor {
  id: string;
  name: string;
  racks: Rack[];
}


interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  capacity?: number;
  manager_name?: string;
  manager_contact?: string;
  status: 'active' | 'inactive';
  created_at: string;
  floors: Floor[];
}

export function SimplifiedWarehouseMaster() {
  // ...existing code...
  // Inventory dialog state
  const [inventoryDialog, setInventoryDialog] = useState<{ open: boolean; bin?: Bin; warehouseId?: string; floorId?: string; rackId?: string; sideId?: string }>( { open: false } );

  // Delete handlers
  const deleteWarehouse = (id: string) => {
    if (window.confirm("Delete this warehouse?")) setWarehouses(prev => prev.filter(w => w.id !== id));
  };
  const deleteFloor = (warehouseId: string, floorId: string) => {
    if (window.confirm("Delete this floor?")) setWarehouses(prev => prev.map(w => w.id === warehouseId ? { ...w, floors: w.floors.filter(f => f.id !== floorId) } : w));
  };
  const deleteRack = (warehouseId: string, floorId: string, rackId: string) => {
    if (window.confirm("Delete this rack?")) setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? { ...f, racks: f.racks.filter(r => r.id !== rackId) } : f)
    } : w));
  };
  const deleteSide = (warehouseId: string, floorId: string, rackId: string, sideId: string) => {
    if (window.confirm("Delete this side?")) setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? {
          ...r,
          sides: r.sides.filter(s => s.id !== sideId)
        } : r)
      } : f)
    } : w));
  };
  const deleteBin = (warehouseId: string, floorId: string, rackId: string, sideId: string, binId: string) => {
    if (window.confirm("Delete this bin?")) setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? {
          ...r,
          sides: r.sides.map(s => s.id === sideId ? {
            ...s,
            bins: s.bins.filter(b => b.id !== binId)
          } : s)
        } : r)
      } : f)
    } : w));
  };
  // Inline editing state
  const [editingName, setEditingName] = useState<{ level: string; id: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // Update name handlers
  const updateWarehouseName = (id: string, name: string) => {
    setWarehouses(prev => prev.map(w => w.id === id ? { ...w, name } : w));
  };
  const updateFloorName = (warehouseId: string, floorId: string, name: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? { ...f, name } : f)
    } : w));
  };
  const updateRackName = (warehouseId: string, floorId: string, rackId: string, name: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? { ...r, name } : r)
      } : f)
    } : w));
  };
  const updateSideName = (warehouseId: string, floorId: string, rackId: string, sideId: string, name: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? {
          ...r,
          sides: r.sides.map(s => s.id === sideId ? { ...s, name } : s)
        } : r)
      } : f)
    } : w));
  };
  const updateBinName = (warehouseId: string, floorId: string, rackId: string, sideId: string, binId: string, name: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? {
          ...r,
          sides: r.sides.map(s => s.id === sideId ? {
            ...s,
            bins: s.bins.map(b => b.id === binId ? { ...b, name } : b)
          } : s)
        } : r)
      } : f)
    } : w));
  };

  // Save name on blur or Enter
  const handleNameSave = (level: string, ids: string[], value: string) => {
    if (level === "warehouse") updateWarehouseName(ids[0], value);
    if (level === "floor") updateFloorName(ids[0], ids[1], value);
    if (level === "rack") updateRackName(ids[0], ids[1], ids[2], value);
    if (level === "side") updateSideName(ids[0], ids[1], ids[2], ids[3], value);
    if (level === "bin") updateBinName(ids[0], ids[1], ids[2], ids[3], ids[4], value);
    setEditingName(null);
    setEditingValue("");
  };

  const [warehouses, setWarehouses] = useState<Warehouse[]>([{
    id: '1',
    name: 'Main Warehouse',
    code: 'WH001',
    address: '123 Industrial Area',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    capacity: 50000,
    manager_name: 'John Doe',
    manager_contact: '+91-9876543210',
    status: 'active',
    created_at: new Date().toISOString(),
    floors: [
      {
        id: 'f1',
        name: 'Ground Floor',
        racks: [
          {
            id: 'r1',
            name: 'Rack A',
            sides: [
              {
                id: 's1',
                name: 'Left',
                bins: [
                  { id: 'b1', name: 'Bin 1' },
                  { id: 'b2', name: 'Bin 2' }
                ]
              },
              {
                id: 's2',
                name: 'Right',
                bins: [
                  { id: 'b3', name: 'Bin 3' },
                  { id: 'b4', name: 'Bin 4' }
                ]
              }
            ]
          }
        ]
      }
    ]
  }]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // For graphical creation
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null);
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);
  const [expandedRack, setExpandedRack] = useState<string | null>(null);
  const [expandedSide, setExpandedSide] = useState<string | null>(null);

  // Add handlers for quick-add (demo only, not persistent)
  const addFloor = (warehouseId: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: [...w.floors, {
        id: `f${Date.now()}`,
        name: `Floor ${w.floors.length + 1}`,
        racks: []
      }]
    } : w));
    setExpandedWarehouse(warehouseId);
  };
  const addRack = (warehouseId: string, floorId: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: [...f.racks, {
          id: `r${Date.now()}`,
          name: `Rack ${f.racks.length + 1}`,
          sides: [
            { id: `s${Date.now()}l`, name: 'Left', bins: [] },
            { id: `s${Date.now()}r`, name: 'Right', bins: [] }
          ]
        }]
      } : f)
    } : w));
  };
  const addBin = (warehouseId: string, floorId: string, rackId: string, sideId: string) => {
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? {
      ...w,
      floors: w.floors.map(f => f.id === floorId ? {
        ...f,
        racks: f.racks.map(r => r.id === rackId ? {
          ...r,
          sides: r.sides.map(s => s.id === sideId ? {
            ...s,
            bins: [...s.bins, { id: `b${Date.now()}`, name: `Bin ${s.bins.length + 1}` }]
          } : s)
        } : r)
      } : f)
    } : w));
  };

  // ...existing code for handleSubmit, handleEdit, handleDelete, resetForm, openDialog...

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      capacity: warehouse.capacity?.toString() || "",
      manager_name: warehouse.manager_name || "",
      manager_contact: warehouse.manager_contact || "",
      status: warehouse.status
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    try {
      setWarehouses(prev => prev.filter(warehouse => warehouse.id !== id));
      toast({
        title: "Success",
        description: "Warehouse deleted successfully!",
      });
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      toast({
        title: "Error",
        description: "Failed to delete warehouse",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      capacity: "",
      manager_name: "",
      manager_contact: "",
      status: "active"
    });
  };

  const openDialog = () => {
    setEditingWarehouse(null);
    resetForm();
    setShowDialog(true);
  };

  const filteredWarehouses = warehouses.filter(warehouse =>
    warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    warehouse.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    warehouse.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dashboard metrics
  const totalWarehouses = warehouses.length;
  const totalFloors = warehouses.reduce((acc, w) => acc + w.floors.length, 0);
  const totalRacks = warehouses.reduce((acc, w) => acc + w.floors.reduce((a, f) => a + f.racks.length, 0), 0);
  const totalSides = warehouses.reduce((acc, w) => acc + w.floors.reduce((a, f) => a + f.racks.reduce((ar, r) => ar + r.sides.length, 0), 0), 0);
  const totalBins = warehouses.reduce((acc, w) => acc + w.floors.reduce((a, f) => a + f.racks.reduce((ar, r) => ar + r.sides.reduce((as, s) => as + s.bins.length, 0), 0), 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Warehouse Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your warehouse locations and facilities
          </p>
        </div>
        {/* ...existing dialog code for adding warehouse... */}
      </div>

      {/* Warehouse Dashboard Section */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-100 to-blue-300 shadow-md">
          <CardHeader>
            <CardTitle>Total Warehouses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{totalWarehouses}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-100 to-green-300 shadow-md">
          <CardHeader>
            <CardTitle>Total Floors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{totalFloors}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-100 to-yellow-300 shadow-md">
          <CardHeader>
            <CardTitle>Total Racks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-700">{totalRacks}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-100 to-purple-300 shadow-md">
          <CardHeader>
            <CardTitle>Total Sides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">{totalSides}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-100 to-pink-300 shadow-md">
          <CardHeader>
            <CardTitle>Total Bins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-700">{totalBins}</div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouse Summary Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Warehouse Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-50">
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Floors</th>
                  <th className="px-4 py-2 text-left">Racks</th>
                  <th className="px-4 py-2 text-left">Bins</th>
                  <th className="px-4 py-2 text-left">Manager</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map(w => (
                  <tr key={w.id} className="border-b">
                    <td className="px-4 py-2 font-semibold">{w.name}</td>
                    <td className="px-4 py-2">{w.code}</td>
                    <td className="px-4 py-2">{w.floors.length}</td>
                    <td className="px-4 py-2">{w.floors.reduce((acc, f) => acc + f.racks.length, 0)}</td>
                    <td className="px-4 py-2">{w.floors.reduce((acc, f) => acc + f.racks.reduce((ar, r) => ar + r.sides.reduce((as, s) => as + s.bins.length, 0), 0), 0)}</td>
                    <td className="px-4 py-2">{w.manager_name}</td>
                    <td className="px-4 py-2">
                      <Badge className={w.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}>{w.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Graphical Preview Panel */}
      <Card className="shadow-erp-md">
        <CardHeader>
          <CardTitle>Graphical Warehouse Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {warehouses.map((warehouse) => (
            <div key={warehouse.id} className="mb-8 p-4 border-2 border-primary rounded-2xl bg-gradient-to-br from-blue-50 via-white to-blue-100 shadow-xl transition-all duration-300">
              <div className="flex items-center mb-2">
                <div className="flex-1 flex items-center cursor-pointer hover:bg-blue-200 rounded-lg px-3 py-2 transition-all duration-200" onClick={() => setExpandedWarehouse(expandedWarehouse === warehouse.id ? null : warehouse.id)}>
                  <Building className="w-7 h-7 mr-3 text-primary animate-pulse" />
                  {editingName?.level === "warehouse" && editingName.id === warehouse.id ? (
                    <input
                      className="font-bold text-xl bg-white border rounded px-2 py-1 ml-0 mr-2 w-40"
                      value={editingValue}
                      autoFocus
                      onChange={e => setEditingValue(e.target.value)}
                      onBlur={() => handleNameSave("warehouse", [warehouse.id], editingValue)}
                      onKeyDown={e => { if (e.key === "Enter") handleNameSave("warehouse", [warehouse.id], editingValue); }}
                    />
                  ) : (
                    <span className="font-bold text-xl cursor-pointer" onClick={() => { setEditingName({ level: "warehouse", id: warehouse.id }); setEditingValue(warehouse.name); }}>{warehouse.name}</span>
                  )}
                  <span className="ml-4 text-xs text-muted-foreground">Code: {warehouse.code}</span>
                  <Badge className="ml-4 bg-blue-200 text-blue-800">{warehouse.floors.length} Floors</Badge>
                  {/* Total inventory at warehouse level (sum of all bins) */}
                  <Badge className="ml-2 bg-green-200 text-green-800">Inventory: {
                    warehouse.floors.reduce((acc, f) => acc + f.racks.reduce((ar, r) => ar + r.sides.reduce((as, s) => as + s.bins.length, 0), 0), 0)
                  }</Badge>
                  <Button size="xs" variant="destructive" className="ml-4" onClick={e => { e.stopPropagation(); deleteWarehouse(warehouse.id); }}>Delete</Button>
                </div>
                <Button size="sm" variant="default" className="ml-2 font-semibold bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-md hover:scale-105 transition-transform duration-150" onClick={() => addFloor(warehouse.id)}>+ Floor</Button>
              </div>
              {expandedWarehouse === warehouse.id && (
                <div className="ml-8">
                  {warehouse.floors.map((floor) => (
                    <div key={floor.id} className="mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-100 to-blue-50 shadow">
                      <div className="flex items-center cursor-pointer hover:bg-blue-100 rounded-lg px-2 py-1 transition-all duration-200" onClick={() => setExpandedFloor(expandedFloor === floor.id ? null : floor.id)}>
                        <Layers className="w-6 h-6 mr-2 text-blue-500 animate-bounce" />
                        {editingName?.level === "floor" && editingName.id === floor.id ? (
                          <input
                            className="font-semibold text-lg bg-white border rounded px-2 py-1 w-32"
                            value={editingValue}
                            autoFocus
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => handleNameSave("floor", [warehouse.id, floor.id], editingValue)}
                            onKeyDown={e => { if (e.key === "Enter") handleNameSave("floor", [warehouse.id, floor.id], editingValue); }}
                          />
                        ) : (
                          <span className="font-semibold text-lg cursor-pointer" onClick={() => { setEditingName({ level: "floor", id: floor.id }); setEditingValue(floor.name); }}>{floor.name}</span>
                        )}
                        <Badge className="ml-3 bg-blue-100 text-blue-700">{floor.racks.length} Racks</Badge>
                        {/* Total inventory at floor level (sum of all bins in racks) */}
                        <Badge className="ml-2 bg-green-100 text-green-800">Inventory: {
                          floor.racks.reduce((ar, r) => ar + r.sides.reduce((as, s) => as + s.bins.length, 0), 0)
                        }</Badge>
                        <Button size="xs" variant="destructive" className="ml-2" onClick={e => { e.stopPropagation(); deleteFloor(warehouse.id, floor.id); }}>Delete</Button>
                        <Button size="sm" variant="default" className="ml-auto font-semibold bg-gradient-to-r from-green-400 to-blue-500 text-white shadow hover:scale-105 transition-transform duration-150" onClick={(e) => { e.stopPropagation(); addRack(warehouse.id, floor.id); }}>+ Rack</Button>
                      </div>
                      {expandedFloor === floor.id && (
                        <div className="ml-8">
                          {floor.racks.map((rack) => (
                            <div key={rack.id} className="mb-2 p-2 rounded-lg bg-gradient-to-r from-green-100 to-blue-50 shadow">
                              <div className="flex items-center cursor-pointer hover:bg-green-100 rounded-lg px-2 py-1 transition-all duration-200" onClick={() => setExpandedRack(expandedRack === rack.id ? null : rack.id)}>
                                <Rows className="w-5 h-5 mr-2 text-green-500 animate-spin" />
                                {editingName?.level === "rack" && editingName.id === rack.id ? (
                                  <input
                                    className="font-medium text-base bg-white border rounded px-2 py-1 w-28"
                                    value={editingValue}
                                    autoFocus
                                    onChange={e => setEditingValue(e.target.value)}
                                    onBlur={() => handleNameSave("rack", [warehouse.id, floor.id, rack.id], editingValue)}
                                    onKeyDown={e => { if (e.key === "Enter") handleNameSave("rack", [warehouse.id, floor.id, rack.id], editingValue); }}
                                  />
                                ) : (
                                  <span className="font-medium text-base cursor-pointer" onClick={() => { setEditingName({ level: "rack", id: rack.id }); setEditingValue(rack.name); }}>{rack.name}</span>
                                )}
                                {/* Total inventory at rack level (sum of all bins in sides) */}
                                <Badge className="ml-3 bg-green-100 text-green-700">Inventory: {
                                  rack.sides.reduce((as, s) => as + s.bins.length, 0)
                                }</Badge>
                                <Badge className="ml-2 bg-green-100 text-green-700">{rack.sides.reduce((acc, s) => acc + s.bins.length, 0)} Bins</Badge>
                                <Button size="xs" variant="destructive" className="ml-2" onClick={e => { e.stopPropagation(); deleteRack(warehouse.id, floor.id, rack.id); }}>Delete</Button>
                              </div>
                              {expandedRack === rack.id && (
                                <div className="ml-8 flex gap-8">
                                  {rack.sides.map((side) => (
                                    <div key={side.id} className="p-2 rounded-lg bg-gradient-to-r from-purple-100 to-blue-50 shadow">
                                      <div className="flex items-center cursor-pointer hover:bg-purple-100 rounded-lg px-2 py-1 transition-all duration-200" onClick={() => setExpandedSide(expandedSide === side.id ? null : side.id)}>
                                        <Columns className="w-5 h-5 mr-1 text-purple-500 animate-pulse" />
                                        {editingName?.level === "side" && editingName.id === side.id ? (
                                          <input
                                            className="font-medium text-base bg-white border rounded px-2 py-1 w-24"
                                            value={editingValue}
                                            autoFocus
                                            onChange={e => setEditingValue(e.target.value)}
                                            onBlur={() => handleNameSave("side", [warehouse.id, floor.id, rack.id, side.id], editingValue)}
                                            onKeyDown={e => { if (e.key === "Enter") handleNameSave("side", [warehouse.id, floor.id, rack.id, side.id], editingValue); }}
                                          />
                                        ) : (
                                          <span className="font-medium text-base cursor-pointer" onClick={() => { setEditingName({ level: "side", id: side.id }); setEditingValue(side.name); }}>{side.name} Side</span>
                                        )}
                                        <Badge className="ml-2 bg-purple-200 text-purple-800">{side.bins.length} Bins</Badge>
                                        <Button size="xs" variant="destructive" className="ml-2" onClick={e => { e.stopPropagation(); deleteSide(warehouse.id, floor.id, rack.id, side.id); }}>Delete</Button>
                                        <Button size="sm" variant="default" className="ml-auto font-semibold bg-gradient-to-r from-blue-400 to-purple-500 text-white shadow hover:scale-105 transition-transform duration-150" onClick={(e) => { e.stopPropagation(); addBin(warehouse.id, floor.id, rack.id, side.id); }}>+ Bin</Button>
                                      </div>
                                      {expandedSide === side.id && (
                                        <div className="ml-4 flex gap-2 flex-wrap">
                                          {side.bins.map((bin) => (
                                            <div key={bin.id} className="flex items-center px-3 py-2 bg-blue-100 rounded-lg shadow text-xs font-semibold hover:bg-blue-200 transition-all duration-200">
                                              <Box className="w-4 h-4 mr-2 text-blue-700 animate-bounce" />
                                              {editingName?.level === "bin" && editingName.id === bin.id ? (
                                                <input
                                                  className="text-xs font-semibold bg-white border rounded px-2 py-1 w-20"
                                                  value={editingValue}
                                                  autoFocus
                                                  onChange={e => setEditingValue(e.target.value)}
                                                  onBlur={() => handleNameSave("bin", [warehouse.id, floor.id, rack.id, side.id, bin.id], editingValue)}
                                                  onKeyDown={e => { if (e.key === "Enter") handleNameSave("bin", [warehouse.id, floor.id, rack.id, side.id, bin.id], editingValue); }}
                                                />
                                              ) : (
                                                <span className="text-xs font-semibold cursor-pointer" onClick={() => { setEditingName({ level: "bin", id: bin.id }); setEditingValue(bin.name); }}>{bin.name}</span>
                                              )}
                                              <Button size="xs" variant="destructive" className="ml-2" onClick={e => { e.stopPropagation(); deleteBin(warehouse.id, floor.id, rack.id, side.id, bin.id); }}>Delete</Button>
                                              <Button size="xs" variant="outline" className="ml-2" onClick={e => { e.stopPropagation(); setInventoryDialog({ open: true, bin, warehouseId: warehouse.id, floorId: floor.id, rackId: rack.id, sideId: side.id }); }}>Add Inventory</Button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {/* Inventory Dialog */}
      <Dialog open={inventoryDialog.open} onOpenChange={open => setInventoryDialog({ ...inventoryDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inventory to Bin</DialogTitle>
          </DialogHeader>
          {inventoryDialog.bin && (
            <div className="space-y-4">
              <div>
                <strong>Bin:</strong> {inventoryDialog.bin.name}
              </div>
              <Input placeholder="Inventory Item Name" />
              <Input placeholder="Quantity" type="number" />
              <Button onClick={() => setInventoryDialog({ open: false })} className="bg-gradient-to-r from-blue-500 to-green-500 text-white">Add Inventory</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}