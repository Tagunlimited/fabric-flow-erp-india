import { useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ErpSegmentedTabList } from "@/components/ui/ErpSegmentedTabList";
import { Package, AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";
import { ProductCategoryManager } from "@/components/inventory/ProductCategoryManager";
import { FabricManagerNew } from "@/components/inventory/FabricManagerNew";
import { SizeTypeManager } from "@/components/inventory/SizeTypeManager";

const INVENTORY_TAB_ORDER = [
  "overview",
  "items",
  "categories",
  "fabrics",
  "sizes",
] as const;

const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState<(typeof INVENTORY_TAB_ORDER)[number]>("overview");
  const activeIdx = INVENTORY_TAB_ORDER.indexOf(activeTab);

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Inventory Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor stock levels and manage your inventory efficiently
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">500</span>
                <Package className="w-5 h-5 text-inventory" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">25</span>
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">450</span>
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Critical
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">5</span>
                <TrendingDown className="w-5 h-5 text-error" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as (typeof INVENTORY_TAB_ORDER)[number])
          }
          className="space-y-6"
        >
          <ErpSegmentedTabList segmentCount={INVENTORY_TAB_ORDER.length} activeIndex={activeIdx}>
            <TabsTrigger
              value="overview"
              className="erp-segmented__btn focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="items"
              className="erp-segmented__btn focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              Inventory Items
            </TabsTrigger>
            <TabsTrigger
              value="categories"
              className="erp-segmented__btn focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              Product Categories
            </TabsTrigger>
            <TabsTrigger
              value="fabrics"
              className="erp-segmented__btn focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              Fabrics
            </TabsTrigger>
            <TabsTrigger
              value="sizes"
              className="erp-segmented__btn focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              Size Types
            </TabsTrigger>
          </ErpSegmentedTabList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="shadow-erp-md">
              <CardHeader>
                <CardTitle>Inventory Management System</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Advanced inventory tracking with 500+ items across fabrics, threads, buttons, zippers, and packaging materials.
                  Real-time stock monitoring with automatic reorder alerts.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-6">
            <Card className="shadow-erp-md">
              <CardHeader>
                <CardTitle>Inventory Items</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Manage individual inventory items, stock levels, and reorder points.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            <ProductCategoryManager />
          </TabsContent>

          <TabsContent value="fabrics" className="space-y-6">
            <FabricManagerNew />
          </TabsContent>

          <TabsContent value="sizes" className="space-y-6">
            <SizeTypeManager />
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
};

export default InventoryPage;