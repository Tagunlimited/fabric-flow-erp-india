import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Tables = Database['public']['Tables'];
type Customers = Tables['customers']['Row'];
type Orders = Tables['orders']['Row'];
type Products = Tables['products']['Row'];
type Employees = Tables['employees']['Row'];
type ProductionOrders = Tables['production_orders']['Row'];
type QualityChecks = Tables['quality_checks']['Row'];
type Inventory = Tables['inventory']['Row'];
type Fabrics = Tables['fabrics']['Row'];
type ProductCategories = Tables['product_categories']['Row'];
type SizeTypes = Tables['size_types']['Row'];
type Quotations = Tables['quotations']['Row'];
type Invoices = Tables['invoices']['Row'];
type DispatchOrders = Tables['dispatch_orders']['Row'];

// Dashboard Data Interface
export interface DashboardData {
  customers: Customers[];
  orders: Orders[];
  products: Products[];
  employees: Employees[];
  productionOrders: ProductionOrders[];
  qualityChecks: QualityChecks[];
  inventory: Inventory[];
  fabrics: Fabrics[];
  productCategories: ProductCategories[];
  sizeTypes: SizeTypes[];
  quotations: Quotations[];
  invoices: Invoices[];
  dispatchOrders: DispatchOrders[];
  summary: {
    totalCustomers: number;
    totalOrders: number;
    totalProducts: number;
    totalEmployees: number;
    totalRevenue: number;
    pendingOrders: number;
    inProductionOrders: number;
    completedOrders: number;
    lowStockItems: number;
    totalInventory: number;
  };
}

// Customer Management
export async function getCustomers(): Promise<Customers[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }

  return data || [];
}

export async function getCustomerById(id: string): Promise<Customers | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching customer:', error);
    return null;
  }

  return data;
}

export async function createCustomer(customer: Database['public']['Tables']['customers']['Insert']): Promise<Customers | null> {
  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single();

  if (error) {
    console.error('Error creating customer:', error);
    return null;
  }

  return data;
}

export async function updateCustomer(id: string, updates: Database['public']['Tables']['customers']['Update']): Promise<Customers | null> {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating customer:', error);
    return null;
  }

  return data;
}

// Order Management
export async function getOrders(): Promise<Orders[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers (
        company_name,
        contact_person,
        email,
        phone
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  return data || [];
}

export async function getPendingOrdersCount(): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    console.error('Error fetching pending orders count:', error);
    return 0;
  }

  return count || 0;
}

export async function getOrderById(id: string): Promise<Orders | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers (
        company_name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        pincode
      ),
      order_items (
        *,
        products (
          name,
          base_price
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching order:', error);
    return null;
  }

  return data;
}

export async function createOrder(order: Database['public']['Tables']['orders']['Insert']): Promise<Orders | null> {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();

  if (error) {
    console.error('Error creating order:', error);
    return null;
  }

  return data;
}

export async function updateOrderStatus(id: string, status: Database['public']['Enums']['order_status']): Promise<Orders | null> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating order status:', error);
    return null;
  }

  return data;
}

// Product Management
export async function getProducts(): Promise<Products[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  return data || [];
}

export async function getProductById(id: string): Promise<Products | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    return null;
  }

  return data;
}

// Employee Management
export async function getEmployees(): Promise<Employees[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching employees:', error);
    return [];
  }

  return data || [];
}

export async function getEmployeeById(id: string): Promise<Employees | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching employee:', error);
    return null;
  }

  return data;
}

// Production Management
export async function getProductionOrders(): Promise<ProductionOrders[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(`
      *,
      orders (
        order_number,
        customers (
          company_name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching production orders:', error);
    return [];
  }

  return data || [];
}

// Quality Management
export async function getQualityChecks(): Promise<QualityChecks[]> {
  const { data, error } = await supabase
    .from('quality_checks')
    .select(`
      *,
      orders (
        order_number,
        customers (
          company_name
        )
      )
    `)
    .order('check_date', { ascending: false });

  if (error) {
    console.error('Error fetching quality checks:', error);
    return [];
  }

  return data || [];
}

// Inventory Management
export async function getInventory(): Promise<Inventory[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching inventory:', error);
    return [];
  }

  return data || [];
}

export async function getFabrics(): Promise<Fabrics[]> {
  const { data, error } = await supabase
    .from('fabric_master')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching fabrics:', error);
    return [];
  }

  return data || [];
}

export async function getProductCategories(): Promise<ProductCategories[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching product categories:', error);
    return [];
  }

  return data || [];
}

export async function getSizeTypes(): Promise<SizeTypes[]> {
  const { data, error } = await supabase
    .from('size_types')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching size types:', error);
    return [];
  }

  return data || [];
}

// Quotation Management
export async function getQuotations(): Promise<Quotations[]> {
  const { data, error } = await supabase
    .from('quotations')
    .select(`
      *,
      customers (
        company_name,
        contact_person
      )
    `)
    .order('quotation_date', { ascending: false });

  if (error) {
    console.error('Error fetching quotations:', error);
    return [];
  }

  return data || [];
}

// Invoice Management
export async function getInvoices(): Promise<Invoices[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customers (
        company_name,
        contact_person
      )
    `)
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('Error fetching invoices:', error);
    return [];
  }

  return data || [];
}

