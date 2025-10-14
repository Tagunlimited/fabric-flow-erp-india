# Database Integration Guide

This document outlines the changes made to replace dummy data with actual database integration using Supabase.

## Overview

The application has been updated to use real database data instead of generated dummy data. All components now fetch data from the Supabase database and display actual business information.

## Changes Made

### 1. Database Service Layer (`src/lib/database.ts`)

Created a comprehensive database service layer that provides:
- Type-safe database operations using Supabase client
- Functions for all major entities (customers, orders, products, employees, etc.)
- Dashboard data aggregation
- Search functionality
- Analytics and reporting functions

### 2. Updated Components

#### EnhancedDashboard (`src/components/EnhancedDashboard.tsx`)
- Replaced `generateAllDummyData()` with `getDashboardData()`
- Updated all data references to use database field names
- Now displays real-time dashboard metrics from database

#### Dashboard (`src/components/Dashboard.tsx`)
- Replaced dummy data generation with database queries
- Updated metrics calculations to use actual data
- Real-time order and customer statistics

#### CrmModule (`src/components/CrmModule.tsx`)
- Replaced dummy customer data with database queries
- Updated customer filtering and display logic
- Real customer information with proper field mapping

### 3. Data Seeding (`src/lib/seedData.ts`)

Created a data seeding system that provides:
- Sample data for development and testing
- Functions to initialize empty database
- Database clearing functionality for testing
- Sample customers, products, employees, fabrics, etc.

### 4. Database Initializer (`src/components/DatabaseInitializer.tsx`)

A UI component that allows:
- Checking database status
- Seeding database with sample data
- Clearing database for testing
- Visual feedback on operations

## Database Schema

The application uses the following main tables:

### Core Entities
- `customers` - Customer information and relationships
- `orders` - Order management and tracking
- `products` - Product catalog and pricing
- `employees` - Employee directory and management
- `inventory` - Stock management and tracking

### Supporting Entities
- `fabrics` - Fabric catalog
- `product_categories` - Product categorization
- `size_types` - Size configurations
- `production_orders` - Production tracking
- `quality_checks` - Quality control
- `dispatch_orders` - Shipping and logistics
- `quotations` - Sales quotations
- `invoices` - Billing and invoicing

## Usage

### 1. Initial Setup

If your database is empty, you can seed it with sample data:

1. Navigate to `/admin/database-setup` (if you have admin access)
2. Use the Database Initializer component to seed the database
3. Or call the seeding functions programmatically:

```typescript
import { initializeDatabase } from '@/lib/seedData';

// Initialize database with sample data
await initializeDatabase();
```

### 2. Using Database Functions

```typescript
import { 
  getCustomers, 
  getOrders, 
  getDashboardData,
  createCustomer,
  updateOrderStatus 
} from '@/lib/database';

// Fetch customers
const customers = await getCustomers();

// Get dashboard data
const dashboardData = await getDashboardData();

// Create a new customer
const newCustomer = await createCustomer({
  company_name: 'New Company',
  contact_person: 'John Doe',
  email: 'john@company.com',
  // ... other fields
});

// Update order status
await updateOrderStatus(orderId, 'in_production');
```

### 3. Dashboard Data Structure

The dashboard now receives real data with the following structure:

```typescript
interface DashboardData {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  employees: Employee[];
  productionOrders: ProductionOrder[];
  qualityChecks: QualityCheck[];
  inventory: Inventory[];
  // ... other entities
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
```

## Field Mapping

### Customer Fields
- `companyName` → `company_name`
- `mobile` → `phone`
- `loyaltyTier` → `customer_tier`
- `orderVolume` → `customer_type`
- `outstandingAmount` → `outstanding_amount`
- `creditLimit` → `credit_limit`

### Order Fields
- `orderDate` → `order_date`
- `totalAmount` → `total_amount`
- `deliveryDate` → `delivery_date`

### Production Fields
- `productionLogs` → `production_orders`
- `efficiency` → `efficiency_percentage`

## Error Handling

All database functions include proper error handling:
- Network errors are logged to console
- Functions return empty arrays or null on errors
- UI components handle loading and error states gracefully

## Performance Considerations

- Dashboard data is fetched once and cached in component state
- Individual entity queries are optimized with proper indexing
- Search functions use database-level filtering
- Large datasets are paginated where appropriate

## Testing

To test the database integration:

1. **Empty Database Test**: Clear the database and verify components handle empty states
2. **Sample Data Test**: Seed the database and verify all components display data correctly
3. **Real-time Updates**: Make changes in the database and verify UI updates
4. **Error Handling**: Test network failures and database errors

## Migration Notes

### From Dummy Data
- Remove all imports of `dummyData.ts`
- Replace `generateAllDummyData()` calls with `getDashboardData()`
- Update field references to match database schema
- Handle loading states for async operations

### Database Requirements
- Ensure Supabase is properly configured
- Verify all required tables exist
- Check RLS (Row Level Security) policies
- Ensure proper indexes for performance

## Troubleshooting

### Common Issues

1. **No Data Displayed**
   - Check if database is empty
   - Verify Supabase connection
   - Check browser console for errors

2. **Field Mapping Errors**
   - Verify database schema matches TypeScript types
   - Check field names in database vs. code

3. **Performance Issues**
   - Add database indexes for frequently queried fields
   - Implement pagination for large datasets
   - Consider caching strategies

### Debug Tools

- Use browser developer tools to inspect network requests
- Check Supabase dashboard for query logs
- Use the Database Initializer component for testing

## Future Enhancements

- Implement real-time subscriptions for live updates
- Add data caching layer for better performance
- Create data export/import functionality
- Add comprehensive analytics and reporting
- Implement data backup and recovery tools 