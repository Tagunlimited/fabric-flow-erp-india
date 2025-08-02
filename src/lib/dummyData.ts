// Smart Dummy Data Generator for Scissors ERP
// Generates 1000+ relational records with Indian-specific datasets and realistic patterns

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'sales' | 'production' | 'quality' | 'dispatch' | 'inventory';
  department: string;
  createdAt: Date;
  isActive: boolean;
}

export interface Customer {
  id: string;
  companyName: string;
  gstin: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  orderVolume: 'High' | 'Medium' | 'Low';
  loyaltyTier: 'Gold' | 'Silver' | 'Bronze';
  totalOrders: number;
  lastOrderDate: Date;
  creditLimit: number;
  outstandingAmount: number;
  totalBilledAmount: number;
}

export interface Product {
  id: string;
  name: string;
  category: 'T-Shirt' | 'Uniform' | 'Jacket' | 'Polo' | 'Hoodie' | 'Custom';
  basePrice: number;
  materialCost: number;
  laborCost: number;
  sizesAvailable: string[];
  colorsAvailable: string[];
  estimatedDays: number;
  minOrderQty: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'in_production' | 'quality_check' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  orderDate: Date;
  deliveryDate: Date;
  specifications: {
    size: string;
    color: string;
    embroidery?: string;
    printing?: string;
    specialInstructions?: string;
  };
  seasonalFactor: number;
}

export interface ProductionLog {
  id: string;
  orderId: string;
  stage: 'cutting' | 'stitching' | 'embroidery' | 'printing' | 'quality_check' | 'packaging' | 'completed';
  assignedTo: string;
  startTime: Date;
  endTime?: Date;
  durationHours: number;
  efficiency: number;
  notes?: string;
  defectsFound?: string[];
}

export interface QualityCheck {
  id: string;
  orderId: string;
  checkedBy: string;
  checkDate: Date;
  passed: boolean;
  defects: string[];
  severity: 'minor' | 'major' | 'critical';
  correctionRequired: boolean;
  remarks?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'fabric' | 'thread' | 'button' | 'zipper' | 'label' | 'packaging';
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: 'meters' | 'pieces' | 'kg' | 'boxes';
  costPerUnit: number;
  supplierId: string;
  lastPurchaseDate: Date;
  stockStatus: 'healthy' | 'low' | 'critical' | 'out_of_stock';
  location: string;
}

