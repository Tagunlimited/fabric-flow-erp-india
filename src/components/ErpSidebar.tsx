import { useState, useEffect } from "react";
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
  AlertTriangle,
  Scissors,
  Shirt
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { getPendingOrdersCount } from '@/lib/database';

interface SidebarItem {
  title: string;
  url?: string;
  icon: any;
  badge?: string;
  badgeColor?: string;
  adminOnly?: boolean;
  children?: SidebarItem[];
}



function buildSidebarItems(currentPath: string, pendingOrdersCount: number = 0): SidebarItem[] {
  return [
    { title: "Dashboard", url: "/", icon: Home },
    {
      title: "CRM",
      icon: Users,
      children: [
        { title: "Create/View Customers", url: "/crm/customers", icon: Users },
      ]
    },
    {
      title: "Orders",
      icon: ShoppingCart,
      badge: currentPath === "/orders" ? "..." : pendingOrdersCount.toString(),
      badgeColor: "bg-manufacturing",
      children: [
        { title: "Custom Orders", url: "/orders", icon: ShoppingCart },
        { title: "Stock Orders", url: "/stock-orders", icon: Shirt }
        
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
      ]
    },
    { title: "Design & Printing", url: "/design", icon: Palette },
    {
      title: "Procurement",
      icon: ShoppingBag,
      children: [
        { title: "Bills of Materials", url: "/bom", icon: ClipboardList },
        { title: "Purchase Orders", url: "/procurement/po", icon: ShoppingBag },
        { title: "Goods Receipt Note", url: "/procurement/grn", icon: ClipboardList },
        { title: "Return to Vendor", url: "/procurement/returns", icon: Truck },
        { title: "Material Shortfall Alerts", url: "/procurement/alerts", icon: AlertTriangle }
      ]
    },
    {
      title: "Inventory",
      icon: Package,
      badge: "500",
      badgeColor: "bg-inventory",
      children: [
        { title: "Dashboard", url: "/warehouse/inventory", icon: Building },
        // { title: "Dashboard", url: "/inventory", icon: BarChart3 },
        // { title: "Material Planning", url: "/inventory/planning", icon: ClipboardList }
        
      ]
    },
    {
      title: "Production",
      icon: Factory,
      badge: "300",
      badgeColor: "bg-warning",
      children: [
        { title: "Production Dashboard", url: "/production", icon: Factory },
        { title: "Assign Orders", url: "/production/assign-orders", icon: Users },
        { title: "Cutting Manager", url: "/production/cutting-manager", icon: Scissors },
        { title: "Tailor Management", url: "/production/tailor-management", icon: Users }
      ]
    },
    { title: "Quality Check", url: "/quality", icon: CheckCircle, badge: "150", badgeColor: "bg-quality",
      children: [
        { title: "Picker", url: "/production/picker", icon: Package },
        { title: "QC", url: "/quality/checks", icon: CheckCircle },
        { title: "Dispatch", url: "/quality/dispatch", icon: Truck }
      ]
     },
    {
      title: "People",
      icon: Users,
      children: [
        { title: "Dashboard", url: "/people", icon: BarChart3 },
        { title: "Our People", url: "/people/employees", icon: Users },
        { title: "Production Team", url: "/people/production-team", icon: Scissors },
        // { title: "Employee Recognition Programme", url: "/people/recognition", icon: Award },
        // { title: "Incentive Programme", url: "/people/incentives", icon: Award },
        { title: "Departments", url: "/people/departments", icon: Building },
        { title: "Designations", url: "/people/designations", icon: Award }
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
        { title: "Customer Type Master", url: "/masters/customer-types", icon: Users },
        { title: "Supplier Master", url: "/masters/suppliers", icon: Truck }
      ]
    },
    {
      title: "User & Roles",
      icon: UserCog,
      adminOnly: true,
      children: [
       // { title: "Users", url: "/admin/users", icon: UserCog },
        { title: "Employee Access", url: "/admin/employee-access", icon: Users },
        { title: "Customer Access", url: "/admin/customer-access", icon: Users }
      ]
    },
    { title: "Configuration", url: "/configuration", icon: Settings }
  ];
}


interface SidebarItemComponentProps {
  item: SidebarItem;
  collapsed: boolean;
  level?: number;
  onMobileClick?: () => void;
}

