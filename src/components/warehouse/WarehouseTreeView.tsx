import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronRight, 
  ChevronDown, 
  Building, 
  Layers, 
  Rows, 
  Package,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Archive,
  Truck
} from 'lucide-react';
import { Warehouse, Floor, Rack, Bin, LocationType, LOCATION_TYPE_CONFIGS } from '@/types/warehouse';

interface WarehouseTreeViewProps {
  warehouses: Warehouse[];
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
  onDelete: (type: string, id: string) => void;
  onAdd: (type: string, parentData?: any) => void;
  selectedNode: any;
  onSelectNode: (node: any) => void;
}

interface TreeNode {
  id: string;
  type: 'warehouse' | 'floor' | 'rack' | 'bin';
  label: string;
  code?: string;
  data: Warehouse | Floor | Rack | Bin;
  children?: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
}

export const WarehouseTreeView: React.FC<WarehouseTreeViewProps> = ({
  warehouses,
  searchTerm,
  onEdit,
  onDelete,
  onAdd,
  selectedNode,
  onSelectNode
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Get icon for location type
  const getLocationTypeIcon = (locationType: LocationType) => {
    switch (locationType) {
      case 'RECEIVING_ZONE': return <Package className="w-4 h-4" />;
      case 'STORAGE': return <Archive className="w-4 h-4" />;
      case 'DISPATCH_ZONE': return <Truck className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  // Build tree structure
  const treeData = useMemo(() => {
    const buildTree = (): TreeNode[] => {
      return warehouses
        .filter(warehouse => 
          !searchTerm || 
          warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          warehouse.code.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(warehouse => ({
          id: warehouse.id,
          type: 'warehouse' as const,
          label: warehouse.name,
          code: warehouse.code,
          data: warehouse,
          children: warehouse.floors?.map(floor => ({
            id: floor.id,
            type: 'floor' as const,
            label: `Floor ${floor.floor_number}`,
            code: floor.floor_number.toString(),
            data: floor,
            children: floor.racks?.map(rack => ({
              id: rack.id,
              type: 'rack' as const,
              label: rack.rack_code,
              code: rack.rack_code,
              data: rack,
              children: rack.bins?.map(bin => ({
                id: bin.id,
                type: 'bin' as const,
                label: bin.bin_code,
                code: bin.bin_code,
                data: bin
              }))
            }))
          }))
        }));
    };

    return buildTree();
  }, [warehouses, searchTerm]);

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Handle node selection
  const handleNodeSelect = (node: TreeNode) => {
    onSelectNode(node);
  };

  // Render tree node
  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;

    const getNodeIcon = () => {
      switch (node.type) {
        case 'warehouse':
          return <Building className="w-4 h-4" />;
        case 'floor':
          return <Layers className="w-4 h-4" />;
        case 'rack':
          return <Rows className="w-4 h-4" />;
        case 'bin':
          return getLocationTypeIcon((node.data as Bin).location_type);
        default:
          return <Package className="w-4 h-4" />;
      }
    };

    const getNodeBadges = () => {
      const badges = [];
      
      switch (node.type) {
        case 'warehouse':
          const warehouse = node.data as Warehouse;
          badges.push(
            <Badge key="status" variant={warehouse.is_active ? "default" : "secondary"}>
              {warehouse.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
          if (warehouse.floors) {
            badges.push(
              <Badge key="floors" variant="outline">
                {warehouse.floors.length} floors
              </Badge>
            );
          }
          break;
          
        case 'floor':
          const floor = node.data as Floor;
          badges.push(
            <Badge key="status" variant={floor.is_active ? "default" : "secondary"}>
              {floor.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
          if (floor.racks) {
            badges.push(
              <Badge key="racks" variant="outline">
                {floor.racks.length} racks
              </Badge>
            );
          }
          break;
          
        case 'rack':
          const rack = node.data as Rack;
          badges.push(
            <Badge key="status" variant={rack.is_active ? "default" : "secondary"}>
              {rack.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
          if (rack.bins) {
            badges.push(
              <Badge key="bins" variant="outline">
                {rack.bins.length} bins
              </Badge>
            );
          }
          break;
          
        case 'bin':
          const bin = node.data as Bin;
          const locationConfig = LOCATION_TYPE_CONFIGS[bin.location_type];
          badges.push(
            <Badge key="type" className={`${locationConfig.bgColor} ${locationConfig.color}`}>
              {locationConfig.label}
            </Badge>
          );
          badges.push(
            <Badge key="status" variant={bin.is_active ? "default" : "secondary"}>
              {bin.is_active ? 'Active' : 'Inactive'}
            </Badge>
          );
          break;
      }
      
      return badges;
    };

    const getAddButton = () => {
      switch (node.type) {
        case 'warehouse':
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAdd('floor', node.data);
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              Floor
            </Button>
          );
        case 'floor':
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAdd('rack', node.data);
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              Rack
            </Button>
          );
        case 'rack':
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAdd('bin', node.data);
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              Bin
            </Button>
          );
        default:
          return null;
      }
    };

    return (
      <div key={node.id} className="select-none">
        <div
          className={`
            flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
            ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'}
          `}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => handleNodeSelect(node)}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          
          {/* Node Icon */}
          <div className="flex-shrink-0">
            {getNodeIcon()}
          </div>
          
          {/* Node Label */}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{node.label}</div>
            {node.code && (
              <div className="text-sm text-muted-foreground">Code: {node.code}</div>
            )}
          </div>
          
          {/* Badges */}
          <div className="flex gap-1 flex-wrap">
            {getNodeBadges()}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-1">
            {getAddButton()}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node.data, node.type);
              }}
            >
              <Edit className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Are you sure you want to delete this ${node.type}?`)) {
                  onDelete(node.type, node.id);
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="ml-4">
            {node.children?.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Warehouse Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent>
        {treeData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No warehouses found</p>
            {searchTerm && <p>Try adjusting your search terms</p>}
          </div>
        ) : (
          <div className="space-y-1">
            {treeData.map(node => renderTreeNode(node))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
