import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FormPersistenceProvider } from "@/contexts/FormPersistenceContext";
import { AppCacheProvider } from "@/contexts/AppCacheContext";
import { GlobalFormPersistenceProvider } from "@/components/GlobalFormPersistenceProvider";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { UserManagement } from "@/components/admin/UserManagement";
import Index from "./pages/Index";
import CustomersPage from "./pages/crm/CustomersPage";
import CustomerDetailPage from "./pages/crm/CustomerDetailPage";
import ProductCategoriesPage from "./pages/inventory/ProductCategoriesPage";
import SizeTypesPage from "./pages/inventory/SizeTypesPage";
// import FabricsPage from "./pages/inventory/FabricsPage"; // Removed - using new FabricManagerNew
import { FabricManagerNew } from "./components/inventory/FabricManagerNew";
import MastersPage from "./pages/masters/MastersPage";
import ProductMasterPage from "./pages/masters/ProductMasterPage";
import ItemMasterPage from "./pages/masters/ItemMasterPage";
import WarehouseMasterPage from "./pages/masters/WarehouseMasterPage";
import WarehouseInventoryPage from "./pages/warehouse/WarehouseInventoryPage";
import CustomerTypeMasterPage from "./pages/masters/CustomerTypeMasterPage";
import SupplierMasterPage from "./pages/masters/SupplierMasterPage";
import BrandingTypePage from "./pages/masters/BrandingTypePage";
import ProductPartsManager from "./pages/masters/ProductPartsManager";
import NotFound from "./pages/NotFound";
import CrmPage from "./pages/CrmPage";
import OrdersPage from "./pages/OrdersPage";
import InventoryPage from "./pages/InventoryPage";
import ProductionPage from "./pages/ProductionPage";
import AssignOrdersPage from "./pages/production/AssignOrdersPage";
import CuttingManagerPage from "./pages/production/CuttingManagerPage";
import TailorManagementPage from "./pages/production/TailorManagementPage";
import PickerPage from "./pages/production/PickerPage";
import QualityPage from "./pages/QualityPage";
import QCPage from "./pages/quality/QCPage";
import DispatchQCPage from "./pages/quality/DispatchQCPage";
import DispatchPage from "./pages/DispatchPage";
import DispatchChallanPrint from "./pages/DispatchChallanPrint";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import DesignPage from "./pages/DesignPage";
import ProcurementPage from "./pages/ProcurementPage";
import PurchaseOrderListPage from "./pages/procurement/PurchaseOrderListPage";
import PurchaseOrderFormPage from "./pages/procurement/PurchaseOrderFormPage";
import BomListPage from "./pages/procurement/BomListPage";
import { BomForm } from "./components/purchase-orders/BomForm";
import { BomCreator } from "./components/purchase-orders/BomCreator";
import { GRNList } from "./components/goods-receipt-notes/GRNList";
import { GRNForm } from "./components/goods-receipt-notes/GRNForm";
import CompanyConfigPage from "./pages/admin/CompanyConfigPage";
import ReportsPage from "./pages/reports/ReportsPage";
import PeoplePage from "./pages/PeoplePage";
import EmployeesPage from "./pages/people/EmployeesPage";
import EmployeeDetailPage from "./pages/people/EmployeeDetailPage";
import DepartmentsPage from "./pages/people/DepartmentsPage";
import DepartmentDetailPage from "./pages/people/DepartmentDetailPage";
import DesignationsPage from "./pages/people/DesignationsPage";
import ProductionTeamPage from "./pages/people/ProductionTeamPage";
import ProductionTeamDetailPage from "./pages/people/ProductionTeamDetailPage";
import OrderDetailPage from "./pages/orders/OrderDetailPage";
import OrderBatchAssignmentPage from "./pages/orders/OrderBatchAssignmentPage";
import StockOrdersPage from "./pages/orders/StockOrdersPage";
import { CustomerDashboard } from "./pages/customer/CustomerDashboard";
import { CustomerAccessManagement } from "./pages/admin/CustomerAccessManagement";
import ProfileSettingsPage from "./pages/profile/ProfileSettingsPage";
import QuotationsPage from './pages/accounts/QuotationsPage';
import QuotationDetailPage from './pages/accounts/QuotationDetailPage';
import ReceiptPage from './pages/accounts/ReceiptPage';
import InvoicePage from './pages/accounts/InvoicePage';
import InvoiceDetailPage from './pages/accounts/InvoiceDetailPage';
import { CompanySettingsProvider } from "@/hooks/CompanySettingsContext";
import EmployeeAccessManagementPage from "./pages/admin/EmployeeAccessManagement";
import { useCompanySettings } from "@/hooks/CompanySettingsContext";
import { useEffect } from "react";
import { ErpLayout } from "@/components/ErpLayout";

