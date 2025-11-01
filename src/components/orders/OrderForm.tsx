import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { SizeTypeSelector } from './SizeTypeSelector';
import { ProductCustomizationModal } from './ProductCustomizationModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, Upload, X, Image, ChevronLeft, ChevronRight, Lock, Unlock, Save } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
import { getOrderItemDisplayImageForForm, getImageSrcFromFileOrUrl } from '@/utils/orderItemImageUtils';

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

interface FabricMaster {
  id: string;
  fabric_code: string;
  fabric_name: string;
  fabric_description?: string | null;
  type: string;
  color: string;
  hex?: string | null;
  gsm?: string | null;
  uom: string;
  rate: number;
  hsn_code?: string | null;
  gst: number;
  image?: string | null;
  inventory: number;
  supplier1?: string | null;
  supplier2?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  department: string;
  avatar_url?: string;
}

interface BrandingType {
  id: string;
  name: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

interface BrandingItem {
  branding_type: string;
  placement: string;
  measurement: string;
}

interface AdditionalCharge {
  particular: string;
  rate: number;
  gst_percentage: number;
  amount_incl_gst: number;
}

interface Customization {
  partId: string;
  partName: string;
  partType: 'dropdown' | 'number';
  selectedAddonId?: string;
  selectedAddonName?: string;
  selectedAddonImageUrl?: string;
  selectedAddonImageAltText?: string;
  customValue?: string;
  quantity?: number;
  priceImpact?: number;
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
  gst_rate: number;
  customizations: Customization[];
}

interface OrderFormData {
  order_date: Date;
  expected_delivery_date: Date;
  customer_id: string;
  sales_manager: string;
  products: Product[];
  gst_rate: number; // keep for now, but not used in summary
  payment_channel: string;
  reference_id: string;
  advance_amount: number;
  additional_charges: AdditionalCharge[];
}

interface OrderFormProps {
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

export function OrderForm({ preSelectedCustomer, onOrderCreated }: OrderFormProps = {}) {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [fabrics, setFabrics] = useState<FabricMaster[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [brandingTypes, setBrandingTypes] = useState<BrandingType[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState<OrderFormData>({
    order_date: new Date(),
    expected_delivery_date: new Date(),
    customer_id: preSelectedCustomer?.id || '',
    sales_manager: '',
    products: [createEmptyProduct()],
    gst_rate: 18,
    payment_channel: '',
    reference_id: '',
    advance_amount: 0,
    additional_charges: []
  });

  const [isLoaded, setIsLoaded] = useState(true);
  const [hasSavedData, setHasSavedData] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);

  // Simple form persistence using localStorage directly
  useEffect(() => {
    setIsFormLoading(true);
    try {
      const savedData = localStorage.getItem('orderFormData');
      if (savedData && !preSelectedCustomer) {
        console.log('OrderForm: Loading saved form data from localStorage');
        const parsedData = JSON.parse(savedData);
        
        // Convert date strings back to Date objects
        if (parsedData.order_date) {
          parsedData.order_date = new Date(parsedData.order_date);
        }
        if (parsedData.expected_delivery_date) {
          parsedData.expected_delivery_date = new Date(parsedData.expected_delivery_date);
        }
        
        // Ensure all products have customizations array
        if (parsedData.products) {
          parsedData.products = parsedData.products.map((product: any) => ({
            ...product,
            customizations: product.customizations || []
          }));
        }
        
        setFormData(parsedData);
        setHasSavedData(true);
        console.log('OrderForm: Form data loaded successfully');
      }
    } catch (error) {
      console.error('Error loading order form data:', error);
    } finally {
      setIsFormLoading(false);
    }
  }, [preSelectedCustomer]);

  // Save form data to localStorage with debounce
  useEffect(() => {
    if (!preSelectedCustomer) {
      const timeoutId = setTimeout(() => {
        try {
          console.log('OrderForm: Saving form data to localStorage');
          localStorage.setItem('orderFormData', JSON.stringify(formData));
        } catch (error) {
          console.error('Error saving order form data:', error);
        }
      }, 2000); // 2 second debounce

      return () => clearTimeout(timeoutId);
    }
  }, [formData, preSelectedCustomer]);

  // Prevent navigation when tab regains focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('OrderForm: Tab regained focus - preventing any navigation');
        // Don't do anything that could trigger navigation
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const resetData = () => {
    setFormData({
      order_date: new Date(),
      expected_delivery_date: new Date(),
      customer_id: preSelectedCustomer?.id || '',
      sales_manager: '',
      products: [createEmptyProduct()],
      gst_rate: 18,
      payment_channel: '',
      reference_id: '',
      advance_amount: 0,
      additional_charges: []
    });
    setHasSavedData(false);
    try {
      localStorage.removeItem('orderFormData');
    } catch (error) {
      console.error('Error clearing order form data:', error);
    }
  };

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategoryImage, setSelectedCategoryImage] = useState<string>('');
  const [isCategoryLocked, setIsCategoryLocked] = useState(false);
  const [mainImages, setMainImages] = useState<{ [productIndex: number]: { reference: string | null, mockup: string | null, category: string | null } }>({});
  const [sizeTypeSelectorOpen, setSizeTypeSelectorOpen] = useState(false);
  const [customizationModalOpen, setCustomizationModalOpen] = useState(false);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer);
    }
  }, [preSelectedCustomer]);

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
      // Reset the category selection state
      setIsCategoryLocked(false);
      setSelectedCategoryImage('');
    }
  };

  const handleUnlockCategory = () => {
    setIsCategoryLocked(false);
    setSelectedCategoryImage('');
    // Auto-scroll will restart automatically due to useEffect dependency
  };

  // Handle fabric selection and auto-select GSM and price
  const handleFabricSelect = (productIndex: number, fabricId: string) => {
    const selectedFabric = fabrics.find(f => f.id === fabricId);
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { 
          ...p, 
          fabric_id: fabricId, 
          color: '', // Reset color - user will select from dropdown
          gsm: selectedFabric?.gsm || '',
          price: selectedFabric?.rate || 0
        } : p
      )
    }));
  };

  // Handle color selection
  const handleColorSelect = (productIndex: number, color: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { ...p, color: color } : p
      )
    }));
  };

  // Get available colors for selected fabric
  const getAvailableColors = (productIndex: number) => {
    const product = formData.products[productIndex];
    if (!product.fabric_id) return [];
    
    const selectedFabric = fabrics.find(f => f.id === product.fabric_id);
    if (!selectedFabric) return [];
    
    // Get all fabrics with the same fabric_name but different colors
    return fabrics.filter(f => f.fabric_name === selectedFabric.fabric_name);
  };

  // Color and GSM are now automatically selected with fabric
  // No separate color selection needed

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
      const currentScroll = sliderRef.current.scrollLeft;
      const itemWidth = 300; // Width of one item
      const newScroll = Math.max(0, currentScroll - itemWidth);
      sliderRef.current.scrollTo({ left: newScroll, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (sliderRef.current) {
      const currentScroll = sliderRef.current.scrollLeft;
      const itemWidth = 300; // Width of one item
      const maxScroll = sliderRef.current.scrollWidth - sliderRef.current.clientWidth;
      const newScroll = Math.min(maxScroll, currentScroll + itemWidth);
      sliderRef.current.scrollTo({ left: newScroll, behavior: 'smooth' });
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
      ],
      gst_rate: 18, // default
      customizations: []
    };
  }

  const fetchData = async () => {
    try {
      const [customersRes, categoriesRes, sizeTypesRes, fabricsRes, employeesRes, brandingTypesRes] = await Promise.all([
        supabase.from('customers').select('*').order('company_name'),
        supabase.from('product_categories').select('*').order('category_name'),
        supabase.from('size_types').select('*').order('size_name'),
        supabase.from('fabric_master').select('*').order('fabric_name'),
        supabase.from('employees').select('*').order('full_name'),
        supabase.from('branding_types').select('*').order('name')
      ]);

      if (customersRes.data) setCustomers(customersRes.data);
      if (categoriesRes.data) setProductCategories(categoriesRes.data);
      if (sizeTypesRes.data) setSizeTypes(sizeTypesRes.data);
      if (fabricsRes.data) setFabrics(fabricsRes.data as any);
      if (employeesRes.data) {
        console.log('Employees fetched:', employeesRes.data);
        // Filter employees to only show those from Sales Department
        const salesEmployees = employeesRes.data.filter(emp => 
          emp.department && emp.department.toLowerCase().includes('sales')
        );
        console.log('Sales employees filtered:', salesEmployees);
        setEmployees(salesEmployees);
      } else {
        console.log('No employees found or error:', employeesRes.error);
      }
      if (brandingTypesRes.data) setBrandingTypes(brandingTypesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
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

  // Get unique fabric names filtered by selected product category
  const getFilteredFabricNames = (productIndex: number) => {
    const product = formData.products[productIndex];
    
    let filteredFabrics = fabrics.filter(f => f.status === 'active');
    
    if (product.product_category_id) {
      const category = productCategories.find(c => c.id === product.product_category_id);
      
      if (category && category.fabrics && category.fabrics.length > 0) {
        filteredFabrics = fabrics.filter(fabric => 
          category.fabrics.includes(fabric.id) && fabric.status === 'active'
        );
      }
    }
    
    // Get unique fabric names
    const uniqueFabricNames = [...new Set(filteredFabrics.map(f => f.fabric_name))];
    
    // Return the first fabric of each unique fabric name for display
    return uniqueFabricNames.map(fabricName => 
      filteredFabrics.find(f => f.fabric_name === fabricName)!
    );
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

  const openSizeTypeSelector = (productIndex: number) => {
    setCurrentProductIndex(productIndex);
    setSizeTypeSelectorOpen(true);
  };

  const openCustomizationModal = (productIndex: number) => {
    setCurrentProductIndex(productIndex);
    setCustomizationModalOpen(true);
  };

  const removeCustomization = (productIndex: number, customizationIndex: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) => 
        index === productIndex 
          ? { ...product, customizations: (product.customizations || []).filter((_, idx) => idx !== customizationIndex) }
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

    return result + ' Only/-';
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let gstAmount = 0;
    formData.products.forEach(product => {
      const productTotal = Object.values(product.sizes_quantities || {}).reduce((total, qty) => total + qty, 0) * product.price;
      subtotal += productTotal;
      gstAmount += (productTotal * (product.gst_rate || 0)) / 100;
    });
    const additionalChargesTotal = formData.additional_charges.reduce((sum, charge) => sum + charge.amount_incl_gst, 0);
    const grandTotal = subtotal + gstAmount + additionalChargesTotal;
    const balance = grandTotal - formData.advance_amount;
    return { subtotal, gstAmount, additionalChargesTotal, grandTotal, balance };
  };

  // Upload images to Supabase storage
  const uploadOrderImages = async (orderId: string, productIndex: number, product: Product) => {
    const uploadedImages: { reference_images?: string[], mockup_images?: string[], attachments?: string[] } = {};

    try {
      // Upload reference images to order-images bucket
      if (product.reference_images && product.reference_images.length > 0) {
        const referenceUrls: string[] = [];
        for (let i = 0; i < product.reference_images.length; i++) {
          const file = product.reference_images[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${orderId}_product${productIndex}_reference_${i + 1}.${fileExt}`;
          const filePath = `${orderId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('order-images')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('order-images')
            .getPublicUrl(filePath);

          referenceUrls.push(data.publicUrl);
        }
        uploadedImages.reference_images = referenceUrls;
      }

      // Upload mockup images to order-images bucket
      if (product.mockup_images && product.mockup_images.length > 0) {
        const mockupUrls: string[] = [];
        for (let i = 0; i < product.mockup_images.length; i++) {
          const file = product.mockup_images[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${orderId}_product${productIndex}_mockup_${i + 1}.${fileExt}`;
          const filePath = `${orderId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('order-images')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('order-images')
            .getPublicUrl(filePath);

          mockupUrls.push(data.publicUrl);
        }
        uploadedImages.mockup_images = mockupUrls;
      }

      // Upload attachments to order-attachments bucket
      if (product.attachments && product.attachments.length > 0) {
        const attachmentUrls: string[] = [];
        for (let i = 0; i < product.attachments.length; i++) {
          const file = product.attachments[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${orderId}_product${productIndex}_attachment_${i + 1}.${fileExt}`;
          const filePath = `${orderId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('order-attachments')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('order-attachments')
            .getPublicUrl(filePath);

          attachmentUrls.push(data.publicUrl);
        }
        uploadedImages.attachments = attachmentUrls;
      }

      return uploadedImages;
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('Failed to upload images');
      return {};
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('OrderForm: Form submission started');
    
    // Prevent submission if we're in the middle of a tab focus change or form loading
    if (document.hidden || isFormLoading) {
      console.log('OrderForm: Preventing submission during tab focus change or form loading');
      return;
    }
    
    setLoading(true);

    try {
      const orderNumber = await generateOrderNumber();
      const { subtotal, gstAmount, additionalChargesTotal, grandTotal, balance } = calculateTotals();

      // Validate required fields
      if (!formData.customer_id) {
        toast.error('Please select a customer');
        setLoading(false);
        return;
      }

      if (!formData.sales_manager) {
        toast.error('Please select a sales manager');
        setLoading(false);
        return;
      }

      // Validate that the selected sales manager exists in employees
      const selectedEmployee = employees.find(emp => emp.id === formData.sales_manager);
      if (!selectedEmployee) {
        toast.error('Selected sales manager not found in employees list');
        setLoading(false);
        return;
      }

      const orderData = {
        order_number: orderNumber,
        order_date: (formData.order_date instanceof Date ? formData.order_date : new Date(formData.order_date)).toISOString(),
        expected_delivery_date: (formData.expected_delivery_date instanceof Date ? formData.expected_delivery_date : new Date(formData.expected_delivery_date)).toISOString(),
        customer_id: formData.customer_id,
        sales_manager: formData.sales_manager,
        total_amount: Number(subtotal),
        tax_amount: Number(gstAmount),
        final_amount: Number(grandTotal),
        advance_amount: Number(formData.advance_amount),
        balance_amount: Number(balance),
        gst_rate: Number(formData.gst_rate),
        payment_channel: formData.payment_channel || null,
        reference_id: formData.reference_id || null,
        status: 'pending' as const,
        notes: ''
      };

      console.log('Inserting order data:', orderData);
      
      // First, let's test if we can create a simple order without items
      const { data: orderResult, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single();

      if (orderError) {
        console.error('Order creation error:', orderError);
        console.error('Order data that failed:', JSON.stringify(orderData, null, 2));
        throw orderError;
      }

      console.log('Order created successfully:', orderResult);

      // Insert order items with uploaded images
      for (let productIndex = 0; productIndex < formData.products.length; productIndex++) {
        const product = formData.products[productIndex];
        
        // Validate product data
        if (!product.product_category_id) {
          toast.error(`Product ${productIndex + 1}: Please select a product category`);
          setLoading(false);
          return;
        }
        
        if (!product.fabric_id) {
          toast.error(`Product ${productIndex + 1}: Please select a fabric`);
          setLoading(false);
          return;
        }
        
        if (!product.size_type_id) {
          toast.error(`Product ${productIndex + 1}: Please select a size type`);
          setLoading(false);
          return;
        }
        
        const totalQuantity = Object.values(product.sizes_quantities || {}).reduce((total, qty) => total + qty, 0);
        
        if (totalQuantity === 0) {
          toast.error(`Product ${productIndex + 1}: Please enter quantities for at least one size`);
          setLoading(false);
          return;
        }
        
        const itemTotal = totalQuantity * product.price;
        
        // Upload images for this product
        const uploadedImages = await uploadOrderImages(orderResult.id, productIndex, product);
        
        const orderItemData = {
          order_id: orderResult.id,
          // product_id: null, // Removed since it might be causing issues
          quantity: totalQuantity,
          unit_price: Number(product.price),
          total_price: Number(itemTotal),
          product_category_id: product.product_category_id,
          category_image_url: product.category_image_url || null,
          product_description: product.product_description || '',
          fabric_id: product.fabric_id || null, // Now references fabric_master table
          gsm: product.gsm || '',
          color: product.color || '',
          remarks: product.remarks || '',
          size_type_id: product.size_type_id,
          sizes_quantities: product.sizes_quantities || {},
          gst_rate: product.gst_rate,
          specifications: {
            branding_items: product.branding_items || [],
            reference_images: uploadedImages.reference_images || [],
            mockup_images: uploadedImages.mockup_images || [],
            attachments: uploadedImages.attachments || [],
            customizations: product.customizations || []
          }
        };

        console.log('Inserting order item data:', orderItemData);
        console.log('Customizations being saved:', product.customizations);
        
        const { error: itemError } = await supabase
          .from('order_items')
          .insert(orderItemData);

        if (itemError) {
          console.error('Order item insertion error:', itemError);
          console.error('Order item data that failed:', JSON.stringify(orderItemData, null, 2));
          throw itemError;
        }

        console.log(`Order item ${productIndex + 1} created successfully`);
      }

      toast.success('Order created successfully!');
      
      // Clear saved form data after successful order creation
      resetData();
      
      console.log('OrderForm: Order created successfully, navigating...');
      
      // Call callback if provided (for dialog mode), otherwise navigate to orders page
      if (onOrderCreated) {
        console.log('OrderForm: Calling onOrderCreated callback');
        onOrderCreated();
      } else {
        console.log('OrderForm: Navigating to /orders');
        navigate('/orders');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, additionalChargesTotal, grandTotal, balance } = calculateTotals();

  // Show loading state while form data is being loaded
  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create New Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading form data...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Create New Order</CardTitle>
            {hasSavedData && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Saved Progress
                </Badge>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={resetData}
                  className="text-red-600 hover:text-red-700"
                >
                  Clear Saved Data
                </Button>
              </div>
            )}
          </div>
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
                {!preSelectedCustomer && (
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <CustomerSearchSelect
                      value={formData.customer_id}
                      onValueChange={handleCustomerSelect}
                      onCustomerSelect={(customer) => setSelectedCustomer(customer)}
                      placeholder="Search by name, phone, contact person..."
                    />
                  </div>
                )}
                
                {preSelectedCustomer && (
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input 
                      value={preSelectedCustomer.company_name} 
                      disabled 
                      className="bg-gray-50"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Sales Manager</Label>
                  <Select value={formData.sales_manager} onValueChange={(value) => setFormData(prev => ({ ...prev, sales_manager: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sales manager">
                        {formData.sales_manager && employees.find(emp => emp.id === formData.sales_manager) && (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage 
                                src={employees.find(emp => emp.id === formData.sales_manager)?.avatar_url} 
                                alt={employees.find(emp => emp.id === formData.sales_manager)?.full_name}
                              />
                              <AvatarFallback className="text-xs">
                                {employees.find(emp => emp.id === formData.sales_manager)?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span>{employees.find(emp => emp.id === formData.sales_manager)?.full_name}</span>
                          </div>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={employee.avatar_url} alt={employee.full_name} />
                              <AvatarFallback className="text-xs">
                                {employee.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-medium">{employee.full_name}</span>
                              <span className="text-xs text-muted-foreground">{employee.department}</span>
                            </div>
                          </div>
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
                                 "flex transition-all duration-500 ease-in-out h-full overflow-x-auto scrollbar-hide snap-x snap-mandatory",
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
                                   className="flex-shrink-0 w-[300px] h-full relative group snap-start"
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
    {/* Row 1 - Fabric, Color, and GSM */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Fabric - Only show when product category is selected */}
      {product.product_category_id && (
        <div>
          <Label className="text-base font-semibold text-gray-700 mb-2 block">Fabric</Label>
          <Select
            value={product.fabric_id}
            onValueChange={(value) => handleFabricSelect(productIndex, value)}
            disabled={false}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select fabric" />
            </SelectTrigger>
            <SelectContent>
              {getFilteredFabricNames(productIndex).map((fabric) => (
                <SelectItem key={fabric.id} value={fabric.id}>
                  <div className="flex items-center gap-2">
                    {fabric.image && (
                      <img 
                        src={fabric.image} 
                        alt={fabric.fabric_name} 
                        className="w-6 h-6 object-cover rounded border"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fabric.fabric_name}</span>
                      {fabric.gsm && <span className="text-muted-foreground">({fabric.gsm} GSM)</span>}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Color */}
      <div>
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
              {getAvailableColors(productIndex).map((fabric) => (
                <SelectItem key={fabric.id} value={fabric.color}>
                  <div className="flex items-center gap-2">
                    {fabric.hex && (
                      <div
                        style={{ 
                          backgroundColor: fabric.hex.startsWith('#') ? fabric.hex : `#${fabric.hex}`,
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: '2px solid #e5e7eb'
                        }}
                      />
                    )}
                    <span>{fabric.color}</span>
                    {fabric.hex && <span className="text-muted-foreground text-xs">({fabric.hex})</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder="Select fabric first"
            disabled
            className="bg-gray-50"
          />
        )}
      </div>

      {/* GSM */}
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
                      
    {/* Size Type */}
    <div>
      <Label className="text-base font-semibold text-gray-700 mb-2 block">Size Type</Label>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        onClick={() => openSizeTypeSelector(productIndex)}
      >
        {product.size_type_id ? (
          sizeTypes.find(st => st.id === product.size_type_id)?.size_name || "Select size type"
        ) : (
          "Select size type"
        )}
      </Button>
    </div>

    {/* Customization Button */}
    <div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => openCustomizationModal(productIndex)}
        disabled={!product.product_category_id}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Customization
      </Button>
      {!product.product_category_id && (
        <p className="text-xs text-muted-foreground mt-1">
          Select a product category first to enable customizations
        </p>
      )}
    </div>

    {/* Display Added Customizations */}
    {(product.customizations || []).length > 0 && (
      <div className="space-y-2">
        <Label className="text-base font-semibold text-gray-700 mb-2 block">Customizations</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {(product.customizations || []).map((customization, index) => (
            <div key={`${customization.partId}-${index}`} className="relative p-3 border rounded-lg bg-white shadow-sm min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeCustomization(productIndex, index)}
                className="absolute top-2 right-2 h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <X className="w-4 h-4" />
              </Button>
              <div className="pr-8 flex items-start gap-3">
                {customization.selectedAddonImageUrl && (
                  <img 
                    src={customization.selectedAddonImageUrl} 
                    alt={customization.selectedAddonImageAltText || customization.selectedAddonName}
                    className="w-12 h-12 object-cover rounded-lg border-2 border-gray-100 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate" title={customization.partName}>
                    {customization.partName}
                  </div>
                  {customization.partType === 'dropdown' && (
                    <div className="text-xs text-gray-600 truncate mt-1" title={customization.selectedAddonName}>
                      {customization.selectedAddonName}
                    </div>
                  )}
                  {customization.partType === 'number' && customization.quantity !== undefined && (
                    <div className="text-xs text-gray-600 mt-1">
                      Qty: {customization.quantity}
                    </div>
                  )}
                  {customization.priceImpact && customization.priceImpact !== 0 && (
                    <div className="text-xs font-medium text-green-600 mt-1">
                      ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

      {/* Size-wise Quantities */}
      {product.size_type_id && (
        <div className="space-y-2">
          <Label className="text-base font-semibold text-gray-700 mb-2 block">Size-wise Quantities</Label>
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

      {/* Price */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">Price (INR)</Label>
        <Input
          type="number"
          value={product.price}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              products: prev.products.map((p, i) =>
                i === productIndex ? { ...p, price: parseFloat(e.target.value) || 0 } : p
              ),
            }))
          }
          placeholder="Enter price"
        />
      </div>
                       {/* Product Description and Remarks */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                             className="resize-none"
                           />
                         </div>
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
                              <Select
                                value={brandingItem.branding_type}
                                onValueChange={(value) => updateBrandingItem(productIndex, brandingIndex, 'branding_type', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select branding type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {brandingTypes.map((brandingType) => (
                                    <SelectItem key={brandingType.id} value={brandingType.name}>
                                      <div className="flex items-center gap-2">
                                        <span>{brandingType.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {brandingType.scope}
                                        </Badge>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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

                  </CardContent>
                </Card>
              ))}
            </div>

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
                          <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Remarks</th>
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
                          const totalQty = Object.values(product.sizes_quantities || {}).reduce((sum, qty) => sum + qty, 0);
                          const amount = totalQty * product.price;
                          const gstAmount = (amount * (product.gst_rate || 0)) / 100;
                          const total = amount + gstAmount;
                          
                          return (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2">
                                {(() => {
                                  // In form context, use helper that handles File objects
                                  const image = getOrderItemDisplayImageForForm(product);
                                  const imageSrc = getImageSrcFromFileOrUrl(image);
                                  
                                  return imageSrc ? (
                                    <img 
                                      src={imageSrc} 
                                      alt="Product" 
                                      className="w-20 h-20 object-cover rounded" // bigger image
                                    />
                                  ) : null;
                                })()}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                <div className="text-sm">
                                  <div className="text-gray-600 text-xs font-medium">
                                    {fabrics.find(f => f.id === product.fabric_id)?.fabric_name} - {product.color}, {product.gsm} GSM
                                  </div>
                                  <div className="font-medium">{product.product_description}</div>
                                  <div className="text-gray-600 text-xs">
                                    {productCategories.find(c => c.id === product.product_category_id)?.category_name}
                                  </div>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">
                                <div className="max-w-xs">
                                  <span className="text-sm text-gray-700 break-words">
                                    {product.remarks || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">
                                <div>{totalQty} Pcs</div>
                                <div className="text-xs text-gray-600">
                                  {Object.entries(product.sizes_quantities || {})
                                    .filter(([_, qty]) => qty > 0)
                                    .map(([size, qty]) => `${size}-${qty}`)
                                    .join(', ')}
                                </div>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">₹{product.price}</td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">{formatCurrency(amount)}</td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">
                                <Input
                                  type="number"
                                  min={0}
                                  value={product.gst_rate}
                                  onChange={e => setFormData(prev => ({
                                    ...prev,
                                    products: prev.products.map((p, i) => i === index ? { ...p, gst_rate: parseFloat(e.target.value) || 0 } : p)
                                  }))}
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

                {/* Additional Charges */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Additional Charges</h3>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={addAdditionalCharge}
                      className="text-primary border-primary hover:bg-primary hover:text-white"
                    >
                      + Add other Charges
                    </Button>
                  </div>
                  
                  {formData.additional_charges.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Particular</th>
                            <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Rate</th>
                            <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">GST %</th>
                            <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Amount (incl of GST)</th>
                            <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.additional_charges.map((charge, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2">
                                <Input
                                  value={charge.particular}
                                  onChange={(e) => updateAdditionalCharge(index, 'particular', e.target.value)}
                                  placeholder="e.g., Transportation Charges"
                                  className="border-0 p-0 h-auto"
                                />
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                <Input
                                  type="number"
                                  value={charge.rate}
                                  onChange={(e) => updateAdditionalCharge(index, 'rate', parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                  className="border-0 p-0 h-auto"
                                />
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                <Input
                                  type="number"
                                  value={charge.gst_percentage}
                                  onChange={(e) => updateAdditionalCharge(index, 'gst_percentage', parseFloat(e.target.value) || 0)}
                                  placeholder="18"
                                  className="border-0 p-0 h-auto"
                                />
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-sm font-medium">
                                {formatCurrency(charge.amount_incl_gst)}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeAdditionalCharge(index)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Grand Total and Amount in Words */}
                <div className="flex justify-between items-end">
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
          </form>
        </CardContent>
      </Card>

      {/* Size Type Selector Popup */}
      <SizeTypeSelector
        sizeTypes={sizeTypes}
        selectedSizeTypeId={formData.products[currentProductIndex]?.size_type_id || ''}
        onSelect={(sizeTypeId) => handleSizeTypeSelect(currentProductIndex, sizeTypeId)}
        open={sizeTypeSelectorOpen}
        onOpenChange={setSizeTypeSelectorOpen}
      />

      {/* Product Customization Modal */}
      <ProductCustomizationModal
        productIndex={currentProductIndex}
        productCategoryId={formData.products[currentProductIndex]?.product_category_id || ''}
        isOpen={customizationModalOpen}
        onClose={() => setCustomizationModalOpen(false)}
        onSave={(customizations) => {
          setFormData(prev => ({
            ...prev,
            products: prev.products.map((product, index) => 
              index === currentProductIndex 
                ? { ...product, customizations: [...(product.customizations || []), ...customizations] }
                : product
            )
          }));
          toast.success(`${customizations.length} customization(s) added`);
        }}
      />
    </div>
  );
}