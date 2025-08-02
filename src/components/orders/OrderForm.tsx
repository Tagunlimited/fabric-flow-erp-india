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
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, Upload, X, Image } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface ProductCategory {
  id: string;
  category_name: string;
  category_image_url: string;
}

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
}

interface FabricVariant {
  id: string;
  fabric_id: string;
  color: string;
  gsm: string;
  rate_per_meter: number;
  stock_quantity: number;
}

interface Fabric {
  id: string;
  name: string;
  color: string;
}

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  department: string;
}

interface BrandingItem {
  branding_type: string;
  placement: string;
  measurement: string;
}

interface Product {
  product_category_id: string;
  category_image_url: string;
  reference_images: File[];
  mockup_images: File[];
  attachments: File[];
  product_description: string;
  fabric_id: string;
  gsm: string;
  color: string;
  remarks: string;
  price: number;
  size_type_id: string;
  sizes_quantities: { [size: string]: number };
  branding_items: BrandingItem[];
}

interface OrderFormData {
  order_date: Date;
  expected_delivery_date: Date;
  customer_id: string;
  sales_manager: string;
  products: Product[];
  gst_rate: number;
  payment_channel: string;
  reference_id: string;
  advance_amount: number;
}

export function OrderForm() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [fabricVariants, setFabricVariants] = useState<FabricVariant[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState<OrderFormData>({
    order_date: new Date(),
    expected_delivery_date: new Date(),
    customer_id: '',
    sales_manager: '',
    products: [createEmptyProduct()],
    gst_rate: 18,
    payment_channel: '',
    reference_id: '',
    advance_amount: 0
  });

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  function createEmptyProduct(): Product {
    return {
      product_category_id: '',
      category_image_url: '',
      reference_images: [],
      mockup_images: [],
      attachments: [],
      product_description: '',
      fabric_id: '',
      gsm: '',
      color: '',
      remarks: '',
      price: 0,
      size_type_id: '',
      sizes_quantities: {},
      branding_items: [
        { branding_type: '', placement: '', measurement: '' },
        { branding_type: '', placement: '', measurement: '' }
      ]
    };
  }

  const fetchData = async () => {
    try {
      const [customersRes, categoriesRes, sizeTypesRes, fabricsRes, fabricVariantsRes, employeesRes] = await Promise.all([
        supabase.from('customers').select('*').order('company_name'),
        supabase.from('product_categories').select('*').order('category_name'),
        supabase.from('size_types').select('*').order('size_name'),
        supabase.from('fabrics').select('*').order('name'),
        supabase.from('fabric_variants').select('*').order('color'),
        supabase.from('employees').select('*').eq('department', 'Sales & Marketing').order('full_name')
      ]);

      if (customersRes.data) setCustomers(customersRes.data);
      if (categoriesRes.data) setProductCategories(categoriesRes.data);
      if (sizeTypesRes.data) setSizeTypes(sizeTypesRes.data);
      if (fabricsRes.data) setFabrics(fabricsRes.data);
      if (fabricVariantsRes.data) setFabricVariants(fabricVariantsRes.data);
      if (employeesRes.data) setEmployees(employeesRes.data);
    } catch (error) {
      toast.error('Failed to fetch form data');
    }
  };

  const generateOrderNumber = async () => {
    try {
      // Get the latest order number to determine the next sequence
      const { data, error } = await supabase
        .from('orders')
        .select('order_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextSequence = 1;
      if (data && data.length > 0) {
        const lastOrderNumber = data[0].order_number;
        // Extract sequence number from formats like "TUC/25-26/JUL/342" or "ORD001"
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
      
      return `TUC/${year}-${nextYear}/${month}/${sequence}`;
    } catch (error) {
      console.error('Error generating order number:', error);
      // Fallback to random if sequence generation fails
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const nextYear = (now.getFullYear() + 1).toString().slice(-2);
      const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const sequence = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `TUC/${year}-${nextYear}/${month}/${sequence}`;
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
    setFormData(prev => ({ ...prev, customer_id: customerId }));
  };

  const handleProductCategorySelect = (productIndex: number, categoryId: string) => {
    const category = productCategories.find(c => c.id === categoryId);
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              product_category_id: categoryId,
              category_image_url: category?.category_image_url || ''
            }
          : product
      )
    }));
  };

  // Define proper size order
  const getSizeOrder = (sizes: string[]) => {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 
                       '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
                       '0-2 Yrs', '3-4 Yrs', '5-6 Yrs', '7-8 Yrs', '9-10 Yrs', '11-12 Yrs', '13-14 Yrs', '15-16 Yrs'];
    
    return sizes.sort((a, b) => {
      const indexA = sizeOrder.indexOf(a);
      const indexB = sizeOrder.indexOf(b);
      
      // If both sizes are in our predefined order, sort by that order
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // If only one is in predefined order, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // For numeric sizes not in predefined list, sort numerically
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      
      // Default alphabetical sort
      return a.localeCompare(b);
    });
  };

  const handleSizeTypeSelect = (productIndex: number, sizeTypeId: string) => {
    const sizeType = sizeTypes.find(st => st.id === sizeTypeId);
    const newSizesQuantities: { [size: string]: number } = {};
    
    // Sort sizes in proper order before creating quantities object
    const orderedSizes = getSizeOrder(sizeType?.available_sizes || []);
    orderedSizes.forEach(size => {
      newSizesQuantities[size] = 0;
    });

    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              size_type_id: sizeTypeId,
              sizes_quantities: newSizesQuantities
            }
          : product
      )
    }));
  };

  const updateBrandingItem = (productIndex: number, brandingIndex: number, field: keyof BrandingItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              branding_items: product.branding_items.map((item, idx) =>
                idx === brandingIndex ? { ...item, [field]: value } : item
              )
            }
          : product
      )
    }));
  };

  const addBrandingItem = (productIndex: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              branding_items: [...product.branding_items, { branding_type: '', placement: '', measurement: '' }]
            }
          : product
      )
    }));
  };

  const removeBrandingItem = (productIndex: number, brandingIndex: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              branding_items: product.branding_items.filter((_, idx) => idx !== brandingIndex)
            }
          : product
      )
    }));
  };

  const addProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, createEmptyProduct()]
    }));
  };

  const removeProduct = (productIndex: number) => {
    if (formData.products.length > 1) {
      setFormData(prev => ({
        ...prev,
        products: prev.products.filter((_, index) => index !== productIndex)
      }));
    }
  };

  const calculateTotals = () => {
    const subtotal = formData.products.reduce((sum, product) => {
      const productTotal = Object.values(product.sizes_quantities || {}).reduce((total, qty) => total + qty, 0) * product.price;
      return sum + productTotal;
    }, 0);
    
    const gstAmount = (subtotal * formData.gst_rate) / 100;
    const grandTotal = subtotal + gstAmount;
    const balance = grandTotal - formData.advance_amount;

    return { subtotal, gstAmount, grandTotal, balance };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const orderNumber = await generateOrderNumber();
      const { subtotal, gstAmount, grandTotal, balance } = calculateTotals();

      const orderData = {
        order_number: orderNumber,
        order_date: format(formData.order_date, 'dd-MMM-yy'),
        expected_delivery_date: format(formData.expected_delivery_date, 'dd-MMM-yy'),
        customer_id: formData.customer_id,
        sales_manager: formData.sales_manager,
        total_amount: subtotal,
        tax_amount: gstAmount,
        final_amount: grandTotal,
        advance_amount: formData.advance_amount,
        balance_amount: balance,
        gst_rate: formData.gst_rate,
        payment_channel: formData.payment_channel || null,
        reference_id: formData.reference_id,
        status: 'pending' as const,
        notes: ''
      };

      const { data: orderResult, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      for (const product of formData.products) {
        const totalQuantity = Object.values(product.sizes_quantities || {}).reduce((total, qty) => total + qty, 0);
        const itemTotal = totalQuantity * product.price;
        
        const orderItemData = {
          order_id: orderResult.id,
          product_id: null, // Set to null since we're using product_category_id instead
          quantity: totalQuantity,
          unit_price: product.price,
          total_price: itemTotal,
          product_category_id: product.product_category_id,
          category_image_url: product.category_image_url,
          product_description: product.product_description,
          fabric_id: product.fabric_id,
          gsm: product.gsm,
          color: product.color,
          remarks: product.remarks,
          size_type_id: product.size_type_id,
          sizes_quantities: product.sizes_quantities,
          specifications: JSON.stringify({
            branding_items: product.branding_items
          }) as any
        };

        const { error: itemError } = await supabase
          .from('order_items')
          .insert(orderItemData);

        if (itemError) throw itemError;
      }

      toast.success('Order created successfully!');
      
      // Navigate to the order detail page
      navigate(`/orders/${orderResult.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, grandTotal, balance } = calculateTotals();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Order</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Order Header Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Order ID</Label>
                <Input value={format(formData.order_date, 'dd-MMM-yy') + " (Auto-generated)"} disabled />
              </div>
              
              <div className="space-y-2">
                <Label>Order Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !formData.order_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.order_date ? format(formData.order_date, "dd-MMM-yy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.order_date}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, order_date: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Expected Delivery Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !formData.expected_delivery_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.expected_delivery_date ? format(formData.expected_delivery_date, "dd-MMM-yy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.expected_delivery_date}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, expected_delivery_date: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Customer Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Customer Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <CustomerSearchSelect
                    value={formData.customer_id}
                    onValueChange={handleCustomerSelect}
                    onCustomerSelect={(customer) => setSelectedCustomer(customer)}
                    placeholder="Search by name, phone, contact person..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sales Manager</Label>
                  <Select value={formData.sales_manager} onValueChange={(value) => setFormData(prev => ({ ...prev, sales_manager: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sales manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.full_name} - {employee.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCustomer && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-sm text-muted-foreground">Contact Person</Label>
                    <p className="font-medium">{selectedCustomer.contact_person}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedCustomer.phone}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedCustomer.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">GSTIN</Label>
                    <p className="font-medium">{selectedCustomer.gstin}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Products Section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Products</h3>
                <Button 
                  type="button" 
                  onClick={addProduct}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </div>

              {formData.products.map((product, productIndex) => (
                <Card key={productIndex} className="relative border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-background shadow-lg">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base text-primary font-semibold">
                        Product {productIndex + 1}
                      </CardTitle>
                      {formData.products.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeProduct(productIndex)}
                          className="hover:scale-105 transition-transform"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Product Category</Label>
                        <Select
                          value={product.product_category_id}
                          onValueChange={(value) => handleProductCategorySelect(productIndex, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {productCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.category_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Fabric</Label>
                        <Select
                          value={product.fabric_id}
                          onValueChange={(value) => setFormData(prev => ({
                            ...prev,
                            products: prev.products.map((p, i) => 
                              i === productIndex ? { ...p, fabric_id: value } : p
                            )
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select fabric" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabrics.map((fabric) => (
                              <SelectItem key={fabric.id} value={fabric.id}>
                                {fabric.name} - {fabric.color}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Size Type</Label>
                        <Select
                          value={product.size_type_id}
                          onValueChange={(value) => handleSizeTypeSelect(productIndex, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select size type" />
                          </SelectTrigger>
                          <SelectContent>
                            {sizeTypes.map((sizeType) => (
                              <SelectItem key={sizeType.id} value={sizeType.id}>
                                {sizeType.size_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>GSM</Label>
                        <Input
                          value={product.gsm}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            products: prev.products.map((p, i) => 
                              i === productIndex ? { ...p, gsm: e.target.value } : p
                            )
                          }))}
                          placeholder="Enter GSM"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Price (INR)</Label>
                        <Input
                          type="number"
                          value={product.price}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            products: prev.products.map((p, i) => 
                              i === productIndex ? { ...p, price: parseFloat(e.target.value) || 0 } : p
                            )
                          }))}
                          placeholder="Enter price"
                        />
                      </div>
                    </div>

                    {/* Category Image Display */}
                    {product.category_image_url && (
                      <div className="space-y-2">
                        <Label>Category Image</Label>
                        <div className="flex items-center justify-center p-4 border-2 border-dashed border-muted rounded-lg bg-muted/10">
                          <img 
                            src={product.category_image_url} 
                            alt="Category" 
                            className="max-h-48 w-full object-contain rounded"
                          />
                        </div>
                      </div>
                    )}

                    {/* Image Upload Sections */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Reference Images</Label>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setFormData(prev => ({
                                ...prev,
                                products: prev.products.map((p, i) => 
                                  i === productIndex ? { ...p, reference_images: files.slice(0, 5) } : p
                                )
                              }));
                            }}
                            className="hidden"
                            id={`ref-images-${productIndex}`}
                          />
                          <label htmlFor={`ref-images-${productIndex}`} className="cursor-pointer block">
                            <Image className="w-10 h-10 mx-auto mb-3 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Reference Images</p>
                            <p className="text-xs text-muted-foreground mt-1">Up to 5 images • PNG, JPG</p>
                            {product.reference_images.length > 0 && (
                              <div className="mt-3">
                                <Badge variant="secondary" className="bg-primary/20 text-primary">
                                  {product.reference_images.length} file(s) selected
                                </Badge>
                                <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                                  {product.reference_images.slice(0, 4).map((file, idx) => (
                                    <div key={idx} className="relative">
                                      <img 
                                        src={URL.createObjectURL(file)} 
                                        alt={`Reference ${idx + 1}`}
                                        className="w-full h-24 object-cover rounded border"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Mockup Images</Label>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setFormData(prev => ({
                                ...prev,
                                products: prev.products.map((p, i) => 
                                  i === productIndex ? { ...p, mockup_images: files.slice(0, 5) } : p
                                )
                              }));
                            }}
                            className="hidden"
                            id={`mockup-images-${productIndex}`}
                          />
                          <label htmlFor={`mockup-images-${productIndex}`} className="cursor-pointer block">
                            <Image className="w-10 h-10 mx-auto mb-3 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Mockup Images</p>
                            <p className="text-xs text-muted-foreground mt-1">Up to 5 images • PNG, JPG</p>
                            {product.mockup_images.length > 0 && (
                              <div className="mt-3">
                                <Badge variant="secondary" className="bg-primary/20 text-primary">
                                  {product.mockup_images.length} file(s) selected
                                </Badge>
                                <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                                  {product.mockup_images.slice(0, 4).map((file, idx) => (
                                    <div key={idx} className="relative">
                                      <img 
                                        src={URL.createObjectURL(file)} 
                                        alt={`Mockup ${idx + 1}`}
                                        className="w-full h-24 object-cover rounded border"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Attachments</Label>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setFormData(prev => ({
                                ...prev,
                                products: prev.products.map((p, i) => 
                                  i === productIndex ? { ...p, attachments: files } : p
                                )
                              }));
                            }}
                            className="hidden"
                            id={`attachments-${productIndex}`}
                          />
                          <label htmlFor={`attachments-${productIndex}`} className="cursor-pointer block">
                            <Upload className="w-10 h-10 mx-auto mb-3 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Attachments</p>
                            <p className="text-xs text-muted-foreground mt-1">Any file type • PDF, DOC, etc.</p>
                            {product.attachments.length > 0 && (
                              <div className="mt-3">
                                <Badge variant="secondary" className="bg-primary/20 text-primary">
                                  {product.attachments.length} file(s) selected
                                </Badge>
                                <div className="mt-2 max-h-20 overflow-y-auto">
                                  {product.attachments.slice(0, 3).map((file, idx) => (
                                    <div key={idx} className="text-xs text-muted-foreground truncate bg-muted/50 rounded px-2 py-1 mt-1">
                                      {file.name}
                                    </div>
                                  ))}
                                  {product.attachments.length > 3 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      +{product.attachments.length - 3} more files
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Product Description</Label>
                      <Textarea
                        value={product.product_description}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          products: prev.products.map((p, i) => 
                            i === productIndex ? { ...p, product_description: e.target.value } : p
                          )
                        }))}
                        placeholder="Enter product description"
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Color</Label>
                      {product.fabric_id ? (
                        <Select
                          value={product.color}
                          onValueChange={(value) => setFormData(prev => ({
                            ...prev,
                            products: prev.products.map((p, i) => 
                              i === productIndex ? { ...p, color: value } : p
                            )
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants
                              .filter(variant => variant.fabric_id === product.fabric_id)
                              .map((variant) => (
                                <SelectItem key={variant.id} value={variant.color}>
                                  {variant.color} - {variant.gsm} GSM (₹{variant.rate_per_meter}/m)
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={product.color}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            products: prev.products.map((p, i) => 
                              i === productIndex ? { ...p, color: e.target.value } : p
                            )
                          }))}
                          placeholder="Select fabric first to see available colors"
                          disabled
                        />
                      )}
                    </div>

                    {/* Size Quantities */}
                    {product.size_type_id && (
                      <div className="space-y-2">
                        <Label>Size-wise Quantities</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(product.sizes_quantities || {}).map(([size, quantity]) => (
                            <div key={size} className="space-y-1">
                              <Label className="text-sm">{size}</Label>
                              <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => {
                                  const newQuantity = parseInt(e.target.value) || 0;
                                  setFormData(prev => ({
                                    ...prev,
                                    products: prev.products.map((p, i) => 
                                      i === productIndex 
                                        ? { 
                                            ...p, 
                                            sizes_quantities: { 
                                              ...p.sizes_quantities, 
                                              [size]: newQuantity 
                                            } 
                                          } 
                                        : p
                                    )
                                  }));
                                }}
                                placeholder="Qty"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Branding Section */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <Label className="text-base font-semibold">Branding Details</Label>
                        {product.branding_items.length < 5 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addBrandingItem(productIndex)}
                            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Branding
                          </Button>
                        )}
                      </div>
                      
                      {product.branding_items.map((brandingItem, brandingIndex) => (
                        <div key={brandingIndex} className="border-2 border-primary/30 rounded-lg p-5 space-y-4 bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary/40 transition-colors shadow-sm">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-foreground">Branding {brandingIndex + 1}</h4>
                            {product.branding_items.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeBrandingItem(productIndex, brandingIndex)}
                                className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Branding Type</Label>
                              <Input
                                value={brandingItem.branding_type}
                                onChange={(e) => updateBrandingItem(productIndex, brandingIndex, 'branding_type', e.target.value)}
                                placeholder="e.g., Embroidery, Print, etc."
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Placement</Label>
                              <Input
                                value={brandingItem.placement}
                                onChange={(e) => updateBrandingItem(productIndex, brandingIndex, 'placement', e.target.value)}
                                placeholder="e.g., Front chest, Back, etc."
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Measurement</Label>
                              <Input
                                value={brandingItem.measurement}
                                onChange={(e) => updateBrandingItem(productIndex, brandingIndex, 'measurement', e.target.value)}
                                placeholder="e.g., 4x4 inches, etc."
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea
                        value={product.remarks}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          products: prev.products.map((p, i) => 
                            i === productIndex ? { ...p, remarks: e.target.value } : p
                          )
                        }))}
                        placeholder="Enter any remarks"
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order Summary */}
            <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-xl">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
                <CardTitle className="text-primary">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>GST Rate (%)</Label>
                    <Select value={formData.gst_rate.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, gst_rate: parseFloat(value) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="12">12%</SelectItem>
                        <SelectItem value="18">18%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Channel</Label>
                    <Select value={formData.payment_channel} onValueChange={(value) => setFormData(prev => ({ ...prev, payment_channel: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="NEFT">NEFT</SelectItem>
                        <SelectItem value="RTGS">RTGS</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Advance Amount</Label>
                    <Input
                      type="number"
                      value={formData.advance_amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, advance_amount: parseFloat(e.target.value) || 0 }))}
                      placeholder="Enter advance amount"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Reference ID</Label>
                  <Input
                    value={formData.reference_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, reference_id: e.target.value }))}
                    placeholder="Enter reference ID"
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Sub Total</Label>
                    <p className="text-lg font-semibold">₹{subtotal.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">GST Amount</Label>
                    <p className="text-lg font-semibold">₹{gstAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Grand Total</Label>
                    <p className="text-lg font-semibold">₹{grandTotal.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Balance</Label>
                    <p className="text-lg font-semibold">₹{balance.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end space-x-4">
              <Button 
                type="button" 
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Save as Draft
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
              >
                {loading ? 'Creating Order...' : 'Create Order'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}