import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { UserManagement } from "@/components/admin/UserManagement";
import Index from "./pages/Index";
import CustomersPage from "./pages/crm/CustomersPage";
import CustomerDetailPage from "./pages/crm/CustomerDetailPage";
import ProductCategoriesPage from "./pages/inventory/ProductCategoriesPage";
import SizeTypesPage from "./pages/inventory/SizeTypesPage";
import FabricsPage from "./pages/inventory/FabricsPage";
import MastersPage from "./pages/masters/MastersPage";
import ProductMasterPage from "./pages/masters/ProductMasterPage";
import ItemMasterPage from "./pages/masters/ItemMasterPage";
import WarehouseMasterPage from "./pages/masters/WarehouseMasterPage";
import CustomerTypeMasterPage from "./pages/masters/CustomerTypeMasterPage";
import NotFound from "./pages/NotFound";
import CrmPage from "./pages/CrmPage";
import OrdersPage from "./pages/OrdersPage";
import InventoryPage from "./pages/InventoryPage";
import ProductionPage from "./pages/ProductionPage";
import QualityPage from "./pages/QualityPage";
import DispatchPage from "./pages/DispatchPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import CompanyConfigPage from "./pages/admin/CompanyConfigPage";
import PeoplePage from "./pages/PeoplePage";
import EmployeesPage from "./pages/people/EmployeesPage";
import EmployeeDetailPage from "./pages/people/EmployeeDetailPage";
import DepartmentsPage from "./pages/people/DepartmentsPage";
import OrderDetailPage from "./pages/orders/OrderDetailPage";
import { CustomerDashboard } from "./pages/customer/CustomerDashboard";
import { CustomerAccessManagement } from "./pages/admin/CustomerAccessManagement";
import ProfileSettingsPage from "./pages/profile/ProfileSettingsPage";
import QuotationsPage from './pages/accounts/QuotationsPage';
import QuotationDetailPage from './pages/accounts/QuotationDetailPage';
import { CompanySettingsProvider } from "@/hooks/CompanySettingsContext";
import { useCompanySettings } from "@/hooks/CompanySettingsContext";
import { useEffect } from "react";

function useDynamicFavicon() {
  const { config } = useCompanySettings();
  useEffect(() => {
    if (config?.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = config.favicon_url;
    }
  }, [config?.favicon_url]);
}

function FaviconUpdater() {
  useDynamicFavicon();
  return null;
}

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <AuthProvider>
          <TooltipProvider>
          <Toaster />
          <Sonner />
          <CompanySettingsProvider>
            <FaviconUpdater />
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginForm />} />
                <Route path="/signup" element={<SignupForm />} />
                
                {/* Protected Routes */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                <Route path="/crm" element={
                  <ProtectedRoute>
                    <CrmPage />
                  </ProtectedRoute>
                } />
                <Route path="/crm/customers" element={
                  <ProtectedRoute>
                    <CustomersPage />
                  </ProtectedRoute>
                } />
                <Route path="/crm/customers/:id" element={
                  <ProtectedRoute>
                    <CustomerDetailPage />
                  </ProtectedRoute>
                } />
                <Route path="/orders" element={
                  <ProtectedRoute>
                    <OrdersPage />
                  </ProtectedRoute>
                } />
                <Route path="/orders/:id" element={
                  <ProtectedRoute>
                    <OrderDetailPage />
                  </ProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                } />
                <Route path="/inventory/product-categories" element={
                  <ProtectedRoute>
                    <ProductCategoriesPage />
                  </ProtectedRoute>
                } />
                <Route path="/inventory/fabrics" element={
                  <ProtectedRoute>
                    <FabricsPage />
                  </ProtectedRoute>
                } />
                <Route path="/inventory/size-types" element={
                  <ProtectedRoute>
                    <SizeTypesPage />
                  </ProtectedRoute>
                } />
                
                {/* Masters Routes */}
                <Route path="/masters" element={
                  <ProtectedRoute>
                    <MastersPage />
                  </ProtectedRoute>
                } />
                <Route path="/masters/products" element={
                  <ProtectedRoute>
                    <ProductMasterPage />
                  </ProtectedRoute>
                } />
                <Route path="/masters/items" element={
                  <ProtectedRoute>
                    <ItemMasterPage />
                  </ProtectedRoute>
                } />
                <Route path="/masters/warehouses" element={
                  <ProtectedRoute>
                    <WarehouseMasterPage />
                  </ProtectedRoute>
                } />
                <Route path="/masters/customer-types" element={
                  <ProtectedRoute>
                    <CustomerTypeMasterPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/production" element={
                  <ProtectedRoute>
                    <ProductionPage />
                  </ProtectedRoute>
                } />
                <Route path="/quality" element={
                  <ProtectedRoute>
                    <QualityPage />
                  </ProtectedRoute>
                } />
                <Route path="/dispatch" element={
                  <ProtectedRoute>
                    <DispatchPage />
                  </ProtectedRoute>
                } />
                <Route path="/analytics" element={
                  <ProtectedRoute>
                    <AnalyticsPage />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                } />
                <Route path="/configuration" element={
                  <ProtectedRoute requiredRole={['admin']}>
                    <CompanyConfigPage />
                  </ProtectedRoute>
                } />
                
                {/* People Routes */}
                <Route path="/people" element={
                  <ProtectedRoute>
                    <PeoplePage />
                  </ProtectedRoute>
                } />
                <Route path="/people/employees" element={
                  <ProtectedRoute>
                    <EmployeesPage />
                  </ProtectedRoute>
                } />
                <Route path="/people/employees/:id" element={
                  <ProtectedRoute>
                    <EmployeeDetailPage />
                  </ProtectedRoute>
                } />
                <Route path="/people/departments" element={
                  <ProtectedRoute>
                    <DepartmentsPage />
                  </ProtectedRoute>
                } />
                
                {/* Customer Routes */}
                <Route path="/customer" element={
                  <ProtectedRoute>
                    <CustomerDashboard />
                  </ProtectedRoute>
                } />
                
                {/* Profile Routes */}
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                } />
                
                {/* Accounts Routes */}
                <Route path="/accounts/quotations" element={
                  <ProtectedRoute>
                    <QuotationsPage />
                  </ProtectedRoute>
                } />
                <Route path="/accounts/quotations/:id" element={
                  <ProtectedRoute>
                    <QuotationDetailPage />
                  </ProtectedRoute>
                } />
                
                {/* Admin Only Routes */}
                <Route path="/admin/users" element={
                  <ProtectedRoute requiredRole={['admin']}>
                    <UserManagement />
                  </ProtectedRoute>
                } />
                <Route path="/admin/customer-access" element={
                  <ProtectedRoute requiredRole={['admin']}>
                    <CustomerAccessManagement />
                  </ProtectedRoute>
                } />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CompanySettingsProvider>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
