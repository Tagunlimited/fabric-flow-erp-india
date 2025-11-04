import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Tables = Database['public']['Tables'];
type Customers = Tables['customers']['Row'];
type Orders = Tables['orders']['Row'];
type Products = Tables['product_master']['Row'];
type Employees = Tables['employees']['Row'];
type ProductionOrders = Tables['production_orders']['Row'];
type QualityChecks = Tables['qc_status_summary']['Row'];
type Inventory = Tables['warehouse_inventory']['Row'];
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
    lowStockItems: number; // Deprecated: use outOfStockItems
    outOfStockItems: number;
    totalInventory: number;
    pendingDispatchOrders: number;
    completedDispatchOrders: number;
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
    .from('product_master')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products from product_master:', error);
    console.error('Products error details:', JSON.stringify(error, null, 2));
    return [];
  }

  console.log('Products fetched from product_master:', data?.length || 0);
  return data || [];
}

export async function getProductById(id: string): Promise<Products | null> {
  const { data, error } = await supabase
    .from('product_master')
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

// Production Team Management
export async function getProductionTeam(): Promise<any[]> {
  const { data, error } = await supabase
    .from('production_team')
    .select('*')
    .order('full_name');

  if (error) {
    console.error('Error fetching production team:', error);
    return [];
  }

  return data || [];
}

export async function getCuttingManagers(): Promise<any[]> {
  console.log('Querying production_team for Cutting Manager...');
  
  // Query by designation field instead of tailor_type
  const { data, error } = await supabase
    .from('production_team')
    .select('*')
    .eq('designation', 'Cutting Manager')
    .order('full_name');

  if (error) {
    console.error('Error fetching cutting managers:', error);
    return [];
  }

  console.log('Cutting managers found:', data);
  return data || [];
}

// Get department count
export async function getDepartmentCount(): Promise<number> {
  const { count, error } = await supabase
    .from('departments')
    .select('*', { count: 'exact', head: false });

  if (error) {
    console.error('Error fetching department count:', error);
    return 0;
  }
  return count || 0;
}

// Get recent activities
export async function getRecentActivities(limit: number = 10): Promise<any[]> {
  const { data, error } = await supabase
    .from('order_lifecycle_view')
    .select('*')
    .order('performed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent activities:', error);
    return [];
  }
  return data || [];
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
    console.error('Production orders error details:', JSON.stringify(error, null, 2));
    return [];
  }

  console.log('Production orders fetched:', data?.length || 0);
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
    console.error('Quality checks error details:', JSON.stringify(error, null, 2));
    return [];
  }

  // Fetch order quantities for each quality check
  if (data && data.length > 0) {
    const orderIds = [...new Set(data.map((qc: any) => qc.order_id).filter(Boolean))];
    
    if (orderIds.length > 0) {
      // Get order items quantities
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', orderIds);

      if (!itemsError && orderItems && orderItems.length > 0) {
        // Sum quantities by order_id
        const quantitiesByOrder = orderItems.reduce((acc: Record<string, number>, item: any) => {
          acc[item.order_id] = (acc[item.order_id] || 0) + (Number(item.quantity) || 0);
          return acc;
        }, {});

        // Add total_quantity to each quality check
        data.forEach((qc: any) => {
          qc.total_quantity = quantitiesByOrder[qc.order_id] || 0;
          // Calculate approved quantity based on pass_percentage
          if (qc.pass_percentage != null && qc.total_quantity > 0) {
            qc.approved_quantity = Math.round((qc.total_quantity * Number(qc.pass_percentage)) / 100);
          } else {
            qc.approved_quantity = 0;
          }
        });

        // Debug logging
        console.log('Quality checks with quantities:', {
          totalChecks: data.length,
          totalQuantity: data.reduce((sum: number, qc: any) => sum + (qc.total_quantity || 0), 0),
          totalApproved: data.reduce((sum: number, qc: any) => sum + (qc.approved_quantity || 0), 0)
        });
      } else {
        console.warn('No order items found for quality checks, or error:', itemsError);
      }
    }
  }

  console.log('Quality checks fetched:', data?.length || 0);
  return data || [];
}

// Inventory Management
export async function getInventory(): Promise<Inventory[]> {
  const { data, error } = await supabase
    .from('warehouse_inventory')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching inventory from warehouse_inventory:', error);
    console.error('Inventory error details:', JSON.stringify(error, null, 2));
    return [];
  }

  console.log('Inventory fetched from warehouse_inventory:', data?.length || 0);
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

