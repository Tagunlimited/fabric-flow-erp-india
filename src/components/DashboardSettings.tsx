import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, LayoutGrid, Table, BarChart3, PieChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardSettingsProps {
  settings: DashboardSettings;
  onSettingsChange: (settings: DashboardSettings) => void;
}

export interface DashboardSettings {
  viewMode: 'cards' | 'table' | 'charts';
  visibleWidgets: {
    keyMetrics: boolean;
    quickStats: boolean;
    moduleCards: boolean;
    recentOrders: boolean;
    productionStatus: boolean;
    recentActivity: boolean;
    systemOverview: boolean;
  };
  chartTypes: {
    metrics: 'bar' | 'line' | 'pie';
    stats: 'bar' | 'doughnut' | 'area';
  };
  refreshInterval: number; // in seconds
  compactMode: boolean;
}

export function DashboardSettings({ settings, onSettingsChange }: DashboardSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<DashboardSettings>(settings);

  const handleSave = () => {
    onSettingsChange(localSettings);
    setIsOpen(false);
  };

  const handleWidgetToggle = (widget: keyof typeof localSettings.visibleWidgets) => {
    setLocalSettings(prev => ({
      ...prev,
      visibleWidgets: {
        ...prev.visibleWidgets,
        [widget]: !prev.visibleWidgets[widget]
      }
    }));
  };

  const handleViewModeChange = (mode: 'cards' | 'table' | 'charts') => {
    setLocalSettings(prev => ({
      ...prev,
      viewMode: mode
    }));
  };

  const handleChartTypeChange = (category: 'metrics' | 'stats', type: string) => {
    setLocalSettings(prev => ({
      ...prev,
      chartTypes: {
        ...prev.chartTypes,
        [category]: type
      }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-gradient-primary">
          <Settings className="w-4 h-4 mr-2" />
          Dashboard Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <Settings className="w-6 h-6 mr-2" />
            Dashboard Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="layout" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="widgets">Widgets</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="layout" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>View Mode</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${localSettings.viewMode === 'cards' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'}`}
                    onClick={() => handleViewModeChange('cards')}
                  >
                    <LayoutGrid className="w-8 h-8 mb-2 mx-auto" />
                    <h3 className="font-semibold text-center">Cards View</h3>
                    <p className="text-sm text-muted-foreground text-center mt-1">
                      Visual cards with metrics and quick stats
                    </p>
                  </div>
                  
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${localSettings.viewMode === 'table' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'}`}
                    onClick={() => handleViewModeChange('table')}
                  >
                    <Table className="w-8 h-8 mb-2 mx-auto" />
                    <h3 className="font-semibold text-center">Table View</h3>
                    <p className="text-sm text-muted-foreground text-center mt-1">
                      Tabular format with detailed data
                    </p>
                  </div>
                  
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${localSettings.viewMode === 'charts' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'}`}
                    onClick={() => handleViewModeChange('charts')}
                  >
                    <BarChart3 className="w-8 h-8 mb-2 mx-auto" />
                    <h3 className="font-semibold text-center">Charts View</h3>
                    <p className="text-sm text-muted-foreground text-center mt-1">
                      Visual charts and graphs
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="widgets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Visible Widgets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(localSettings.visibleWidgets).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label htmlFor={key} className="font-medium capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {getWidgetDescription(key)}
                        </p>
                      </div>
                      <Switch
                        id={key}
                        checked={value}
                        onCheckedChange={() => handleWidgetToggle(key as keyof typeof localSettings.visibleWidgets)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Metrics Charts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['bar', 'line', 'pie'].map((type) => (
                      <div 
                        key={type}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${localSettings.chartTypes.metrics === type ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'}`}
                        onClick={() => handleChartTypeChange('metrics', type)}
                      >
                        <div className="flex items-center">
                          {type === 'bar' && <BarChart3 className="w-5 h-5 mr-2" />}
                          {type === 'line' && <BarChart3 className="w-5 h-5 mr-2" />}
                          {type === 'pie' && <PieChart className="w-5 h-5 mr-2" />}
                          <span className="capitalize font-medium">{type} Chart</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Stats Charts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['bar', 'doughnut', 'area'].map((type) => (
                      <div 
                        key={type}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${localSettings.chartTypes.stats === type ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'}`}
                        onClick={() => handleChartTypeChange('stats', type)}
                      >
                        <div className="flex items-center">
                          {type === 'bar' && <BarChart3 className="w-5 h-5 mr-2" />}
                          {type === 'doughnut' && <PieChart className="w-5 h-5 mr-2" />}
                          {type === 'area' && <BarChart3 className="w-5 h-5 mr-2" />}
                          <span className="capitalize font-medium">{type} Chart</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="compact-mode">Compact Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Reduce spacing and use smaller components
                      </p>
                    </div>
                    <Switch
                      id="compact-mode"
                      checked={localSettings.compactMode}
                      onCheckedChange={(checked) => 
                        setLocalSettings(prev => ({ ...prev, compactMode: checked }))
                      }
                    />
                  </div>
                  
                  <div>
                    <Label>Refresh Interval</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      How often to refresh dashboard data
                    </p>
                    <div className="flex gap-2">
                      {[30, 60, 120, 300].map((interval) => (
                        <Badge
                          key={interval}
                          variant={localSettings.refreshInterval === interval ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => 
                            setLocalSettings(prev => ({ ...prev, refreshInterval: interval }))
                          }
                        >
                          {interval < 60 ? `${interval}s` : `${interval / 60}m`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-gradient-primary">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getWidgetDescription(key: string): string {
  const descriptions: Record<string, string> = {
    keyMetrics: "Revenue, orders, efficiency metrics",
    quickStats: "Quick access statistics",
    moduleCards: "ERP module navigation cards",
    recentOrders: "Latest order activity",
    productionStatus: "Current production status",
    recentActivity: "Recent system activity",
    systemOverview: "System health overview"
  };
  return descriptions[key] || "Dashboard widget";
}