import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Tables = Database['public']['Tables'];

// Sample data for seeding the database
const sampleCustomers: Tables['customers']['Insert'][] = [
  {
    company_name: 'Fabrics Plus Ltd',
    contact_person: 'Rajesh Kumar',
    email: 'rajesh@fabricsplus.com',
    phone: '+91-9876543210',
    address: '123 Textile Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    gstin: '27AABCF1234Z1Z5',
    customer_tier: 'gold',
    customer_type: 'Wholesale',
    credit_limit: 500000,
    outstanding_amount: 75000,
    total_orders: 25
  },
  {
    company_name: 'Weave Master Industries',
    contact_person: 'Priya Sharma',
    email: 'priya@weavemaster.com',
    phone: '+91-9876543211',
    address: '456 Garment Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    gstin: '27AABCF1235Z1Z6',
    customer_tier: 'silver',
    customer_type: 'Retail',
    credit_limit: 250000,
    outstanding_amount: 45000,
    total_orders: 15
  },
  {
    company_name: 'Cotton King Textiles',
    contact_person: 'Amit Patel',
    email: 'amit@cottonking.com',
    phone: '+91-9876543212',
    address: '789 Fabric Lane',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380001',
    gstin: '24AABCF1236Z1Z7',
    customer_tier: 'bronze',
    customer_type: 'B2B',
    credit_limit: 100000,
    outstanding_amount: 25000,
    total_orders: 8
  }
];

const sampleProducts: Tables['products']['Insert'][] = [
  {
    name: 'Premium Cotton T-Shirt',
    code: 'TS-001',
    category: 'T-Shirt',
    base_price: 180,
    cost_price: 120,
    description: 'High-quality cotton t-shirt with excellent comfort',
    hsn_code: '6104.42',
   tax_rate: 18
  },
  {
    name: 'Corporate Uniform',
    code: 'UN-001',
    category: 'Uniform',
    base_price: 350,
    cost_price: 250,
    description: 'Professional corporate uniform with company branding',
    hsn_code: '6104.43',
   tax_rate: 18
  },
  {
    name: 'Winter Jacket',
    code: 'JK-001',
    category: 'Jacket',
    base_price: 650,
    cost_price: 450,
    description: 'Warm winter jacket with multiple pockets',
    hsn_code: '6104.44',
   tax_rate: 18
  }
];

const sampleEmployees: Tables['employees']['Insert'][] = [
  {
    full_name: 'Rahul Verma',
    employee_code: 'EMP001',
    designation: 'Production Manager',
    department: 'Production',
    personal_phone: '+91-9876543213',
    personal_email: 'rahul@company.com',
    address_line1: '101 Worker Colony',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400002',
    date_of_birth: '1985-03-15',
    joining_date: '2020-01-15',
    gender: 'Male',
    employment_type: 'Full-time',
    emergency_contact_name: 'Sita Verma',
    emergency_contact_phone: '+91-9876543214'
  },
  {
    full_name: 'Meera Singh',
    employee_code: 'EMP002',
    designation: 'Quality Control Manager',
    department: 'Quality Control',
    personal_phone: '+91-9876543215',
    personal_email: 'meera@company.com',
    address_line1: '202 Staff Quarters',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400003',
    date_of_birth: '1988-07-22',
    joining_date: '2021-03-01',
    gender: 'Female',
    employment_type: 'Full-time',
    emergency_contact_name: 'Raj Singh',
    emergency_contact_phone: '+91-9876543216'
  }
];

const sampleFabrics: Tables['fabrics']['Insert'][] = [
  {
    name: 'Premium Cotton',
    description: 'High-quality cotton fabric for t-shirts',
    // gsm: '180', // Field not available in current schema
    image_url: null
  },
  {
    name: 'Polyester Blend',
    description: 'Durable polyester blend for uniforms',
    // gsm: '200', // Field not available in current schema
    image_url: null
  },
  {
    name: 'Denim',
    description: 'Classic denim fabric for jackets',
    // gsm: '250', // Field not available in current schema
    image_url: null
  }
];

const sampleProductCategories: Tables['product_categories']['Insert'][] = [
  {
    category_name: 'T-Shirt',
    description: 'Casual and formal t-shirts',
    category_image_url: null
  },
  {
    category_name: 'Uniform',
    description: 'Corporate and industrial uniforms',
    category_image_url: null
  },
  {
    category_name: 'Jacket',
    description: 'Winter and casual jackets',
    category_image_url: null
  }
];

