import { useState, useEffect } from 'react';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, XCircle, Clock, Users, UserCheck, UserX, Plus, Edit, Trash2, Key, Mail, Phone, MapPin, Calendar, Briefcase, Settings, Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInYears, differenceInMonths } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  marital_status?: string;
  blood_group?: string;
  personal_email?: string;
  personal_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  designation: string;
  department: string;
  joining_date: string;
  employment_type: string;
  reports_to?: string;
  created_at: string;
  avatar_url?: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string;
  department: string;
  status: string;
  created_at: string;
  avatar_url?: string;
}

interface SidebarItem {
  id: string;
  title: string;
  url?: string;
  icon: string;
  parent_id?: string;
  sort_order: number;
  is_active: boolean;
  children?: SidebarItem[];
}

interface UserSidebarPermission {
  id: string;
  user_id: string;
  sidebar_item_id: string;
  can_view: boolean;
  can_edit: boolean;
  is_override: boolean;
  sidebar_item: SidebarItem;
}

export function EmployeeAccessManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [grantAccessSource, setGrantAccessSource] = useState<'row' | 'header' | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordData, setResetPasswordData] = useState({
    password: '',
    confirmPassword: ''
  });

  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [userSidebarPermissions, setUserSidebarPermissions] = useState<UserSidebarPermission[]>([]);
  const [showSidebarPermissions, setShowSidebarPermissions] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());



  const ensureSidebarItemsExist = async () => {
    try {
      console.log('Checking if sidebar items exist...');
      
      // Check if sidebar items exist, if not, create them
      const { data: existingItems, error: checkError } = await supabase
        .from('sidebar_items')
        .select('id, title')
        .limit(5);

      console.log('Existing items check result:', { existingItems, checkError });

      if (checkError) {
        console.error('Error checking sidebar items:', checkError);
        console.log('Error details:', {
          message: checkError.message,
          details: checkError.details,
          hint: checkError.hint,
          code: checkError.code
        });
        
        // If table doesn't exist, try to create it first
        if (checkError.message?.includes('relation "sidebar_items" does not exist')) {
          console.log('Sidebar items table does not exist, attempting to create it...');
          const tableCreated = await createSidebarItemsTable();
          if (!tableCreated) {
            console.log('❌ Could not create table automatically. Please run the SQL script manually.');
            return false;
          }
        } else {
          console.log('❌ Unknown error occurred. Please check your database connection and permissions.');
          return false;
        }
      }

      if (!existingItems || existingItems.length === 0) {
        console.log('No sidebar items found, creating default items...');
        
        // Create comprehensive sidebar items with correct URLs
        const defaultItems = [
          { title: 'Dashboard', url: '/dashboard', icon: 'Home', sort_order: 1, is_active: true },
          { title: 'CRM', url: null, icon: 'Users', sort_order: 2, is_active: true }, // Parent item, no URL
          { title: 'Orders', url: '/orders', icon: 'ShoppingCart', sort_order: 3, is_active: true },
          { title: 'Accounts', url: null, icon: 'Calculator', sort_order: 4, is_active: true }, // Parent item, no URL
          { title: 'Design & Printing', url: '/design', icon: 'Palette', sort_order: 5, is_active: true },
          { title: 'Procurement', url: null, icon: 'ShoppingBag', sort_order: 6, is_active: true }, // Parent item, no URL
          { title: 'Inventory', url: null, icon: 'Package', sort_order: 7, is_active: true }, // Parent item, no URL
          { title: 'Production', url: null, icon: 'Factory', sort_order: 8, is_active: true }, // Parent item, no URL
          { title: 'Quality Check', url: '/quality', icon: 'CheckCircle', sort_order: 9, is_active: true },
          { title: 'People', url: null, icon: 'Users', sort_order: 10, is_active: true }, // Parent item, no URL
          { title: 'Masters', url: null, icon: 'Package', sort_order: 11, is_active: true }, // Parent item, no URL
          { title: 'User & Roles', url: null, icon: 'UserCog', sort_order: 12, is_active: true }, // Parent item, no URL
          { title: 'Configuration', url: '/configuration', icon: 'Settings', sort_order: 13, is_active: true },
          { title: 'Reports', url: '/reports', icon: 'FileText', sort_order: 14, is_active: true }
        ];

        console.log('Inserting default items:', defaultItems.length);
        const { data: insertData, error: insertError } = await supabase
          .from('sidebar_items')
          .insert(defaultItems as any)
          .select();

        if (insertError) {
          console.error('Error creating default sidebar items:', insertError);
          return false;
        }

        console.log('Default sidebar items created successfully:', insertData?.length);
      } else {
        console.log('Sidebar items already exist:', existingItems.length);
      }

      return true;
    } catch (error) {
      console.error('Error in ensureSidebarItemsExist:', error);
      return false;
    }
  };

  const createSidebarItemsTable = async () => {
    try {
      console.log('Creating sidebar_items table...');
      
      // Try to create the table using a direct SQL approach
      // First, let's try to insert a test item to see if the table exists
      const testItem = {
        title: 'Test Item',
        url: '/test',
        icon: 'Test',
        sort_order: 999,
        is_active: true
      };

      const { data: testData, error: testError } = await supabase
        .from('sidebar_items')
        .insert([testItem] as any)
        .select();

      if (testError) {
        console.error('Table creation test failed:', testError);
        
        // If the error indicates table doesn't exist, we need to run the migration
        if (testError.message?.includes('relation "sidebar_items" does not exist')) {
          console.log('Table does not exist. Please run the migration first.');
          console.log('Run this SQL in your Supabase SQL editor:');
          console.log(`
            CREATE TABLE IF NOT EXISTS sidebar_items (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              title TEXT NOT NULL,
              url TEXT,
              icon TEXT NOT NULL,
              parent_id UUID REFERENCES sidebar_items(id) ON DELETE CASCADE,
              sort_order INTEGER DEFAULT 0,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );
          `);
          return false;
        }
        return false;
      }

      // If test succeeded, delete the test item
      if (testData && testData.length > 0) {
        await supabase
          .from('sidebar_items')
          .delete()
          .eq('title', 'Test Item' as any);
        console.log('Table exists and is accessible');
      }

      return true;
    } catch (error) {
      console.error('Error in createSidebarItemsTable:', error);
      return false;
    }
  };

  const syncSidebarItems = async () => {
    try {
      console.log('Syncing sidebar items with current sidebar configuration...');
      
      // Extract sidebar items from the actual static sidebar configuration
      // This matches the buildSidebarItems function in ErpSidebar.tsx
      const mainSidebarItems = [
        { title: 'Dashboard', url: '/', icon: 'Home', sort_order: 1, is_active: true, children: [] },
        { title: 'CRM', url: null, icon: 'Users', sort_order: 2, is_active: true, children: [
          { title: 'Create/View Customers', url: '/crm/customers', icon: 'Users', sort_order: 1, is_active: true }
        ]},
        { title: 'Orders', url: '/orders', icon: 'ShoppingCart', sort_order: 3, is_active: true, children: [
          { title: 'Custom Orders', url: '/orders', icon: 'ShoppingCart', sort_order: 1, is_active: true }
        ]},
        { title: 'Accounts', url: null, icon: 'Calculator', sort_order: 4, is_active: true, children: [
          { title: 'View Quotation', url: '/accounts/quotations', icon: 'Calculator', sort_order: 1, is_active: true },
          { title: 'Create/View Invoices', url: '/accounts/invoices', icon: 'Calculator', sort_order: 2, is_active: true },
          { title: 'Receipts', url: '/accounts/receipts', icon: 'Calculator', sort_order: 3, is_active: true },
          { title: 'Payments', url: '/accounts/payments', icon: 'Calculator', sort_order: 4, is_active: true }
        ]},
        { title: 'Design & Printing', url: '/design', icon: 'Palette', sort_order: 5, is_active: true, children: [] },
        { title: 'Procurement', url: null, icon: 'ShoppingBag', sort_order: 6, is_active: true, children: [
          { title: 'Bills of Materials', url: '/bom', icon: 'ClipboardList', sort_order: 1, is_active: true },
          { title: 'Purchase Orders', url: '/procurement/po', icon: 'ShoppingBag', sort_order: 2, is_active: true },
          { title: 'Goods Receipt Note', url: '/procurement/grn', icon: 'ClipboardList', sort_order: 3, is_active: true },
          { title: 'Return to Vendor', url: '/procurement/returns', icon: 'Truck', sort_order: 4, is_active: true },
          { title: 'Material Shortfall Alerts', url: '/procurement/alerts', icon: 'AlertTriangle', sort_order: 5, is_active: true }
        ]},
        { title: 'Inventory', url: null, icon: 'Package', sort_order: 7, is_active: true, children: [
          { title: 'Raw Material', url: '/warehouse/inventory', icon: 'Warehouse', sort_order: 1, is_active: true },
          { title: 'Product Inventory', url: '/inventory/products', icon: 'Package', sort_order: 2, is_active: true },
          { title: 'Inventory Adjustment', url: '/inventory/adjustment', icon: 'Package', sort_order: 3, is_active: true }
        ]},
        { title: 'Production', url: null, icon: 'Factory', sort_order: 8, is_active: true, children: [
          { title: 'Production Dashboard', url: '/production', icon: 'Factory', sort_order: 1, is_active: true },
          { title: 'Assign Orders', url: '/production/assign-orders', icon: 'Users', sort_order: 2, is_active: true },
          { title: 'Cutting Manager', url: '/production/cutting-manager', icon: 'Scissors', sort_order: 3, is_active: true },
          { title: 'Tailor Management', url: '/production/tailor-management', icon: 'Users', sort_order: 4, is_active: true }
        ]},
        { title: 'Quality Check', url: '/quality', icon: 'CheckCircle', sort_order: 9, is_active: true, children: [
          { title: 'Picker', url: '/production/picker', icon: 'Package', sort_order: 1, is_active: true },
          { title: 'QC', url: '/quality/checks', icon: 'CheckCircle', sort_order: 2, is_active: true },
          { title: 'Dispatch', url: '/quality/dispatch', icon: 'Truck', sort_order: 3, is_active: true }
        ]},
        { title: 'People', url: null, icon: 'Users', sort_order: 10, is_active: true, children: [
          { title: 'Dashboard', url: '/people', icon: 'BarChart3', sort_order: 1, is_active: true },
          { title: 'Our People', url: '/people/employees', icon: 'Users', sort_order: 2, is_active: true },
          { title: 'Departments', url: '/people/departments', icon: 'Building', sort_order: 3, is_active: true },
          { title: 'Designations', url: '/people/designations', icon: 'Award', sort_order: 4, is_active: true }
        ]},
        { title: 'Masters', url: null, icon: 'Package', sort_order: 11, is_active: true, children: [
          { title: 'Masters Dashboard', url: '/masters', icon: 'Package', sort_order: 1, is_active: true },
          { title: 'Product Master', url: '/masters/products', icon: 'Package', sort_order: 2, is_active: true },
          { title: 'Item Master', url: '/masters/items', icon: 'Package', sort_order: 3, is_active: true },
          { title: 'Product Categories', url: '/inventory/product-categories', icon: 'Package', sort_order: 4, is_active: true },
          { title: 'Fabric Master', url: '/inventory/fabrics', icon: 'Palette', sort_order: 5, is_active: true },
          { title: 'Size Master', url: '/inventory/size-types', icon: 'ClipboardList', sort_order: 6, is_active: true },
          { title: 'Warehouse Master', url: '/masters/warehouses', icon: 'Building', sort_order: 7, is_active: true },
          { title: 'Customer Type Master', url: '/masters/customer-types', icon: 'Users', sort_order: 8, is_active: true },
          { title: 'Supplier Master', url: '/masters/suppliers', icon: 'Truck', sort_order: 9, is_active: true }
        ]},
        { title: 'User & Roles', url: null, icon: 'UserCog', sort_order: 12, is_active: true, children: [
          { title: 'Employee Access', url: '/admin/employee-access', icon: 'Users', sort_order: 1, is_active: true },
          { title: 'Customer Access', url: '/admin/customer-access', icon: 'Users', sort_order: 2, is_active: true }
        ]},
        { title: 'Configuration', url: '/configuration', icon: 'Settings', sort_order: 13, is_active: true, children: [] },
        { title: 'Reports', url: '/reports', icon: 'FileText', sort_order: 14, is_active: true, children: [] }
      ];

      // Flatten all items (parents and children)
      const allItems: any[] = [];
      mainSidebarItems.forEach(parent => {
        // Add parent
        allItems.push({
          title: parent.title,
          url: parent.url,
          icon: parent.icon,
          parent_id: null,
          sort_order: parent.sort_order,
          is_active: parent.is_active
        });
        
        // Add children
        parent.children?.forEach(child => {
          allItems.push({
            title: child.title,
            url: child.url,
            icon: child.icon,
            parent_title: parent.title,
            child_sort_order: child.sort_order,
            is_active: child.is_active
          });
        });
      });

      // Get existing items from database
      const { data: existingItems, error: fetchError } = await supabase
        .from('sidebar_items')
        .select('id, title, url, icon, parent_id, sort_order')
        .eq('is_active', true as any);

      if (fetchError) {
        console.error('Error fetching existing sidebar items:', fetchError);
        return;
      }

      // Sync parent items
      for (const item of mainSidebarItems) {
        const existing = existingItems?.find((e: any) => e.title === item.title && e.parent_id === null);
        
        if (!existing) {
          // Insert new parent
          console.log(`Inserting new parent item: ${item.title}`);
          const { error: insertError } = await supabase
            .from('sidebar_items')
            .insert({
              title: item.title,
              url: item.url,
              icon: item.icon,
              sort_order: item.sort_order,
              is_active: item.is_active
            } as any);
          
          if (insertError) {
            console.error(`Error inserting ${item.title}:`, insertError);
          }
        } else {
          // Update if URL is different
          if ((existing as any).url !== item.url) {
            console.log(`Updating parent item: ${item.title}`);
            await supabase
              .from('sidebar_items')
              .update({ 
                url: item.url,
                icon: item.icon,
                sort_order: item.sort_order
              } as any)
              .eq('id', (existing as any).id);
          }
        }
      }

      // Sync child items
      for (const parentItem of mainSidebarItems) {
        if (!parentItem.children || parentItem.children.length === 0) continue;
        
        // Get parent ID from database
        const { data: parentData, error: parentError } = await supabase
          .from('sidebar_items')
          .select('id')
          .eq('title', parentItem.title as any)
          .is('parent_id', null)
          .maybeSingle();
        
        if (parentError) {
          console.error(`Error finding parent ${parentItem.title}:`, parentError);
          continue;
        }
        
        if (!parentData || !(parentData as any).id) {
          console.warn(`Parent ${parentItem.title} not found in database, skipping children`);
          continue;
        }
        
        // Sync each child
        for (const childItem of parentItem.children) {
          const existingChild = existingItems?.find((e: any) => 
            e.title === childItem.title && 
            e.parent_id === (parentData as any).id
          );
          
          if (!existingChild) {
            // Insert new child
            console.log(`Inserting new child item: ${childItem.title} under ${parentItem.title}`);
            const { error: insertError } = await supabase
              .from('sidebar_items')
              .insert({
                title: childItem.title,
                url: childItem.url,
                icon: childItem.icon,
                parent_id: (parentData as any).id,
                sort_order: childItem.sort_order,
                is_active: childItem.is_active
              } as any);
            
            if (insertError) {
              console.error(`Error inserting child ${childItem.title}:`, insertError);
            }
          } else {
            // Update if URL is different
            if ((existingChild as any).url !== childItem.url) {
              console.log(`Updating child item: ${childItem.title}`);
              await supabase
                .from('sidebar_items')
                .update({ 
                  url: childItem.url,
                  icon: childItem.icon,
                  sort_order: childItem.sort_order
                } as any)
                .eq('id', (existingChild as any).id);
            }
          }
        }
      }

      console.log('Sidebar items sync completed');
    } catch (error) {
      console.error('Error in syncSidebarItems:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Ensure sidebar items exist first
      await ensureSidebarItemsExist();
      
      // Sync with current sidebar configuration
      await syncSidebarItems();
      
      // Fetch employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('full_name');

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        toast.error('Failed to fetch employees.');
        setEmployees([]);
      } else {
        setEmployees((employeesData as any) || []);
      }

      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Error fetching user profiles:', profilesError);
        toast.error('Failed to fetch user profiles.');
        setUserProfiles([]);
      } else {
        setUserProfiles((profilesData as any) || []);
      }

      // Fetch sidebar items
      const { data: sidebarData, error: sidebarError } = await supabase
        .from('sidebar_items')
        .select('*')
        .eq('is_active', true as any)
        .order('sort_order');

      console.log('Sidebar items fetch result:', { sidebarData, sidebarError });
      console.log('Total items fetched:', sidebarData?.length);
      console.log('Items with children:', sidebarData?.filter((item: any) => item.parent_id));

      if (sidebarError) {
        console.error('Error fetching sidebar items:', sidebarError);
        toast.error('Failed to fetch sidebar items.');
        setSidebarItems([]);
      } else {
        // Organize items into hierarchy
        const itemsMap = new Map<string, SidebarItem>();
        const rootItems: SidebarItem[] = [];
        
        (sidebarData as any)?.forEach((item: any) => {
          itemsMap.set(item.id, { ...item, children: [] });
        });
        
        (sidebarData as any)?.forEach((item: any) => {
          if (item.parent_id) {
            const parent = itemsMap.get(item.parent_id);
            if (parent) {
              parent.children?.push(itemsMap.get(item.id)!);
            }
          } else {
            rootItems.push(itemsMap.get(item.id)!);
          }
        });

        // Sort children within each parent
        itemsMap.forEach((item) => {
          if (item.children && item.children.length > 0) {
            item.children.sort((a, b) => a.sort_order - b.sort_order);
          }
        });

        // Sort root items
        rootItems.sort((a, b) => a.sort_order - b.sort_order);

        console.log('Processed sidebar items:', { 
          rootItems: rootItems.length, 
          totalItems: sidebarData?.length,
          itemsWithChildren: rootItems.filter(item => item.children && item.children.length > 0).length
        });
        console.log('Root items with children:', rootItems.filter(item => item.children && item.children.length > 0).map(item => ({ title: item.title, children: item.children?.length })));
        
        setSidebarItems(rootItems);
      }

      // Fetch user sidebar permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('user_sidebar_permissions')
        .select(`
          *,
          sidebar_item:sidebar_items(*)
        `);

      if (permissionsError) {
        console.error('Error fetching user sidebar permissions:', permissionsError);
        toast.error('Failed to fetch user sidebar permissions.');
        setUserSidebarPermissions([]);
      } else {
        setUserSidebarPermissions((permissionsData as any) || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const getAvatarUrl = (employee: Employee) => {
    // First check if employee has avatar_url directly
    if (employee.avatar_url) {
      return employee.avatar_url;
    }
    
    // Check if there's a profile with avatar_url for this employee
    const profile = userProfiles.find(p => {
      // Try to match by employee_id if profiles have it, or by name/email
      return p.full_name === employee.full_name || 
             (employee.personal_email && p.email === employee.personal_email);
    });
    
    if (profile?.avatar_url) {
      return profile.avatar_url;
    }
    
    // Fallback to placeholder images
    const avatars = [
      'photo-1581092795360-fd1ca04f0952',
      'photo-1485827404703-89b55fcc595e', 
      'photo-1581091226825-a6a2a5aee158',
      'photo-1501286353178-1ec881214838'
    ];
    const index = employee.full_name.charCodeAt(0) % avatars.length;
    return `https://images.unsplash.com/${avatars[index]}?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=200&h=200&q=80`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const setupDefaultEmployeePermissions = async (userId: string) => {
    try {
      // Check if user already has permissions
      const { data: existingPermissions, error: checkError } = await supabase
        .from('user_sidebar_permissions')
        .select('id')
        .eq('user_id', userId as any)
        .limit(1);

      if (checkError) {
        console.error('Error checking existing permissions:', checkError);
        return;
      }

      // If user already has permissions, don't add default ones
      if (existingPermissions && existingPermissions.length > 0) {
        console.log('User already has permissions, skipping default setup');
        return;
      }

      // Get basic sidebar items that employees should have access to by default
      const { data: basicItems, error: itemsError } = await supabase
        .from('sidebar_items')
        .select('id')
        .in('title', ['Dashboard', 'Orders', 'Production', 'Quality Check'] as any)
        .eq('is_active', true as any);

      if (itemsError) {
        console.error('Error fetching basic sidebar items:', itemsError);
        return;
      }

      if (basicItems && basicItems.length > 0) {
        // Create default permissions for basic items
        const permissions = basicItems.map((item: any) => ({
          user_id: userId,
          sidebar_item_id: item.id,
          can_view: true,
          can_edit: false,
          is_override: false
        }));

        const { error: permError } = await supabase
          .from('user_sidebar_permissions')
          .insert(permissions as any);

        if (permError) {
          console.error('Error setting up default permissions:', permError);
        } else {
          console.log('Default permissions set up for new employee');
        }
      }
    } catch (error) {
      console.error('Error in setupDefaultEmployeePermissions:', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newUserData.password !== newUserData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    try {
      setProcessingUser('creating');
      
      // Create user account using admin signup (doesn't auto-login)
      let authData, authError;
      
      try {
        // Store current admin session before creating user
        const { data: currentSession } = await supabase.auth.getSession();
        const adminUserId = currentSession?.session?.user?.id;
        
        if (!adminUserId) {
          throw new Error('Admin session not found. Please log in again.');
        }
        
        // Try to use admin API first (if available)
        try {
          const adminResult = await supabase.auth.admin.createUser({
            email: newUserData.email,
            password: newUserData.password,
            email_confirm: true,
            user_metadata: {
              full_name: selectedEmployee.full_name,
              phone: selectedEmployee.personal_phone,
              department: selectedEmployee.department,
              created_by_admin: true
            }
          });
          
          if (adminResult.error) {
            throw adminResult.error;
          }
          
          authData = adminResult.data;
          authError = null;
        } catch (adminError: any) {
          // Fallback to signup if admin API not available
          console.warn('Admin API not available, using signup:', adminError);
          const signupResult = await supabase.auth.signUp({
            email: newUserData.email,
            password: newUserData.password,
            options: {
              data: {
                full_name: selectedEmployee.full_name,
                phone: selectedEmployee.personal_phone,
                department: selectedEmployee.department,
                created_by_admin: true
              },
              emailRedirectTo: `${window.location.origin}/login`
            }
          });
          authData = signupResult.data;
          authError = signupResult.error;
          
          // Immediately sign out the new user and restore admin session
          if (authData?.user) {
            await supabase.auth.signOut();
            // Restore admin session
            if (currentSession?.session) {
              await supabase.auth.setSession(currentSession.session);
            }
          }
        }
        
        if (authError) {
          throw new Error(`Account creation failed: ${authError.message}`);
        }
      } catch (signupError: any) {
        console.error('Signup failed:', signupError);
        throw new Error(signupError.message || 'Unable to create user account. Please try again or contact your system administrator.');
      }

      // Handle the result after restoring admin session
      if (authError) {
        // If user already exists, try to find their user_id and create profile
        if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
          // Try to get user by email from profiles table
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('email', newUserData.email as any)
            .single();

          if (existingProfile && 'user_id' in existingProfile) {
            // Update existing profile
            const { error: profileError } = await supabase
              .from('profiles')
              .update({
                full_name: selectedEmployee.full_name,
                phone: selectedEmployee.personal_phone,
                department: selectedEmployee.department,
                role: 'employee',
                status: 'approved'
              } as any)
              .eq('user_id', (existingProfile as any).user_id);

            if (profileError) {
              throw new Error(profileError.message || 'Failed to update user profile');
            }

            // Set up default permissions for the existing employee if they don't have any
            await setupDefaultEmployeePermissions((existingProfile as any).user_id);

            toast.success('Employee profile updated successfully!');
          } else {
            throw new Error('User exists but no profile found. Please contact administrator.');
          }
        } else {
          throw new Error(authError.message || 'Failed to create user account');
        }
      } else if (authData.user) {
        // New user created successfully, create profile
        // Note: We already signed out the new user and restored admin session above
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: authData.user.id,
            full_name: selectedEmployee.full_name,
            email: newUserData.email,
            phone: selectedEmployee.personal_phone,
            department: selectedEmployee.department,
            role: 'employee',
            status: 'approved'
          } as any);

        if (profileError) {
          throw new Error(profileError.message || 'Failed to create user profile');
        }

        // Set up default permissions for the new employee
        await setupDefaultEmployeePermissions(authData.user.id);

        // Send welcome email with credentials
        try {
          // Use Supabase's email service to send welcome email
          // Note: This requires email templates to be configured in Supabase dashboard
          const { error: emailError } = await supabase.functions.invoke('send-welcome-email', {
            body: {
              email: newUserData.email,
              password: newUserData.password,
              full_name: selectedEmployee.full_name,
              employee_name: selectedEmployee.full_name
            }
          });
          
          if (emailError) {
            console.warn('Failed to send welcome email:', emailError);
            // Don't fail the entire operation if email fails
            toast.success(`Employee account created! Email: ${newUserData.email}, Password: [provided during creation]. Welcome email may not have been sent.`);
          } else {
            toast.success('Employee account created successfully! Welcome email with credentials has been sent.');
          }
        } catch (emailErr) {
          // If email function doesn't exist or fails, just show success message
          console.warn('Email sending not available:', emailErr);
          toast.success(`Employee account created successfully! Email: ${newUserData.email}. They can login immediately with the provided credentials.`);
        }
      } else {
        throw new Error('User creation failed - no user data returned');
      }

      setShowCreateForm(false);
      setGrantAccessSource(null);
      setNewUserData({ email: '', password: '', confirmPassword: '' });
      setSelectedEmployee(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error creating user account:', error);
      toast.error(error.message || 'Failed to create user account');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user account? This will remove their system access.')) return;

    try {
      setProcessingUser(userId);
      
      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId as any);

      toast.success('User account deleted successfully');
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user account');
    } finally {
      setProcessingUser(null);
    }
  };

  const getUserStatus = (employee: Employee) => {
    const hasAccount = userProfiles.some(profile => 
      profile.email === employee.personal_email || 
      profile.full_name === employee.full_name
    );
    
    if (hasAccount) {
      const profile = userProfiles.find(p => 
        p.email === employee.personal_email || 
        p.full_name === employee.full_name
      );
      return {
        status: 'active',
        label: 'Active',
        badge: <Badge className="bg-success text-success-foreground">Active</Badge>,
        profile
      };
    } else {
      return {
        status: 'no-access',
        label: 'No Access',
        badge: <Badge variant="outline">No Access</Badge>
      };
    }
  };

  const getExperienceText = (joiningDate: string) => {
    const joinDate = new Date(joiningDate);
    const now = new Date();
    const years = differenceInYears(now, joinDate);
    const months = differenceInMonths(now, joinDate) % 12;
    
    if (years > 0) {
      return `${years} Yr${years > 1 ? 's' : ''}, ${months} Month${months !== 1 ? 's' : ''}`;
    } else {
      return `${months} Month${months !== 1 ? 's' : ''}`;
    }
  };

  const updateUserSidebarPermission = async (userId: string, sidebarItemId: string, canView: boolean, canEdit: boolean) => {
    try {
      // Find the item being updated to check if it has a parent
      const findItemWithParent = (items: SidebarItem[]): SidebarItem | null => {
        for (const item of items) {
          if (item.id === sidebarItemId) return item;
          if (item.children && item.children.length > 0) {
            const found = findItemWithParent(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      const item = findItemWithParent(sidebarItems);
      const existingPermission = getUserSidebarPermission(userId, sidebarItemId);
      
      // If unchecking (canView: false) and permission exists, delete it
      if (!canView && existingPermission) {
        const { error: deleteError } = await supabase
          .from('user_sidebar_permissions')
          .delete()
          .eq('user_id', userId as any)
          .eq('sidebar_item_id', sidebarItemId as any)
          .eq('is_override', true as any);
        
        if (deleteError) {
          throw deleteError;
        }
        
        toast.success('Permission removed successfully');
        await fetchData();
        return;
      }
      
      // If checking (canView: true), upsert the permission
      if (canView) {
        // First, try to delete any existing permission for this user/item combination
        // This handles cases where there might be a record with is_override=false or true
        const { error: deleteError } = await supabase
          .from('user_sidebar_permissions')
          .delete()
          .eq('user_id', userId as any)
          .eq('sidebar_item_id', sidebarItemId as any);
        
        // Log delete error but don't fail - it might not exist
        if (deleteError && !deleteError.message?.includes('No rows')) {
          console.warn('Error deleting existing permission:', deleteError);
        }

        // Insert the new permission
        const { error: insertError } = await supabase
          .from('user_sidebar_permissions')
          .insert({
            user_id: userId,
            sidebar_item_id: sidebarItemId,
            can_view: true,
            can_edit: canEdit,
            is_override: true
          } as any);

        if (insertError) {
          // If insert fails due to conflict, try update instead
          if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
            const { error: updateError } = await supabase
              .from('user_sidebar_permissions')
              .update({
                can_view: true,
                can_edit: canEdit,
                is_override: true
              } as any)
              .eq('user_id', userId as any)
              .eq('sidebar_item_id', sidebarItemId as any);
            
            if (updateError) {
              throw updateError;
            }
          } else {
            throw insertError;
          }
        }

        // If granting access to a child item, also grant access to its parent
        if (item && item.parent_id) {
          console.log(`Auto-granting access to parent for ${item.title}`);
          // Delete any existing parent permission first
          await supabase
            .from('user_sidebar_permissions')
            .delete()
            .eq('user_id', userId as any)
            .eq('sidebar_item_id', item.parent_id as any);
          
          // Insert parent permission
          const { error: parentInsertError } = await supabase
            .from('user_sidebar_permissions')
            .insert({
              user_id: userId,
              sidebar_item_id: item.parent_id,
              can_view: true,
              can_edit: false,
              is_override: true
            } as any);
          
          if (parentInsertError) {
            // If insert fails due to conflict, try update instead
            if (parentInsertError.code === '23505' || parentInsertError.message?.includes('duplicate') || parentInsertError.message?.includes('unique')) {
              const { error: parentUpdateError } = await supabase
                .from('user_sidebar_permissions')
                .update({
                  can_view: true,
                  can_edit: false,
                  is_override: true
                } as any)
                .eq('user_id', userId as any)
                .eq('sidebar_item_id', item.parent_id as any);
              
              if (parentUpdateError) {
                console.error('Error updating parent permission:', parentUpdateError);
                // Don't throw - parent permission is secondary
              }
            } else {
              console.error('Error inserting parent permission:', parentInsertError);
              // Don't throw - parent permission is secondary
            }
          }
        }
        
        toast.success('Permission granted! Parent menu access also granted.');
        await fetchData();
      }
    } catch (error) {
      console.error('Error updating sidebar permission:', error);
      toast.error('Failed to update sidebar permission');
    }
  };

  const deleteUserSidebarPermission = async (permissionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sidebar_permissions')
        .delete()
        .eq('id', permissionId as any);

      if (error) throw error;
      
      toast.success('Sidebar permission removed successfully');
      await fetchData();
    } catch (error) {
      console.error('Error deleting sidebar permission:', error);
      toast.error('Failed to delete sidebar permission');
    }
  };

  const getUserSidebarPermission = (userId: string, sidebarItemId: string) => {
    return userSidebarPermissions.find(
      perm => perm.user_id === userId && perm.sidebar_item_id === sidebarItemId && perm.is_override
    );
  };

  const renderSidebarItem = (item: SidebarItem, userId: string, level = 0) => {
    const permission = getUserSidebarPermission(userId, item.id);
    // Only show checked if explicit user override exists (is_override: true)
    let canView = permission?.can_view ?? false;
    const canEdit = permission?.can_edit ?? false;

    // If this item has children and any child is selected, also check the parent
    if (item.children && item.children.length > 0) {
      const hasChildSelected = item.children.some(child => {
        const childPermission = getUserSidebarPermission(userId, child.id);
        return childPermission?.can_view ?? false;
      });
      if (hasChildSelected && !canView) {
        canView = true; // Show parent as checked if any child is checked
      }
    }

    // Render as table row
    return (
      <>
        {/* Parent/Item row */}
        <div 
          key={item.id} 
          className={`flex items-center gap-2 py-2 px-3 hover:bg-muted/30 ${level > 0 ? 'ml-6' : 'border-b'}`}
          style={{ marginLeft: level > 0 ? `${level * 24}px` : '0' }}
        >
          <input
            type="checkbox"
            checked={canView}
            onChange={(e) => {
              updateUserSidebarPermission(userId, item.id, e.target.checked, canEdit);
            }}
            className="rounded w-4 h-4"
          />
          <div className="flex-1 flex items-center gap-2">
            {level > 0 && (
              <span className="text-muted-foreground text-xs">└─</span>
            )}
            <span className="text-sm font-medium">{item.title}</span>
            {item.url && (
              <Badge variant="outline" className="text-xs">
                {item.url}
              </Badge>
            )}
            {permission?.is_override && (
              <Badge variant="secondary" className="text-xs">
                Custom
              </Badge>
            )}
            {!permission && canView && (
              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                Auto
              </Badge>
            )}
          </div>
        </div>
        
        {/* Render children recursively */}
        {item.children && item.children.length > 0 && (
          <div className="space-y-1">
            {item.children.map(child => (
              <React.Fragment key={child.id}>
                {renderSidebarItem(child, userId, level + 1)}
              </React.Fragment>
            ))}
          </div>
        )}
      </>
    );
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-sync sidebar URLs on component mount
  useEffect(() => {
    const autoSync = async () => {
      try {
        console.log('🔄 Auto-syncing sidebar URLs...');
        await syncSidebarItems();
        console.log('✅ Auto-sync completed');
      } catch (error) {
        console.error('❌ Auto-sync failed:', error);
      }
    };
    
    // Run auto-sync after a short delay to ensure component is mounted
    const timer = setTimeout(autoSync, 1000);
    return () => clearTimeout(timer);
  }, []);

  const stats = {
    total: employees.length,
    withAccess: employees.filter(emp => getUserStatus(emp).status === 'active').length,
    withoutAccess: employees.filter(emp => getUserStatus(emp).status === 'no-access').length
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {/* <div>
          <h1 className="text-3xl font-bold">Employee Access Management</h1>
          <p className="text-gray-600 mt-1">
            Create user accounts with passwords for employees and manage their system access
          </p>
        </div> */}
                        <div className="flex items-center space-x-4">
              {/* <div className="text-sm text-muted-foreground">
                <p>💡 <strong>Note:</strong> You can now create user accounts with passwords for employees. They can log in immediately using their email and password.</p>
                <p className="mt-1">🔑 <strong>Role Mapping:</strong> Roles from the roles table are automatically mapped to system permissions.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={testDatabaseAccess}
                  className="mt-2"
                >
                  🔍 Test Database Access
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== SIMPLE PROFILE CREATION TEST ===');
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        console.error('No authenticated user');
                        return;
                      }
                      
                      const testData = {
                        user_id: user.id,
                        full_name: 'TEST PROFILE',
                        email: 'test@test.com',
                        role: 'sales',
                        status: 'approved'
                      };
                      
                      console.log('Attempting to create test profile with:', testData);
                      const { error } = await supabase.from('profiles').insert(testData);
                      
                      if (error) {
                        console.error('Test profile creation failed:', error);
                      } else {
                        console.log('Test profile created successfully!');
                        // Clean up - delete the test profile
                        await supabase.from('profiles').delete().eq('email', 'test@test.com');
                        console.log('Test profile cleaned up');
                      }
                    } catch (err) {
                      console.error('Test failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🧪 Test Profile Creation
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== TEST AUTH USER CREATION ===');
                      
                      // Try to create a minimal auth user
                      const { data, error } = await supabase.auth.signUp({
                        email: 'testauth@test.com',
                        password: 'testpass123'
                      });
                      
                      if (error) {
                        console.error('Auth user creation test failed:', error);
                      } else {
                        console.log('Auth user creation test successful:', data);
                        // Clean up - delete the test user if possible
                        if (data.user) {
                          console.log('Test auth user created with ID:', data.user.id);
                        }
                      }
                    } catch (err) {
                      console.error('Auth test failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🔐 Test Auth Creation
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== CHECK AVAILABLE ROLES ===');
                      
                      // Check what roles are available in the database
                      const { data: rolesData, error: rolesError } = await supabase
                        .from('roles')
                        .select('*')
                        .order('name');
                      
                      if (rolesError) {
                        console.error('Error fetching roles:', rolesError);
                      } else {
                        console.log('Available roles from roles table:', rolesData);
                        console.log('Role names:', rolesData?.map(r => r.name));
                      }
                      
                      // Test what user_role enum values are actually accepted by the database
                      console.log('Testing user_role enum values...');
                      
                      // First, let's check what the actual enum values are by looking at existing profiles
                      console.log('Checking existing profiles for valid role values...');
                      const { data: existingProfiles, error: profilesError } = await supabase
                        .from('profiles')
                        .select('role')
                        .limit(10);
                      
                      if (profilesError) {
                        console.error('Error fetching existing profiles:', profilesError);
                      } else {
                        console.log('Existing profile roles:', existingProfiles);
                        const uniqueRoles = [...new Set(existingProfiles.map(p => p.role))];
                        console.log('Unique role values in database:', uniqueRoles);
                      }
                      
                      // Now test with the actual enum values we found
                      const testRoles = ['admin', 'sales', 'production', 'quality', 'dispatch', 'manager', 'customer'];
                      
                      // Test with different status values to see what's allowed
                      console.log('Testing with different status values...');
                      const testStatuses = ['pending', 'approved', 'rejected', 'active', 'inactive'];
                      
                      for (const testStatus of testStatuses) {
                        try {
                          const testData = {
                            user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
                            full_name: 'TEST STATUS',
                            email: `teststatus${testStatus}@test.com`,
                            role: 'admin', // Use admin since we know it's valid
                            status: testStatus
                          };
                          
                          const { error: insertError } = await supabase
                            .from('profiles')
                            .insert(testData);
                          
                          if (insertError) {
                            if (insertError.message.includes('check constraint "profiles_status_check"')) {
                              console.log(`Status '${testStatus}': ❌ NOT VALID STATUS VALUE`);
                            } else {
                              console.log(`Status '${testStatus}': ❌ ${insertError.message}`);
                            }
                          } else {
                            console.log(`Status '${testStatus}': ✅ VALID STATUS VALUE`);
                            // Clean up the test profile
                            await supabase.from('profiles').delete().eq('email', `teststatus${testStatus}@test.com`);
                          }
                        } catch (err) {
                          console.log(`Status '${testStatus}': ❌ Error testing`);
                        }
                      }
                      
                      // Test with different role values to find valid ones
                      console.log('Testing different role values...');
                      const possibleRoles = ['user', 'employee', 'staff', 'supervisor', 'lead', 'coordinator', 'assistant'];
                      
                      for (const testRole of possibleRoles) {
                        try {
                          const testData = {
                            user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
                            full_name: 'TEST ROLE',
                            email: `testrole${testRole}@test.com`,
                            role: testRole,
                            status: 'pending' // Use pending since we'll test status separately
                          };
                          
                          const { error: insertError } = await supabase
                            .from('profiles')
                            .insert(testData);
                          
                          if (insertError) {
                            if (insertError.message.includes('invalid input value for enum user_role')) {
                              console.log(`Role '${testRole}': ❌ NOT VALID ENUM VALUE`);
                            } else {
                              console.log(`Role '${testRole}': ✅ VALID ENUM VALUE (other constraint failed)`);
                            }
                          } else {
                            console.log(`Role '${testRole}': ✅ VALID ENUM VALUE`);
                            // Clean up the test profile
                            await supabase.from('profiles').delete().eq('email', `testrole${testRole}@test.com`);
                          }
                        } catch (err) {
                          console.log(`Role '${testRole}': ❌ Error testing`);
                        }
                      }
                    } catch (err) {
                      console.error('Role check failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🎭 Check Available Roles
                </Button>
              </div> */}
              <Dialog open={showCreateForm} onOpenChange={(open) => {
                setShowCreateForm(open);
                if (!open) {
                  setGrantAccessSource(null);
                  setSelectedEmployee(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => setGrantAccessSource('header')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create User Account
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create User Account for Employee</DialogTitle>
                    <DialogDescription>
                      Create a system account for this employee with login credentials
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    {grantAccessSource === 'header' && (
                      <div className="space-y-2">
                        <Label>Select Employee</Label>
                        <Select onValueChange={(employeeId) => {
                          const employee = employees.find(emp => emp.id === employeeId);
                          setSelectedEmployee(employee || null);
                          if (employee?.personal_email) {
                            setNewUserData(prev => ({ ...prev, email: employee.personal_email }));
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose an employee" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees
                              .filter(emp => getUserStatus(emp).status === 'no-access')
                              .map((employee) => (
                                <SelectItem key={employee.id} value={employee.id}>
                                  {employee.full_name} - {employee.department}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {selectedEmployee && (
                      <div className="p-3 bg-muted rounded-lg space-y-2">
                        <p className="text-sm font-medium">{selectedEmployee.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEmployee.designation} • {selectedEmployee.department}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEmployee.personal_email || 'No email provided'}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Email Address *</Label>
                      <Input
                        type="email"
                        value={newUserData.email}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter email address"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={newUserData.password}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Confirm Password *</Label>
                      <Input
                        type="password"
                        value={newUserData.confirmPassword}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm password"
                        required
                      />
                    </div>

                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Admin Account Creation:</strong> This employee will be assigned the default 'employee' role. 
                          They will receive an email confirmation link to activate their account.
                          You can customize their sidebar permissions after account creation.
                        </p>
                      </div>
                    
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCreateForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={processingUser === 'creating' || !selectedEmployee}
                      >
                        {processingUser === 'creating' ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With System Access</p>
                <p className="text-2xl font-bold">{stats.withAccess}</p>
              </div>
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">No Access</p>
                <p className="text-2xl font-bold">{stats.withoutAccess}</p>
              </div>
              <UserX className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Access Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Access Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="space-y-2">
                      <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                        <Users className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">No employees found</h3>
                      <p className="text-muted-foreground">Add employees to the system to manage their access.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((employee) => {
                  const accessStatus = getUserStatus(employee);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={getAvatarUrl(employee)} alt={employee.full_name} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                              {getInitials(employee.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{employee.full_name}</div>
                            <div className="text-sm text-muted-foreground">{employee.employee_code}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {employee.personal_email && (
                            <div className="flex items-center text-sm">
                              <Mail className="w-3 h-3 mr-1 text-muted-foreground" />
                              {employee.personal_email}
                            </div>
                          )}
                          <div className="flex items-center text-sm">
                            <Phone className="w-3 h-3 mr-1 text-muted-foreground" />
                            {employee.personal_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{employee.department}</div>
                          <div className="text-sm text-muted-foreground">{employee.designation}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">{getExperienceText(employee.joining_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            Since {format(new Date(employee.joining_date), 'MMM yyyy')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {accessStatus.badge}
                        {accessStatus.profile && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Role: {accessStatus.profile.role}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {accessStatus.status === 'no-access' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedEmployee(employee);
                                setNewUserData({
                                  email: employee.personal_email || '',
                                  password: '',
                                  confirmPassword: ''
                                });
                                setGrantAccessSource('row');
                                setShowCreateForm(true);
                              }}
                            >
                              <Key className="w-4 h-4 mr-1" />
                              Grant Access
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSidebarPermissions(accessStatus.profile!.user_id)}
                              >
                                <Settings className="w-4 h-4 mr-1" />
                                Permissions
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setResetPasswordUserId(accessStatus.profile!.user_id);
                                  setResetPasswordData({ password: '', confirmPassword: '' });
                                }}
                                disabled={processingUser === accessStatus.profile!.user_id}
                              >
                                <Key className="w-4 h-4 mr-1" />
                                Reset Password
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(accessStatus.profile!.user_id)}
                                disabled={processingUser === accessStatus.profile!.user_id}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sidebar Permissions Dialog */}
      <Dialog open={!!showSidebarPermissions} onOpenChange={() => setShowSidebarPermissions(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage Sidebar Permissions
              {showSidebarPermissions && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  for {userProfiles.find(p => p.user_id === showSidebarPermissions)?.full_name}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Configure which sidebar options this employee can access. These permissions override role-based permissions.
            </DialogDescription>
          </DialogHeader>
          
          {showSidebarPermissions && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    Check the boxes to grant access to specific sidebar options. Sub-menus are shown indented under their parent menu.
                  </p>
                  <Button 
                    onClick={async () => {
                      console.log('🔄 Forcing sidebar sync...');
                      await syncSidebarItems();
                      await fetchData();
                      toast.success('Sidebar items synced! Sub-menus should now be visible.');
                    }}
                    variant="outline"
                    size="sm"
                  >
                    🔄 Sync Sub-Menus
                  </Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {sidebarItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-2">No sidebar items found</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Sidebar items: {sidebarItems.length} | 
                        Loading: {loading ? 'Yes' : 'No'}
                      </p>
                      <div className="space-y-2">
                        <Button 
                          onClick={fetchData}
                          variant="outline"
                          size="sm"
                        >
                          Refresh Sidebar Items
                        </Button>
                        <Button 
                          onClick={syncSidebarItems}
                          variant="outline"
                          size="sm"
                        >
                          Sync with Current Sidebar
                        </Button>
                        <Button 
                          onClick={async () => {
                            console.log('🔧 Manual setup triggered...');
                            await ensureSidebarItemsExist();
                            await fetchData();
                          }}
                          variant="default"
                          size="sm"
                        >
                          Force Setup Sidebar Items
                        </Button>
                        <Button 
                          onClick={async () => {
                            console.log('🔍 Debugging sidebar permissions...');
                            if (showSidebarPermissions) {
                              const { data: userPerms } = await supabase
                                .from('user_sidebar_permissions')
                                .select(`
                                  *,
                                  sidebar_item:sidebar_items(*)
                                `)
                                .eq('user_id', showSidebarPermissions as any);
                              
                              console.log('👤 User permissions for', showSidebarPermissions, ':', userPerms);
                              
                              const { data: allItems } = await supabase
                                .from('sidebar_items')
                                .select('*')
                                .eq('is_active', true as any)
                                .order('sort_order');
                              
                              console.log('📋 All sidebar items:', allItems);
                            }
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Debug Permissions
                        </Button>
                        <Button 
                          onClick={async () => {
                            console.log('🔄 Manual sync triggered...');
                            await syncSidebarItems();
                            await fetchData();
                            toast.success('Sidebar URLs synced successfully');
                          }}
                          variant="default"
                          size="sm"
                        >
                          Fix NULL URLs
                        </Button>
                        <Button 
                          onClick={async () => {
                            console.log('🔄 Testing URL sync...');
                            // Test the sync function directly
                            const currentSidebarItems = [
                              { title: 'Dashboard', url: '/dashboard', icon: 'Home', sort_order: 1, is_active: true },
                              { title: 'Orders', url: '/orders', icon: 'ShoppingCart', sort_order: 3, is_active: true },
                              { title: 'Design & Printing', url: '/design', icon: 'Palette', sort_order: 5, is_active: true },
                              { title: 'Quality Check', url: '/quality', icon: 'CheckCircle', sort_order: 9, is_active: true },
                              { title: 'Configuration', url: '/configuration', icon: 'Settings', sort_order: 13, is_active: true },
                              { title: 'Reports', url: '/reports', icon: 'FileText', sort_order: 14, is_active: true }
                            ];
                            
                            const { data: existingItems } = await supabase
                              .from('sidebar_items')
                              .select('title, url')
                              .eq('is_active', true as any);
                            
                            console.log('📊 Current database items:', existingItems);
                            
                            for (const item of currentSidebarItems) {
                              const existing = existingItems?.find((e: any) => e.title === item.title);
                              if (existing) {
                                console.log(`${item.title}: DB="${(existing as any).url}" → Expected="${item.url}"`);
                                if ((existing as any).url !== item.url) {
                                  await supabase
                                    .from('sidebar_items')
                                    .update({ url: item.url } as any)
                                    .eq('title', item.title as any);
                                  console.log(`✅ Updated ${item.title}`);
                                }
                              }
                            }
                            
                            toast.success('URL sync test completed - check console');
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Test URL Sync
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sidebarItems.length === 0 && (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                          Click "🔄 Sync Sub-Menus" button above to load sub-menu items
                        </div>
                      )}
                      {sidebarItems.map(item => renderSidebarItem(item, showSidebarPermissions))}
                    </div>
                  )}
                </div>
              </div>

              {/* Current Custom Permissions */}
              <div className="space-y-2">
                <h4 className="font-medium">Current Custom Permissions</h4>
                <div className="space-y-2">
                  {userSidebarPermissions
                    .filter(perm => perm.user_id === showSidebarPermissions && perm.is_override)
                    .map((permission) => (
                      <div key={permission.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{permission.sidebar_item.title}</span>
                          {permission.sidebar_item.url && (
                            <Badge variant="outline" className="text-xs">
                              {permission.sidebar_item.url}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            Custom
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteUserSidebarPermission(permission.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  {userSidebarPermissions.filter(perm => perm.user_id === showSidebarPermissions && perm.is_override).length === 0 && (
                    <p className="text-sm text-muted-foreground">No custom permissions set</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!resetPasswordUserId} onOpenChange={(open) => {
        if (!open) {
          setResetPasswordUserId(null);
          setResetPasswordData({ password: '', confirmPassword: '' });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Employee Password</DialogTitle>
            <DialogDescription>
              Set a new password for this employee. They will need to use this password to login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (resetPasswordData.password !== resetPasswordData.confirmPassword) {
              toast.error('Passwords do not match');
              return;
            }
            if (resetPasswordData.password.length < 6) {
              toast.error('Password must be at least 6 characters long');
              return;
            }
            
            try {
              setProcessingUser(resetPasswordUserId!);
              const { data, error } = await supabase.functions.invoke('reset-employee-password', {
                body: {
                  userId: resetPasswordUserId,
                  newPassword: resetPasswordData.password
                }
              });
              
              if (error) {
                // Check if function doesn't exist or isn't deployed
                if (error.message?.includes('Edge Function') || error.message?.includes('not found') || error.message?.includes('CORS')) {
                  toast.error('Password reset function is not deployed. Please deploy the reset-employee-password edge function first.');
                  console.error('Edge function not found. Deploy it using: supabase functions deploy reset-employee-password');
                } else {
                  throw error;
                }
                return;
              }
              
              if (data?.success) {
                toast.success('Password reset successfully!');
                setResetPasswordUserId(null);
                setResetPasswordData({ password: '', confirmPassword: '' });
              } else {
                throw new Error(data?.error || 'Failed to reset password');
              }
            } catch (error: any) {
              console.error('Error resetting password:', error);
              if (error.message?.includes('Edge Function') || error.message?.includes('CORS')) {
                toast.error('Password reset function is not available. Please contact your administrator to deploy the function.');
              } else {
                toast.error(error.message || 'Failed to reset password');
              }
            } finally {
              setProcessingUser(null);
            }
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password *</Label>
              <Input
                type="password"
                value={resetPasswordData.password}
                onChange={(e) => setResetPasswordData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter new password"
                required
                minLength={6}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Confirm Password *</Label>
              <Input
                type="password"
                value={resetPasswordData.confirmPassword}
                onChange={(e) => setResetPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                required
                minLength={6}
              />
            </div>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetPasswordUserId(null);
                  setResetPasswordData({ password: '', confirmPassword: '' });
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={processingUser === resetPasswordUserId}
              >
                {processingUser === resetPasswordUserId ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
