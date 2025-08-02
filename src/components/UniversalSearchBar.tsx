import { useState, useEffect, useRef } from 'react';
import { Search, X, Package, Users, ShoppingCart, Building, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'order' | 'customer' | 'product' | 'employee' | 'invoice';
  title: string;
  subtitle: string;
  description?: string;
  status?: string;
  amount?: number;
  date?: string;
  icon: React.ComponentType<any>;
  route: string;
}

interface UniversalSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function UniversalSearchBar({ 
  value, 
  onChange, 
  placeholder = "Search orders, customers, products, employees...",
  className 
}: UniversalSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const searchAll = async () => {
      setLoading(true);
      setIsOpen(true);
      
      try {
        const searchTerm = value.trim();
        const allResults: SearchResult[] = [];

        // Search Orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, customer_id, status, final_amount, created_at, customers(company_name)')
          .or(`order_number.ilike.%${searchTerm}%,customers.company_name.ilike.%${searchTerm}%`)
          .limit(5);

        if (orders) {
          orders.forEach(order => {
            allResults.push({
              id: order.id,
              type: 'order',
              title: order.order_number,
              subtitle: order.customers?.company_name || 'Unknown Customer',
              status: order.status,
              amount: order.final_amount,
              date: order.created_at,
              icon: ShoppingCart,
              route: `/orders/${order.id}`
            });
          });
        }

        // Search Customers
        const { data: customers } = await supabase
          .from('customers')
          .select('id, company_name, contact_person, email, phone, customer_type')
          .or(`company_name.ilike.%${searchTerm}%,contact_person.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
          .limit(5);

        if (customers) {
          customers.forEach(customer => {
            allResults.push({
              id: customer.id,
              type: 'customer',
              title: customer.company_name,
              subtitle: customer.contact_person || customer.email,
              description: customer.phone,
              status: customer.customer_type,
              icon: Building,
              route: `/crm/customers/${customer.id}`
            });
          });
        }

        // Search Employees
        const { data: employees } = await supabase
          .from('employees')
          .select('id, full_name, employee_code, department, designation, personal_phone')
          .or(`full_name.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%,department.ilike.%${searchTerm}%`)
          .limit(5);

        if (employees) {
          employees.forEach(employee => {
            allResults.push({
              id: employee.id,
              type: 'employee',
              title: employee.full_name,
              subtitle: employee.employee_code,
              description: `${employee.department} - ${employee.designation}`,
              status: employee.department,
              icon: User,
              route: `/people/employees/${employee.id}`
            });
          });
        }

        // Search Products
        const { data: products } = await supabase
          .from('products')
          .select('id, name, code, category, base_price')
          .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
          .limit(5);

        if (products) {
          products.forEach(product => {
            allResults.push({
              id: product.id,
              type: 'product',
              title: product.name,
              subtitle: product.code,
              description: product.category,
              amount: product.base_price,
              icon: Package,
              route: `/inventory/products/${product.id}`
            });
          });
        }

        // Search Invoices
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, customer_id, total_amount, status, created_at, customers(company_name)')
          .or(`invoice_number.ilike.%${searchTerm}%,customers.company_name.ilike.%${searchTerm}%`)
          .limit(5);

        if (invoices) {
          invoices.forEach(invoice => {
            allResults.push({
              id: invoice.id,
              type: 'invoice',
              title: invoice.invoice_number,
              subtitle: invoice.customers?.company_name || 'Unknown Customer',
              status: invoice.status,
              amount: invoice.total_amount,
              date: invoice.created_at,
              icon: FileText,
              route: `/accounts/invoices/${invoice.id}`
            });
          });
        }

        // Sort results by relevance (exact matches first, then partial)
        allResults.sort((a, b) => {
          const aExact = a.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        a.subtitle.toLowerCase().includes(searchTerm.toLowerCase());
          const bExact = b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        b.subtitle.toLowerCase().includes(searchTerm.toLowerCase());
          
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });

        setResults(allResults.slice(0, 10)); // Limit to 10 results
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchAll, 300);
    return () => clearTimeout(debounceTimer);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => prev < results.length - 1 ? prev + 1 : prev);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.route);
    setIsOpen(false);
    setSelectedIndex(-1);
    onChange(''); // Clear search
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'order': return 'bg-blue-100 text-blue-800';
      case 'customer': return 'bg-green-100 text-green-800';
      case 'product': return 'bg-purple-100 text-purple-800';
      case 'employee': return 'bg-orange-100 text-orange-800';
      case 'invoice': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return '';
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div ref={searchRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim().length >= 2 && setIsOpen(true)}
          className={cn(
            "w-full pl-10 pr-10 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            className
          )}
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 max-h-96 overflow-y-auto shadow-lg border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2">Searching...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className={cn(
                      "flex items-center space-x-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                      selectedIndex === index && "bg-muted/50"
                    )}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex-shrink-0">
                      <result.icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium truncate">{result.title}</h4>
                        <Badge variant="outline" className={getTypeColor(result.type)}>
                          {result.type}
                        </Badge>
                        {result.status && (
                          <Badge variant="outline" className={getStatusColor(result.status)}>
                            {result.status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                      {result.description && (
                        <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-1">
                        {result.amount && (
                          <span className="text-xs text-muted-foreground">
                            ₹{result.amount.toLocaleString()}
                          </span>
                        )}
                        {result.date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(result.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : value.trim().length >= 2 ? (
              <div className="p-4 text-center text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No results found for "{value}"</p>
                <p className="text-xs">Try searching for orders, customers, products, or employees</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}