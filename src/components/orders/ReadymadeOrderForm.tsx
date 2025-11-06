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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarIcon, Plus, Trash2, X, Search, Image as ImageIcon, Upload, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  selling_price?: number;
  regular_selling_price?: number;
  mrp: number;
  gst_rate: number;
  current_stock: number;
  image_url?: string;
  main_image?: string;
  class?: string;
  size?: string;
  color?: string;
  category?: string;
  sku?: string;
  is_active: boolean;
}

interface ProductClass {
  class: string;
  image_url?: string;
  main_image?: string;
  total_stock: number;
  product_count: number;
}

interface BrandingItem {
  branding_type: string;
  placement: string;
  measurement: string;
}

interface BrandingType {
  id: string;
  name: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
}

interface OrderProduct {
  product_master_id: string;
  product_id: string;
  product_name: string;
  class?: string;
  size?: string; // Size from product_master
  color?: string; // Color from product_master
  category?: string; // Category from product_master
  quantity: number; // Total quantity (sum of sizes_quantities)
  sizes_quantities: { [size: string]: number }; // Size-wise quantities
  unit_price: number;
  gst_rate: number;
  total_price: number;
  reference_images: File[];
  mockup_images: File[];
  attachments: File[];
  branding_items: BrandingItem[];
}

interface AdditionalCharge {
  particular: string;
  rate: number;
  gst_percentage: number;
  amount_incl_gst: number;
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
  additional_charges: AdditionalCharge[];
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
  const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; avatar_url?: string }[]>([]);
  const [brandingTypes, setBrandingTypes] = useState<BrandingType[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [loading, setLoading] = useState(false);
  const [classSearchOpen, setClassSearchOpen] = useState<{ [key: number]: boolean }>({});
  const [mainImages, setMainImages] = useState<{ [key: number]: { reference?: string; mockup?: string } }>({});
  const [imageModal, setImageModal] = useState<{ open: boolean; url: string | null }>({ open: false, url: null });

  const [formData, setFormData] = useState<ReadymadeOrderFormData>({
    order_date: new Date(),
    expected_delivery_date: new Date(),
    customer_id: preSelectedCustomer?.id || '',
    sales_manager: '',
    products: [],
    payment_channel: '',
    reference_id: '',
    advance_amount: 0,
    notes: '',
    additional_charges: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch active products from product_master
      const { data: productsData, error: productsError } = await supabase
        .from('product_master')
        .select('id, product_id, product_name, class, sku, size, color, category, selling_price, regular_selling_price, mrp, gst_rate, current_stock, image_url, main_image, is_active')
        .eq('is_active', true)
        .order('product_name');

      if (productsError) throw productsError;
      const allProducts = (productsData || []) as ProductMaster[];
      setProducts(allProducts);

      // Group products by class and create unique classes with images
      const classMap = new Map<string, ProductClass>();
      
      allProducts.forEach(product => {
        const className = product.class || 'Unknown';
        if (!classMap.has(className)) {
          // Get the first product with an image for this class
          const firstProductWithImage = allProducts.find(p => 
            p.class === className && (p.main_image || p.image_url)
          );
          
          classMap.set(className, {
            class: className,
            image_url: firstProductWithImage?.image_url || firstProductWithImage?.main_image,
            main_image: firstProductWithImage?.main_image || firstProductWithImage?.image_url,
            total_stock: 0,
            product_count: 0
          });
        }
        
        const classData = classMap.get(className)!;
        classData.total_stock += product.current_stock || 0;
        classData.product_count += 1;
      });
      
      setProductClasses(Array.from(classMap.values()).sort((a, b) => a.class.localeCompare(b.class)));

      // Fetch employees for sales manager - filter to only show sales employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, full_name, department, designation, avatar_url')
        .order('full_name');

      if (employeesError) throw employeesError;
      
      // Filter employees to only show those from Sales Department or with Sales designation
      const salesEmployees = (employeesData || []).filter(emp => {
        const dept = emp.department?.toLowerCase() || '';
        const desig = emp.designation?.toLowerCase() || '';
        return dept.includes('sales') || desig.includes('sales');
      });
      
      setEmployees(salesEmployees);

      // Fetch branding types
      const { data: brandingData, error: brandingError } = await supabase
        .from('branding_types')
        .select('*')
        .order('name');

      if (brandingError) {
        console.warn('Error fetching branding types:', brandingError);
      } else {
        setBrandingTypes(brandingData || []);
      }

      // Fetch size types
      const { data: sizeTypesData, error: sizeTypesError } = await supabase
        .from('size_types')
        .select('*')
        .order('size_name');

      if (sizeTypesError) {
        console.warn('Error fetching size types:', sizeTypesError);
      } else {
        setSizeTypes(sizeTypesData || []);
      }
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
    setFormData(prev => ({
      ...prev,
      products: [
        ...prev.products,
        {
          product_master_id: '',
          product_id: '',
          product_name: '',
          class: '',
          size: '',
          color: '',
          category: '',
          quantity: 0,
          sizes_quantities: {},
          unit_price: 0,
          gst_rate: 18,
          total_price: 0,
          reference_images: [],
          mockup_images: [],
          attachments: [],
          branding_items: []
        }
      ]
    }));
  };

  const removeProduct = (index: number) => {
    setFormData({
      ...formData,
      products: formData.products.filter((_, i) => i !== index)
    });
  };

  const updateProduct = (index: number, field: keyof OrderProduct, value: any) => {
    const updatedProducts = [...formData.products];
    const product = { 
      ...updatedProducts[index],
      // Ensure all fields are preserved
      branding_items: updatedProducts[index].branding_items || [],
      reference_images: updatedProducts[index].reference_images || [],
      mockup_images: updatedProducts[index].mockup_images || [],
      attachments: updatedProducts[index].attachments || [],
      sizes_quantities: updatedProducts[index].sizes_quantities || {},
      color: updatedProducts[index].color || '',
      category: updatedProducts[index].category || ''
    };

    if (field === 'class') {
      // When class is selected, find the first available product of that class
      const selectedClass = productClasses.find(c => c.class === value);
      if (selectedClass) {
        const firstProduct = products.find(p => p.class === selectedClass.class && p.is_active);
        if (firstProduct) {
          product.product_master_id = firstProduct.id;
          product.product_id = firstProduct.product_id || firstProduct.sku || '';
          // Construct product name from available fields if product_name is empty
          product.product_name = firstProduct.product_name || 
            [firstProduct.category, firstProduct.class, firstProduct.color]
              .filter(Boolean)
              .join(' ') || 
            firstProduct.product_id || 
            firstProduct.sku || 
            selectedClass.class;
          product.class = selectedClass.class;
          product.color = firstProduct.color || '';
          product.category = firstProduct.category || '';
          product.unit_price = firstProduct.selling_price || firstProduct.regular_selling_price || firstProduct.mrp || 0;
          product.gst_rate = firstProduct.gst_rate || 0;
          // Initialize sizes_quantities for this class
          product.sizes_quantities = initializeSizesQuantities(selectedClass.class);
          product.quantity = 0;
          product.total_price = 0;
        }
      }
    } else if (field === 'product_master_id') {
      const selectedProduct = products.find(p => p.id === value);
      if (selectedProduct) {
        product.product_master_id = selectedProduct.id;
        product.product_id = selectedProduct.product_id || selectedProduct.sku || '';
        product.product_name = selectedProduct.product_name;
        product.class = selectedProduct.class;
        product.unit_price = selectedProduct.selling_price || selectedProduct.regular_selling_price || selectedProduct.mrp || 0;
        product.gst_rate = selectedProduct.gst_rate || 0;
        product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
      }
    } else if (field === 'unit_price') {
      product.unit_price = parseFloat(value) || 0;
      product.quantity = updateTotalQuantity(product);
      product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
    }

    updatedProducts[index] = product;
    setFormData({ ...formData, products: updatedProducts });
  };

  // Update size quantity
  const updateSizeQuantity = (productIndex: number, size: string, quantity: number) => {
    const updatedProducts = [...formData.products];
    const product = updatedProducts[productIndex];
    
    product.sizes_quantities = {
      ...product.sizes_quantities,
      [size]: Math.max(0, parseInt(quantity.toString()) || 0)
    };
    
    // Update total quantity
    product.quantity = updateTotalQuantity(product);
    
    // Update total price
    product.total_price = (product.unit_price * product.quantity) * (1 + (product.gst_rate / 100));
    
    updatedProducts[productIndex] = product;
    setFormData({ ...formData, products: updatedProducts });
  };

  const getProductsByClass = (className: string) => {
    return products.filter(p => p.class === className && p.is_active);
  };

  const getClassImage = (className: string) => {
    const classData = productClasses.find(c => c.class === className);
    return classData?.main_image || classData?.image_url || null;
  };

  // Get available sizes for a class
  const getAvailableSizesForClass = (className: string): string[] => {
    const classProducts = products.filter(p => p.class === className && p.is_active && p.size);
    const uniqueSizes = Array.from(new Set(classProducts.map(p => p.size).filter(Boolean) as string[]));
    
    // Sort sizes in proper order
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 
                       '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
                       '0-2 Yrs', '3-4 Yrs', '5-6 Yrs', '7-8 Yrs', '9-10 Yrs', '11-12 Yrs', '13-14 Yrs', '15-16 Yrs'];
    
    return uniqueSizes.sort((a, b) => {
      const indexA = sizeOrder.indexOf(a);
      const indexB = sizeOrder.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  };

  // Initialize sizes_quantities when class is selected
  const initializeSizesQuantities = (className: string): { [size: string]: number } => {
    const availableSizes = getAvailableSizesForClass(className);
    const sizesQuantities: { [size: string]: number } = {};
    availableSizes.forEach(size => {
      sizesQuantities[size] = 0;
    });
    return sizesQuantities;
  };

  // Update total quantity from sizes_quantities
  const updateTotalQuantity = (product: OrderProduct): number => {
    return Object.values(product.sizes_quantities || {}).reduce((sum, qty) => sum + qty, 0);
  };

  // Image handling functions
  const handleImageClick = (productIndex: number, imageType: 'reference' | 'mockup', imageUrl: string) => {
    setMainImages(prev => ({
      ...prev,
      [productIndex]: {
        ...prev[productIndex],
        [imageType]: imageUrl
      }
    }));
    setImageModal({ open: true, url: imageUrl });
  };

  const getMainImage = (productIndex: number, imageType: 'reference' | 'mockup') => {
    return mainImages[productIndex]?.[imageType] || null;
  };

  const handleImageUpload = (productIndex: number, imageType: 'reference' | 'mockup', files: File[]) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { 
          ...p, 
          [imageType === 'reference' ? 'reference_images' : 'mockup_images']: files.slice(0, 5) 
        } : p
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

  // Branding functions
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

  // Additional Charges Functions
  const addAdditionalCharge = () => {
    setFormData(prev => ({
      ...prev,
      additional_charges: [...prev.additional_charges, {
        particular: '',
        rate: 0,
        gst_percentage: 18,
        amount_incl_gst: 0
      }]
    }));
  };

  const removeAdditionalCharge = (index: number) => {
    setFormData(prev => ({
      ...prev,
      additional_charges: prev.additional_charges.filter((_, i) => i !== index)
    }));
  };

  const updateAdditionalCharge = (index: number, field: keyof AdditionalCharge, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      additional_charges: prev.additional_charges.map((charge, i) => {
        if (i === index) {
          const updatedCharge = { ...charge, [field]: value };
          // Recalculate amount_incl_gst when rate or gst_percentage changes
          if (field === 'rate' || field === 'gst_percentage') {
            const rate = field === 'rate' ? Number(value) : charge.rate;
            const gstPercentage = field === 'gst_percentage' ? Number(value) : charge.gst_percentage;
            updatedCharge.amount_incl_gst = rate + (rate * gstPercentage / 100);
          }
          return updatedCharge;
        }
        return charge;
      })
    }));
  };

  // Convert number to words
  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const convertLessThanOneThousand = (n: number): string => {
      if (n === 0) return '';

      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      }
      if (n < 1000) {
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanOneThousand(n % 100) : '');
      }
      return '';
    };

    if (num === 0) return 'Zero';

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const remainder = num % 1000;

    let result = '';

    if (crore > 0) {
      result += convertLessThanOneThousand(crore) + ' Crore';
    }
    if (lakh > 0) {
      result += (result ? ' ' : '') + convertLessThanOneThousand(lakh) + ' Lakh';
    }
    if (thousand > 0) {
      result += (result ? ' ' : '') + convertLessThanOneThousand(thousand) + ' Thousand';
    }
    if (remainder > 0) {
      result += (result ? ' ' : '') + convertLessThanOneThousand(remainder);
    }

    return result.trim() || 'Zero';
  };

  const calculateTotals = () => {
    const subtotal = formData.products.reduce((sum, p) => {
      // Calculate quantity from sizes_quantities if available, otherwise use quantity
      const qty = Object.keys(p.sizes_quantities || {}).length > 0 
        ? Object.values(p.sizes_quantities).reduce((qtySum, q) => qtySum + q, 0)
        : p.quantity;
      return sum + (p.unit_price * qty);
    }, 0);
    const gstAmount = formData.products.reduce((sum, p) => {
      const qty = Object.keys(p.sizes_quantities || {}).length > 0 
        ? Object.values(p.sizes_quantities).reduce((qtySum, q) => qtySum + q, 0)
        : p.quantity;
      const productTotal = p.unit_price * qty;
      return sum + (productTotal * (p.gst_rate / 100));
    }, 0);
    // Removed additional charges and advance amount as per custom order form
    const total = subtotal + gstAmount;
    return { subtotal, gstAmount, additionalChargesTotal: 0, total, balance: total };
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

    // Validate products - check if size quantities are set or total quantity > 0
    if (formData.products.some(p => {
      if (!p.product_master_id) return true;
      const totalQty = Object.keys(p.sizes_quantities || {}).length > 0
        ? Object.values(p.sizes_quantities).reduce((sum, qty) => sum + qty, 0)
        : p.quantity;
      return totalQty <= 0;
    })) {
      toast.error('Please fill in all product details correctly and ensure quantities are set');
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
          advance_amount: 0,
          balance_amount: total,
          payment_channel: null,
          reference_id: formData.reference_id || null,
          notes: formData.notes || null
        } as any)
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Upload images and attachments for each product, then create order items
      for (let productIndex = 0; productIndex < formData.products.length; productIndex++) {
        const product = formData.products[productIndex];
        const uploadedImages: { reference_images?: string[]; mockup_images?: string[]; attachments?: string[] } = {};

        // Upload reference images
        if (product.reference_images && product.reference_images.length > 0) {
          const referenceUrls: string[] = [];
          for (let i = 0; i < product.reference_images.length; i++) {
            const file = product.reference_images[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${orderData.id}_product${productIndex}_reference_${i + 1}.${fileExt}`;
            const filePath = `${orderData.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('order-images')
              .upload(filePath, file);

            if (uploadError) {
              console.error('Reference image upload error:', uploadError);
              continue; // Continue with other images even if one fails
            }

            const { data } = supabase.storage
              .from('order-images')
              .getPublicUrl(filePath);

            referenceUrls.push(data.publicUrl);
          }
          uploadedImages.reference_images = referenceUrls;
        }

        // Upload mockup images
        if (product.mockup_images && product.mockup_images.length > 0) {
          const mockupUrls: string[] = [];
          for (let i = 0; i < product.mockup_images.length; i++) {
            const file = product.mockup_images[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${orderData.id}_product${productIndex}_mockup_${i + 1}.${fileExt}`;
            const filePath = `${orderData.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('order-images')
              .upload(filePath, file);

            if (uploadError) {
              console.error('Mockup image upload error:', uploadError);
              continue;
            }

            const { data } = supabase.storage
              .from('order-images')
              .getPublicUrl(filePath);

            mockupUrls.push(data.publicUrl);
          }
          uploadedImages.mockup_images = mockupUrls;
        }

        // Upload attachments
        if (product.attachments && product.attachments.length > 0) {
          const attachmentUrls: string[] = [];
          for (let i = 0; i < product.attachments.length; i++) {
            const file = product.attachments[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${orderData.id}_product${productIndex}_attachment_${i + 1}.${fileExt}`;
            const filePath = `${orderData.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('order-attachments')
              .upload(filePath, file);

            if (uploadError) {
              console.error('Attachment upload error:', uploadError);
              continue;
            }

            const { data } = supabase.storage
              .from('order-attachments')
              .getPublicUrl(filePath);

            attachmentUrls.push(data.publicUrl);
          }
          uploadedImages.attachments = attachmentUrls;
        }

        // Calculate total quantity from sizes_quantities
        const totalQuantity = Object.keys(product.sizes_quantities || {}).length > 0
          ? Object.values(product.sizes_quantities).reduce((sum, qty) => sum + qty, 0)
          : product.quantity;

        // Get class image for this product
        const classImage = getClassImage(product.class);

        // Create order item with uploaded images and branding
        const { error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: orderData.id,
            product_id: null,
            quantity: totalQuantity,
            unit_price: product.unit_price,
            total_price: product.total_price,
            gst_rate: product.gst_rate,
            product_description: product.product_name,
            specifications: {
              product_master_id: product.product_master_id,
              product_id: product.product_id,
              product_name: product.product_name,
              class: product.class,
              size: product.size,
              color: product.color,
              category: product.category,
              sizes_quantities: product.sizes_quantities || {},
              order_type: 'readymade',
              class_image: classImage, // Store class image
              branding_items: product.branding_items || [],
              reference_images: uploadedImages.reference_images || [],
              mockup_images: uploadedImages.mockup_images || [],
              attachments: uploadedImages.attachments || []
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

      const { subtotal, gstAmount, total } = calculateTotals();
  const grandTotal = total;

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
                  <SelectValue placeholder="Select sales manager">
                    {formData.sales_manager && (() => {
                      const selectedEmp = employees.find(e => e.id === formData.sales_manager);
                      return selectedEmp ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={selectedEmp.avatar_url} alt={selectedEmp.full_name} />
                            <AvatarFallback className="text-xs">
                              {selectedEmp.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{selectedEmp.full_name}</span>
                        </div>
                      ) : 'Select sales manager';
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={emp.avatar_url} alt={emp.full_name} />
                          <AvatarFallback className="text-xs">
                            {emp.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{emp.full_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.sales_manager && (() => {
                const selectedEmp = employees.find(e => e.id === formData.sales_manager);
                return selectedEmp ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={selectedEmp.avatar_url} alt={selectedEmp.full_name} />
                      <AvatarFallback className="text-xs">
                        {selectedEmp.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{selectedEmp.full_name}</span>
                  </div>
                ) : null;
              })()}
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

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Class *</Label>
                  <Popover 
                    open={classSearchOpen[index] || false} 
                    onOpenChange={(open) => setClassSearchOpen({ ...classSearchOpen, [index]: open })}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {product.class ? (
                          <div className="flex items-center gap-2">
                            {getClassImage(product.class) && (
                              <img 
                                src={getClassImage(product.class)!} 
                                alt={product.class}
                                className="w-6 h-6 rounded object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <span>{product.class}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select class...</span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search class..." />
                        <CommandList>
                          <CommandEmpty>No class found.</CommandEmpty>
                          <CommandGroup>
                            {productClasses.map((classItem) => (
                              <CommandItem
                                key={classItem.class}
                                value={classItem.class}
                                onSelect={() => {
                                  updateProduct(index, 'class', classItem.class);
                                  setClassSearchOpen({ ...classSearchOpen, [index]: false });
                                }}
                                className="flex items-center gap-3 p-3 cursor-pointer"
                              >
                                <div className="relative w-20 h-20 rounded border overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                                  {classItem.main_image || classItem.image_url ? (
                                    <img
                                      src={classItem.main_image || classItem.image_url}
                                      alt={classItem.class}
                                      className="w-full h-full object-cover rounded"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        if (e.currentTarget.parentElement) {
                                          e.currentTarget.parentElement.innerHTML = '<div class="w-20 h-20 rounded border bg-muted flex items-center justify-center"><svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                                        }
                                      }}
                                    />
                                  ) : (
                                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium">{classItem.class}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {classItem.product_count} product{classItem.product_count !== 1 ? 's' : ''} • Stock: {classItem.total_stock}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Product Details - Show after class is selected */}
                {product.class && (
                  <>
                    <div className="space-y-2">
                      <Label>Product *</Label>
                      <Input
                        value={product.product_name || (product.category && product.color ? `${product.category} - ${product.color}` : product.class || '')}
                        readOnly
                        className="bg-muted"
                        placeholder="Product name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Color *</Label>
                      <Input
                        value={product.color || ''}
                        readOnly
                        className="bg-muted"
                        placeholder="Color"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Input
                        value={product.category || ''}
                        readOnly
                        className="bg-muted"
                        placeholder="Category"
                      />
                    </div>
                  </>
                )}
                
                {!product.class && (
                  <div className="space-y-2 md:col-span-3">
                    <Label>Product *</Label>
                    <Input
                      value=""
                      disabled
                      placeholder="Select class first"
                      className="bg-gray-50"
                    />
                  </div>
                )}

                {/* Size-wise Quantities - Show after class is selected */}
                {product.class && getAvailableSizesForClass(product.class).length > 0 && (
                  <div className="space-y-2 md:col-span-4">
                    <Label className="text-base font-semibold">Size-wise Quantities *</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 border rounded-lg bg-muted/30">
                      {getAvailableSizesForClass(product.class).map((size) => (
                        <div key={size} className="space-y-1">
                          <Label className="text-sm font-medium">{size}</Label>
                          <Input
                            type="number"
                            min="0"
                            value={product.sizes_quantities?.[size] || 0}
                            onChange={(e) => updateSizeQuantity(index, size, parseInt(e.target.value) || 0)}
                            placeholder="0"
                            className="text-center"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Quantity: <span className="font-semibold">{product.quantity}</span>
                    </div>
                  </div>
                )}

                {/* Fallback to simple quantity input if no sizes available */}
                {product.class && getAvailableSizesForClass(product.class).length === 0 && (
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={product.quantity}
                      onChange={(e) => {
                        const qty = Math.max(1, parseInt(e.target.value) || 1);
                        const updatedProducts = [...formData.products];
                        updatedProducts[index] = {
                          ...product,
                          quantity: qty,
                          total_price: (product.unit_price * qty) * (1 + (product.gst_rate / 100))
                        };
                        setFormData({ ...formData, products: updatedProducts });
                      }}
                  />
                </div>
                )}

                {/* Show quantity input if no class selected */}
                {!product.class && (
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={product.quantity}
                      disabled
                      placeholder="Select class first"
                      className="bg-gray-50"
                    />
                  </div>
                )}

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

              <div className="flex items-center gap-4 text-sm border-t pt-2">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Total Quantity: <span className="font-semibold">{product.quantity}</span></div>
                  {product.sizes_quantities && Object.keys(product.sizes_quantities).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Size breakdown: {Object.entries(product.sizes_quantities)
                        .filter(([_, qty]) => qty > 0)
                        .map(([size, qty]) => `${size}:${qty}`)
                        .join(', ') || 'None'}
              </div>
                  )}
                </div>
                <div className="text-right">
                  <div>GST: {product.gst_rate}%</div>
                  <div className="font-medium">Total: {formatCurrency(product.total_price)}</div>
                </div>
              </div>

              {/* Image Gallery Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
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
                        handleImageUpload(index, 'reference', files);
                      }}
                      className="hidden"
                      id={`ref-images-${index}`}
                    />
                    <label htmlFor={`ref-images-${index}`} className="cursor-pointer block">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 text-primary" />
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
                            src={getMainImage(index, 'reference') || URL.createObjectURL(product.reference_images[0])} 
                            alt="Main Reference"
                            className="w-full h-64 object-contain rounded cursor-pointer hover:scale-105 transition-transform duration-200"
                            onClick={() => handleImageClick(index, 'reference', getMainImage(index, 'reference') || URL.createObjectURL(product.reference_images[0]))}
                          />
                          <p className="text-center text-sm text-muted-foreground mt-2">Click to see full view</p>
                        </div>
                        
                        {/* Thumbnail Gallery */}
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {product.reference_images.map((file, idx) => (
                            <div 
                              key={idx} 
                              className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200"
                              onClick={() => handleImageClick(index, 'reference', URL.createObjectURL(file))}
                            >
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`Reference ${idx + 1}`}
                                className={`w-16 h-16 object-cover rounded border-2 ${
                                  getMainImage(index, 'reference') === URL.createObjectURL(file) 
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
                        handleImageUpload(index, 'mockup', files);
                      }}
                      className="hidden"
                      id={`mockup-images-${index}`}
                    />
                    <label htmlFor={`mockup-images-${index}`} className="cursor-pointer block">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 text-primary" />
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
                            src={getMainImage(index, 'mockup') || URL.createObjectURL(product.mockup_images[0])} 
                            alt="Main Mockup"
                            className="w-full h-64 object-contain rounded cursor-pointer hover:scale-105 transition-transform duration-200"
                            onClick={() => handleImageClick(index, 'mockup', getMainImage(index, 'mockup') || URL.createObjectURL(product.mockup_images[0]))}
                          />
                          <p className="text-center text-sm text-muted-foreground mt-2">Click to see full view</p>
                        </div>
                        
                        {/* Thumbnail Gallery */}
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {product.mockup_images.map((file, idx) => (
                            <div 
                              key={idx} 
                              className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200"
                              onClick={() => handleImageClick(index, 'mockup', URL.createObjectURL(file))}
                            >
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`Mockup ${idx + 1}`}
                                className={`w-16 h-16 object-cover rounded border-2 ${
                                  getMainImage(index, 'mockup') === URL.createObjectURL(file) 
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

              {/* Attachments Section */}
              <div className="space-y-3 mt-6">
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
                          i === index ? { ...p, attachments: files } : p
                        )
                      }));
                    }}
                    className="hidden"
                    id={`attachments-${index}`}
                  />
                  <label htmlFor={`attachments-${index}`} className="cursor-pointer block">
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

              {/* Branding Section */}
              <div className="space-y-4 mt-6">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Branding Details</Label>
                  {(product.branding_items?.length || 0) < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addBrandingItem(index)}
                      className="border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Branding
                    </Button>
                  )}
                </div>
                
                {(!product.branding_items || product.branding_items.length === 0) && (
                  <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed border-gray-300 rounded-lg">
                    No branding items added. Click "Add Branding" to add branding details.
                  </div>
                )}
                
                {(product.branding_items || []).map((brandingItem, brandingIndex) => (
                  <div key={brandingIndex} className="border-2 border-primary/30 rounded-lg p-5 space-y-4 bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary/40 transition-colors shadow-sm">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-foreground">Branding {brandingIndex + 1}</h4>
                      {(product.branding_items?.length || 0) > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBrandingItem(index, brandingIndex)}
                          className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Branding Type</Label>
                        <Select
                          value={brandingItem.branding_type}
                          onValueChange={(value) => updateBrandingItem(index, brandingIndex, 'branding_type', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select branding type" />
                          </SelectTrigger>
                          <SelectContent>
                            {brandingTypes.length > 0 ? (
                              brandingTypes.map((brandingType) => (
                                <SelectItem key={brandingType.id} value={brandingType.name}>
                                  <div className="flex items-center gap-2">
                                    <span>{brandingType.name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {brandingType.scope}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                No branding types available
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Placement</Label>
                        <Input
                          value={brandingItem.placement}
                          onChange={(e) => updateBrandingItem(index, brandingIndex, 'placement', e.target.value)}
                          placeholder="e.g., Front chest, Back, etc."
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Measurement</Label>
                        <Input
                          value={brandingItem.measurement}
                          onChange={(e) => updateBrandingItem(index, brandingIndex, 'measurement', e.target.value)}
                          placeholder="e.g., 4x4 inches, etc."
                        />
                      </div>
                    </div>
                  </div>
                ))}
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

      {/* Order Summary */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-xl">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
          <CardTitle className="text-primary">ORDER SUMMARY</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Product Summary Table */}
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Product Image</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Product Name</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Color</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Category</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Size-wise Qty</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Total Qty</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Price</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Amount</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">GST Rate</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">GST Amt</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.products.map((product, index) => {
                    const amount = product.quantity * product.unit_price;
                    const gstAmount = (amount * (product.gst_rate || 0)) / 100;
                    const total = amount + gstAmount;
                    const productData = products.find(p => p.id === product.product_master_id);
                    const classImage = getClassImage(product.class || '');
                    
                    // Get size-wise breakdown
                    const sizeBreakdown = product.sizes_quantities && Object.keys(product.sizes_quantities).length > 0
                      ? Object.entries(product.sizes_quantities)
                          .filter(([_, qty]) => qty > 0)
                          .map(([size, qty]) => `${size}: ${qty}`)
                          .join(', ')
                      : 'N/A';
                    
                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2">
                          {classImage ? (
                            <img 
                              src={classImage} 
                              alt={product.class || 'Product'} 
                              className="w-20 h-20 object-cover rounded"
                            />
                          ) : (
                            <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </td>
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="text-sm">
                            <div className="font-medium">{product.product_name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{product.class || ''}</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="text-sm">{product.color || 'N/A'}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="text-sm">{product.category || 'N/A'}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="text-sm text-xs">{sizeBreakdown}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2">
                          <div className="text-sm font-medium">{product.quantity}</div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">₹{product.unit_price}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(amount)}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">
                          <Input
                            type="number"
                            min={0}
                            value={product.gst_rate}
                            onChange={e => {
                              const updatedProducts = [...formData.products];
                              updatedProducts[index] = {
                                ...product,
                                gst_rate: parseFloat(e.target.value) || 0,
                                total_price: (product.unit_price * product.quantity) * (1 + ((parseFloat(e.target.value) || 0) / 100))
                              };
                              setFormData({ ...formData, products: updatedProducts });
                            }}
                            className="w-16 h-8 text-xs px-1 py-0 border border-gray-300 rounded"
                          />
                          %
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(gstAmount)}</td>
                        <td className="border border-gray-300 px-3 py-2 text-sm font-medium">{formatCurrency(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Subtotal */}
            <div className="text-right">
              <div className="text-lg font-semibold">Subtotal: {formatCurrency(subtotal)}</div>
            </div>
          </div>

          {/* Grand Total and Amount in Words */}
          <div className="flex justify-between items-end pt-4 border-t">
            <div className="space-y-2">
              <div className="text-sm text-gray-600">Amount in words:</div>
              <div className="text-sm font-medium">INR {numberToWords(Math.round(grandTotal))}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">Grand Total: {formatCurrency(grandTotal)}</div>
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

      {/* Image Modal */}
      <Dialog open={imageModal.open} onOpenChange={(open) => setImageModal({ open, url: imageModal.url })}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          {imageModal.url && (
            <img 
              src={imageModal.url} 
              alt="Preview" 
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}

