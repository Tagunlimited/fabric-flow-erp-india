// Node.js script to delete all orders and related records
// WARNING: This will permanently delete ALL orders and related data
// Use with extreme caution - this action cannot be undone!

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vwpseddaghxktpjtriaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cHNlZGRhZ2h4a3RwanRyaWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjgzNjQsImV4cCI6MjA3NTQ0NDM2NH0.b-TPhSHiEeqJOg81dgUv50UxWvwHQWzGLcI2j1CwMBs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteAllOrders() {
  console.log('🚨 WARNING: This will delete ALL orders and related data!');
  console.log('This action cannot be undone!');
  
  // Ask for confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise((resolve) => {
    rl.question('Are you sure you want to delete ALL orders? Type "DELETE ALL" to confirm: ', resolve);
  });
  
  rl.close();
  
  if (answer !== 'DELETE ALL') {
    console.log('❌ Operation cancelled. Orders were not deleted.');
    return;
  }
  
  console.log('🗑️  Starting deletion process...');
  
  try {
    // Step 1: Get counts before deletion
    console.log('\n📊 Getting record counts before deletion...');
    
    const { data: ordersCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });
    
    const { data: orderItemsCount } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true });
    
    console.log(`Found ${ordersCount?.length || 0} orders and ${orderItemsCount?.length || 0} order items to delete`);
    
    // Step 2: Delete order item customizations (if table exists)
    console.log('\n🗑️  Deleting order item customizations...');
    try {
      const { error } = await supabase
        .from('order_item_customizations')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (error && !error.message.includes('relation "order_item_customizations" does not exist')) {
        console.error('Error deleting order item customizations:', error);
      } else {
        console.log('✅ Order item customizations deleted');
      }
    } catch (err) {
      console.log('ℹ️  Order item customizations table does not exist, skipping...');
    }
    
    // Step 3: Delete order items
    console.log('\n🗑️  Deleting order items...');
    const { error: orderItemsError } = await supabase
      .from('order_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (orderItemsError) {
      console.error('Error deleting order items:', orderItemsError);
    } else {
      console.log('✅ Order items deleted');
    }
    
    // Step 4: Delete order activities (if table exists)
    console.log('\n🗑️  Deleting order activities...');
    try {
      const { error } = await supabase
        .from('order_activities')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (error && !error.message.includes('relation "order_activities" does not exist')) {
        console.error('Error deleting order activities:', error);
      } else {
        console.log('✅ Order activities deleted');
      }
    } catch (err) {
      console.log('ℹ️  Order activities table does not exist, skipping...');
    }
    
    // Step 5: Delete order batch assignments (if table exists)
    console.log('\n🗑️  Deleting order batch assignments...');
    try {
      const { error } = await supabase
        .from('order_batch_assignments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (error && !error.message.includes('relation "order_batch_assignments" does not exist')) {
        console.error('Error deleting order batch assignments:', error);
      } else {
        console.log('✅ Order batch assignments deleted');
      }
    } catch (err) {
      console.log('ℹ️  Order batch assignments table does not exist, skipping...');
    }
    
    // Step 6: Delete order assignments (if table exists)
    console.log('\n🗑️  Deleting order assignments...');
    try {
      const { error } = await supabase
        .from('order_assignments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (error && !error.message.includes('relation "order_assignments" does not exist')) {
        console.error('Error deleting order assignments:', error);
      } else {
        console.log('✅ Order assignments deleted');
      }
    } catch (err) {
      console.log('ℹ️  Order assignments table does not exist, skipping...');
    }
    
    // Step 7: Delete invoices (if table exists)
    console.log('\n🗑️  Deleting invoices...');
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (error && !error.message.includes('relation "invoices" does not exist')) {
        console.error('Error deleting invoices:', error);
      } else {
        console.log('✅ Invoices deleted');
      }
    } catch (err) {
      console.log('ℹ️  Invoices table does not exist, skipping...');
    }
    
    // Step 8: Delete order-related receipts
    console.log('\n🗑️  Deleting order-related receipts...');
    try {
      const { error } = await supabase
        .from('receipts')
        .delete()
        .or('reference_type.eq.order,reference_type.eq.ORDER');
      
      if (error && !error.message.includes('relation "receipts" does not exist')) {
        console.error('Error deleting receipts:', error);
      } else {
        console.log('✅ Order-related receipts deleted');
      }
    } catch (err) {
      console.log('ℹ️  Receipts table does not exist, skipping...');
    }
    
    // Step 9: Finally delete all orders
    console.log('\n🗑️  Deleting all orders...');
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (ordersError) {
      console.error('Error deleting orders:', ordersError);
    } else {
      console.log('✅ All orders deleted');
    }
    
    // Step 10: Verify deletion
    console.log('\n✅ Verification: Checking if orders still exist...');
    const { data: remainingOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });
    
    if (remainingOrders && remainingOrders.length === 0) {
      console.log('🎉 SUCCESS: All orders and related records have been deleted!');
    } else {
      console.log('⚠️  WARNING: Some orders may still exist. Please check manually.');
    }
    
  } catch (error) {
    console.error('❌ Error during deletion process:', error);
  }
}

// Run the deletion
deleteAllOrders().catch(console.error);