const sampleSizeTypes: Tables['size_types']['Insert'][] = [
  {
    size_name: 'Standard Sizes',
    available_sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  },
  {
    size_name: 'Kids Sizes',
    available_sizes: ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y']
  }
];

const sampleDepartments: Tables['departments']['Insert'][] = [
  {
    name: 'Production',
    description: 'Manufacturing and production operations',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Quality Control',
    description: 'Quality assurance and control processes',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Sales',
    description: 'Sales and customer relationship management',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Marketing',
    description: 'Marketing and promotional activities',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'HR',
    description: 'Human resources and personnel management',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Finance',
    description: 'Financial management and accounting',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'IT',
    description: 'Information technology and systems support',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Warehouse',
    description: 'Inventory and warehouse management',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Cutting',
    description: 'Fabric cutting and preparation',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Stitching',
    description: 'Garment stitching and assembly',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Packaging',
    description: 'Product packaging and dispatch',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Design',
    description: 'Product design and development',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Maintenance',
    description: 'Equipment maintenance and repairs',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Admin',
    description: 'Administrative and general operations',
    // is_active: true // Field not available in current schema
  },
  {
    name: 'Security',
    description: 'Security and safety management',
    // is_active: true // Field not available in current schema
  }
];

// Function to seed the database
export async function seedDatabase() {
  try {
    console.log('Starting database seeding...');

    // Insert customers
    console.log('Inserting customers...');
    for (const customer of sampleCustomers) {
      const { error } = await supabase
        .from('customers')
        .insert(customer as any);
      
      if (error) {
        console.error('Error inserting customer:', error);
      }
    }

    // Insert products
    console.log('Inserting products...');
    for (const product of sampleProducts) {
      const { error } = await supabase
        .from('products')
        .insert(product as any);
      
      if (error) {
        console.error('Error inserting product:', error);
      }
    }

    // Insert employees
    console.log('Inserting employees...');
    for (const employee of sampleEmployees) {
      const { error } = await supabase
        .from('employees')
        .insert(employee as any);
      
      if (error) {
        console.error('Error inserting employee:', error);
      }
    }

    // Insert fabrics
    console.log('Inserting fabrics...');
    for (const fabric of sampleFabrics) {
      const { error } = await supabase
        .from('fabrics')
        .insert(fabric as any);
      
      if (error) {
        console.error('Error inserting fabric:', error);
      }
    }

    // Insert product categories
    console.log('Inserting product categories...');
    for (const category of sampleProductCategories) {
      const { error } = await supabase
        .from('product_categories')
        .insert(category as any);
      
      if (error) {
        console.error('Error inserting product category:', error);
      }
    }

    // Insert size types
    console.log('Inserting size types...');
    for (const sizeType of sampleSizeTypes) {
      const { error } = await supabase
        .from('size_types')
        .insert(sizeType as any);
      
      if (error) {
        console.error('Error inserting size type:', error);
      }
    }

    // Insert departments
    console.log('Inserting departments...');
    for (const department of sampleDepartments) {
      const { error } = await supabase
        .from('departments')
        .insert(department as any);
      
      if (error) {
        console.error('Error inserting department:', error);
      }
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Function to clear all data (for testing)
export async function clearDatabase() {
  try {
    console.log('Clearing database...');
    
    const tables = [
      'orders',
      'order_items',
      'production_orders',
      'quality_checks',
      'dispatch_orders',
      'invoices',
      'quotations',
      'inventory',
      'customers',
      'products',
      'employees',
      'fabrics',
      'product_categories',
      'size_types'
    ];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000' as any); // Delete all except system records
      
      if (error) {
        console.error(`Error clearing table ${table}:`, error);
      }
    }

    console.log('Database cleared successfully!');
  } catch (error) {
    console.error('Error clearing database:', error);
  }
}

// Function to check if database is empty
export async function isDatabaseEmpty(): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error checking database:', error);
      return false;
    }

    return count === 0;
  } catch (error) {
    console.error('Error checking database:', error);
    return false;
  }
}

// Function to initialize database with sample data if empty
export async function initializeDatabase() {
  const isEmpty = await isDatabaseEmpty();
  
  if (isEmpty) {
    console.log('Database is empty. Seeding with sample data...');
    await seedDatabase();
  } else {
    console.log('Database already contains data. Skipping seeding.');
  }
} 