function useDynamicFavicon() {
  const { config, loading } = useCompanySettings();
  useEffect(() => {
    // Only set favicon if company settings are loaded and not loading
    if (!loading && config?.favicon_url) {
      const faviconUrl = config.favicon_url;
      
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    }
  }, [config?.favicon_url, loading]);
}

function FaviconUpdater() {
  useDynamicFavicon();
  return null;
}

// Wrapper component for protected routes that need company settings
function ProtectedRouteWithCompanySettings({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string[] }) {
  return (
    <CompanySettingsProvider>
      <FaviconUpdater />
      <ProtectedRoute requiredRole={requiredRole}>
        {children}
      </ProtectedRoute>
    </CompanySettingsProvider>
  );
}

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <AuthProvider>
          <AppCacheProvider>
            <FormPersistenceProvider>
              <GlobalFormPersistenceProvider>
                <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginForm />} />
                <Route path="/signup" element={<SignupForm />} />
                
                {/* Protected Routes */}
                <Route path="/" element={
                  <ProtectedRouteWithCompanySettings>
                    <Index />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/crm" element={
                  <ProtectedRouteWithCompanySettings>
                    <CrmPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/crm/customers" element={
                  <ProtectedRouteWithCompanySettings>
                    <CustomersPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/crm/customers/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <CustomerDetailPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/orders" element={
                  <ProtectedRouteWithCompanySettings>
                    <OrdersPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/stock-orders" element={
                  <ProtectedRouteWithCompanySettings>
                    <StockOrdersPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/orders/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <OrderDetailPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/orders/:id/assign-batches" element={
                  <ProtectedRouteWithCompanySettings>
                    <OrderBatchAssignmentPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/inventory" element={
                  <ProtectedRouteWithCompanySettings>
                    <InventoryPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/inventory/product-categories" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProductCategoriesPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/inventory/fabrics" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <FabricManagerNew />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/inventory/size-types" element={
                  <ProtectedRouteWithCompanySettings>
                    <SizeTypesPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                {/* Masters Routes */}
                <Route path="/masters" element={
                  <ProtectedRouteWithCompanySettings>
                    <MastersPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/products" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProductMasterPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/items" element={
                  <ProtectedRouteWithCompanySettings>
                    <ItemMasterPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/warehouses" element={
                  <ProtectedRouteWithCompanySettings>
                    <WarehouseMasterPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/warehouse/inventory" element={
                  <ProtectedRouteWithCompanySettings>
                    <WarehouseInventoryPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/customer-types" element={
                  <ProtectedRouteWithCompanySettings>
                    <CustomerTypeMasterPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/suppliers" element={
                  <ProtectedRouteWithCompanySettings>
                    <SupplierMasterPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/branding-types" element={
                  <ProtectedRouteWithCompanySettings>
                    <BrandingTypePage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/masters/product-parts" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProductPartsManager />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                <Route path="/production" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProductionPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/production/assign-orders" element={
                  <ProtectedRouteWithCompanySettings>
                    <AssignOrdersPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/production/cutting-manager" element={
                  <ProtectedRouteWithCompanySettings>
                    <CuttingManagerPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/production/tailor-management" element={
                  <ProtectedRouteWithCompanySettings>
                    <TailorManagementPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/production/picker" element={
                  <ProtectedRouteWithCompanySettings>
                    <PickerPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/design" element={
                  <ProtectedRouteWithCompanySettings>
                    <DesignPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProcurementPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement/po" element={
                  <ProtectedRouteWithCompanySettings>
                    <PurchaseOrderListPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement/po/new" element={
                  <ProtectedRouteWithCompanySettings>
                    <PurchaseOrderFormPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement/po/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <PurchaseOrderFormPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/bom" element={
                  <ProtectedRouteWithCompanySettings>
                    <BomListPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/bom/create" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <BomCreator />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/bom/new" element={
                  <ProtectedRouteWithCompanySettings>
                    <BomForm />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/bom/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <BomForm />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/bom/:id/edit" element={
                  <ProtectedRouteWithCompanySettings>
                    <BomForm />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                {/* GRN Routes */}
                <Route path="/procurement/grn" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <GRNList />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement/grn/new" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <GRNForm />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/procurement/grn/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <GRNForm />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/quality" element={
                  <ProtectedRouteWithCompanySettings>
                    <QualityPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/quality/checks" element={
                  <ProtectedRouteWithCompanySettings>
                    <QCPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/quality/dispatch" element={
                  <ProtectedRouteWithCompanySettings>
                    <DispatchQCPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/dispatch" element={
                  <ProtectedRouteWithCompanySettings>
                    <DispatchPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/dispatch/challan/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <DispatchChallanPrint />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/analytics" element={
                  <ProtectedRouteWithCompanySettings>
                    <AnalyticsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/settings" element={
                  <ProtectedRouteWithCompanySettings>
                    <SettingsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/reports" element={
                  <ProtectedRouteWithCompanySettings>
                    <ErpLayout>
                      <ReportsPage />
                    </ErpLayout>
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/configuration" element={
                  <ProtectedRouteWithCompanySettings requiredRole={['admin']}>
                    <CompanyConfigPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                {/* People Routes */}
                <Route path="/people" element={
                  <ProtectedRouteWithCompanySettings>
                    <PeoplePage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/employees" element={
                  <ProtectedRouteWithCompanySettings>
                    <EmployeesPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/employees/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <EmployeeDetailPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/departments" element={
                  <ProtectedRouteWithCompanySettings>
                    <DepartmentsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/departments/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <DepartmentDetailPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/designations" element={
                  <ProtectedRouteWithCompanySettings>
                    <DesignationsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/people/production-team" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProductionTeamPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                        <Route path="/people/production-team/:id" element={
          <ProtectedRouteWithCompanySettings>
            <ProductionTeamDetailPage />
          </ProtectedRouteWithCompanySettings>
        } />
                
                {/* Customer Routes */}
                <Route path="/customer" element={
                  <ProtectedRouteWithCompanySettings>
                    <CustomerDashboard />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                {/* Profile Routes */}
                <Route path="/profile" element={
                  <ProtectedRouteWithCompanySettings>
                    <ProfileSettingsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                
                {/* Accounts Routes */}
                <Route path="/accounts/quotations" element={
                  <ProtectedRouteWithCompanySettings>
                    <QuotationsPage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/accounts/quotations/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <QuotationDetailPage />
                  </ProtectedRouteWithCompanySettings>
                } />

                <Route path="/accounts/receipts" element={
                  <ProtectedRouteWithCompanySettings>
                    <ReceiptPage />
                  </ProtectedRouteWithCompanySettings>
                } />

                <Route path="/accounts/invoices" element={
                  <ProtectedRouteWithCompanySettings>
                    <InvoicePage />
                  </ProtectedRouteWithCompanySettings>
                } />
                <Route path="/accounts/invoices/:id" element={
                  <ProtectedRouteWithCompanySettings>
                    <InvoiceDetailPage />
                  </ProtectedRouteWithCompanySettings>
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
                <Route path="/admin/employee-access" element={
                  <ProtectedRoute requiredRole={['admin']}>
                    <EmployeeAccessManagementPage />
                  </ProtectedRoute>
                } />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </GlobalFormPersistenceProvider>
        </FormPersistenceProvider>
      </AppCacheProvider>
    </AuthProvider>
  </ThemeProvider>
</QueryClientProvider>
);
};

export default App;
