// Test script to check GST rate issue
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vwpseddaghxktpjtriaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cHNlZGRhZ2h4a3RwanRyaWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjgzNjQsImV4cCI6MjA3NTQ0NDM2NH0.b-TPhSHiEeqJOg81dgUv50UxWvwHQWzGLcI2j1CwMBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGSTIssue() {
  console.log('🔍 Testing GST rate issue...');

  try {
    // Check if there are any orders at all
    console.log('📋 Checking if there are any orders...');
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, gst_rate, tax_amount, total_amount, final_amount')
      .limit(10);

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError);
      return;
    }

    console.log('📊 Recent orders:', orders);

    // Check order items for these orders
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      console.log('📋 Checking order items...');
      
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, gst_rate, unit_price, quantity, total_price, specifications')
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('❌ Error fetching order items:', itemsError);
        return;
      }

      console.log('📊 Order items:', orderItems);
    }

  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

testGSTIssue();
