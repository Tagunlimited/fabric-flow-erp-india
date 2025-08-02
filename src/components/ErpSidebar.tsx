import { useState } from "react";
import { 
  Home, 
  Users, 
  ShoppingCart, 
  Package, 
  Factory, 
  CheckCircle, 
  Truck, 
  BarChart3, 
  Settings, 
  Menu,
  X,
  UserCog,
  Calculator,
  Palette,
  Building,
  ShoppingBag,
  ClipboardList,
  Award,
  ChevronDown,
  ChevronRight,
  AlertTriangle
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';

interface SidebarItem {
  title: string;
  url?: string;
  icon: any;
  badge?: string;
  badgeColor?: string;
  adminOnly?: boolean;
  children?: SidebarItem[];
}

const sidebarItems: SidebarItem[] = [
  { title: "Dashboard", url: "/", icon: Home },
  { 
    title: "CRM", 
    icon: Users, 
    children: [
      { title: "Create/View Customers", url: "/crm/customers", icon: Users },
      { title: "Customer Types", url: "/crm/customer-types", icon: Users },
      { title: "Loyalty Programme", url: "/crm/loyalty", icon: Award }
    ]
  },
  { 
    title: "Orders", 
    icon: ShoppingCart, 
    badge: "200", 
    badgeColor: "bg-manufacturing",
    children: [
      { title: "Create/View Orders", url: "/orders", icon: ShoppingCart }
    ]
  },
  { 
    title: "Accounts", 
    icon: Calculator,
    children: [
      { title: "View Quotation", url: "/accounts/quotations", icon: Calculator },
      { title: "Create/View Invoices", url: "/accounts/invoices", icon: Calculator },
      { title: "Receipts", url: "/accounts/receipts", icon: Calculator },
      { title: "Payments", url: "/accounts/payments", icon: Calculator },
      { title: "Expenses", url: "/accounts/expenses", icon: Calculator },
      { title: "Payroll", url: "/accounts/payroll", icon: Calculator },
      { title: "Settings", url: "/accounts/settings", icon: Settings }
    ]
  },
  { title: "Design & Printing", url: "/design", icon: Palette },
  { 
    title: "Inventory", 
    icon: Package, 
    badge: "500", 
    badgeColor: "bg-inventory",
    children: [
      { title: "Dashboard", url: "/inventory", icon: BarChart3 },
      { title: "Material Planning", url: "/inventory/planning", icon: ClipboardList }
    ]
  },
  { 
    title: "Procurement", 
    icon: ShoppingBag,
    children: [
      { title: "Bills of Materials", url: "/procurement/bom", icon: ClipboardList },
      { title: "Purchase Orders", url: "/procurement/po", icon: ShoppingBag },
      { title: "Goods Receipt Note", url: "/procurement/grn", icon: ClipboardList },
      { title: "Return to Vendor", url: "/procurement/returns", icon: Truck },
      { title: "Material Shortfall Alerts", url: "/procurement/alerts", icon: AlertTriangle }
    ]
  },
  { title: "Production", url: "/production", icon: Factory, badge: "300", badgeColor: "bg-warning" },
  { title: "Quality Check", url: "/quality", icon: CheckCircle, badge: "150", badgeColor: "bg-quality" },
  { 
    title: "People", 
    icon: Users,
    children: [
      { title: "Dashboard", url: "/people", icon: BarChart3 },
      { title: "Our People", url: "/people/employees", icon: Users },
      { title: "Employee Recognition Programme", url: "/people/recognition", icon: Award },
      { title: "Incentive Programme", url: "/people/incentives", icon: Award },
      { title: "Departments", url: "/people/departments", icon: Building }
    ]
  },
  { 
    title: "Masters", 
    icon: Package,
    children: [
      { title: "Masters Dashboard", url: "/masters", icon: Package },
      { title: "Product Master", url: "/masters/products", icon: Package },
      { title: "Item Master", url: "/masters/items", icon: Package },
      { title: "Product Categories", url: "/inventory/product-categories", icon: Package },
      { title: "Fabric Master", url: "/inventory/fabrics", icon: Palette },
      { title: "Size Master", url: "/inventory/size-types", icon: ClipboardList },
      { title: "Warehouse Master", url: "/masters/warehouses", icon: Building },
      { title: "Customer Type Master", url: "/masters/customer-types", icon: Users }
    ]
  },
  { 
    title: "User & Roles", 
    icon: UserCog, 
    adminOnly: true,
    children: [
      { title: "Users", url: "/admin/users", icon: UserCog },
      { title: "Customer Access", url: "/admin/customer-access", icon: Users }
    ]
  },
  { title: "Configuration", url: "/configuration", icon: Settings }
];

interface SidebarItemComponentProps {
  item: SidebarItem;
  collapsed: boolean;
  level?: number;
  onMobileClick?: () => void;
}

function SidebarItemComponent({ item, collapsed, level = 0, onMobileClick }: SidebarItemComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname;

  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.url ? currentPath === item.url : false;
  const hasActiveChild = hasChildren && item.children?.some(child => currentPath === child.url);

  if (hasChildren) {
    if (collapsed) {
      // When collapsed, show parent item as a simple link to first child
      const firstChild = item.children?.[0];
      if (firstChild?.url) {
        return (
          <NavLink
            to={firstChild.url}
            className={({ isActive }) =>
              cn(
                "flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-primary-foreground/20 text-primary-foreground shadow-lg" 
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              )
            }
            onClick={onMobileClick}
          >
            <item.icon className="w-5 h-5" />
          </NavLink>
        );
      }
    }
    
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex items-center w-full px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
              (isActive || hasActiveChild)
                ? "bg-primary-foreground/20 text-primary-foreground shadow-lg" 
                : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
              level > 0 && "ml-4"
            )}
            onClick={onMobileClick}
          >
            <item.icon className="flex-shrink-0 w-5 h-5 mr-3" />
            <span className="flex-1 text-left">{item.title}</span>
            {item.badge && (
              <span className={cn(
                "px-2 py-1 text-xs rounded-full font-medium text-primary-foreground mr-2",
                item.badgeColor || "bg-primary-foreground/20"
              )}>
                {item.badge}
              </span>
            )}
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 mt-1">
          {item.children?.map((child, index) => (
            <SidebarItemComponent 
              key={index} 
              item={child} 
              collapsed={collapsed} 
              level={level + 1} 
              onMobileClick={onMobileClick}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (item.url) {
    return (
      <NavLink
        to={item.url}
        className={({ isActive }) =>
          cn(
            "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
            collapsed ? "justify-center" : "",
            isActive 
              ? "bg-primary-foreground/20 text-primary-foreground shadow-lg" 
              : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
            level > 0 && "ml-4"
          )
        }
        onClick={onMobileClick}
      >
        <item.icon className={cn("flex-shrink-0 w-5 h-5", !collapsed && "mr-3")} />
        {!collapsed && (
          <span className="flex-1">{item.title}</span>
        )}
        {!collapsed && item.badge && (
          <span className={cn(
            "px-2 py-1 text-xs rounded-full font-medium text-primary-foreground",
            item.badgeColor || "bg-primary-foreground/20"
          )}>
            {item.badge}
          </span>
        )}
      </NavLink>
    );
  }

  return null;
}

interface ErpSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ErpSidebar({ mobileOpen = false, onMobileClose }: ErpSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, user } = useAuth();
  const { config } = useCompanySettings();
  // Use sidebar_logo_url if available, else logo_url
  const companyLogo = config.sidebar_logo_url || config.logo_url || 'https://i.postimg.cc/3JbMq1Fw/6732e31fc8403c1a709ad1e0-256-1.png';
  
  // Handle pre-configured admin user
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
  const userRole = profile?.role || (isPreConfiguredAdmin ? 'admin' : null);

  const filteredItems = sidebarItems.filter(item => 
    !item.adminOnly || userRole === 'admin'
  );

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "h-screen bg-primary border-r border-border/40 transition-all duration-300 flex flex-col shadow-lg z-50",
        "fixed top-0 left-0 lg:relative lg:flex-shrink-0",
        collapsed ? "w-16" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        "lg:translate-x-0",
        "ease-in-out"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-primary-foreground/20">
          {!collapsed && (
            <div className="flex items-center space-x-2">
              <img 
                src={companyLogo} 
                alt="Company Logo" 
                className="h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://i.postimg.cc/3JbMq1Fw/6732e31fc8403c1a709ad1e0-256-1.png';
                }}
              />
              <div>
                <h2 className="text-primary-foreground font-bold text-base sm:text-lg">Scissors</h2>
                <p className="text-primary-foreground/70 text-xs">ERP System</p>
              </div>
            </div>
          )}
          {collapsed && (
            <img 
              src={companyLogo} 
              alt="Logo" 
              className="h-8 object-contain mx-auto"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://i.postimg.cc/3JbMq1Fw/6732e31fc8403c1a709ad1e0-256-1.png';
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground hidden lg:flex"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMobileClose}
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        {/* Navigation */}
        <nav className="flex-1 px-1 sm:px-2 py-2 sm:py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-primary-foreground/20">
          {filteredItems.map((item, index) => (
            <SidebarItemComponent 
              key={index} 
              item={item} 
              collapsed={collapsed}
              onMobileClick={onMobileClose}
            />
          ))}
        </nav>
        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-primary-foreground/20">
          {!collapsed && (
            <div className="text-center text-primary-foreground/70 text-xs">
              <p> 2024 Scissors ERP</p>
              <p className="mt-1">v1.0.0</p>
              {(profile || isPreConfiguredAdmin) && (
                <p className="mt-2 text-primary-foreground/90 font-medium capitalize">
                  {profile?.full_name || (isPreConfiguredAdmin ? 'System Admin' : '')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}