import { useState, useEffect, useRef } from 'react';
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
import { CalendarIcon, Plus, Trash2, Upload, X, Image, ChevronLeft, ChevronRight, Lock, Unlock, Save } from 'lucide-react';
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
  fabrics: string[];
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
  const [selectedCategoryImage, setSelectedCategoryImage] = useState<string>('');
  const [isCategoryLocked, setIsCategoryLocked] = useState(false);
  const [mainImages, setMainImages] = useState<{ [productIndex: number]: { reference: string | null, mockup: string | null, category: string | null } }>({});
  const sliderRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-scroll functionality - DISABLED as per user request
  // useEffect(() => {
  //   if (!isCategoryLocked && productCategories.length > 1 && sliderRef.current) {
  //     autoScrollIntervalRef.current = setInterval(() => {
  //       if (sliderRef.current) {
  //         const scrollAmount = 320; // Width of one item
  //         const currentScroll = sliderRef.current.scrollLeft;
  //         const maxScroll = sliderRef.current.scrollWidth - sliderRef.current.clientWidth;
  //         
  //         if (currentScroll >= maxScroll) {
  //           // Reset to beginning when reaching the end
  //           sliderRef.current.scrollTo({ left: 0, behavior: 'smooth' });
  //         } else {
  //           // Scroll to next item
  //           sliderRef.current.scrollTo({ left: currentScroll + scrollAmount, behavior: 'smooth' });
  //         }
  //       }
  //     }, 4000); // Scroll every 4 seconds
  //   }

  //   return () => {
  //     if (autoScrollIntervalRef.current) {
  //       clearInterval(autoScrollIntervalRef.current);
  //       autoScrollIntervalRef.current = null;
  //     }
  //   };
  // }, [isCategoryLocked, productCategories.length]);

  const handleCategoryImageSelect = (categoryId: string, imageUrl: string) => {
    setSelectedCategoryImage(imageUrl);
    setIsCategoryLocked(true);
    // Stop auto-scroll
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
    }
  };

  const handleSaveCategory = (productIndex: number) => {
    const category = productCategories.find(c => c.category_image_url === selectedCategoryImage);
    if (category) {
      handleProductCategorySelect(productIndex, category.id);
      toast.success(`Category "${category.category_name}" selected!`);
    }
  };

  const handleUnlockCategory = () => {
    setIsCategoryLocked(false);
    setSelectedCategoryImage('');
    // Auto-scroll will restart automatically due to useEffect dependency
  };

  // Handle fabric selection and auto-select GSM
  const handleFabricSelect = (productIndex: number, fabricId: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { ...p, fabric_id: fabricId, color: '', gsm: '' } : p
      )
    }));
  };

  // Handle color selection and auto-select GSM
  const handleColorSelect = (productIndex: number, color: string) => {
    const product = formData.products[productIndex];
    const selectedVariant = fabricVariants.find(variant => 
      variant.fabric_id === product.fabric_id && variant.color === color
    );
    
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { 
          ...p, 
          color: color, 
          gsm: selectedVariant?.gsm || '',
          price: selectedVariant?.rate_per_meter || 0
        } : p
      )
    }));
  };

  // Handle image gallery functionality
  const handleImageClick = (productIndex: number, imageType: 'reference' | 'mockup' | 'category', imageUrl: string) => {
    setMainImages(prev => ({
      ...prev,
      [productIndex]: {
        ...prev[productIndex],
        [imageType]: imageUrl
      }
    }));
  };

  const getMainImage = (productIndex: number, imageType: 'reference' | 'mockup' | 'category') => {
    return mainImages[productIndex]?.[imageType] || null;
  };

  // Set first image as main image when images are uploaded
  const handleImageUpload = (productIndex: number, imageType: 'reference' | 'mockup', files: File[]) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { ...p, [imageType === 'reference' ? 'reference_images' : 'mockup_images']: files.slice(0, 5) } : p
      )
    }));

    // Set first image as main image if no main image is set
    if (files.length > 0 && !getMainImage(productIndex, imageType)) {
      setMainImages(prev => ({
        ...prev,
        [productIndex]: {
          ...prev[productIndex],
          [imageType]: URL.createObjectURL(files[0])
        }
      }));
    }
  };

  const scrollLeft = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

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
              category_image_url: category?.category_image_url || '',
              fabric_id: '' // Reset fabric selection when category changes
            }
          : product
      )
    }));
  };

  // Get fabrics filtered by selected product category
  const getFilteredFabrics = (productIndex: number) => {
    const product = formData.products[productIndex];
    if (!product.product_category_id) {
      return fabrics; // Show all fabrics if no category is selected
    }
    
    const category = productCategories.find(c => c.id === product.product_category_id);
    if (!category || !category.fabrics || category.fabrics.length === 0) {
      return fabrics; // Show all fabrics if category has no associated fabrics
    }
    
    // Filter fabrics based on category's associated fabric IDs
    return fabrics.filter(fabric => category.fabrics.includes(fabric.id));
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
                  <CardContent className="space-y-6">
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  {/* Left Column - Product Category */}
  <div className="lg:col-span-4">
     <Label className="text-base font-semibold text-gray-700">Product Category</Label>
                         
                         {/* Image-based Category Selector */}
                         <div className="relative"> {/* Added horizontal padding */}
                           <div className="w-[300px] h-[400px] bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden relative shadow-lg hover:shadow-xl transition-all duration-300">
                             {/* Category Slider */}
                             <div 
                               ref={sliderRef}
                               className={cn(
                                 "flex transition-all duration-500 ease-in-out h-full overflow-x-auto scrollbar-hide",
                                 isCategoryLocked ? "pointer-events-none" : "cursor-pointer"
                               )}
                               style={{ 
                                 scrollBehavior: isCategoryLocked ? 'auto' : 'smooth',
                                 scrollbarWidth: 'none',
                                 msOverflowStyle: 'none'
                               }}
                             >
                               {productCategories.map((category) => (
                                 <div 
                                   key={category.id}
                                   className="flex-shrink-0 w-[300px] h-full relative group"
                                   onClick={() => !isCategoryLocked && handleCategoryImageSelect(category.id, category.category_image_url)}
                                 >
                                   <img 
                                     src={category.category_image_url || '/placeholder-category.svg'} 
                                     alt={category.category_name}
                                     className="w-full h-full object-contain bg-gradient-to-br from-gray-100 to-gray-200"
                                     onError={(e) => {
                                       e.currentTarget.src = '/placeholder-category.svg';
                                     }}
                                   />
                                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-8">
                                     <div className="text-white text-center transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                       <p className="font-bold text-xl mb-2">{category.category_name}</p>
                                       <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium">
                                         Click to select
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               ))}
                             </div>

                             {/* Lock Icon Overlay */}
                             {isCategoryLocked && (
                               <div className="absolute inset-0   flex items-center justify-center">
                                 <div className="bg-white rounded-full p-4 shadow-xl border-2 border-gray-200">
                                   <Lock className="w-8 h-8 text-gray-700" />
                                 </div>
                               </div>
                             )}

                             {/* Navigation Arrows */}
                             {!isCategoryLocked && productCategories.length > 1 && (
                               <>
                                 <button
                                   type="button"
                                   onClick={scrollLeft}
                                   className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-3 shadow-lg transition-all duration-200 z-10 hover:scale-110"
                                 >
                                   <ChevronLeft className="w-6 h-6 text-gray-700" />
                                 </button>
                                 <button
                                   type="button"
                                   onClick={scrollRight}
                                   className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-3 shadow-lg transition-all duration-200 z-10 hover:scale-110"
                                 >
                                   <ChevronRight className="w-6 h-6 text-gray-700" />
                                 </button>
                               </>
                             )}

                             {/* Save Button */}
                             {selectedCategoryImage && isCategoryLocked && (
                               <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                                 <Button
                                   type="button"
                                   onClick={() => handleSaveCategory(productIndex)}
                                   className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
                                   size="sm"
                                 >
                                   <Save className="w-4 h-4 mr-2" />
                                   Save Category
                                 </Button>
                               </div>
                             )}

                             {/* Unlock Button */}
                             {isCategoryLocked && (
                               <button
                                 type="button"
                                 onClick={handleUnlockCategory}
                                 className="absolute top-3 right-3 bg-white/90 hover:bg-white rounded-full p-3 shadow-lg transition-all duration-200 z-10 hover:scale-110"
                                 title="Unlock to change category"
                               >
                                 <Unlock className="w-5 h-5 text-gray-700" />
                               </button>
                             )}
                           </div>
                           </div>
  </div>

  {/* Right Column - 2 Rows × 2 Columns each */}
  <div className="lg:col-span-8 grid grid-cols-1 gap-6">
    {/* Row 1 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Fabric */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">Fabric</Label>
        <Select
          value={product.fabric_id}
          onValueChange={(value) => handleFabricSelect(productIndex, value)}
          disabled={!product.product_category_id}
        >
          <SelectTrigger>
            <SelectValue placeholder={product.product_category_id ? "Select fabric" : "Select category first"} />
          </SelectTrigger>
          <SelectContent>
            {getFilteredFabrics(productIndex).map((fabric) => (
              <SelectItem key={fabric.id} value={fabric.id}>
                {fabric.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Size Type */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">Size Type</Label>
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
{/* <div className="space-y-3">
                        <Label>Color</Label>
                        {product.fabric_id ? (
                          <Select
                            value={product.color}
                            onValueChange={(value) => handleColorSelect(productIndex, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select color" />
                            </SelectTrigger>
                            <SelectContent>
                                                          {fabricVariants
                              .filter(variant => variant.fabric_id === product.fabric_id)
                              .map((variant) => (
                                <SelectItem key={variant.id} value={variant.color}>
                                  {variant.color}
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
                            placeholder={product.product_category_id ? "Select fabric first to see available colors" : "Select category and fabric first"}
                            disabled
                          />
                        )}
                      </div> */}
                      
    {/* Row 2 */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* COLOR */}
      <div >
                        <Label className="text-base font-semibold text-gray-700 mb-2 block">Color</Label>
                        {product.fabric_id ? (
                          <Select
                            value={product.color}
                            onValueChange={(value) => handleColorSelect(productIndex, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select color" />
                            </SelectTrigger>
                            <SelectContent>
                                                          {fabricVariants
                              .filter(variant => variant.fabric_id === product.fabric_id)
                              .map((variant) => (
                                <SelectItem key={variant.id} value={variant.color}>
                                  {variant.color}
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
                            placeholder={product.product_category_id ? "Select fabric first to see available colors" : "Select category and fabric first"}
                            disabled
                          />
                        )}
                      </div>
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">GSM (Auto-selected)</Label>
        <Input
          value={product.gsm}
          placeholder="GSM will be auto-selected from fabric"
          disabled
          className="bg-gray-50"
        />
      </div>

      
    </div>
       <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">GSM (Auto-selected)</Label>
        <Input
          value={product.gsm}
          placeholder="GSM will be auto-selected from fabric"
          disabled
          className="bg-gray-50"
        />
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
                          rows={2}
                          className="resize-none"
                        />
                      </div>

                      
  </div>
  
</div>


                    

                                          {/* Selected Category Image Display */}
                      
                    {/* Image Gallery Sections */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Reference Images Gallery */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Reference Images</Label>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              handleImageUpload(productIndex, 'reference', files);
                            }}
                            className="hidden"
                            id={`ref-images-${productIndex}`}
                          />
                          <label htmlFor={`ref-images-${productIndex}`} className="cursor-pointer block">
                            <Image className="w-8 h-8 mx-auto mb-2 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Reference Images</p>
                            <p className="text-xs text-muted-foreground">Up to 5 images • Click thumbnails to view</p>
                          </label>
                          
                          {product.reference_images.length > 0 && (
                            <div className="mt-4">
                              <Badge variant="secondary" className="bg-primary/20 text-primary mb-3">
                                {product.reference_images.length} file(s) selected
                              </Badge>
                              
                              {/* Main Image Display */}
                              <div className="mb-3 p-2 border-2 border-primary/30 rounded-lg bg-white">
                                <img 
                                  src={getMainImage(productIndex, 'reference') || URL.createObjectURL(product.reference_images[0])} 
                                  alt="Main Reference"
                                  className="w-full h-64 object-contain rounded cursor-pointer hover:scale-105 transition-transform duration-200"
                                />
                                <p className="text-center text-sm text-muted-foreground mt-2">Click to see full view</p>
                              </div>
                              
                              {/* Thumbnail Gallery */}
                              <div className="flex gap-2 overflow-x-auto pb-2">
                                {product.reference_images.map((file, idx) => (
                                  <div 
                                    key={idx} 
                                    className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200"
                                    onClick={() => handleImageClick(productIndex, 'reference', URL.createObjectURL(file))}
                                  >
                                    <img 
                                      src={URL.createObjectURL(file)} 
                                      alt={`Reference ${idx + 1}`}
                                      className={`w-16 h-16 object-cover rounded border-2 ${
                                        getMainImage(productIndex, 'reference') === URL.createObjectURL(file) 
                                          ? 'border-primary' 
                                          : 'border-gray-200'
                                      }`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mockup Images Gallery */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Mockup Images</Label>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              handleImageUpload(productIndex, 'mockup', files);
                            }}
                            className="hidden"
                            id={`mockup-images-${productIndex}`}
                          />
                          <label htmlFor={`mockup-images-${productIndex}`} className="cursor-pointer block">
                            <Image className="w-8 h-8 mx-auto mb-2 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Mockup Images</p>
                            <p className="text-xs text-muted-foreground">Up to 5 images • Click thumbnails to view</p>
                          </label>
                          
                          {product.mockup_images.length > 0 && (
                            <div className="mt-4">
                              <Badge variant="secondary" className="bg-primary/20 text-primary mb-3">
                                {product.mockup_images.length} file(s) selected
                              </Badge>
                              
                              {/* Main Image Display */}
                              <div className="mb-3 p-2 border-2 border-primary/30 rounded-lg bg-white">
                                <img 
                                  src={getMainImage(productIndex, 'mockup') || URL.createObjectURL(product.mockup_images[0])} 
                                  alt="Main Mockup"
                                  className="w-full h-64 object-contain rounded cursor-pointer hover:scale-105 transition-transform duration-200"
                                />
                                <p className="text-center text-sm text-muted-foreground mt-2">Click to see full view</p>
                              </div>
                              
                              {/* Thumbnail Gallery */}
                              <div className="flex gap-2 overflow-x-auto pb-2">
                                {product.mockup_images.map((file, idx) => (
                                  <div 
                                    key={idx} 
                                    className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200"
                                    onClick={() => handleImageClick(productIndex, 'mockup', URL.createObjectURL(file))}
                                  >
                                    <img 
                                      src={URL.createObjectURL(file)} 
                                      alt={`Mockup ${idx + 1}`}
                                      className={`w-16 h-16 object-cover rounded border-2 ${
                                        getMainImage(productIndex, 'mockup') === URL.createObjectURL(file) 
                                          ? 'border-primary' 
                                          : 'border-gray-200'
                                      }`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
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
                    {/* Removed extra closing div to fix JSX tag mismatch */}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* <div className="space-y-2">
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
                          rows={2}
                          className="resize-none"
                        />
                      </div> */}

                      {/* <div className="space-y-2">
                        <Label>Color</Label>
                        {product.fabric_id ? (
                          <Select
                            value={product.color}
                            onValueChange={(value) => handleColorSelect(productIndex, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select color" />
                            </SelectTrigger>
                            <SelectContent>
                                                          {fabricVariants
                              .filter(variant => variant.fabric_id === product.fabric_id)
                              .map((variant) => (
                                <SelectItem key={variant.id} value={variant.color}>
                                  {variant.color}
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
                            placeholder={product.product_category_id ? "Select fabric first to see available colors" : "Select category and fabric first"}
                            disabled
                          />
                        )}
                      </div> */}
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