import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Package, 
  Box, 
  Palette, 
  Building, 
  Users, 
  Shirt,
  Ruler,
  Settings
} from "lucide-react";

const masters = [
  {
    title: "Product Master",
    description: "Manage your product catalog and inventory",
    icon: Package,
    path: "/masters/products"
  },
  {
    title: "Item Master", 
    description: "Manage inventory items and stock levels",
    icon: Box,
    path: "/masters/items"
  },
  {
    title: "Product Category Master",
    description: "Organize products into categories",
    icon: Package,
    path: "/inventory/product-categories"
  },
  {
    title: "Fabric Master",
    description: "Manage fabric types and variations",
    icon: Palette,
    path: "/inventory/fabrics"
  },
  {
    title: "Size Master",
    description: "Configure size types and measurements",
    icon: Ruler,
    path: "/inventory/size-types"
  },
  {
    title: "Warehouse Master",
    description: "Manage warehouse locations and facilities",
    icon: Building,
    path: "/masters/warehouses"
  },
  {
    title: "Customer Type Master",
    description: "Define customer types and configurations",
    icon: Users,
    path: "/masters/customer-types"
  }
];

const MastersPage = () => {
  const navigate = useNavigate();

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Masters Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure and manage all master data for your ERP system
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {masters.map((master, index) => (
            <Card 
              key={index} 
              className="shadow-erp-md hover:shadow-erp-lg transition-all duration-200 cursor-pointer group"
              onClick={() => navigate(master.path)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <master.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {master.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm mb-4">
                  {master.description}
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(master.path);
                  }}
                >
                  Manage
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-erp-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Custom Masters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Custom Master Management</h3>
              <p className="text-muted-foreground mb-4">
                Create and manage custom master data tables with configurable fields
              </p>
              <Button 
                className="bg-gradient-primary hover:bg-gradient-primary/90"
                onClick={() => navigate("/masters/custom")}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configure Custom Masters
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
};

export default MastersPage;