// QC Status Summary - Get total approved quantities from qc_status_summary view
export async function getQcStatusSummary(): Promise<{ totalApproved: number; totalPicked: number; totalRejected: number; passRate: number }> {
  try {
    // qc_status_summary is a view, not a table, so we query it directly
    const { data, error } = await (supabase as any)
      .from('qc_status_summary')
      .select('total_approved, total_picked, total_rejected');

    if (error) {
      console.error('Error fetching QC status summary:', error);
      return { totalApproved: 0, totalPicked: 0, totalRejected: 0, passRate: 0 };
    }

    if (!data || data.length === 0) {
      return { totalApproved: 0, totalPicked: 0, totalRejected: 0, passRate: 0 };
    }

    // Sum up all the totals from all assignments
    const totals = data.reduce((acc: any, row: any) => {
      acc.totalApproved += Number(row.total_approved || 0);
      acc.totalPicked += Number(row.total_picked || 0);
      acc.totalRejected += Number(row.total_rejected || 0);
      return acc;
    }, { totalApproved: 0, totalPicked: 0, totalRejected: 0 });

    // Calculate pass rate: (total_approved / total_picked) * 100
    const passRate = totals.totalPicked > 0
      ? Math.round((totals.totalApproved / totals.totalPicked) * 100)
      : 0;

    console.log('QC Status Summary:', {
      totalApproved: totals.totalApproved,
      totalPicked: totals.totalPicked,
      totalRejected: totals.totalRejected,
      passRate
    });

    return {
      totalApproved: totals.totalApproved,
      totalPicked: totals.totalPicked,
      totalRejected: totals.totalRejected,
      passRate
    };
  } catch (error) {
    console.error('Error in getQcStatusSummary:', error);
    return { totalApproved: 0, totalPicked: 0, totalRejected: 0, passRate: 0 };
  }
}

// Get cutting quantities assigned to cutting master but not completed
export async function getCuttingPendingQuantities(): Promise<number> {
  try {
    // Fetch from order_cutting_assignments where cutting is not completed
    // Get all assignments and filter out completed ones
    const { data: allCuttingAssignments, error: cuttingError } = await (supabase as any)
      .from('order_cutting_assignments')
      .select('order_id, assigned_quantity, completed_quantity, status');

    if (cuttingError) {
      console.error('Error fetching cutting assignments:', cuttingError);
    }

    // Filter out completed assignments and calculate pending quantities
    let cuttingPending = 0;
    if (allCuttingAssignments && allCuttingAssignments.length > 0) {
      const nonCompletedAssignments = allCuttingAssignments.filter((assignment: any) => assignment.status !== 'completed');
      
      if (nonCompletedAssignments.length > 0) {
        // Get order IDs for assignments that don't have assigned_quantity or need BOM lookup
        const orderIdsForBom = nonCompletedAssignments
          .filter((a: any) => !a.assigned_quantity || a.assigned_quantity === 0)
          .map((a: any) => a.order_id)
          .filter(Boolean);
        
        let bomQtyByOrder: Record<string, number> = {};
        if (orderIdsForBom.length > 0) {
          const { data: bomRecords, error: bomError2 } = await supabase
            .from('bom_records')
            .select('order_id, total_order_qty')
            .in('order_id', orderIdsForBom);
          
          if (!bomError2 && bomRecords) {
            bomQtyByOrder = bomRecords.reduce((acc: Record<string, number>, bom: any) => {
              const orderId = bom.order_id;
              if (orderId) {
                acc[orderId] = (acc[orderId] || 0) + Number(bom.total_order_qty || 0);
              }
              return acc;
            }, {});
          }
        }
        
        // Calculate pending for each assignment
        cuttingPending = nonCompletedAssignments.reduce((sum: number, assignment: any) => {
          let assigned = Number(assignment.assigned_quantity || 0);
          
          // If assigned_quantity is 0 or null, try to get from BOM
          if (assigned === 0 && assignment.order_id) {
            assigned = bomQtyByOrder[assignment.order_id] || 0;
          }
          
          const completed = Number(assignment.completed_quantity || 0);
          const pending = Math.max(0, assigned - completed);
          return sum + pending;
        }, 0);
      }
    }

    // Also check order_assignments for legacy cutting master assignments
    const { data: orderAssignments, error: orderError } = await supabase
      .from('order_assignments')
      .select('order_id, cut_quantity, cutting_master_id, cut_quantities_by_size')
      .not('cutting_master_id', 'is', null);

    if (orderError) {
      console.error('Error fetching order assignments for cutting:', orderError);
    }

    // For legacy assignments, calculate pending by getting total order quantity from BOM and subtracting cut quantity
    let legacyPending = 0;
    if (orderAssignments && orderAssignments.length > 0) {
      const orderIds = orderAssignments.map((oa: any) => oa.order_id).filter(Boolean);
      
      if (orderIds.length > 0) {
        // Get total order quantities from BOM records
        const { data: bomRecords, error: bomError } = await supabase
          .from('bom_records')
          .select('order_id, total_order_qty')
          .in('order_id', orderIds);

        if (bomError) {
          console.error('Error fetching BOM records:', bomError);
        }

        // Calculate total quantity per order from BOM
        const totalQtyByOrder = (bomRecords || []).reduce((acc: Record<string, number>, bom: any) => {
          const orderId = bom.order_id;
          if (orderId) {
            acc[orderId] = (acc[orderId] || 0) + Number(bom.total_order_qty || 0);
          }
          return acc;
        }, {});

        // Calculate pending for each legacy assignment
        legacyPending = orderAssignments.reduce((sum: number, oa: any) => {
          const orderId = oa.order_id;
          const totalQty = totalQtyByOrder[orderId] || 0;
          
          // Get cut quantity - use cut_quantities_by_size if available, otherwise use cut_quantity
          let cutQty = 0;
          if (oa.cut_quantities_by_size && typeof oa.cut_quantities_by_size === 'object') {
            // Sum up all values from the JSONB object
            cutQty = Object.values(oa.cut_quantities_by_size).reduce((s: number, val: any): number => {
              return s + Number(val || 0);
            }, 0);
          } else {
            cutQty = Number(oa.cut_quantity || 0);
          }
          
          const pending = Math.max(0, totalQty - cutQty);
          return sum + pending;
        }, 0);
      }
    }

    const totalPending = cuttingPending + legacyPending;

    console.log('Cutting Pending Quantities:', {
      cuttingAssignmentsCount: allCuttingAssignments?.length || 0,
      orderAssignmentsCount: orderAssignments?.length || 0,
      cuttingPending,
      legacyPending,
      totalPending,
      cuttingError: cuttingError?.message,
      orderError: orderError?.message
    });

    return totalPending;
  } catch (error) {
    console.error('Error in getCuttingPendingQuantities:', error);
    return 0;
  }
}

