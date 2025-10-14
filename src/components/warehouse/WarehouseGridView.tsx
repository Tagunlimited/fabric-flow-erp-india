import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Building, 
  Layers, 
  Rows, 
  Package,
  Plus,
  Edit,
  Trash2,
  Search,
  Archive,
  Truck,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Warehouse, Floor, Rack, Bin, LocationType, LOCATION_TYPE_CONFIGS } from '@/types/warehouse';

interface WarehouseGridViewProps {
  warehouses: Warehouse[];
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
  onDelete: (type: string, id: string) => void;
  onAdd: (type: string, parentData?: any) => void;
}

type ViewType = 'warehouses' | 'floors' | 'racks' | 'bins';

export const WarehouseGridView: React.FC<WarehouseGridViewProps> = ({
  warehouses,
  searchTerm,
  onEdit,
  onDelete,
  onAdd
}) => {
  const [viewType, setViewType] = useState<ViewType>('warehouses');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Get icon for location type
  const getLocationTypeIcon = (locationType: LocationType) => {
    switch (locationType) {
      case 'RECEIVING_ZONE': return <Package className="w-4 h-4" />;
      case 'STORAGE': return <Archive className="w-4 h-4" />;
      case 'DISPATCH_ZONE': return <Truck className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  // Flatten data for grid view
  const gridData = useMemo(() => {
    const data: any[] = [];

    warehouses.forEach(warehouse => {
      // Add warehouse
      if (viewType === 'warehouses') {
        if (!searchTerm || 
            warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            warehouse.code.toLowerCase().includes(searchTerm.toLowerCase())) {
          data.push({
            ...warehouse,
            type: 'warehouse',
            parentName: null,
            level: 0
          });
        }
      }

      // Add floors
      if (viewType === 'floors' || viewType === 'racks' || viewType === 'bins') {
        warehouse.floors?.forEach(floor => {
          if (viewType === 'floors') {
            if (!searchTerm || 
                `Floor ${floor.floor_number}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                floor.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
              data.push({
                ...floor,
                type: 'floor',
                parentName: warehouse.name,
                level: 1
              });
            }
          }

          // Add racks
          if (viewType === 'racks' || viewType === 'bins') {
            floor.racks?.forEach(rack => {
              if (viewType === 'racks') {
                if (!searchTerm || 
                    rack.rack_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    rack.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
                  data.push({
                    ...rack,
                    type: 'rack',
                    parentName: `${warehouse.name} - Floor ${floor.floor_number}`,
                    level: 2
                  });
                }
              }

              // Add bins
              if (viewType === 'bins') {
                rack.bins?.forEach(bin => {
                  if (!searchTerm || 
                      bin.bin_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      bin.location_type.toLowerCase().includes(searchTerm.toLowerCase())) {
                    data.push({
                      ...bin,
                      type: 'bin',
                      parentName: `${warehouse.name} - Floor ${floor.floor_number} - ${rack.rack_code}`,
                      level: 3
                    });
                  }
                });
              }
            });
          }
        });
      }
    });

    return data;
  }, [warehouses, searchTerm, viewType]);

  // Toggle row expansion
  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Render warehouse row
  const renderWarehouseRow = (warehouse: any) => {
    const isExpanded = expandedRows.has(warehouse.id);
    const hasChildren = warehouse.floors && warehouse.floors.length > 0;

    return (
      <TableRow key={warehouse.id} className="hover:bg-muted/50">
        <TableCell>
          <div className="flex items-center gap-2">
            {hasChildren && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => toggleRow(warehouse.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            )}
            <Building className="w-4 h-4" />
            <span className="font-medium">{warehouse.name}</span>
          </div>
        </TableCell>
        <TableCell>{warehouse.code}</TableCell>
        <TableCell>{warehouse.city || '-'}</TableCell>
        <TableCell>{warehouse.state || '-'}</TableCell>
        <TableCell>
          <Badge variant={warehouse.is_active ? "default" : "secondary"}>
            {warehouse.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </TableCell>
        <TableCell>{warehouse.floors?.length || 0}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAdd('floor', warehouse)}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(warehouse, 'warehouse')}
            >
              <Edit className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this warehouse?')) {
                  onDelete('warehouses', warehouse.id);
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Render floor row
  const renderFloorRow = (floor: any) => (
    <TableRow key={floor.id} className="hover:bg-muted/50">
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingLeft: '20px' }}>
          <Layers className="w-4 h-4" />
          <span className="font-medium">Floor {floor.floor_number}</span>
        </div>
      </TableCell>
      <TableCell>{floor.floor_number}</TableCell>
      <TableCell>{floor.description || '-'}</TableCell>
      <TableCell>{floor.parentName}</TableCell>
      <TableCell>
        <Badge variant={floor.is_active ? "default" : "secondary"}>
          {floor.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>{floor.racks?.length || 0}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAdd('rack', floor)}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(floor, 'floor')}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this floor?')) {
                onDelete('floors', floor.id);
              }
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  // Render rack row
  const renderRackRow = (rack: any) => (
    <TableRow key={rack.id} className="hover:bg-muted/50">
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingLeft: '40px' }}>
          <Rows className="w-4 h-4" />
          <span className="font-medium">{rack.rack_code}</span>
        </div>
      </TableCell>
      <TableCell>{rack.rack_code}</TableCell>
      <TableCell>{rack.description || '-'}</TableCell>
      <TableCell>{rack.parentName}</TableCell>
      <TableCell>
        <Badge variant={rack.is_active ? "default" : "secondary"}>
          {rack.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>-</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAdd('bin', rack)}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(rack, 'rack')}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this rack?')) {
                onDelete('racks', rack.id);
              }
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  // Render bin row
  const renderBinRow = (bin: any) => {
    const locationConfig = LOCATION_TYPE_CONFIGS[bin.location_type];
    
    return (
      <TableRow key={bin.id} className="hover:bg-muted/50">
        <TableCell>
          <div className="flex items-center gap-2" style={{ paddingLeft: '60px' }}>
            {getLocationTypeIcon(bin.location_type)}
            <span className="font-medium">{bin.bin_code}</span>
          </div>
        </TableCell>
        <TableCell>{bin.bin_code}</TableCell>
        <TableCell>
          <Badge className={`${locationConfig.bgColor} ${locationConfig.color}`}>
            {locationConfig.label}
          </Badge>
        </TableCell>
        <TableCell>{bin.parentName}</TableCell>
        <TableCell>
          <Badge variant={bin.is_active ? "default" : "secondary"}>
            {bin.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </TableCell>
        <TableCell>-</TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(bin, 'bin')}
            >
              <Edit className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this bin?')) {
                  onDelete('bins', bin.id);
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Get table headers based on view type
  const getTableHeaders = () => {
    switch (viewType) {
      case 'warehouses':
        return ['Name', 'Code', 'City', 'State', 'Status', 'Floors', 'Actions'];
      case 'floors':
        return ['Name', 'Floor Number', 'Description', 'Warehouse', 'Status', 'Racks', 'Actions'];
      case 'racks':
        return ['Name', 'Rack Code', 'Description', 'Location', 'Status', 'Actions'];
      case 'bins':
        return ['Name', 'Bin Code', 'Type', 'Location', 'Status', 'Actions'];
      default:
        return [];
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Grid View</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={viewType === 'warehouses' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('warehouses')}
            >
              <Building className="w-4 h-4 mr-2" />
              Warehouses
            </Button>
            <Button
              variant={viewType === 'floors' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('floors')}
            >
              <Layers className="w-4 h-4 mr-2" />
              Floors
            </Button>
            <Button
              variant={viewType === 'racks' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('racks')}
            >
              <Rows className="w-4 h-4 mr-2" />
              Racks
            </Button>
            <Button
              variant={viewType === 'bins' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('bins')}
            >
              <Package className="w-4 h-4 mr-2" />
              Bins
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {gridData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No {viewType} found</p>
            {searchTerm && <p>Try adjusting your search terms</p>}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {getTableHeaders().map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {gridData.map((item) => {
                  switch (item.type) {
                    case 'warehouse':
                      return renderWarehouseRow(item);
                    case 'floor':
                      return renderFloorRow(item);
                    case 'rack':
                      return renderRackRow(item);
                    case 'bin':
                      return renderBinRow(item);
                    default:
                      return null;
                  }
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
