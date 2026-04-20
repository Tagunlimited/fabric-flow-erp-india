import { useState, useEffect, useRef } from 'react';
import { Search, X, Package, ShoppingCart, Building, User, FileText, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn, formatCurrency } from '@/lib/utils';

export type SearchEntityType =
  | 'order'
  | 'customer'
  | 'product'
  | 'employee'
  | 'invoice'
  | 'quotation';

export interface SearchResult {
  id: string;
  type: SearchEntityType;
  /** User-facing area: Orders, Customers, Invoices, Quotations, … */
  pageLabel: string;
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

/** Strip ILIKE wildcards from user input so they cannot break or widen the pattern. */
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_]/g, '');
}

function logSearchSourceError(source: string, error: { message?: string } | null): void {
  if (!error || !import.meta.env.DEV) return;
  console.warn(`[UniversalSearch] ${source} failed:`, error.message ?? error);
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  return m.includes('does not exist') || m.includes('42703') || m.includes('column');
}

/** Only show status badges for primitive values (avoids crashing on objects / unexpected types). */
function statusBadgeText(status: unknown): string | undefined {
  if (status == null || status === '') return undefined;
  if (typeof status === 'string') {
    const t = status.trim();
    return t.length ? t : undefined;
  }
  if (typeof status === 'number' && Number.isFinite(status)) return String(status);
  if (typeof status === 'boolean') return String(status);
  return undefined;
}

async function fetchProductsForUniversalSearch(pattern: string): Promise<{
  data: any[] | null;
  error: { message?: string } | null;
}> {
  const modern = await supabase
    .from('products')
    .select('id, product_name, product_code, category, selling_price, cost_price')
    .or(`product_name.ilike.${pattern},product_code.ilike.${pattern},category.ilike.${pattern}`)
    .limit(6);

  if (!modern.error) {
    return { data: modern.data as any[] | null, error: null };
  }

  if (!isMissingColumnError(modern.error)) {
    return { data: null, error: modern.error };
  }

  const legacy = await supabase
    .from('products')
    .select('id, name, code, category, base_price, cost_price')
    .or(`name.ilike.${pattern},code.ilike.${pattern},category.ilike.${pattern}`)
    .limit(6);

  return { data: legacy.data as any[] | null, error: legacy.error };
}

function mapProductRowToSearchResult(product: any): SearchResult {
  const title = product.product_name ?? product.name ?? 'Product';
  const subtitle = String(product.product_code ?? product.code ?? '');
  const price =
    typeof product.selling_price === 'number'
      ? product.selling_price
      : typeof product.base_price === 'number'
        ? product.base_price
        : typeof product.cost_price === 'number'
          ? product.cost_price
          : undefined;
  return {
    id: product.id,
    type: 'product',
    pageLabel: 'Products',
    title,
    subtitle,
    description: product.category || undefined,
    amount: price,
    icon: Package,
    route: `/inventory/products/${product.id}`,
  };
}

async function fetchQuotationsForUniversalSearch(
  pattern: string,
  customerIds: string[]
): Promise<{ data: any[] | null; error: { message?: string } | null }> {
  const selectWithOrder =
    'id, quotation_number, customer_id, order_id, total_amount, status, created_at, customers(company_name)';
  const selectNoOrder =
    'id, quotation_number, customer_id, total_amount, status, created_at, customers(company_name)';

  const attempts: Array<{ select: string; useIsDeleted: boolean }> = [
    { select: selectWithOrder, useIsDeleted: true },
    { select: selectWithOrder, useIsDeleted: false },
    { select: selectNoOrder, useIsDeleted: true },
    { select: selectNoOrder, useIsDeleted: false },
  ];

  let lastError: { message?: string } | null = null;
  for (const { select, useIsDeleted } of attempts) {
    let q = supabase.from('quotations').select(select);
    if (useIsDeleted) q = q.eq('is_deleted', false);
    if (customerIds.length > 0) {
      const inList = customerIds.slice(0, 50).join(',');
      q = q.or(`quotation_number.ilike.${pattern},customer_id.in.(${inList})`);
    } else {
      q = q.ilike('quotation_number', pattern);
    }
    const res = await q.limit(5);
    if (!res.error) {
      return { data: res.data as any[] | null, error: null };
    }
    lastError = res.error;
    if (!isMissingColumnError(res.error)) {
      return { data: null, error: res.error };
    }
  }
  return { data: null, error: lastError };
}

