// Check the actual table structure for orders and order_items
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vwpseddaghxktpjtriaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cHNlZGRhZ2h4a3RwanRyaWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjgzNjQsImV4cCI6MjA3NTQ0NDM2NH0.b-TPhSHiEeqJOg81dgUv50UxWvwHQWzGLcI2j1CwMBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableStructure() {
  console.log('🔍 Checking table structure...');

  try {
    // Check orders table structure by trying to fetch one record
    console.log('📋 Checking orders table...');
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .limit(1);

    if (ordersError) {
      console.error('❌ Error fetching from orders:', ordersError);
    } else {
      console.log('📊 Orders table structure (sample record):');
      if (orders && orders.length > 0) {
        console.log('Available columns:', Object.keys(orders[0]));
        console.log('Sample order data:', orders[0]);
      } else {
        console.log('No orders found, but table exists');
      }
    }

    // Check order_items table structure by trying to fetch one record
    console.log('\n📋 Checking order_items table...');
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .limit(1);

    if (itemsError) {
      console.error('❌ Error fetching from order_items:', itemsError);
    } else {
      console.log('📊 Order_items table structure (sample record):');
      if (orderItems && orderItems.length > 0) {
        console.log('Available columns:', Object.keys(orderItems[0]));
        console.log('Sample order item data:', orderItems[0]);
      } else {
        console.log('No order items found, but table exists');
      }
    }

    // Try to create a test order to see what happens
    console.log('\n🧪 Testing order creation...');
    const testOrderData = {
      order_number: 'TEST-' + Date.now(),
      customer_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      total_amount: 100,
      tax_amount: 18,
      final_amount: 118,
      gst_rate: 18,
      status: 'pending'
    };

    const { data: testOrder, error: testOrderError } = await supabase
      .from('orders')
      .insert(testOrderData)
      .select()
      .single();

    if (testOrderError) {
      console.error('❌ Error creating test order:', testOrderError);
    } else {
      console.log('✅ Test order created successfully:', testOrder);
      
      // Clean up test order
      await supabase.from('orders').delete().eq('id', testOrder.id);
      console.log('🧹 Test order cleaned up');
    }

  } catch (error) {
    console.error('💥 Check failed:', error);
  }
}

checkTableStructure();
