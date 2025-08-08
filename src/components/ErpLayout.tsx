import { ErpSidebar } from "@/components/ErpSidebar";
import { Button } from "@/components/ui/button";
import { Search, User, LogOut, Sun, Moon, Bell, Settings, Menu } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { FloatingNotification } from "@/components/notifications/FloatingNotification";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalSearchBar } from "@/components/UniversalSearchBar";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';

interface ErpLayoutProps {
  children: React.ReactNode;
}

export function ErpLayout({ children }: ErpLayoutProps) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [floatingNotification, setFloatingNotification] = useState<any>(null);
  const [availableRoles] = useState(['admin', 'sales', 'production', 'quality', 'dispatch', 'manager']);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { config } = useCompanySettings();
  const headerLogo = config.header_logo_url || config.logo_url || 'https://i.postimg.cc/D0hJxKtP/tag-black.png';
  
  // Handle pre-configured admin user display
  const displayName = profile?.full_name || 
    (user?.email === 'ecom@tagunlimitedclothing.com' ? 'System Administrator' : user?.email);
  const displayRole = profile?.role || 
    (user?.email === 'ecom@tagunlimitedclothing.com' ? 'admin' : 'user');

  // Handle floating header
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down and past 100px
        setIsHeaderVisible(false);
      } else {
        // Scrolling up
        setIsHeaderVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleAvatarUpload = async (url: string) => {
    if (!user) return;
    try {
      await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          avatar_url: url
        } as any);
      
      await refreshProfile();
      toast.success('Avatar uploaded successfully');
    } catch (error: any) {
      toast.error('Failed to upload avatar');
    }
  };

  const handleAvatarDelete = async () => {
    if (!user) return;
    try {
      await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          avatar_url: null
        } as any);
      
      await refreshProfile();
      toast.success('Avatar deleted successfully');
    } catch (error: any) {
      toast.error('Failed to delete avatar');
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!user || !profile) return;
    toast.success(`Role updated to ${newRole}`);
  };

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Sidebar overlays content on mobile, is static on desktop */}
      <ErpSidebar 
        mobileOpen={mobileMenuOpen}
        onMobileClose={handleMobileMenuClose}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Floating Header - Only spans the main content area */}
        <header className={`sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b transition-transform duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}>
          <div className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-4 w-full">
            {/* Left: Logo and App Name */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMobileMenuToggle}
                className="lg:hidden mr-1"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <img 
                src={headerLogo} 
                alt="AG Scissors ERP Logo" 
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <h1 className="text-base sm:text-xl font-bold text-primary truncate max-w-[100px] sm:max-w-none">Scissors ERP</h1>
            </div>
            {/* Center: Search Bar */}
            <div className="flex-1 flex justify-center">
              <div className="w-full max-w-xl">
                <UniversalSearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search orders, customers, products, employees..."
                  className="h-12 text-lg"
                />
              </div>
            </div>
            {/* Right: Avatar + User Info, then icons */}
            <div className="flex items-center space-x-2 min-w-0">
              {/* Avatar and User Info */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  {user && (
                    <AvatarUploader
                      currentUrl={(profile as any)?.avatar_url || ""}
                      onUpload={handleAvatarUpload}
                      onDelete={handleAvatarDelete}
                      userId={user.id}
                      userName={displayName}
                      size="sm"
                    />
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <div className="font-medium text-sm text-foreground">{displayName}</div>
                  {profile?.department && (
                    <div className="text-xs text-muted-foreground">{profile.department}</div>
                  )}
                  <div className="text-xs text-muted-foreground capitalize">{displayRole}</div>
                </div>
              </div>
              {/* Notification, Theme, Settings, Logout */}
              <NotificationCenter />
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="text-foreground hover:bg-muted hover:text-foreground"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-1">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{displayName}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className="text-xs text-muted-foreground">Role:</span>
                        <Select value={displayRole} onValueChange={handleRoleChange}>
                          <SelectTrigger className="h-6 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role} value={role} className="text-xs">
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>
        {/* Main Content with proper spacing */}
        <main className="flex-1 px-2 sm:px-6 py-4 sm:py-6 w-full overflow-x-auto">
          {children}
        </main>
      </div>
      <FloatingNotification
        notification={floatingNotification}
        onDismiss={() => setFloatingNotification(null)}
      />
    </div>
  );
}