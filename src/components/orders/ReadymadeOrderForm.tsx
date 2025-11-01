import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';

interface Customer {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
}

interface ProductMaster {
  id: string;
  product_id: string;
  product_name: string;
  product_category?: string;
  description?: string;
  regular_selling_price: number;
  mrp: number;
  gst_rate: number;
  current_stock: number;
  image_url?: string;
  is_active: boolean;
}

interface OrderProduct {
  product_master_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  total_price: number;
}

interface ReadymadeOrderFormData {
  order_date: Date;
  expected_delivery_date: Date;
  customer_id: string;
  sales_manager: string;
  products: OrderProduct[];
  payment_channel: string;
  reference_id: string;
  advance_amount: number;
  notes: string;
}

interface ReadymadeOrderFormProps {
  preSelectedCustomer?: {
    id: string;
    company_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
  } | null;
  onOrderCreated?: () => void;
}

export function ReadymadeOrderForm({ preSelectedCustomer, onOrderCreated }: ReadymadeOrderFormProps = {}) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState<ReadymadeOrderFormData>({
    order_date: new Date(),
    expected_delivery_date: new Date(),
    customer_id: preSelectedCustomer?.id || '',
    sales_manager: '',
    products: [],
    payment_channel: '',
    reference_id: '',
    advance_amount: 0,
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch active products from product_master
      const { data: productsData, error: productsError } = await supabase
        .from('product_master')
        .select('*')
        .eq('is_active', true)
        .order('product_name');

      if (productsError) throw productsError;
      setProducts(productsData || []);

      // Fetch employees for sales manager - filter to only show sales employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, full_name, department, designation')
        .order('full_name');

      if (employeesError) throw employeesError;
      
      // Filter employees to only show those from Sales Department or with Sales designation
      const salesEmployees = (employeesData || []).filter(emp => {
        const dept = emp.department?.toLowerCase() || '';
        const desig = emp.designation?.toLowerCase() || '';
        return dept.includes('sales') || desig.includes('sales');
      });
      
      setEmployees(salesEmployees);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch form data');
    }
  };

  const generateOrderNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number')
        .eq('order_type', 'readymade')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextSequence = 1;
      if (data && data.length > 0) {
        const lastOrderNumber = data[0].order_number;
        const match = lastOrderNumber.match(/(\d+)$/);
        if (match) {
          nextSequence = parseInt(match[1]) + 1;
        }
      }

      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const nextYear = (now.getFullYear() + 1).toString().slice(-2);
      const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const sequence = nextSequence.toString().padStart(3, '0');
      
      return `RMO/${year}-${nextYear}/${month}/${sequence}`;
    } catch (error) {
      console.error('Error generating order number:', error);
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const nextYear = (now.getFullYear() + 1).toString().slice(-2);
      const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const sequence = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `RMO/${year}-${nextYear}/${month}/${sequence}`;
    }
  };

  const addProduct = () => {
    setFormData({
      ...formData,
      products: [
        ...formData.products,
        {
          product_master_id: '',
          product_id: '',
          product_name: '',
          quantity: 1,
          unit_price: 0,
          gst_rate: 0,
          total_price: 0
        }
      ]
    });
  };

  const removeProduct = (index: number) => {
    setFormData({
      ...formData,
      products: formData.products.filter((_, i) => i !== index)
    });
  };

  const updateProduct = (index: number, field: keyof OrderProduct, value: any) => {
    const updatedProducts = [...formData.products];
    const product = { ...updatedProducts[index] };

    if (field === 'product_master_id') {
      const selectedProduct = products.find(p => p.id === value);
      if (selectedProduct) {
        product.product_master_id = selectedProduct.id;
        product.product_id = selectedProduct.product_id;
        product.product_name = selectedProduct.product_name;
        product.unit_price = selectedProduct.regular_selling_price || selectedProduct.mrp || 0;
        product.gst_rate = selectedProduct.gst_rate || 0;
        product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
      }
    } else if (field === 'quantity') {
      product.quantity = Math.max(1, parseInt(value) || 1);
      product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
    } else if (field === 'unit_price') {
      product.unit_price = parseFloat(value) || 0;
      product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
    }

    updatedProducts[index] = product;
    setFormData({ ...formData, products: updatedProducts });
  };

  const calculateTotals = () => {
    const subtotal = formData.products.reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);
    const gstAmount = formData.products.reduce((sum, p) => {
      const productTotal = p.unit_price * p.quantity;
      return sum + (productTotal * (p.gst_rate / 100));
    }, 0);
    const total = subtotal + gstAmount;
    const balance = total - formData.advance_amount;
    return { subtotal, gstAmount, total, balance };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customer_id) {
      toast.error('Please select a customer');
      return;
    }

    if (formData.products.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    if (formData.products.some(p => !p.product_master_id || p.quantity <= 0)) {
      toast.error('Please fill in all product details correctly');
      return;
    }

    try {
      setLoading(true);
      const orderNumber = await generateOrderNumber();
      const { subtotal, gstAmount, total, balance } = calculateTotals();

      // Create order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          order_date: formData.order_date.toISOString().split('T')[0],
          expected_delivery_date: formData.expected_delivery_date.toISOString().split('T')[0],
          customer_id: formData.customer_id,
          sales_manager: formData.sales_manager || null,
          order_type: 'readymade' as any,
          status: 'pending' as any,
          total_amount: subtotal,
          gst_amount: gstAmount,
          tax_amount: gstAmount,
          final_amount: total,
          advance_amount: formData.advance_amount || 0,
          balance_amount: balance,
          payment_channel: formData.payment_channel || null,
          reference_id: formData.reference_id || null,
          notes: formData.notes || null
        } as any)
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Create order items
      for (const product of formData.products) {
        const { error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: orderData.id,
            product_id: null, // product_id references products table, not product_master, so set to null
            quantity: product.quantity,
            unit_price: product.unit_price,
            total_price: product.total_price,
            gst_rate: product.gst_rate,
            product_description: product.product_name,
            specifications: {
              product_master_id: product.product_master_id,
              product_id: product.product_id,
              product_name: product.product_name,
              order_type: 'readymade'
            }
          } as any);

        if (itemError) throw itemError;
      }

      toast.success('Readymade order created successfully!');
      
      if (onOrderCreated) {
        onOrderCreated();
      } else {
        navigate('/orders/readymade');
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(error.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, total, balance } = calculateTotals();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer & Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <CustomerSearchSelect
                value={formData.customer_id}
                onValueChange={(customerId) => setFormData({ ...formData, customer_id: customerId })}
                placeholder="Search by name, phone, contact person..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sales_manager">Sales Manager</Label>
              <Select
                value={formData.sales_manager}
                onValueChange={(value) => setFormData({ ...formData, sales_manager: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sales manager" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order_date">Order Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.order_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.order_date ? format(formData.order_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.order_date}
                    onSelect={(date) => date && setFormData({ ...formData, order_date: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_delivery_date">Expected Delivery Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.expected_delivery_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.expected_delivery_date ? format(formData.expected_delivery_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.expected_delivery_date}
                    onSelect={(date) => date && setFormData({ ...formData, expected_delivery_date: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_channel">Payment Channel</Label>
              <Input
                id="payment_channel"
                value={formData.payment_channel}
                onChange={(e) => setFormData({ ...formData, payment_channel: e.target.value })}
                placeholder="e.g., Bank Transfer, UPI, Cash"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference_id">Reference ID</Label>
              <Input
                id="reference_id"
                value={formData.reference_id}
                onChange={(e) => setFormData({ ...formData, reference_id: e.target.value })}
                placeholder="Optional reference"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes or instructions"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Products</CardTitle>
            <Button type="button" onClick={addProduct} variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.products.map((product, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">Product {index + 1}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeProduct(index)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Select
                    value={product.product_master_id}
                    onValueChange={(value) => updateProduct(index, 'product_master_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.product_name} ({p.product_id}) - Stock: {p.current_stock}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={product.quantity}
                    onChange={(e) => updateProduct(index, 'quantity', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Unit Price *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.unit_price}
                    onChange={(e) => updateProduct(index, 'unit_price', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span>GST: {product.gst_rate}%</span>
                <span className="font-medium">Total: {formatCurrency(product.total_price)}</span>
              </div>
            </div>
          ))}

          {formData.products.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No products added. Click "Add Product" to add products to this order.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="advance_amount">Advance Amount</Label>
              <Input
                id="advance_amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.advance_amount}
                onChange={(e) => setFormData({ ...formData, advance_amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST:</span>
              <span className="font-medium">{formatCurrency(gstAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total Amount:</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Advance:</span>
              <span>{formatCurrency(formData.advance_amount)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold border-t pt-2">
              <span>Balance Amount:</span>
              <span>{formatCurrency(balance)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => navigate('/orders/readymade')}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Order'}
        </Button>
      </div>
    </form>
  );
}

