import { getDashboardData, getCustomers, getOrders, getProducts } from './database';
import { initializeDatabase, isDatabaseEmpty } from './seedData';

export async function testDatabaseIntegration() {
  console.log('🧪 Testing Database Integration...\n');

  try {
    // Test 1: Check if database is empty
    console.log('1. Checking database status...');
    const isEmpty = await isDatabaseEmpty();
    console.log(`   Database is ${isEmpty ? 'empty' : 'contains data'}`);

    if (isEmpty) {
      console.log('   Seeding database with sample data...');
      await initializeDatabase();
      console.log('   ✅ Database seeded successfully');
    }

    // Test 2: Test individual entity queries
    console.log('\n2. Testing individual entity queries...');
    
    const customers = await getCustomers();
    console.log(`   ✅ Customers: ${customers.length} records`);
    
    const orders = await getOrders();
    console.log(`   ✅ Orders: ${orders.length} records`);
    
    const products = await getProducts();
    console.log(`   ✅ Products: ${products.length} records`);

    // Test 3: Test dashboard data aggregation
    console.log('\n3. Testing dashboard data aggregation...');
    const dashboardData = await getDashboardData();
    
    console.log(`   ✅ Dashboard Summary:`);
    console.log(`      - Total Customers: ${dashboardData.summary.totalCustomers}`);
    console.log(`      - Total Orders: ${dashboardData.summary.totalOrders}`);
    console.log(`      - Total Products: ${dashboardData.summary.totalProducts}`);
    console.log(`      - Total Revenue: ₹${dashboardData.summary.totalRevenue.toLocaleString()}`);
    console.log(`      - Pending Orders: ${dashboardData.summary.pendingOrders}`);
    console.log(`      - In Production: ${dashboardData.summary.inProductionOrders}`);
    console.log(`      - Low Stock Items: ${dashboardData.summary.lowStockItems}`);

    // Test 4: Verify data structure
    console.log('\n4. Verifying data structure...');
    
    if (dashboardData.customers.length > 0) {
      const sampleCustomer = dashboardData.customers[0];
      console.log(`   ✅ Customer structure: ${sampleCustomer.company_name} (${sampleCustomer.customer_tier})`);
    }
    
    if (dashboardData.orders.length > 0) {
      const sampleOrder = dashboardData.orders[0];
      console.log(`   ✅ Order structure: ${sampleOrder.order_number} (${sampleOrder.status})`);
    }
    
    if (dashboardData.products.length > 0) {
      const sampleProduct = dashboardData.products[0];
      console.log(`   ✅ Product structure: ${sampleProduct.name} (₹${sampleProduct.base_price})`);
    }

    console.log('\n🎉 All database integration tests passed!');
    return true;

  } catch (error) {
    console.error('\n❌ Database integration test failed:', error);
    return false;
  }
}

// Function to run tests from browser console
export function runDatabaseTests() {
  testDatabaseIntegration().then(success => {
    if (success) {
      console.log('✅ Database integration is working correctly');
    } else {
      console.log('❌ Database integration has issues');
    }
  });
}

// Make it available globally for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testDatabase = runDatabaseTests;
} 