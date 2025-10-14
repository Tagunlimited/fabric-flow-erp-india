import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { calculateLifetimeValue, formatCurrency } from '@/lib/utils';

interface Customer {
  id: string;
  company_name: string;
  contact_person: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
}

interface CustomerSearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  onCustomerSelect?: (customer: Customer | null) => void;
  placeholder?: string;
}

export function CustomerSearchSelect({ 
  value, 
  onValueChange, 
  onCustomerSelect,
  placeholder = "Select customer..." 
}: CustomerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLifetimeValues, setCustomerLifetimeValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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
      const lifetimeValues: Record<string, number> = {};

      // Fetch invoices for all customers
      const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('customer_id, total_amount')
        .in('customer_id', customerIds as any[]);

      if (invoiceError) throw invoiceError;

      // Fetch orders for all customers
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('customer_id, final_amount')
        .in('customer_id', customerIds as any[]);

      if (orderError) throw orderError;

      // Calculate lifetime value for each customer
      customerIds.forEach(customerId => {
        const customerInvoices = (invoices as any[])?.filter((inv: any) => inv.customer_id === customerId) || [];
        const customerOrders = (orders as any[])?.filter((ord: any) => ord.customer_id === customerId) || [];
        lifetimeValues[customerId] = calculateLifetimeValue(customerInvoices, customerOrders);
      });

      setCustomerLifetimeValues(lifetimeValues);
    } catch (error) {
      console.error('Error fetching customer lifetime values:', error);
    }
  };

  const searchCustomers = async (term: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`company_name.ilike.%${term}%,contact_person.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,mobile.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%,pincode.ilike.%${term}%,gstin.ilike.%${term}%,pan.ilike.%${term}%`)
        .order('company_name', { ascending: true })
        .limit(20);

      if (error) throw error;
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
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          {selectedCustomer
            ? `${selectedCustomer.company_name} (${selectedCustomer.mobile || selectedCustomer.phone})`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput 
            placeholder="Search by any customer detail (name, phone, email, address, GSTIN, etc.)..." 
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Searching..." : "No customers found."}
            </CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => handleSelect(customer.id)}
                  className="flex flex-col items-start p-3"
                >
                  <div className="flex items-center w-full">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === customer.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{customer.company_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {customer.contact_person} • {customer.mobile || customer.phone}
                      </div>
                      {customer.email && (
                        <div className="text-xs text-muted-foreground">{customer.email}</div>
                      )}
                      <div className="text-xs text-accent font-medium">
                        LTV: {formatCurrency(customerLifetimeValues[customer.id] || 0)}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}