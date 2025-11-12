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
  Shirt,
  FileText,
  Image,
  Warehouse,
  UserPlus,
  Contact,
  DollarSign,
  Receipt,
  CreditCard,
  Quote,
  PackageCheck,
  Boxes,
  PackageSearch,
  PackageX,
  LayoutDashboard,
  UserCheck,
  UsersRound,
  CheckSquare,
  ClipboardCheck,
  Hand,
  Box,
  FileEdit,
  Wallet,
  List
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { getPendingOrdersCount } from '@/lib/database';
import { useSidebarPermissions, SidebarItem as DynamicSidebarItem } from '@/hooks/useSidebarPermissions';

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
      icon: Contact,
      children: [
        { title: "Create/View Customers", url: "/crm/customers", icon: UserPlus },
      ]
    },
    {
      title: "Orders",
      icon: ShoppingCart,
      url: "/orders",
      badge: currentPath === "/orders" ? "..." : pendingOrdersCount.toString(),
      badgeColor: "bg-manufacturing",
      children: [
        { title: "Custom Orders", url: "/orders", icon: FileEdit }
        // { title: "Readymade Orders", url: "/orders/readymade", icon: Shirt }
        // { title: "Stock Orders", url: "/stock-orders", icon: Shirt }
        
      ]
    },
    {
      title: "Accounts",
      icon: DollarSign,
      children: [
        { title: "View Quotation", url: "/accounts/quotations", icon: Quote },
        { title: "Create/View Invoices", url: "/accounts/invoices", icon: FileText },
        { title: "Receipts", url: "/accounts/receipts", icon: Receipt },
        { title: "Payments", url: "/accounts/payments", icon: CreditCard },
      ]
    },
    { title: "Design & Printing", url: "/design", icon: Palette },
    {
      title: "Procurement",
      icon: ShoppingBag,
      children: [
        { title: "Bills of Materials", url: "/bom", icon: List },
        { title: "Purchase Orders", url: "/procurement/po", icon: ShoppingCart },
        { title: "Goods Receipt Note", url: "/procurement/grn", icon: PackageCheck }
        // { title: "Return to Vendor", url: "/procurement/returns", icon: Truck },
        // { title: "Material Shortfall Alerts", url: "/procurement/alerts", icon: AlertTriangle }
      ]
    },
    {
      title: "Inventory",
      icon: Package,
      children: [
        { title: "Raw Material", url: "/warehouse/inventory", icon: Boxes },
        { title: "Product Inventory", url: "/inventory/products", icon: PackageSearch },
        { title: "Inventory Adjustment", url: "/inventory/adjustment", icon: PackageX },
      ]
    },
    {
      title: "Production",
      icon: Factory,
      children: [
        { title: "Production Dashboard", url: "/production", icon: LayoutDashboard },
        { title: "Assign Orders", url: "/production/assign-orders", icon: UserCheck },
        { title: "Cutting Manager", url: "/production/cutting-manager", icon: Scissors },
        { title: "Tailor Management", url: "/production/tailor-management", icon: UsersRound }
      ]
    },
    { title: "Quality Check", url: "/quality", icon: CheckCircle,
      children: [
        { title: "Picker", url: "/production/picker", icon: Hand },
        { title: "QC", url: "/quality/checks", icon: CheckSquare },
        { title: "Dispatch", url: "/quality/dispatch", icon: Truck }
      ]
     },
    {
      title: "People",
      icon: Users,
      children: [
        { title: "Dashboard", url: "/people", icon: LayoutDashboard },
        { title: "Our People", url: "/people/employees", icon: UsersRound },
        // { title: "Production Team", url: "/people/production-team", icon: Scissors },
        // { title: "Employee Recognition Programme", url: "/people/recognition", icon: Award },
        // { title: "Incentive Programme", url: "/people/incentives", icon: Award },
        { title: "Departments", url: "/people/departments", icon: Building },
        { title: "Designations", url: "/people/designations", icon: Award }
      ]
    },
    {
      title: "Masters",
      icon: Package,
      url: "/masters"
    },
    {
      title: "User & Roles",
      icon: UserCog,
      adminOnly: true,
      children: [
       // { title: "Users", url: "/admin/users", icon: UserCog },
        { title: "Employee Access", url: "/admin/employee-access", icon: UserCheck },
        { title: "Customer Access", url: "/admin/customer-access", icon: UsersRound }
      ]
    },
    { title: "Reports", url: "/reports", icon: FileText },
    { title: "Configuration", url: "/configuration", icon: Settings }
  ];
}


interface SidebarItemComponentProps {
  item: SidebarItem;
  collapsed: boolean;
  level?: number;
  onMobileClick?: () => void;
  openMenuTitle?: string | null;
  onMenuToggle?: (title: string | null) => void;
}

