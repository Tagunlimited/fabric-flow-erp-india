import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, UserPlus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { calculateLifetimeValue, formatCurrency } from '@/lib/utils';
import { CustomerForm } from './CustomerForm';
import { usePageState } from "@/contexts/AppCacheContext";

interface Customer {
  id: string;
  company_name: string;
  contact_person?: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  pan?: string;
}

interface CustomerSearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  onCustomerSelect?: (customer: Customer | null) => void;
  placeholder?: string;
  onCreateCustomer?: (customer: Customer) => void;
  cacheKey?: string;
}

export function CustomerSearchSelect({ 
  value, 
  onValueChange, 
  onCustomerSelect,
  placeholder = "Select customer...",
  onCreateCustomer,
  cacheKey = "customerSearchSelect"
}: CustomerSearchSelectProps) {
  const { state: dialogState, updateState: updateDialogState } = usePageState(cacheKey, {
    open: false,
    showCreateCustomer: false
  });

  const open = dialogState?.open ?? false;
  const showCreateCustomer = dialogState?.showCreateCustomer ?? false;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLifetimeValues, setCustomerLifetimeValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const setOpen = (value: boolean) => {
    updateDialogState(prev => ({
      ...(prev || { open: false, showCreateCustomer: false }),
      open: value
    }));
  };

  const setShowCreateCustomer = (value: boolean) => {
    updateDialogState(prev => ({
      ...(prev || { open: false, showCreateCustomer: false }),
      showCreateCustomer: value
    }));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      searchCustomers(searchTerm);
    } else {
      fetchCustomers();
    }
  }, [searchTerm]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('company_name')
        .limit(50);

      if (error) throw error;
      setCustomers((data as unknown as Customer[]) || []);
      
      // Fetch lifetime values for customers
      if (data && data.length > 0) {
        await fetchCustomerLifetimeValues(data as unknown as Customer[]);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerLifetimeValues = async (customerList: Customer[]) => {
    try {
      const customerIds = customerList.map(c => c.id);
      const values: Record<string, number> = {};

      // Fetch invoices for all customers
      const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('customer_id, total_amount')
        .in('customer_id', customerIds);

      if (invoiceError) {
        console.warn('Error fetching invoices for lifetime values:', invoiceError);
      }

      // Fetch orders for all customers
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('customer_id, final_amount')
        .in('customer_id', customerIds);

      if (orderError) {
        console.warn('Error fetching orders for lifetime values:', orderError);
      }

      // Calculate lifetime value for each customer
      customerIds.forEach(customerId => {
        const customerInvoices = invoices?.filter(inv => inv.customer_id === customerId) || [];
        const customerOrders = orders?.filter(ord => ord.customer_id === customerId) || [];
        values[customerId] = calculateLifetimeValue(customerInvoices, customerOrders);
      });

      setCustomerLifetimeValues(values);
    } catch (error) {
      console.error('Error fetching customer lifetime values:', error);
    }
  };

  const searchCustomers = async (term: string) => {
    if (!term.trim()) {
      setCustomers([]);
      setHasSearched(false);
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      
      // Clean the search term - remove spaces, dashes, parentheses for phone number search
      const cleanTerm = term.trim();
      const phoneSearchTerm = cleanTerm.replace(/[\s\-\(\)]/g, '');
      
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`company_name.ilike.%${cleanTerm}%,contact_person.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%,phone.ilike.%${phoneSearchTerm}%,address.ilike.%${cleanTerm}%,city.ilike.%${cleanTerm}%,state.ilike.%${cleanTerm}%,pincode.ilike.%${cleanTerm}%,gstin.ilike.%${cleanTerm}%,pan.ilike.%${cleanTerm}%`)
        .order('company_name', { ascending: true })
        .limit(20);

      if (error) {
        throw error;
      }
      setCustomers((data as unknown as Customer[]) || []);
    } catch (error) {
      console.error('Error searching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomer = customers.find(customer => customer.id === value);

  const handleSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    onValueChange(customerId);
    onCustomerSelect?.(customer || null);
    setOpen(false);
    setShowCreateCustomer(false);
  };

  const handleCreateCustomer = () => {
    updateDialogState(prev => ({
      ...(prev || { open: false, showCreateCustomer: false }),
      showCreateCustomer: true,
      open: false
    }));
  };

  const handleCustomerCreated = (newCustomer: Customer) => {
    setShowCreateCustomer(false);
    // Add the new customer to the list
    setCustomers(prev => [newCustomer, ...prev]);
    // Select the new customer
    onValueChange(newCustomer.id);
    onCustomerSelect?.(newCustomer);
    onCreateCustomer?.(newCustomer);
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          {selectedCustomer
            ? `${selectedCustomer.company_name} (${selectedCustomer.phone})`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search by name, phone number, email, company, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus-visible:ring-0"
          />
        </div>
        
        <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : customers.length > 0 ? (
            <div className="p-1">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => handleSelect(customer.id)}
                  className="flex flex-col items-start p-3 cursor-pointer hover:bg-accent rounded-sm"
                >
                  <div className="flex items-center w-full">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === customer.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{customer.company_name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {customer.contact_person ? `${customer.contact_person} • ` : ''}{customer.phone}
                      </div>
                      {customer.email && (
                        <div className="text-xs text-muted-foreground truncate">{customer.email}</div>
                      )}
                      <div className="text-xs text-accent font-medium">
                        LTV: {formatCurrency(customerLifetimeValues[customer.id] || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="py-6 text-center">
              <div className="text-sm text-muted-foreground mb-4">
                No customers found for "{searchTerm}"
              </div>
              <Button 
                onClick={handleCreateCustomer}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Create Customer
              </Button>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Start typing to search customers by name, phone, email, or company...
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>

    {/* Create Customer Dialog */}
    <Dialog open={showCreateCustomer} onOpenChange={setShowCreateCustomer}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Customer</DialogTitle>
          <DialogDescription>
            Add a new customer to the system. Fill in the required information below.
          </DialogDescription>
        </DialogHeader>
        <CustomerForm 
          onSave={handleCustomerCreated}
          onCancel={() => setShowCreateCustomer(false)}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}