// Indian States and Cities
const INDIAN_STATES = [
  { state: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nashik', 'Aurangabad', 'Nagpur'] },
  { state: 'Delhi', cities: ['New Delhi', 'Delhi'] },
  { state: 'Karnataka', cities: ['Bangalore', 'Mysore', 'Hubli', 'Mangalore'] },
  { state: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'] },
  { state: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'] },
  { state: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'] },
  { state: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Agra', 'Varanasi'] }
];

const TEXTILE_COMPANIES = [
  'Fabrics Plus', 'Weave Master', 'Cotton King', 'Silk Route', 'Thread Works',
  'Garment Hub', 'Textile Valley', 'Fashion Forward', 'Cloth Craft', 'Fiber Zone',
  'Stitch Perfect', 'Yarn House', 'Material World', 'Fabric Factory', 'Textile Trends',
  'Weaving Wonders', 'Cotton Castle', 'Silk Symphony', 'Thread Theory', 'Cloth Culture'
];

const PRODUCT_CATEGORIES = [
  { name: 'T-Shirt', basePrice: 180, materialCost: 85, laborCost: 45, estimatedDays: 5 },
  { name: 'Uniform', basePrice: 350, materialCost: 165, laborCost: 95, estimatedDays: 8 },
  { name: 'Jacket', basePrice: 650, materialCost: 285, laborCost: 165, estimatedDays: 12 },
  { name: 'Polo', basePrice: 250, materialCost: 115, laborCost: 65, estimatedDays: 6 },
  { name: 'Hoodie', basePrice: 480, materialCost: 215, laborCost: 125, estimatedDays: 10 },
  { name: 'Custom', basePrice: 400, materialCost: 180, laborCost: 110, estimatedDays: 14 }
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const COLORS = ['White', 'Black', 'Navy', 'Red', 'Royal Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Grey'];

// Smart Data Generation Functions
export function generateUsers(count: number = 10): User[] {
  const roles: Array<User['role']> = ['admin', 'sales', 'production', 'quality', 'dispatch', 'inventory'];
  const departments = ['Administration', 'Sales', 'Production', 'Quality Control', 'Dispatch', 'Inventory'];
  
  return Array.from({ length: count }, (_, i) => {
    const role = roles[i % roles.length];
    const department = departments[i % departments.length];
    
    return {
      id: `user_${i + 1}`,
      email: `${role}${i > 0 ? i + 1 : ''}@tagunlimited.com`,
      name: `${role.charAt(0).toUpperCase() + role.slice(1)} User ${i > 0 ? i + 1 : ''}`,
      role,
      department,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      isActive: Math.random() > 0.1 // 90% active users
    };
  });
}

export function generateCustomers(count: number = 50): Customer[] {
  return Array.from({ length: count }, (_, i) => {
    const stateData = INDIAN_STATES[Math.floor(Math.random() * INDIAN_STATES.length)];
    const city = stateData.cities[Math.floor(Math.random() * stateData.cities.length)];
    const companyName = `${TEXTILE_COMPANIES[Math.floor(Math.random() * TEXTILE_COMPANIES.length)]} ${i + 1}`;
    
    // Generate realistic GSTIN
    const stateCode = String(Math.floor(Math.random() * 37) + 1).padStart(2, '0');
    const gstin = `${stateCode}${String(Math.floor(Math.random() * 900000) + 100000)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 10)}Z${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 10)}`;
    
    const totalOrders = Math.floor(Math.random() * 25) + 1;
    const loyaltyTier = totalOrders > 15 ? 'Gold' : totalOrders > 5 ? 'Silver' : 'Bronze';
    const orderVolume = totalOrders > 15 ? 'High' : totalOrders > 5 ? 'Medium' : 'Low';
    
    // Calculate realistic billing amounts based on loyalty tier and order volume
    const baseOrderValue = loyaltyTier === 'Gold' ? 45000 : loyaltyTier === 'Silver' ? 25000 : 12000;
    const variance = Math.random() * 0.4 + 0.8; // 80% to 120% of base value
    const avgOrderValue = Math.floor(baseOrderValue * variance);
    const totalBilledAmount = Math.floor(totalOrders * avgOrderValue);
    
    return {
      id: `customer_${i + 1}`,
      companyName,
      gstin,
      mobile: `9${String(Math.floor(Math.random() * 800000000) + 100000000)}`,
      email: `${companyName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
      address: `${Math.floor(Math.random() * 999) + 1}, Industrial Area, ${city}`,
      city,
      state: stateData.state,
      pincode: String(Math.floor(Math.random() * 900000) + 100000),
      orderVolume,
      loyaltyTier,
      totalOrders,
      lastOrderDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      creditLimit: Math.floor(Math.random() * 500000) + 50000,
      outstandingAmount: Math.floor(Math.random() * 25000),
      totalBilledAmount
    };
  });
}

export function generateProducts(count: number = 20): Product[] {
  return Array.from({ length: count }, (_, i) => {
    const category = PRODUCT_CATEGORIES[Math.floor(Math.random() * PRODUCT_CATEGORIES.length)];
    const variation = Math.floor(Math.random() * 5) + 1;
    
    return {
      id: `product_${i + 1}`,
      name: `${category.name} ${variation}`,
      category: category.name as any,
      basePrice: category.basePrice + Math.floor(Math.random() * 100) - 50,
      materialCost: category.materialCost + Math.floor(Math.random() * 30) - 15,
      laborCost: category.laborCost + Math.floor(Math.random() * 20) - 10,
      sizesAvailable: SIZES.slice(0, Math.floor(Math.random() * 5) + 3),
      colorsAvailable: COLORS.slice(0, Math.floor(Math.random() * 6) + 3),
      estimatedDays: category.estimatedDays + Math.floor(Math.random() * 5) - 2,
      minOrderQty: Math.floor(Math.random() * 50) + 10
    };
  });
}

export function generateOrders(customers: Customer[], products: Product[], count: number = 200): Order[] {
  const statuses: Order['status'][] = ['pending', 'confirmed', 'in_production', 'quality_check', 'ready', 'dispatched', 'delivered', 'cancelled'];
  const priorities: Order['priority'][] = ['low', 'medium', 'high', 'urgent'];
  
  return Array.from({ length: count }, (_, i) => {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 500) + 50;
    
    // Seasonal factors (higher in March-April for Holi, Oct-Nov for Diwali)
    const month = Math.floor(Math.random() * 12) + 1;
    const seasonalFactor = (month === 3 || month === 4) ? 1.8 : 
                          (month === 10 || month === 11) ? 2.2 : 1.0;
    
    const adjustedQuantity = Math.floor(quantity * seasonalFactor);
    const unitPrice = product.basePrice + Math.floor(Math.random() * 50) - 25;
    const totalAmount = adjustedQuantity * unitPrice;
    
    const orderDate = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    const deliveryDate = new Date(orderDate.getTime() + (product.estimatedDays * 24 * 60 * 60 * 1000));
    
    return {
      id: `order_${i + 1}`,
      orderNumber: `ORD-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      customerId: customer.id,
      productId: product.id,
      quantity: adjustedQuantity,
      unitPrice,
      totalAmount,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      orderDate,
      deliveryDate,
      specifications: {
        size: product.sizesAvailable[Math.floor(Math.random() * product.sizesAvailable.length)],
        color: product.colorsAvailable[Math.floor(Math.random() * product.colorsAvailable.length)],
        embroidery: Math.random() > 0.7 ? 'Company Logo' : undefined,
        printing: Math.random() > 0.8 ? 'Screen Print' : undefined,
        specialInstructions: Math.random() > 0.9 ? 'Rush order - High priority' : undefined
      },
      seasonalFactor
    };
  });
}

export function generateProductionLogs(orders: Order[], count: number = 300): ProductionLog[] {
  const stages: ProductionLog['stage'][] = ['cutting', 'stitching', 'embroidery', 'printing', 'quality_check', 'packaging', 'completed'];
  const workers = ['Ramesh Kumar', 'Suresh Patel', 'Rajesh Singh', 'Mukesh Gupta', 'Dinesh Sharma'];
  
  return Array.from({ length: count }, (_, i) => {
    const order = orders[Math.floor(Math.random() * orders.length)];
    const stage = stages[Math.floor(Math.random() * stages.length)];
    
    const baseDuration = stage === 'cutting' ? 6 : 
                        stage === 'stitching' ? 18 : 
                        stage === 'embroidery' ? 8 : 
                        stage === 'printing' ? 4 : 
                        stage === 'quality_check' ? 2 : 3;
    
    const durationHours = baseDuration + Math.floor(Math.random() * 4) - 2;
    const efficiency = Math.floor(Math.random() * 30) + 70; // 70-100%
    
    const startTime = new Date(order.orderDate.getTime() + Math.random() * 5 * 24 * 60 * 60 * 1000);
    const endTime = stage === 'completed' ? new Date(startTime.getTime() + durationHours * 60 * 60 * 1000) : undefined;
    
    // 5% chance of defects
    const defects = Math.random() < 0.05 ? ['Stitching issue', 'Color variation', 'Size discrepancy'][Math.floor(Math.random() * 3)] : undefined;
    
    return {
      id: `production_${i + 1}`,
      orderId: order.id,
      stage,
      assignedTo: workers[Math.floor(Math.random() * workers.length)],
      startTime,
      endTime,
      durationHours,
      efficiency,
      notes: Math.random() > 0.8 ? 'Completed ahead of schedule' : undefined,
      defectsFound: defects ? [defects] : undefined
    };
  });
}

export function generateQualityChecks(orders: Order[], count: number = 150): QualityCheck[] {
  const checkers = ['Priya Sharma', 'Neha Patel', 'Ravi Kumar', 'Anita Singh'];
  const defectTypes = ['Stitching defects', 'Color mismatch', 'Size variation', 'Fabric quality', 'Print alignment'];
  
  return Array.from({ length: count }, (_, i) => {
    const order = orders[Math.floor(Math.random() * orders.length)];
    const passed = Math.random() > 0.05; // 95% pass rate
    
    const defects = !passed ? [defectTypes[Math.floor(Math.random() * defectTypes.length)]] : [];
    const severity = !passed ? (['minor', 'major', 'critical'][Math.floor(Math.random() * 3)] as any) : 'minor';
    
    return {
      id: `qc_${i + 1}`,
      orderId: order.id,
      checkedBy: checkers[Math.floor(Math.random() * checkers.length)],
      checkDate: new Date(order.orderDate.getTime() + Math.random() * 10 * 24 * 60 * 60 * 1000),
      passed,
      defects,
      severity,
      correctionRequired: !passed,
      remarks: !passed ? 'Requires rework before dispatch' : 'Quality standards met'
    };
  });
}

export function generateInventoryItems(count: number = 500): InventoryItem[] {
  const materials = {
    fabric: ['Cotton White', 'Polyester Blue', 'Cotton Black', 'Linen Beige', 'Denim Blue', 'Silk Red'],
    thread: ['Polyester Thread White', 'Cotton Thread Black', 'Silk Thread Gold', 'Nylon Thread Blue'],
    button: ['Plastic Button White', 'Metal Button Silver', 'Wooden Button Brown', 'Shell Button Natural'],
    zipper: ['Metal Zipper Black', 'Plastic Zipper White', 'Invisible Zipper Beige', 'Heavy Duty Zipper'],
    label: ['Woven Label', 'Printed Label', 'Care Label', 'Size Label'],
    packaging: ['Poly Bag', 'Cardboard Box', 'Tissue Paper', 'Bubble Wrap']
  };
  
  const suppliers = ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D', 'Supplier E'];
  const locations = ['Warehouse A', 'Warehouse B', 'Production Floor', 'Quality Section'];
  
  return Array.from({ length: count }, (_, i) => {
    const categories = Object.keys(materials) as Array<keyof typeof materials>;
    const category = categories[Math.floor(Math.random() * categories.length)];
    const items = materials[category];
    const name = items[Math.floor(Math.random() * items.length)];
    
    const minStock = Math.floor(Math.random() * 100) + 50;
    const maxStock = minStock * 5;
    const currentStock = Math.floor(Math.random() * (maxStock - minStock)) + minStock;
    
    const stockStatus = currentStock < minStock * 0.2 ? 'critical' :
                       currentStock < minStock * 0.5 ? 'low' :
                       currentStock === 0 ? 'out_of_stock' : 'healthy';
    
    const units = category === 'fabric' ? 'meters' : 
                 category === 'thread' ? 'kg' : 
                 category === 'packaging' ? 'boxes' : 'pieces';
    
    return {
      id: `inventory_${i + 1}`,
      name: `${name} ${i + 1}`,
      category,
      currentStock,
      minStock,
      maxStock,
      unit: units,
      costPerUnit: Math.floor(Math.random() * 50) + 10,
      supplierId: suppliers[Math.floor(Math.random() * suppliers.length)],
      lastPurchaseDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      stockStatus,
      location: locations[Math.floor(Math.random() * locations.length)]
    };
  });
}

// Main function to generate all dummy data
export function generateAllDummyData() {
  const users = generateUsers(10);
  const customers = generateCustomers(50);
  const products = generateProducts(20);
  const orders = generateOrders(customers, products, 200);
  const productionLogs = generateProductionLogs(orders, 300);
  const qualityChecks = generateQualityChecks(orders, 150);
  const inventoryItems = generateInventoryItems(500);
  
  return {
    users,
    customers,
    products,
    orders,
    productionLogs,
    qualityChecks,
    inventoryItems,
    // Summary statistics
    summary: {
      totalUsers: users.length,
      totalCustomers: customers.length,
      totalProducts: products.length,
      totalOrders: orders.length,
      totalProductionLogs: productionLogs.length,
      totalQualityChecks: qualityChecks.length,
      totalInventoryItems: inventoryItems.length,
      totalRecords: users.length + customers.length + products.length + orders.length + 
                   productionLogs.length + qualityChecks.length + inventoryItems.length
    }
  };
}