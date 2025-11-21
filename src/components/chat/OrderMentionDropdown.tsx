import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';

interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
}

interface OrderMentionDropdownProps {
  searchTerm: string;
  onSelect: (order: Order) => void;
  position: { top: number; left: number };
  onClose: () => void;
}

export function OrderMentionDropdown({
  searchTerm,
  onSelect,
  position,
  onClose,
}: OrderMentionDropdownProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('orders')
          .select(`
            id,
            order_number,
            customer_id,
            customers!inner(company_name)
          `)
          .order('created_at', { ascending: false });

        // If search term exists, filter by it
        if (searchTerm.trim()) {
          // Check if search term is numeric (last 3 digits)
          const isNumeric = /^\d+$/.test(searchTerm.trim());
          
          if (isNumeric && searchTerm.trim().length >= 3) {
            // Filter by last 3 digits of order number
            const last3Digits = searchTerm.trim().slice(-3);
            query = query.ilike('order_number', `%${last3Digits}`);
          } else {
            // Filter by order number containing the search term
            query = query.ilike('order_number', `%${searchTerm}%`);
          }
        }

        const { data, error } = await query.limit(20);

        if (error) throw error;

        const formattedOrders: Order[] = (data || []).map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          customer_name: order.customers?.company_name,
        }));

        setOrders(formattedOrders);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Error fetching orders:', error);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchOrders, 200);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, orders.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (orders[selectedIndex]) {
          onSelect(orders[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, selectedIndex, onSelect, onClose]);

  return (
    <div
      className="fixed z-[100] w-64 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {loading ? (
        <div className="p-2 text-sm text-muted-foreground">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="p-2 text-sm text-muted-foreground">No orders found</div>
      ) : (
        <div className="p-1">
          {orders.map((order, index) => (
            <div
              key={order.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent',
                selectedIndex === index && 'bg-accent'
              )}
              onClick={() => onSelect(order)}
            >
              <Package className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {order.order_number}
                </div>
                {order.customer_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {order.customer_name}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