function SidebarItemComponent({ item, collapsed, level = 0, onMobileClick, openMenuTitle, onMenuToggle }: SidebarItemComponentProps) {
  const location = useLocation();
  const currentPath = location.pathname;
  const hasChildrenInit = item.children && item.children.length > 0;
  const hasActiveChildInit = hasChildrenInit && item.children?.some(child => currentPath === child.url);
  
  // For top-level menus (level 0), use controlled state from parent for accordion behavior
  // For nested menus (level > 0), use local state
  const isTopLevelMenu = level === 0 && hasChildrenInit;
  const [localIsOpen, setLocalIsOpen] = useState(hasActiveChildInit);
  
  const isOpen = isTopLevelMenu 
    ? (openMenuTitle === item.title)
    : localIsOpen;
  
  const handleToggle = (open: boolean) => {
    if (isTopLevelMenu && onMenuToggle) {
      // If opening, set this menu as open (closes others)
      // If closing, set to null
      onMenuToggle(open ? item.title : null);
    } else {
      // For nested menus, use local state
      setLocalIsOpen(open);
    }
  };
  
  // Update local state when route changes for nested menus
  useEffect(() => {
    if (!isTopLevelMenu && hasChildrenInit) {
      setLocalIsOpen(hasActiveChildInit);
    }
  }, [currentPath, isTopLevelMenu, hasChildrenInit, hasActiveChildInit]);

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
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
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
              openMenuTitle={openMenuTitle}
              onMenuToggle={onMenuToggle}
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
  const { items: dynamicSidebarItems, loading: permissionsLoading, permissionsSetup } = useSidebarPermissions();
  
  // State to track which top-level menu is open (accordion behavior)
  const [openMenuTitle, setOpenMenuTitle] = useState<string | null>(null);
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

  // Icon mapping for dynamic icons
  const iconMap: { [key: string]: any } = {
    Home, Users, ShoppingCart, Package, Factory, CheckCircle, Truck, BarChart3, 
    Settings, UserCog, Calculator, Palette, Building, ShoppingBag, ClipboardList, 
    Award, AlertTriangle, Scissors, Shirt, Contact, UserPlus, DollarSign, Receipt,
    CreditCard, Quote, FileText, PackageCheck, Boxes, PackageSearch, PackageX,
    LayoutDashboard, UserCheck, UsersRound, CheckSquare, ClipboardCheck, Hand,
    Box, FileEdit, Wallet, List
  };

  // Convert dynamic sidebar items to the old format
  const convertDynamicSidebarItems = (items: DynamicSidebarItem[]): SidebarItem[] => {
    return items.map(item => ({
      title: item.title,
      url: item.url,
      icon: iconMap[item.icon] || Home,
      adminOnly: false, // This will be handled by permissions
      children: item.children ? convertDynamicSidebarItems(item.children) : undefined
    }));
  };

  // Build items based on role and permissions
  const staticSidebarItems = buildSidebarItems(location.pathname, pendingOrdersCount);
  const dynamicItems = convertDynamicSidebarItems(dynamicSidebarItems);
  
  // Use dynamic items if permissions are loaded and properly set up
  // For admin users, use static sidebar if permissions system is not set up
  // For non-admin users, always use dynamic permissions (even if empty)
  const shouldUseDynamicItems = !permissionsLoading && permissionsSetup && (userRole !== 'admin' || dynamicSidebarItems.length > 0);
  
  // For non-admin users, show loading state instead of static sidebar during loading
  // For admin users, always show static sidebar if dynamic items are not available
  const sidebarItems = shouldUseDynamicItems ? dynamicItems : 
    (userRole !== 'admin' && permissionsLoading ? [] : staticSidebarItems);
  
  // Debug logging for sidebar decision (only log when there are issues)
  // Debug logging removed for performance
  
  // Debug logging removed for performance
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

  // Initialize and update open menu based on current route
  useEffect(() => {
    const findMenuWithActiveChild = (items: SidebarItem[]): string | null => {
      for (const item of items) {
        if (item.children && item.children.length > 0) {
          const hasActiveChild = item.children.some(child => 
            child.url && location.pathname === child.url
          );
          if (hasActiveChild) {
            return item.title;
          }
        }
      }
      return null;
    };

    const menuWithActiveChild = findMenuWithActiveChild(filteredItems);
    
    if (menuWithActiveChild !== openMenuTitle) {
      setOpenMenuTitle(menuWithActiveChild);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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
                style={{
                  height: config.logo_sizes?.sidebar_logo_height || '32px',
                  width: config.logo_sizes?.sidebar_logo_width || 'auto'
                }}
                className="object-contain"
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
              style={{
                height: config.logo_sizes?.sidebar_logo_height || '32px',
                width: config.logo_sizes?.sidebar_logo_width || 'auto'
              }}
              className="object-contain mx-auto"
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
          {userRole !== 'admin' && permissionsLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm text-muted-foreground">Loading permissions...</span>
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <SidebarItemComponent 
                key={index} 
                item={item} 
                collapsed={collapsed}
                onMobileClick={onMobileClose}
                openMenuTitle={openMenuTitle}
                onMenuToggle={setOpenMenuTitle}
              />
            ))
          )}
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
                  href="https://blackmattertech.com/"
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
                    {/* <img src="/Users//public/1.png" alt="BlackMatter Technologies" className="w-10 h-10" /> */}
                    BlackMatter <br></br> Technologies
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