function SidebarItemComponent({ item, collapsed, level = 0, onMobileClick }: SidebarItemComponentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const hasChildrenInit = item.children && item.children.length > 0;
  const hasActiveChildInit = hasChildrenInit && item.children?.some(child => currentPath === child.url);
  const [isOpen, setIsOpen] = useState(hasActiveChildInit);

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
    
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {isMobile ? (
          <div
            className={cn(
              "flex items-center w-full px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
              (isActive || hasActiveChild)
                ? "bg-primary-foreground/20 text-primary-foreground shadow-lg"
                : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
              level > 0 && "ml-4"
            )}
          >
            <item.icon className="flex-shrink-0 w-5 h-5 mr-3" />
            <span className="flex-1 text-left select-none">{item.title}</span>
            {item.badge && (
              <span
                className={cn(
                  "px-2 py-1 text-xs rounded-full font-medium text-primary-foreground mr-2",
                  item.badgeColor || "bg-primary-foreground/20"
                )}
              >
                {item.badge}
              </span>
            )}
            <CollapsibleTrigger asChild>
              <button
                className="p-1 rounded hover:bg-primary-foreground/10"
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={(e) => e.stopPropagation()}
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </CollapsibleTrigger>
          </div>
        ) : (
          <CollapsibleTrigger asChild>
            <div
              className={cn(
                "flex items-center w-full px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer",
                (isActive || hasActiveChild)
                  ? "bg-primary-foreground/20 text-primary-foreground shadow-lg"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                level > 0 && "ml-4"
              )}
            >
              <item.icon className="flex-shrink-0 w-5 h-5 mr-3" />
              <span className="flex-1 text-left select-none">{item.title}</span>
              {item.badge && (
                <span
                  className={cn(
                    "px-2 py-1 text-xs rounded-full font-medium text-primary-foreground mr-2",
                    item.badgeColor || "bg-primary-foreground/20"
                  )}
                >
                  {item.badge}
                </span>
              )}
              {isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </CollapsibleTrigger>
        )}
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
        data-leaf-link
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
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function ErpSidebar({ mobileOpen = false, onMobileClose, onCollapsedChange }: ErpSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { profile, user } = useAuth();
  const location = useLocation();
  const { config } = useCompanySettings();
  const [portalSettings, setPortalSettings] = useState<null | {
    can_view_orders: boolean;
    can_view_invoices: boolean;
    can_view_quotations: boolean;
  }>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  // Use sidebar_logo_url if available, else logo_url
  const companyLogo = config.sidebar_logo_url || config.logo_url || 'https://i.postimg.cc/3JbMq1Fw/6732e31fc8403c1a709ad1e0-256-1.png';
  
  // Handle pre-configured admin user
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
  const userRole = profile?.role || (isPreConfiguredAdmin ? 'admin' : null);

  // Fetch customer portal permissions when role is customer
  useEffect(() => {
    const fetchPortalSettings = async () => {
      if (!user || userRole !== 'customer') return;
      try {
        setPortalLoading(true);
        const { data: link, error: linkErr } = await (supabase as any)
          .from('customer_users')
          .select('customer_id')
          .eq('user_id', user.id as any)
          .maybeSingle();
        if (linkErr) throw linkErr;
        if (!link?.customer_id) {
          setPortalSettings({ can_view_orders: false, can_view_invoices: false, can_view_quotations: false });
          return;
        }
        const { data: settings, error: settingsErr } = await (supabase as any)
          .from('customer_portal_settings')
          .select('can_view_orders, can_view_invoices, can_view_quotations')
          .eq('customer_id', link.customer_id as any)
          .maybeSingle();
        if (settingsErr) throw settingsErr;
        setPortalSettings({
          can_view_orders: !!(settings as any)?.can_view_orders,
          can_view_invoices: !!(settings as any)?.can_view_invoices,
          can_view_quotations: !!(settings as any)?.can_view_quotations,
        });
      } catch (e) {
        setPortalSettings({ can_view_orders: false, can_view_invoices: false, can_view_quotations: false });
      } finally {
        setPortalLoading(false);
      }
    };
    fetchPortalSettings();
  }, [user?.id, userRole]);

  // Fetch pending orders count
  useEffect(() => {
    const fetchPendingOrdersCount = async () => {
      try {
        const count = await getPendingOrdersCount();
        setPendingOrdersCount(count);
      } catch (error) {
        console.error('Error fetching pending orders count:', error);
        setPendingOrdersCount(0);
      }
    };

    fetchPendingOrdersCount();
  }, []);

  // Refresh pending orders count when location changes (e.g., after creating/updating orders)
  useEffect(() => {
    const fetchPendingOrdersCount = async () => {
      try {
        const count = await getPendingOrdersCount();
        setPendingOrdersCount(count);
      } catch (error) {
        console.error('Error fetching pending orders count:', error);
        setPendingOrdersCount(0);
      }
    };

    // Only refresh if we're not on the orders page (to avoid unnecessary calls)
    if (location.pathname !== '/orders') {
      fetchPendingOrdersCount();
    }
  }, [location.pathname]);

  // Build items based on role
  const sidebarItems = buildSidebarItems(location.pathname, pendingOrdersCount);
  let filteredItems = sidebarItems.filter(item => !item.adminOnly || userRole === 'admin');

  if (userRole === 'customer' && portalSettings !== null) {
    // Only hide items/tabs; do not change labels or structure beyond filtering
    const allowedTopTitles = new Set(["Orders", "Accounts"]);
    const mapItem = (item: SidebarItem): SidebarItem | null => {
      // Hide dashboard and all non-customer sections
      if (!allowedTopTitles.has(item.title)) {
        return null;
      }
      if (!item.children || item.children.length === 0) {
        return null;
      }
      // Filter children based on portal flags
      const children = item.children.filter(child => {
        if (item.title === 'Orders') {
          // Keep orders tab only if orders permission is on
          return !!portalSettings?.can_view_orders && child.url === '/orders';
        }
        if (item.title === 'Accounts') {
          if (child.url === '/accounts/quotations') {
            return !!portalSettings?.can_view_quotations;
          }
          if (child.url === '/accounts/invoices') {
            return !!portalSettings?.can_view_invoices;
          }
          // Hide other account tabs (receipts, payments) for customers
          return false;
        }
        return false;
      });
      if (children.length === 0) return null;
      return { ...item, children };
    };

    filteredItems = filteredItems
      .map(mapItem)
      .filter((x): x is SidebarItem => x !== null);
  }

  const handleCollapsedChange = (newCollapsed: boolean) => {
    setCollapsed(newCollapsed);
    onCollapsedChange?.(newCollapsed);
  };

  // Sync initial collapsed state with parent
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, []); // Only run once on mount

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
        "fixed top-0 left-0 lg:fixed lg:left-0 lg:top-0",
        collapsed ? "w-16" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        "lg:translate-x-0",
        "ease-in-out",
        "lg:shadow-2xl",
        "lg:backdrop-blur-sm"
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
            onClick={() => handleCollapsedChange(!collapsed)}
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
        <nav className="flex-1 px-1 sm:px-2 py-2 sm:py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-primary-foreground/20 lg:overflow-y-auto"
             onClick={(e) => {
               // Prevent sidebar closing on first tap when expanding parents on mobile
               // We only close on navigation to a leaf item
               const target = e.target as HTMLElement;
               if (target.closest('[data-leaf-link]')) {
                 onMobileClose?.();
               }
             }}>
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
              <p>2024 Scissors ERP</p>
              <p className="mt-1">v1.0.0</p>
              
              <p className="mt-2">
                Powered by <br />
                <a
                  href="https://sellerskacentral.in/"
                  className="animated-sellers"
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    display: 'inline-block',
                    marginTop: '4px',
                    color: '#fff',
                    textShadow: '0 0 8px #2196f3, 0 0 16px #2196f3',
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="flex items-center gap-2">
                    {/* <img src="/Users//public/1.png" alt="Tech Panda" className="w-10 h-10" /> */}
                    Tech Panda
                  </span>
                </a>
              </p>
              <style>{`
                .animated-sellers {
                  animation: sellersPulse 1.5s infinite alternate;
                }
                @keyframes sellersPulse {
                  0% { letter-spacing: 0px; text-shadow: 0 0 8px #2196f3, 0 0 16px #2196f3; }
                  50% { letter-spacing: 2px; text-shadow: 0 0 16px #fff, 0 0 32px #2196f3; }
                  100% { letter-spacing: 0px; text-shadow: 0 0 8px #2196f3, 0 0 16px #2196f3; }
                }
              `}</style>
            </div>
          )}
        </div>
      </div>
    </>
  );
}