async function fetchCustomersForUniversalSearch(
  pattern: string
): Promise<{ data: any[] | null; error: { message?: string } | null }> {
  const orWide = [
    `company_name.ilike.${pattern}`,
    `contact_person.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
    `address.ilike.${pattern}`,
    `city.ilike.${pattern}`,
    `state.ilike.${pattern}`,
    `gstin.ilike.${pattern}`,
    `pan.ilike.${pattern}`,
  ].join(',');

  const orNarrow = [
    `company_name.ilike.${pattern}`,
    `contact_person.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
  ].join(',');

  const selectCore =
    'id, company_name, contact_person, email, phone, address, city, state, gstin, pan';
  const core = await supabase.from('customers').select(selectCore).or(orWide).limit(50);
  if (!core.error) return { data: core.data as any[] | null, error: null };
  if (!isMissingColumnError(core.error)) return { data: null, error: core.error };

  const narrow = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email, phone')
    .or(orNarrow)
    .limit(50);
  if (!narrow.error) return { data: narrow.data as any[] | null, error: null };
  if (!isMissingColumnError(narrow.error)) return { data: null, error: narrow.error };

  const minimal = await supabase
    .from('customers')
    .select('id, company_name, contact_person, email, phone')
    .or(`company_name.ilike.${pattern}`)
    .limit(50);
  return { data: minimal.data as any[] | null, error: minimal.error };
}