// Dispatch Management
export async function getDispatchOrders(): Promise<DispatchOrders[]> {
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select(`
      *,
      orders (
        order_number,
        customers (
          company_name
        )
      )
    `)
    .order('dispatch_date', { ascending: false });

  if (error) {
    console.error('Error fetching dispatch orders:', error);
    return [];
  }

  return data || [];
}

// Dashboard Data Aggregation
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [
      customers,
      orders,
      products,
      employees,
      productionOrders,
      qualityChecks,
      inventory,
      fabrics,
      productCategories,
      sizeTypes,
      quotations,
      invoices,
      dispatchOrders
    ] = await Promise.all([
      getCustomers(),
      getOrders(),
      getProducts(),
      getEmployees(),
      getProductionOrders(),
      getQualityChecks(),
      getInventory(),
      getFabrics(),
      getProductCategories(),
      getSizeTypes(),
      getQuotations(),
      getInvoices(),
      getDispatchOrders()
    ]);

    // Calculate summary statistics
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const pendingOrders = orders.filter(order => order.status === 'pending').length;
    const inProductionOrders = orders.filter(order => order.status === 'in_production').length;
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    const lowStockItems = inventory.filter(item => (item.stock_quantity || 0) < 100).length; // Assuming 100 is low stock threshold

    const summary = {
      totalCustomers: customers.length,
      totalOrders: orders.length,
      totalProducts: products.length,
      totalEmployees: employees.length,
      totalRevenue,
      pendingOrders,
      inProductionOrders,
      completedOrders,
      lowStockItems,
      totalInventory: inventory.length
    };

    return {
      customers,
      orders,
      products,
      employees,
      productionOrders,
      qualityChecks,
      inventory,
      fabrics,
      productCategories,
      sizeTypes,
      quotations,
      invoices,
      dispatchOrders,
      summary
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      customers: [],
      orders: [],
      products: [],
      employees: [],
      productionOrders: [],
      qualityChecks: [],
      inventory: [],
      fabrics: [],
      productCategories: [],
      sizeTypes: [],
      quotations: [],
      invoices: [],
      dispatchOrders: [],
      summary: {
        totalCustomers: 0,
        totalOrders: 0,
        totalProducts: 0,
        totalEmployees: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        inProductionOrders: 0,
        completedOrders: 0,
        lowStockItems: 0,
        totalInventory: 0
      }
    };
  }
}

// Search functionality
export async function searchCustomers(query: string): Promise<Customers[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .or(`company_name.ilike.%${query}%,contact_person.ilike.%${query}%,email.ilike.%${query}%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error searching customers:', error);
    return [];
  }

  return data || [];
}

export async function searchOrders(query: string): Promise<Orders[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers (
        company_name,
        contact_person
      )
    `)
    .or(`order_number.ilike.%${query}%,customers.company_name.ilike.%${query}%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error searching orders:', error);
    return [];
  }

  return data || [];
}

// Analytics and Reports
export async function getOrderAnalytics(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('orders')
    .select('order_date, total_amount, status')
    .gte('order_date', startDate.toISOString())
    .order('order_date', { ascending: true });

  if (error) {
    console.error('Error fetching order analytics:', error);
    return [];
  }

  return data || [];
}

export async function getRevenueAnalytics(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('orders')
    .select('order_date, total_amount')
    .gte('order_date', startDate.toISOString())
    .order('order_date', { ascending: true });

  if (error) {
    console.error('Error fetching revenue analytics:', error);
    return [];
  }

  return data || [];
} 