// Get stitching quantities that have batches or tailors assigned
export async function getStitchingAssignedQuantities(): Promise<number> {
  try {
    // Fetch from order_batch_assignments - sum quantities from size distributions
    const { data: batchAssignments, error: batchError } = await (supabase as any)
      .from('order_batch_assignments')
      .select('id, total_quantity, batch_id');

    if (batchError) {
      console.error('Error fetching batch assignments:', batchError);
      return 0;
    }

    if (!batchAssignments || batchAssignments.length === 0) {
      return 0;
    }

    // Get assignment IDs to fetch size distributions
    const assignmentIds = batchAssignments.map((ba: any) => ba.id).filter(Boolean);

    if (assignmentIds.length === 0) {
      // Fallback: use total_quantity from batch assignments if no size distributions
      return batchAssignments.reduce((sum: number, ba: any) => {
        return sum + Number(ba.total_quantity || 0);
      }, 0);
    }

    // Fetch size distributions to get accurate quantities
    const { data: sizeDistributions, error: sizeError } = await (supabase as any)
      .from('order_batch_size_distributions')
      .select('quantity, order_batch_assignment_id')
      .in('order_batch_assignment_id', assignmentIds);

    if (sizeError) {
      console.error('Error fetching size distributions:', sizeError);
      // Fallback to total_quantity from batch assignments
      return batchAssignments.reduce((sum: number, ba: any) => {
        return sum + Number(ba.total_quantity || 0);
      }, 0);
    }

    // Sum quantities from size distributions
    const totalQuantity = (sizeDistributions || []).reduce((sum: number, sd: any) => {
      return sum + Number(sd.quantity || 0);
    }, 0);

    console.log('Stitching Assigned Quantities:', {
      batchAssignments: batchAssignments.length,
      sizeDistributions: sizeDistributions?.length || 0,
      totalQuantity
    });

    return totalQuantity;
  } catch (error) {
    console.error('Error in getStitchingAssignedQuantities:', error);
    return 0;
  }
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
    // Count orders in production - includes in_production status and production stages
    const inProductionOrders = orders.filter(order => 
      order.status === 'in_production' || 
      order.status === 'under_cutting' || 
      order.status === 'under_stitching' || 
      order.status === 'under_qc'
    ).length;
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    
    // Calculate SKU-based inventory metrics using only product_master SKUs
    // Step 1: Create a map of product_id -> SKU from product_master
    const productIdToSkuMap = new Map<string, string>();
    const allProductSkus = new Set<string>();
    
    products.forEach((product: any) => {
      if (product.id && product.sku) {
        productIdToSkuMap.set(product.id, product.sku);
        allProductSkus.add(product.sku);
      }
    });
    
    // Step 2: Group inventory quantities by product SKU (only for PRODUCT type items)
    const skuQuantities = new Map<string, number>();
    
    inventory.forEach((item: any) => {
      // Only process PRODUCT type items
      if (item.item_type === 'PRODUCT' && item.item_id) {
        const productSku = productIdToSkuMap.get(item.item_id);
        
        if (productSku) {
          const quantity = parseFloat(item.quantity || 0);
          if (quantity > 0) {
            const currentQty = skuQuantities.get(productSku) || 0;
            skuQuantities.set(productSku, currentQty + quantity);
          }
        }
      }
    });
    
    // Step 3: Initialize all product SKUs with 0 quantity if they don't have inventory
    allProductSkus.forEach((sku) => {
      if (!skuQuantities.has(sku)) {
        skuQuantities.set(sku, 0);
      }
    });
    
    // Total number of unique SKUs from product_master
    const totalSKUs = allProductSkus.size;
    
    // Count SKUs with total quantity less than 10 (out of stock)
    // Only count SKUs from product_master
    const outOfStockSKUs = Array.from(skuQuantities.entries())
      .filter(([sku, qty]) => allProductSkus.has(sku) && qty < 10).length;
    
    // Keep lowStockItems for backward compatibility (using old threshold < 100)
    const lowStockItems = inventory.filter((item: any) => (item.quantity || 0) < 100).length;
    
    // Calculate dispatch order statistics
    // Fetch readymade orders for dispatch calculations
    let readymadeOrders: any[] = [];
    try {
      const { data: readymadeOrdersData, error: readymadeError } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          dispatch_orders (
            id,
            status
          )
        `)
        .eq('order_type', 'readymade' as any)
        .in('status', ['confirmed', 'ready_for_dispatch', 'dispatched', 'completed'] as any);
      
      if (readymadeError) {
        console.error('Error fetching readymade orders for dispatch stats:', readymadeError);
      } else {
        readymadeOrders = readymadeOrdersData || [];
      }
    } catch (error) {
      console.error('Error fetching readymade orders:', error);
    }
    
    // Pending dispatch orders:
    // 1. dispatch_orders with status 'pending' or 'packed'
    // 2. Readymade orders that are confirmed/ready_for_dispatch and don't have a dispatch_order yet
    const dispatchPending = dispatchOrders.filter((o: any) => 
      ['pending', 'packed'].includes(o.status)
    ).length;
    
    const readymadePending = readymadeOrders.filter((o: any) => {
      const isConfirmed = ['confirmed', 'ready_for_dispatch'].includes(o.status);
      const hasDispatchOrder = o.dispatch_orders && o.dispatch_orders.length > 0;
      return isConfirmed && !hasDispatchOrder;
    }).length;
    
    const pendingDispatchOrders = dispatchPending + readymadePending;
    
    // Completed dispatch orders:
    // 1. dispatch_orders with status 'shipped' or 'delivered'
    // 2. Readymade orders that have dispatch_orders with status 'shipped' or 'delivered'
    const dispatchCompleted = dispatchOrders.filter((o: any) => 
      ['shipped', 'delivered'].includes(o.status)
    ).length;
    
    const readymadeCompleted = readymadeOrders.filter((o: any) => {
      if (!o.dispatch_orders || o.dispatch_orders.length === 0) {
        return false;
      }
      // Check if any dispatch_order has status 'shipped' or 'delivered'
      return o.dispatch_orders.some((do_: any) => 
        ['shipped', 'delivered'].includes(do_.status)
      );
    }).length;
    
    const completedDispatchOrders = dispatchCompleted + readymadeCompleted;
    
    // Debug logging
    console.log('Dashboard data counts:', {
      customers: customers.length,
      orders: orders.length,
      products: products.length,
      employees: employees.length,
      productionOrders: productionOrders.length,
      qualityChecks: qualityChecks.length,
      inventory: inventory.length
    });

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
      outOfStockItems: outOfStockSKUs,
      totalInventory: totalSKUs,
      pendingDispatchOrders,
      completedDispatchOrders
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
        outOfStockItems: 0,
        totalInventory: 0,
        pendingDispatchOrders: 0,
        completedDispatchOrders: 0
      }
    };
  }
}

// Search functionality
export async function searchCustomers(query: string): Promise<Customers[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .or(`company_name.ilike.%${query}%,contact_person.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,mobile.ilike.%${query}%,address.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%,pincode.ilike.%${query}%,gstin.ilike.%${query}%,pan.ilike.%${query}%`)
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