export function UniversalSearchBar({
  value,
  onChange,
  placeholder = 'Search orders, customers, invoices, quotations, products…',
  className,
}: UniversalSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [partialSourceFailure, setPartialSourceFailure] = useState(false);
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
      setPartialSourceFailure(false);
      return;
    }

    const searchAll = async () => {
      setLoading(true);
      setIsOpen(true);
      setPartialSourceFailure(false);

      try {
        const searchTerm = sanitizeSearchTerm(value);
        if (searchTerm.length < 2) {
          setResults([]);
          setLoading(false);
          return;
        }

        const pattern = `%${searchTerm}%`;
        const allResults: SearchResult[] = [];
        let anyError = false;
        const quotationRoutesSeen = new Set<string>();

        const {
          data: customersMatch,
          error: customersError,
        } = await fetchCustomersForUniversalSearch(pattern);

        if (customersError) {
          logSearchSourceError('customers', customersError);
          anyError = true;
        }

        const customerRows = customersMatch ?? [];
        const customerIds = customerRows.map((c) => c.id).filter(Boolean);

        customerRows.slice(0, 6).forEach((customer: any) => {
          const tierOrType = customer.customer_type ?? customer.customer_tier;
          allResults.push({
            id: customer.id,
            type: 'customer',
            pageLabel: 'Customers',
            title: customer.company_name,
            subtitle: customer.contact_person || customer.email || '',
            description: customer.phone || undefined,
            status: statusBadgeText(tierOrType),
            icon: Building,
            route: `/crm/customers/${customer.id}`,
          });
        });

        const orderSelect =
          'id, order_number, customer_id, status, final_amount, created_at, customers(company_name)';
        let orders: any[] | null = null;
        let ordersError = null as { message?: string } | null;

        if (customerIds.length > 0) {
          const inList = customerIds.slice(0, 50).join(',');
          const res = await supabase
            .from('orders')
            .select(orderSelect)
            .eq('is_deleted', false)
            .or(`order_number.ilike.${pattern},customer_id.in.(${inList})`)
            .limit(6);
          orders = res.data as any[] | null;
          ordersError = res.error;
        } else {
          const res = await supabase
            .from('orders')
            .select(orderSelect)
            .eq('is_deleted', false)
            .ilike('order_number', pattern)
            .limit(6);
          orders = res.data as any[] | null;
          ordersError = res.error;
        }

        if (ordersError) {
          logSearchSourceError('orders', ordersError);
          anyError = true;
        }

        if (orders) {
          orders.forEach((order: any) => {
            allResults.push({
              id: order.id,
              type: 'order',
              pageLabel: 'Orders',
              title: order.order_number,
              subtitle: order.customers?.company_name || 'Unknown Customer',
              status: statusBadgeText(order.status),
              amount: order.final_amount ?? undefined,
              date: order.created_at,
              icon: ShoppingCart,
              route: `/orders/${order.id}`,
            });

            const quotationRoute = `/accounts/quotations/${order.id}`;
            if (!quotationRoutesSeen.has(quotationRoute)) {
              quotationRoutesSeen.add(quotationRoute);
              allResults.push({
                id: order.id,
                type: 'quotation',
                pageLabel: 'Quotations',
                title: order.order_number,
                subtitle: order.customers?.company_name
                  ? `Quotation · ${order.customers.company_name}`
                  : 'Open quotation view',
                status: statusBadgeText(order.status),
                amount: order.final_amount ?? undefined,
                date: order.created_at,
                icon: Quote,
                route: quotationRoute,
              });
            }
          });
        }

        const { data: employees, error: employeesError } = await supabase
          .from('employees')
          .select('id, full_name, employee_code, department, designation, personal_phone')
          .or(
            `full_name.ilike.${pattern},employee_code.ilike.${pattern},department.ilike.${pattern}`
          )
          .limit(6);

        if (employeesError) {
          logSearchSourceError('employees', employeesError);
          anyError = true;
        }

        if (employees) {
          employees.forEach((employee: any) => {
            allResults.push({
              id: employee.id,
              type: 'employee',
              pageLabel: 'Employees',
              title: employee.full_name,
              subtitle: employee.employee_code,
              description: `${employee.department} - ${employee.designation}`,
              status: statusBadgeText(employee.department),
              icon: User,
              route: `/people/employees/${employee.id}`,
            });
          });
        }

        const { data: products, error: productsError } =
          await fetchProductsForUniversalSearch(pattern);

        if (productsError) {
          logSearchSourceError('products', productsError);
          anyError = true;
        }

        if (products?.length) {
          products.forEach((product: any) => {
            allResults.push(mapProductRowToSearchResult(product));
          });
        }

        const invoiceSelect =
          'id, invoice_number, customer_id, total_amount, status, created_at, customers(company_name)';
        let invoices: any[] | null = null;
        let invoicesError = null as { message?: string } | null;

        if (customerIds.length > 0) {
          const inList = customerIds.slice(0, 50).join(',');
          const res = await supabase
            .from('invoices')
            .select(invoiceSelect)
            .eq('is_deleted', false)
            .or(`invoice_number.ilike.${pattern},customer_id.in.(${inList})`)
            .limit(6);
          invoices = res.data as any[] | null;
          invoicesError = res.error;
        } else {
          const res = await supabase
            .from('invoices')
            .select(invoiceSelect)
            .eq('is_deleted', false)
            .ilike('invoice_number', pattern)
            .limit(6);
          invoices = res.data as any[] | null;
          invoicesError = res.error;
        }

        if (invoicesError) {
          logSearchSourceError('invoices', invoicesError);
          anyError = true;
        }

        if (invoices) {
          invoices.forEach((invoice: any) => {
            allResults.push({
              id: invoice.id,
              type: 'invoice',
              pageLabel: 'Invoices',
              title: invoice.invoice_number,
              subtitle: invoice.customers?.company_name || 'Unknown Customer',
              status: statusBadgeText(invoice.status),
              amount: invoice.total_amount ?? undefined,
              date: invoice.created_at,
              icon: FileText,
              route: `/accounts/invoices/${invoice.id}`,
            });
          });
        }

        const {
          data: quotationRows,
          error: quotationsError,
        } = await fetchQuotationsForUniversalSearch(pattern, customerIds);

        if (quotationsError) {
          logSearchSourceError('quotations', quotationsError);
          anyError = true;
        }

        if (quotationRows?.length) {
          quotationRows.forEach((row: any) => {
            const orderId = row.order_id as string | null | undefined;
            const route =
              orderId && String(orderId).length > 0
                ? `/accounts/quotations/${orderId}`
                : '';
            if (!route || quotationRoutesSeen.has(route)) return;
            quotationRoutesSeen.add(route);
            allResults.push({
              id: row.id,
              type: 'quotation',
              pageLabel: 'Quotations',
              title: row.quotation_number || 'Quotation',
              subtitle: row.customers?.company_name || 'Customer',
              description: orderId ? `Linked order` : undefined,
              status: statusBadgeText(row.status),
              amount: row.total_amount ?? undefined,
              date: row.created_at,
              icon: Quote,
              route,
            });
          });
        }

        const termLower = searchTerm.toLowerCase();
        allResults.sort((a, b) => {
          const titleA = String(a.title ?? '').toLowerCase();
          const titleB = String(b.title ?? '').toLowerCase();
          const subA = String(a.subtitle ?? '').toLowerCase();
          const subB = String(b.subtitle ?? '').toLowerCase();
          const aExact =
            titleA.includes(termLower) || subA.includes(termLower);
          const bExact =
            titleB.includes(termLower) || subB.includes(termLower);

          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });

        setPartialSourceFailure(anyError);
        setResults(allResults.slice(0, 28));
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
        setPartialSourceFailure(true);
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
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
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
    onChange('');
  };

  const getPageLabelColor = (type: SearchEntityType) => {
    switch (type) {
      case 'order':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200';
      case 'customer':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
      case 'product':
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200';
      case 'employee':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
      case 'invoice':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200';
      case 'quotation':
        return 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status?: string) => {
    const label = statusBadgeText(status);
    if (!label) return '';
    switch (label.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
            'w-full pl-10 pr-10 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
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
                {partialSourceFailure && (
                  <p className="px-3 pb-1 text-xs text-muted-foreground">
                    Some search sources could not be loaded.
                  </p>
                )}
                {results.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className={cn(
                      'flex items-center space-x-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                      selectedIndex === index && 'bg-muted/50'
                    )}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex-shrink-0">
                      <result.icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium truncate">{result.title}</h4>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 font-medium', getPageLabelColor(result.type))}
                        >
                          {result.pageLabel}
                        </Badge>
                        {statusBadgeText(result.status) && (
                          <Badge variant="outline" className={getStatusColor(result.status)}>
                            {statusBadgeText(result.status)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                      {result.description && (
                        <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-1">
                        {typeof result.amount === 'number' && (
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(result.amount)}
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
                <p className="text-xs">
                  Try orders, customers, invoices, quotations, products, or employees
                </p>
                {partialSourceFailure && (
                  <p className="text-xs mt-2 text-amber-600 dark:text-amber-500">
                    Some search sources could not be loaded.
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
