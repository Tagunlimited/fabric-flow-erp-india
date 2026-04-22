import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerSearchSelect } from '@/components/customers/CustomerSearchSelect';
import { ProductCustomizationModal } from './ProductCustomizationModal';
import { BrandingPlacementCombobox } from './BrandingPlacementCombobox';
import { CustomizationColorChips } from '@/components/common/CustomizationColorChips';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, Upload, X, Image, ChevronLeft, ChevronRight, Lock, Unlock, Save, ChevronDown, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn, formatCurrency, formatLocalDateYMD } from '@/lib/utils';
import { getOrderItemDisplayImageForForm, getImageSrcFromFileOrUrl } from '@/utils/orderItemImageUtils';
import { usePageState } from '@/contexts/AppCacheContext';
import { getSortedSizes, sortSizesQuantities, SizeType as SizeTypeUtil } from '@/utils/sizeSorting';
import { initializeSizePrices, calculateSizeBasedTotal, calculateAverageUnitPrice } from '@/utils/priceCalculation';

function formatOrderCreateError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter((p): p is string => Boolean(p && String(p).trim()));
    if (parts.length) return parts.join(' — ');
    if (e.code) return `Error ${e.code}`;
  }
  return 'Failed to create order';
}

interface Customer {
  id: string;
  company_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
}

interface ProductCategory {
  id: string;
  category_name: string;
  category_image_url?: string;
  fabrics?: string[];
}

interface SizeType {
  id: string;
  size_name: string;
  available_sizes: string[];
  size_order?: Record<string, number>;
  created_at?: string;
  updated_at?: string;
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
  employee_code?: string;
  full_name: string;
  department?: string;
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
  colors?: Array<{ colorId: string; colorName: string; hex: string }>;
}

interface Product {
  product_category_id: string;
  category_image_url: string;
  reference_images: Array<File | string>;
  mockup_images: Array<File | string>;
  attachments: Array<File | string>;
  product_description: string;
  fabric_id: string;
  fabric_base_id?: string;
  gsm: string;
  color: string;
  remarks: string;
  price: number;
  size_type_id: string;
  sizes_quantities: { [size: string]: number };
  size_prices?: { [size: string]: number };
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
  const [orderDatePopoverOpen, setOrderDatePopoverOpen] = useState(false);
  const [expectedDeliveryPopoverOpen, setExpectedDeliveryPopoverOpen] = useState(false);

  const initialFormData = useMemo<OrderFormData>(() => ({
    order_date: new Date(),
    expected_delivery_date: new Date(),
    customer_id: preSelectedCustomer?.id || '',
    sales_manager: '',
    products: [createEmptyProduct()],
    gst_rate: 5,
    payment_channel: '',
    reference_id: '',
    advance_amount: 0,
    additional_charges: []
  }), [preSelectedCustomer?.id]);

  const {
    state: formData,
    updateState: updateFormState,
    resetState: resetFormState,
    hasSavedState: hasSavedFormState
  } = usePageState<OrderFormData>('customOrderForm', initialFormData);

  const setFormData = useCallback(
    (value: OrderFormData | ((prev: OrderFormData) => OrderFormData)) => {
      updateFormState((prev: OrderFormData) => {
        if (typeof value === 'function') {
          return (value as (prev: OrderFormData) => OrderFormData)(prev);
        }
        return value;
      });
    },
    [updateFormState]
  );

  // Normalize persisted primitives (dates, arrays) after hydration
  useEffect(() => {
    setFormData(prev => {
      let changed = false;
      const next = { ...prev };

      if (!(next.order_date instanceof Date)) {
        next.order_date = new Date(next.order_date);
        changed = true;
      }
      if (!(next.expected_delivery_date instanceof Date)) {
        next.expected_delivery_date = new Date(next.expected_delivery_date);
        changed = true;
      }

      const normalizedProducts = (next.products || []).map(product => {
        const normalizedProduct = { ...product };
        
        // Filter out invalid File objects (File objects can't be serialized, so they become empty objects after refresh)
        if (product.reference_images && Array.isArray(product.reference_images)) {
          const validReferenceImages = product.reference_images.filter(img => 
            img instanceof File || (typeof img === 'string' && img.trim() !== '')
          );
          if (validReferenceImages.length !== product.reference_images.length) {
            normalizedProduct.reference_images = validReferenceImages;
            changed = true;
          }
        }
        
        if (product.mockup_images && Array.isArray(product.mockup_images)) {
          const validMockupImages = product.mockup_images.filter(img => 
            img instanceof File || (typeof img === 'string' && img.trim() !== '')
          );
          if (validMockupImages.length !== product.mockup_images.length) {
            normalizedProduct.mockup_images = validMockupImages;
            changed = true;
          }
        }
        
        if (product.attachments && Array.isArray(product.attachments)) {
          const validAttachments = product.attachments.filter(att => 
            att instanceof File || (typeof att === 'string' && att.trim() !== '')
          );
          if (validAttachments.length !== product.attachments.length) {
            normalizedProduct.attachments = validAttachments;
            changed = true;
          }
        }
        
        if (product.customizations && Array.isArray(product.customizations)) {
          return normalizedProduct;
        }
        changed = true;
        return {
          ...normalizedProduct,
          customizations: product.customizations || []
        };
      });

      if (changed) {
        next.products = normalizedProducts;
        // Also clear mainImages if they reference removed files
        setMainImages(prev => {
          const updated: typeof prev = {};
          let mainImagesChanged = false;
          Object.keys(prev).forEach(key => {
            const productIdx = parseInt(key);
            const product = normalizedProducts[productIdx];
            if (product) {
              const mainMockup = prev[productIdx]?.mockup;
              const mainReference = prev[productIdx]?.reference;
              
              // Check if main images still exist in the product
              const mockupExists = !mainMockup || product.mockup_images?.some(img => {
                const imgUrl = getImageUrl(img);
                return imgUrl === mainMockup;
              });
              const referenceExists = !mainReference || product.reference_images?.some(img => {
                const imgUrl = getImageUrl(img);
                return imgUrl === mainReference;
              });
              
              if (mockupExists && referenceExists) {
                updated[productIdx] = prev[productIdx];
              } else {
                mainImagesChanged = true;
                updated[productIdx] = {
                  mockup: mockupExists ? mainMockup : null,
                  reference: referenceExists ? mainReference : null,
                  category: prev[productIdx]?.category || null
                };
              }
            }
          });
          return mainImagesChanged ? updated : prev;
        });
        return next;
      }

      return prev;
    });
  }, [setFormData]); // normalize persisted data once on mount

  // DISABLED: Visibility change handler - using centralized visibility manager
  // No action needed on visibility change to prevent unwanted refreshes

  const resetData = useCallback((options?: { silent?: boolean }) => {
    resetFormState();
    setMainImages({});
    setSelectedCustomer(null);
    setSelectedCategoryImage('');
    setIsCategoryLocked(false);
    setSelectedSizesForPriceEdit({});
    if (!options?.silent) {
      toast.success('Form reset successfully');
    }
  }, [resetFormState]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategoryImage, setSelectedCategoryImage] = useState<string>('');
  const [isCategoryLocked, setIsCategoryLocked] = useState(false);
  const [mainImages, setMainImages] = useState<{ [productIndex: number]: { reference: string | null, mockup: string | null, category: string | null } }>({});
  const [customizationModalOpen, setCustomizationModalOpen] = useState(false);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [selectedSizesForPriceEdit, setSelectedSizesForPriceEdit] = useState<{ [productIndex: number]: string[] }>({});
  const [sizePriceEditOpen, setSizePriceEditOpen] = useState<{ [productIndex: number]: boolean }>({});
  const [colorTypeaheadPrefix, setColorTypeaheadPrefix] = useState<Record<number, string>>({});
  const [expandedProductSections, setExpandedProductSections] = useState<Record<number, {
    reference: boolean;
    attachments: boolean;
    branding: boolean;
    mockup: boolean;
  }>>({});
  const [mediaLinkInputs, setMediaLinkInputs] = useState<
    Record<number, { reference: string; mockup: string; attachments: string }>
  >({});
  const sliderRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const colorTypeaheadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleProductSection = (
    productIndex: number,
    section: 'reference' | 'attachments' | 'branding' | 'mockup'
  ) => {
    setExpandedProductSections(prev => ({
      ...prev,
      [productIndex]: {
        reference: prev[productIndex]?.reference ?? false,
        attachments: prev[productIndex]?.attachments ?? false,
        branding: prev[productIndex]?.branding ?? false,
        mockup: prev[productIndex]?.mockup ?? false,
        [section]: !(prev[productIndex]?.[section] ?? false)
      }
    }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer);
    }
  }, [preSelectedCustomer]);

  useEffect(() => {
    if (preSelectedCustomer?.id) {
      setFormData(prev => {
        if (prev.customer_id) return prev;
        return {
          ...prev,
          customer_id: preSelectedCustomer.id
        };
      });
    }
  }, [preSelectedCustomer?.id, setFormData]);

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
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => 
        i === productIndex ? { 
          ...p, 
          fabric_base_id: fabricId,
          fabric_id: fabricId, 
        color: '', // Reset color - user will select from dropdown
        gsm: '',
        price: p.price
        } : p
      )
    }));
  };

  // Handle color selection by color name (kept for any other callers)
  const handleColorSelect = (productIndex: number, color: string) => {
  setFormData(prev => {
    const product = prev.products[productIndex];
    const baseFabric = fabrics.find(
      f => f.id === (product.fabric_base_id || product.fabric_id)
    );
    const variants = baseFabric
      ? fabrics.filter(f => f.fabric_name === baseFabric.fabric_name)
      : [];
    const matchingVariant = variants.find(
      (variant) =>
        variant.color === color && (!product.gsm || !variant.gsm || variant.gsm === product.gsm)
    ) || variants.find((variant) => variant.color === color);

    return {
      ...prev,
      products: prev.products.map((p, i) =>
        i === productIndex
          ? {
              ...p,
              color,
              fabric_id: matchingVariant?.id || p.fabric_id,
              fabric_base_id: p.fabric_base_id || p.fabric_id,
              gsm: matchingVariant?.gsm || p.gsm,
              price: matchingVariant?.rate ?? p.price
            }
          : p
      )
    };
  });
  };

  // Handle color selection by fabric id (unique value – prevents duplicate display in Select)
  const handleColorSelectByFabricId = (productIndex: number, fabricId: string) => {
    const fabric = fabrics.find(f => f.id === fabricId);
    if (!fabric) return;
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) =>
        i === productIndex
          ? {
              ...p,
              color: fabric.color,
              fabric_id: fabric.id,
              fabric_base_id: p.fabric_base_id || p.fabric_id,
              gsm: fabric.gsm || p.gsm,
              price: fabric.rate ?? p.price
            }
          : p
      )
    }));
  };

  // Get available colors for selected fabric
  const getAvailableColors = (productIndex: number) => {
  const product = formData.products[productIndex];
  const baseId = product.fabric_base_id || product.fabric_id;
  if (!baseId) return [];
  
  const selectedFabric = fabrics.find(f => f.id === baseId);
    if (!selectedFabric) return [];
    
    // Get all variants for the same fabric and keep only unique color entries
    const sameFabricVariants = fabrics.filter(
      (f) => f.fabric_name === selectedFabric.fabric_name
    );
    const seen = new Set<string>();

    return sameFabricVariants.filter((f) => {
      const colorKey = (f.color || "").trim().toLowerCase();
      const hexKey = (f.hex || "").trim().toLowerCase();
      const key = `${colorKey}|${hexKey}`;

      // If color text is missing, keep the entry to avoid hiding valid records.
      if (!colorKey) return true;

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getSortedAvailableColors = (productIndex: number) => {
    const colors = getAvailableColors(productIndex);
    const prefix = (colorTypeaheadPrefix[productIndex] || '').trim().toLowerCase();

    const alphaSort = (a: typeof colors[number], b: typeof colors[number]) =>
      (a.color || '').localeCompare(b.color || '');

    if (!prefix) return [...colors].sort(alphaSort);

    const startsWithPrefix = colors.filter((c) => (c.color || '').toLowerCase().startsWith(prefix));
    const others = colors.filter((c) => !(c.color || '').toLowerCase().startsWith(prefix));
    return [...startsWithPrefix.sort(alphaSort), ...others.sort(alphaSort)];
  };

  const handleColorTypeahead = (productIndex: number, key: string) => {
    if (!/^[a-zA-Z]$/.test(key)) return;

    if (colorTypeaheadTimeoutRef.current) {
      clearTimeout(colorTypeaheadTimeoutRef.current);
    }

    setColorTypeaheadPrefix((prev) => ({
      ...prev,
      [productIndex]: `${prev[productIndex] || ''}${key}`.toLowerCase(),
    }));

    colorTypeaheadTimeoutRef.current = setTimeout(() => {
      setColorTypeaheadPrefix((prev) => ({ ...prev, [productIndex]: '' }));
    }, 900);
  };

const getSelectedFabricVariant = (productIndex: number) => {
  const product = formData.products[productIndex];
  if (!product.fabric_id || !product.color || !product.gsm) return null;
  const variant = fabrics.find(f => f.id === product.fabric_id);
  if (!variant) return null;
  // Ensure variant matches selected attributes; if not, try to resolve by attributes
  if (
    variant.color !== product.color ||
    (variant.gsm && product.gsm && variant.gsm !== product.gsm)
  ) {
    const resolved = fabrics.find(
      (f) =>
        f.fabric_name === variant.fabric_name &&
        f.color === product.color &&
        (!product.gsm || f.gsm === product.gsm)
    );
    return resolved || variant;
  }
  return variant;
};

  // Get available GSM options for selected product/fabric.
  // Keeps unique values and allows users to still type custom GSM manually.
  const getAvailableGsmOptions = (productIndex: number): string[] => {
    const product = formData.products[productIndex];
    const baseId = product.fabric_base_id || product.fabric_id;
    if (!baseId) return [];

    const selectedBaseFabric = fabrics.find((f) => f.id === baseId);
    if (!selectedBaseFabric) return [];

    const gsmSet = new Set<string>();
    fabrics
      .filter((f) => f.fabric_name === selectedBaseFabric.fabric_name)
      .forEach((f) => {
        const gsm = String(f.gsm || '').trim();
        if (gsm) gsmSet.add(gsm);
      });

    return Array.from(gsmSet).sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    });
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

  // Helper function to safely get image URL from File or string
  const getImageUrl = (fileOrUrl: File | string | undefined | null): string | null => {
    if (!fileOrUrl) return null;
    if (typeof fileOrUrl === 'string') return fileOrUrl;
    if (fileOrUrl instanceof File) return URL.createObjectURL(fileOrUrl);
    return null;
  };

  // Set first image as main image when images are uploaded
  const handleImageUpload = (productIndex: number, imageType: 'reference' | 'mockup', files: File[]) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => {
        if (i === productIndex) {
          const existingImages = imageType === 'reference' ? p.reference_images : p.mockup_images;
          const maxFiles = imageType === 'mockup' ? 20 : 5;
          const newFiles = [...existingImages, ...files].slice(0, maxFiles);
          return { ...p, [imageType === 'reference' ? 'reference_images' : 'mockup_images']: newFiles };
        }
        return p;
      })
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

  const normalizeHttpUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const addMediaLink = (
    productIndex: number,
    mediaType: 'reference_images' | 'mockup_images' | 'attachments'
  ) => {
    const draft = mediaLinkInputs[productIndex]?.[mediaType === 'attachments' ? 'attachments' : mediaType === 'reference_images' ? 'reference' : 'mockup'] || '';
    const url = normalizeHttpUrl(draft);
    if (!url) {
      toast.error('Please enter a valid http/https URL');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      products: prev.products.map((p, i) => {
        if (i !== productIndex) return p;
        const existing = p[mediaType] || [];
        const existingUrls = existing.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean);
        if (existingUrls.includes(url)) return p;
        return { ...p, [mediaType]: [...existing, url] };
      }),
    }));

    setMediaLinkInputs((prev) => ({
      ...prev,
      [productIndex]: {
        reference: prev[productIndex]?.reference || '',
        mockup: prev[productIndex]?.mockup || '',
        attachments: prev[productIndex]?.attachments || '',
        [mediaType === 'attachments' ? 'attachments' : mediaType === 'reference_images' ? 'reference' : 'mockup']: '',
      },
    }));
  };

  // Remove a specific image from the product
  const handleRemoveImage = (productIndex: number, imageType: 'reference' | 'mockup', imageIndex: number) => {
    // Get current product data
    const currentProduct = formData.products[productIndex];
    const images = imageType === 'reference' ? currentProduct.reference_images : currentProduct.mockup_images;
    
    // Get the image being removed to check if it's the main image
    const imageToRemove = images[imageIndex];
    const currentMainImageUrl = getMainImage(productIndex, imageType);
    const imageToRemoveUrl = getImageUrl(imageToRemove);
    
    // Filter out the removed image
    const updatedImages = images.filter((_, idx) => idx !== imageIndex);
    
    // Update form data
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((p, i) => {
        if (i === productIndex) {
          return { ...p, [imageType === 'reference' ? 'reference_images' : 'mockup_images']: updatedImages };
        }
        return p;
      })
    }));
    
    // Update main image separately
    if (updatedImages.length > 0) {
      // If we removed the main image, set the first remaining image as main
      if (currentMainImageUrl === imageToRemoveUrl) {
        const firstImageUrl = getImageUrl(updatedImages[0]);
        if (firstImageUrl) {
          setMainImages(prev => ({
            ...prev,
            [productIndex]: {
              ...prev[productIndex],
              [imageType]: firstImageUrl
            }
          }));
        }
      }
      // If we didn't remove the main image, keep the current main image
      // (mainImages state doesn't need to change)
    } else {
      // No images left, clear main image
      setMainImages(prev => ({
        ...prev,
        [productIndex]: {
          ...prev[productIndex],
          [imageType]: null
        }
      }));
    }
    
    toast.success(`${imageType === 'mockup' ? 'Mockup' : 'Reference'} image removed`);
  };

  const handleRemoveAttachment = (productIndex: number, attachmentIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      products: prev.products.map((p, i) =>
        i === productIndex ? { ...p, attachments: p.attachments.filter((_, idx) => idx !== attachmentIndex) } : p
      ),
    }));
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
    fabric_base_id: '',
      gsm: '',
      color: '',
      remarks: '',
      price: 0,
      size_type_id: '',
      sizes_quantities: {},
      branding_items: [
        { branding_type: '', placement: '', measurement: '' }
      ],
      gst_rate: 5, // default
      customizations: []
    };
  }

  const fetchData = async () => {
    try {
      // Fetch fabrics with pagination to get ALL records (Supabase has a 1000 record limit per query)
      const fetchAllFabrics = async () => {
        let allFabrics: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error, count } = await supabase
            .from('fabric_master')
            .select('*', { count: 'exact' })
            .order('fabric_name')
            .range(from, from + pageSize - 1);

          if (error) {
            console.error('Error fetching fabrics:', error);
            throw error;
          }

          if (data) {
            allFabrics = [...allFabrics, ...data];

            // Check if we've fetched all records
            if (count !== null) {
              if (allFabrics.length >= count) {
                hasMore = false;
              } else {
                from += pageSize;
              }
            } else {
              // If count is not available, check if we got less than pageSize (last page)
              if (data.length < pageSize) {
                hasMore = false;
              } else {
                from += pageSize;
              }
            }
          } else {
            hasMore = false;
          }
        }

        return allFabrics;
      };

      const [customersRes, categoriesRes, sizeTypesRes, allFabrics, employeesRes, brandingTypesRes] = await Promise.all([
        supabase.from('customers').select('*').order('company_name'),
        supabase.from('product_categories').select('*').order('category_name'),
        supabase.from('size_types').select('*').order('size_name'),
        fetchAllFabrics(), // Fetch all fabrics with pagination
        supabase.from('employees').select('*').order('full_name'),
        supabase.from('branding_types').select('*').order('name')
      ]);

      if (customersRes.data) setCustomers(customersRes.data as any);
      if (categoriesRes.data) setProductCategories(categoriesRes.data as any);
      if (sizeTypesRes.data) setSizeTypes(sizeTypesRes.data as any);
      if (allFabrics) {
        const fabricsData = allFabrics as any;
        setFabrics(fabricsData);
      }
      if (employeesRes.data) {
        // Filter employees to only show those from Sales Department
        const salesEmployees = (employeesRes.data as any[]).filter((emp: any) => 
          emp.department && emp.department.toLowerCase().includes('sales')
        );
        setEmployees(salesEmployees as any);
      }
      if (brandingTypesRes.data) setBrandingTypes(brandingTypesRes.data as any);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch form data');
    }
  };

  const generateOrderNumber = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const nextYear = (now.getFullYear() + 1).toString().slice(-2);
      const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const pattern = `TUC/${year}-${nextYear}/${month}/`;
      
      // Get all order numbers with the current month/year pattern
      const { data, error } = await supabase
        .from('orders')
        .select('order_number')
        .like('order_number', `${pattern}%`)
        .order('order_number', { ascending: false });

      if (error) throw error;

      let nextSequence = 1;
      if (data && data.length > 0) {
        // Find the maximum sequence number for this month
        const sequences = data
          .map(order => {
            const match = (order as any).order_number.match(/(\d+)$/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(seq => !isNaN(seq));
        
        if (sequences.length > 0) {
          nextSequence = Math.max(...sequences) + 1;
        }
      }

      const sequence = nextSequence.toString().padStart(3, '0');
      return `${pattern}${sequence}`;
    } catch (error) {
      console.error('Error generating order number:', error);
      // Fallback to timestamp-based unique number if sequence generation fails
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const nextYear = (now.getFullYear() + 1).toString().slice(-2);
      const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
      return `TUC/${year}-${nextYear}/${month}/${timestamp}`;
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setSelectedCustomer(customer as any || null);
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
              fabric_id: '', // Reset fabric selection when category changes
              fabric_base_id: ''
            }
          : product
      )
    }));
  };

  // Get unique fabric names - show all active fabrics regardless of category association
  // Returns one entry per fabric_name (GSM variants are merged)
  const getFilteredFabricNames = (productIndex: number) => {
    // Show all active fabrics, not filtered by category
    const allActiveFabrics = fabrics.filter(f => f.status === 'active');
    
    // Create a map to store unique fabric names
    // Key format: "fabric_name"
    const fabricMap = new Map<string, typeof allActiveFabrics[0]>();
    
    allActiveFabrics.forEach(fabric => {
      const fabricName = (fabric.fabric_name || '').trim();
      
      // Only process if fabric has a name
      if (!fabricName) {
        return;
      }
      
      const key = fabricName.toLowerCase();
      
      // Store each unique fabric name
      // If same name already exists, keep the first one
      if (!fabricMap.has(key)) {
        fabricMap.set(key, fabric);
      }
    });
    
    // Convert to array and sort
    const result = Array.from(fabricMap.values()).sort((a, b) => {
      return (a.fabric_name || '').localeCompare(b.fabric_name || '');
    });
    
    return result;
  };

  const handleSizeTypeSelect = (productIndex: number, sizeTypeId: string) => {
    const sizeType = sizeTypes.find(st => st.id === sizeTypeId);
    const newSizesQuantities: { [size: string]: number } = {};
    
    // Sort sizes in proper order before creating quantities object
    const orderedSizes = getSortedSizes(sizeType || null);
    orderedSizes.forEach(size => {
      newSizesQuantities[size] = 0;
    });

    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, index) => {
        if (index === productIndex) {
          // Don't initialize size_prices - all sizes will use base price by default
          // Only store custom prices when user explicitly edits them
          return {
            ...product,
            size_type_id: sizeTypeId,
            sizes_quantities: newSizesQuantities,
            size_prices: undefined // Start with no custom prices - all use base price
          };
        }
        return product;
      })
    }));
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

  const duplicateProduct = (productIndex: number) => {
    const cloneMediaFiles = (items: Array<File | string>) =>
      items.map((item) => {
        if (item instanceof File) {
          return new File([item], item.name, {
            type: item.type,
            lastModified: item.lastModified,
          });
        }
        return item;
      });

    setFormData(prev => {
      const source = prev.products[productIndex];
      if (!source) return prev;

      const duplicated: Product = {
        ...source,
        // Keep details same, but reset size type and quantities for new sizing
        size_type_id: '',
        sizes_quantities: {},
        size_prices: undefined,
        // Clone arrays/objects to avoid reference sharing
        reference_images: cloneMediaFiles(source.reference_images || []),
        mockup_images: cloneMediaFiles(source.mockup_images || []),
        attachments: cloneMediaFiles(source.attachments || []),
        branding_items: (source.branding_items || []).map(item => ({ ...item })),
        customizations: (source.customizations || []).map(item => ({ ...item })),
      };

      const insertIndex = productIndex + 1;

      // Keep main image mapping aligned after inserting a product.
      setMainImages((prevMain) => {
        const shifted: typeof prevMain = {};
        Object.entries(prevMain).forEach(([key, value]) => {
          const idx = Number(key);
          shifted[idx >= insertIndex ? idx + 1 : idx] = value;
        });
        // No pre-selected main image for duplicated product.
        shifted[insertIndex] = { reference: null, mockup: null, category: null };
        return shifted;
      });

      return {
        ...prev,
        products: [
          ...prev.products.slice(0, insertIndex),
          duplicated,
          ...prev.products.slice(insertIndex),
        ],
      };
    });
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
        gst_percentage: 5,
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
      // Use size-based pricing if available, otherwise fall back to old calculation
      const productTotal = calculateSizeBasedTotal(
        product.sizes_quantities || {},
        product.size_prices,
        product.price
      );
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
        const referenceLinks = product.reference_images.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        const referenceFiles = product.reference_images.filter((x): x is File => x instanceof File);
        const referenceUrls: string[] = [];
        for (let i = 0; i < referenceFiles.length; i++) {
          const file = referenceFiles[i];
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
        uploadedImages.reference_images = [...referenceLinks, ...referenceUrls];
      }

      // Upload mockup images to order-images bucket
      if (product.mockup_images && product.mockup_images.length > 0) {
        const mockupLinks = product.mockup_images.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        const mockupFiles = product.mockup_images.filter((x): x is File => x instanceof File);
        const mockupUrls: string[] = [];
        for (let i = 0; i < mockupFiles.length; i++) {
          const file = mockupFiles[i];
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
        uploadedImages.mockup_images = [...mockupLinks, ...mockupUrls];
      }

      // Upload attachments to order-attachments bucket
      if (product.attachments && product.attachments.length > 0) {
        const attachmentLinks = product.attachments.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        const attachmentFiles = product.attachments.filter((x): x is File => x instanceof File);
        const attachmentUrls: string[] = [];
        for (let i = 0; i < attachmentFiles.length; i++) {
          const file = attachmentFiles[i];
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
        uploadedImages.attachments = [...attachmentLinks, ...attachmentUrls];
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
    // Prevent submission if tab is hidden
    if (document.hidden) {
      return;
    }
    
    setLoading(true);

    try {
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

      // Retry mechanism for order number generation and insertion
      let orderResult: any = null;
      let maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const orderNumber = await generateOrderNumber();
          
          // Check if any product has mockup images uploaded
          // User requirement: ONLY mockup images trigger status change, reference images not required
          const hasMockupImages = formData.products.some(product => 
            product.mockup_images && product.mockup_images.length > 0
          );
          
          // Set initial status: 'designing_done' if mockup images exist, otherwise 'pending'
          const initialStatus: 'designing_done' | 'pending' = hasMockupImages ? 'designing_done' : 'pending';

      const orderData = {
        order_number: orderNumber,
        order_date: formatLocalDateYMD(
          formData.order_date instanceof Date ? formData.order_date : new Date(formData.order_date)
        ),
        expected_delivery_date: formatLocalDateYMD(
          formData.expected_delivery_date instanceof Date
            ? formData.expected_delivery_date
            : new Date(formData.expected_delivery_date)
        ),
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
            status: initialStatus,
        notes: ''
      };

          const { data, error: orderError } = await supabase
        .from('orders')
        .insert(orderData as any)
        .select()
        .single();

      if (orderError) {
            // If it's a duplicate key error, retry with a new order number
            if (orderError.code === '23505' && attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 100)); // Small delay before retry
              continue;
            }
        throw orderError;
      }

          orderResult = data;
          break; // Success, exit the retry loop
        } catch (retryError: any) {
          if (attempt === maxRetries - 1) {
            throw retryError; // Last attempt failed, throw the error
          }
        }
      }

      if (!orderResult) {
        throw new Error('Failed to create order after multiple attempts');
      }

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
        
        // Calculate item total using size-based pricing
        const itemTotal = calculateSizeBasedTotal(
          product.sizes_quantities || {},
          product.size_prices,
          product.price
        );
        
        // Calculate average unit price for backward compatibility
        const avgUnitPrice = calculateAverageUnitPrice(
          product.sizes_quantities || {},
          product.size_prices,
          product.price
        );
        
        // Upload images for this product
        const uploadedImages = await uploadOrderImages((orderResult as any).id, productIndex, product);
        
        const orderItemData = {
          order_id: (orderResult as any).id,
          // product_id: null, // Removed since it might be causing issues
          quantity: totalQuantity,
          unit_price: Number(avgUnitPrice), // Average for backward compatibility
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
          size_prices: product.size_prices || {}, // Store size-wise prices
          gst_rate: product.gst_rate,
          specifications: {
            branding_items: product.branding_items || [],
            reference_images: uploadedImages.reference_images || [],
            mockup_images: uploadedImages.mockup_images || [],
            attachments: uploadedImages.attachments || [],
            customizations: product.customizations || [],
            size_prices: product.size_prices || {} // Also store in specifications for easy access
          }
        };

        const { error: itemError } = await supabase
          .from('order_items')
          .insert(orderItemData as any);

        if (itemError) {
          console.error('Order item insert failed:', formatOrderCreateError(itemError));
          throw itemError;
        }
      }

      const orderId = (orderResult as any).id as string;
      const chargesToInsert = formData.additional_charges
        .filter((c) => c.particular?.trim() && Number(c.rate) > 0)
        .map((charge) => ({
          order_id: orderId,
          particular: charge.particular.trim(),
          rate: Number(charge.rate),
          gst_percentage: Number(charge.gst_percentage ?? 0),
          amount_incl_gst: Number(charge.amount_incl_gst ?? 0),
        }));

      if (chargesToInsert.length > 0) {
        const { error: chargesError } = await supabase
          .from('order_additional_charges')
          .insert(chargesToInsert as any);
        if (chargesError) {
          console.error('order_additional_charges insert failed:', formatOrderCreateError(chargesError));
          throw chargesError;
        }
      }

      toast.success('Order created successfully!');

      // Clear saved form data after successful order creation (no extra "form reset" toast)
      resetData({ silent: true });
      
      // Call callback if provided (for dialog mode), otherwise navigate to orders page
      if (onOrderCreated) {
        onOrderCreated();
      } else {
        navigate('/orders');
      }
    } catch (error) {
      const msg = formatOrderCreateError(error);
      console.error('Order create failed:', msg, error);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, additionalChargesTotal, grandTotal, balance } = calculateTotals();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Create New Order</CardTitle>
              <div className="flex items-center gap-2">
              {hasSavedFormState && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Saved Progress
                </Badge>
              )}
                <Button 
                  type="button" 
                  variant="outline" 
                size="default"
                  onClick={resetData}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                >
                <Trash2 className="w-4 h-4 mr-2" />
                Reset Form
                </Button>
              </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Order Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(8.25rem,10rem)_minmax(9.5rem,12.5rem)_minmax(8.25rem,10rem)] gap-x-3 gap-y-4 xl:gap-x-4 items-end">
              <div className="flex flex-col gap-4 min-w-0 sm:flex-row sm:items-end sm:gap-3 md:col-span-2 xl:col-span-1">
                <div className="space-y-2 min-w-0 flex-1">
                  <Label className="block">Client</Label>
                  {!preSelectedCustomer ? (
                    <CustomerSearchSelect
                      value={formData.customer_id}
                      onValueChange={handleCustomerSelect}
                      onCustomerSelect={(customer) => setSelectedCustomer(customer as any)}
                      placeholder="Search by name, phone, contact person..."
                      cacheKey="customerSearchSelect-customOrder"
                    />
                  ) : (
                    <Input
                      value={preSelectedCustomer.company_name}
                      disabled
                      className="bg-gray-50"
                    />
                  )}
                </div>

                <div className="space-y-2 min-w-0 w-full sm:w-fit sm:max-w-[min(100%,26rem)] sm:min-w-[10.5rem] sm:shrink-0">
                  <Label className="block">Sales Manager</Label>
                  <Select value={formData.sales_manager} onValueChange={(value) => setFormData(prev => ({ ...prev, sales_manager: value }))}>
                    <SelectTrigger className="w-full min-w-[10.5rem]">
                      <SelectValue placeholder="Select sales manager">
                        {formData.sales_manager && employees.find(emp => emp.id === formData.sales_manager) && (
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="w-6 h-6 shrink-0">
                              <AvatarImage
                                src={employees.find(emp => emp.id === formData.sales_manager)?.avatar_url}
                                alt={employees.find(emp => emp.id === formData.sales_manager)?.full_name}
                              />
                              <AvatarFallback className="text-xs">
                                {employees.find(emp => emp.id === formData.sales_manager)?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{employees.find(emp => emp.id === formData.sales_manager)?.full_name}</span>
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

              <div className="space-y-2 min-w-0">
                <Label className="block">Order Date</Label>
                <Popover open={orderDatePopoverOpen} onOpenChange={setOrderDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full min-w-0 justify-start text-left font-normal text-sm", !formData.order_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {formData.order_date ? format(formData.order_date, "dd-MMM-yy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.order_date}
                      onSelect={(date) => {
                        if (!date) return;
                        setFormData(prev => ({ ...prev, order_date: date }));
                        setOrderDatePopoverOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="block">Order ID</Label>
                <Input
                  value={format(formData.order_date, 'dd-MMM-yy') + " (Auto-generated)"}
                  disabled
                  className="min-w-0 text-sm"
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="block">Expected Delivery Date</Label>
                <Popover open={expectedDeliveryPopoverOpen} onOpenChange={setExpectedDeliveryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full min-w-0 justify-start text-left font-normal text-sm", !formData.expected_delivery_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {formData.expected_delivery_date ? format(formData.expected_delivery_date, "dd-MMM-yy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.expected_delivery_date}
                      onSelect={(date) => {
                        if (!date) return;
                        setFormData(prev => ({ ...prev, expected_delivery_date: date }));
                        setExpectedDeliveryPopoverOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Customer Information Details */}
            <div className="space-y-4">

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
              </div>

              {formData.products.map((product, productIndex) => {
                const selectedFabricVariant = getSelectedFabricVariant(productIndex);
                return (
                <Card key={productIndex} className="relative border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-background shadow-lg">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-transparent">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base text-primary font-semibold">
                        Product {productIndex + 1}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => duplicateProduct(productIndex)}
                          className="hover:scale-105 transition-transform"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Duplicate
                        </Button>
                        {formData.products.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeProduct(productIndex)}
                            className="hover:scale-105 transition-transform text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  {/* Left Column - Product Category */}
  <div className="lg:col-span-4 flex flex-col h-full">
     <Label className="text-base font-semibold text-gray-700">Product Category</Label>
                         
                         {/* Dropdown Category Selector */}
                         <Select
                           value={product.product_category_id || ''}
                           onValueChange={(value) => handleProductCategorySelect(productIndex, value)}
                         >
                           <SelectTrigger className="w-full">
                             <SelectValue placeholder="Select product category" />
                           </SelectTrigger>
                           <SelectContent>
                             {productCategories.map((category) => (
                               <SelectItem key={category.id} value={category.id}>
                                 {category.category_name}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>

                         {/* Mockup Image Display - Extended height container */}
                         {product.mockup_images && product.mockup_images.length > 0 ? (
                           <div className="mt-4 flex-1 flex flex-col">
                             <div className="flex justify-between items-center mb-2">
                               <Label className="text-sm font-medium text-gray-600 block">Uploaded Mockup</Label>
                             </div>
                             <div className="border-2 border-gray-200 rounded-lg p-3 bg-gray-50 flex-1 flex flex-col min-h-[400px]">
                               <div className="flex-1 flex items-center justify-center relative">
                                 {(() => {
                                   const mainImageUrl = getMainImage(productIndex, 'mockup') || getImageUrl(product.mockup_images[0]);
                                   return mainImageUrl ? (
                                 <img 
                                       src={mainImageUrl} 
                                   alt="Mockup Preview"
                                   className="max-w-full max-h-full object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                                   onClick={() => {
                                         window.open(mainImageUrl, '_blank');
                                   }}
                                 />
                                   ) : null;
                                 })()}
                               </div>
                               <p className="text-center text-xs text-muted-foreground mt-2">
                                 {product.mockup_images.length} file(s) uploaded • Click to view full size
                               </p>
                               {/* Thumbnail Gallery for this section */}
                               {product.mockup_images.length > 1 && (
                                 <div className="flex gap-2 overflow-x-auto pb-2 mt-3">
                                   {product.mockup_images.map((file, idx) => (
                                     <div 
                                       key={idx} 
                                       className="flex-shrink-0 relative group"
                                     >
                                       <div
                                         className="cursor-pointer hover:scale-105 transition-transform duration-200"
                                         onClick={() => {
                                           const imageUrl = getImageUrl(file);
                                           if (imageUrl) {
                                             setMainImages(prev => ({
                                               ...prev,
                                               [productIndex]: {
                                                 ...prev[productIndex],
                                                 mockup: imageUrl
                                               }
                                             }));
                                           }
                                         }}
                                       >
                                         {(() => {
                                           const fileUrl = getImageUrl(file);
                                           const mainImageUrl = getMainImage(productIndex, 'mockup') || getImageUrl(product.mockup_images[0]);
                                           return fileUrl ? (
                                             <img 
                                               src={fileUrl} 
                                               alt={`Mockup ${idx + 1}`}
                                               className={`w-16 h-16 object-cover rounded border-2 ${
                                                 mainImageUrl === fileUrl 
                                                   ? 'border-primary' 
                                                   : 'border-gray-200'
                                               }`}
                                             />
                                           ) : null;
                                         })()}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               )}
                             </div>
                           </div>
                         ) : (
                           <div className="mt-4 flex-1 min-h-[400px]"></div>
                         )}

                         {/* Image-based Category Selector - COMMENTED OUT */}
                         {/* <div className="relative"> 
                           <div className="w-[300px] h-[400px] bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl overflow-hidden relative shadow-lg hover:shadow-xl transition-all duration-300">
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

                             {isCategoryLocked && (
                               <div className="absolute inset-0   flex items-center justify-center">
                                 <div className="bg-white rounded-full p-4 shadow-xl border-2 border-gray-200">
                                   <Lock className="w-8 h-8 text-gray-700" />
                                 </div>
                               </div>
                             )}

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
                           </div> */}
  </div>

  {/* Right Column - 2 Rows × 2 Columns each */}
  <div className="lg:col-span-8 grid grid-cols-1 gap-6">
    {/* Row 1 - Product, Color, and Size Type */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Product - Only show when product category is selected */}
      {product.product_category_id && (
        <div>
          <Label className="text-base font-semibold text-gray-700 mb-2 block">
            Product
            {(() => {
              const filteredFabrics = getFilteredFabricNames(productIndex);
              return filteredFabrics.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredFabrics.length} {filteredFabrics.length === 1 ? 'option' : 'options'})
                </span>
              );
            })()}
          </Label>
          <Select
            value={product.fabric_base_id || product.fabric_id}
            onValueChange={(value) => handleFabricSelect(productIndex, value)}
            disabled={false}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {getFilteredFabricNames(productIndex).map((fabric) => (
                <SelectItem key={fabric.id} value={fabric.id}>
                  {fabric.fabric_name}
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
            value={product.fabric_id}
            onValueChange={(value) => handleColorSelectByFabricId(productIndex, value)}
          >
            <SelectTrigger
              className="w-full"
              onKeyDown={(e) => handleColorTypeahead(productIndex, e.key)}
            >
              <SelectValue placeholder="Select color" />
            </SelectTrigger>
            <SelectContent>
              {getSortedAvailableColors(productIndex).map((fabric) => (
                <SelectItem key={fabric.id} value={fabric.id}>
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
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder="Select fabric first"
            disabled
            className="bg-gray-50 w-full"
          />
        )}
      </div>

      {/* Size Type */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">Size Type</Label>
        <Select
          value={product.size_type_id}
          onValueChange={(value) => handleSizeTypeSelect(productIndex, value)}
        >
          <SelectTrigger className="w-full">
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

      {/* GSM */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">GSM</Label>
        {(() => {
          const gsmOptions = getAvailableGsmOptions(productIndex);
          const listId = `gsm-options-${productIndex}`;
          return (
            <>
              <Input
                value={product.gsm}
                placeholder={gsmOptions.length > 0 ? "Select or type GSM" : "Enter GSM"}
                list={listId}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    products: prev.products.map((p, i) =>
                      i === productIndex ? { ...p, gsm: e.target.value } : p
                    ),
                  }))
                }
                className="w-full"
              />
              <datalist id={listId}>
                {gsmOptions.map((gsm) => (
                  <option key={gsm} value={gsm} />
                ))}
              </datalist>
            </>
          );
        })()}
      </div>
    </div>
    {selectedFabricVariant?.image && (
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
        <img
          src={selectedFabricVariant.image}
          alt={`${selectedFabricVariant.fabric_name} ${selectedFabricVariant.color}`}
          className="w-20 h-20 object-cover rounded-md border"
        />
        <div>
          <div className="font-semibold text-sm text-primary">{selectedFabricVariant.fabric_name}</div>
          <div className="text-sm text-muted-foreground">
            {selectedFabricVariant.color} • {selectedFabricVariant.gsm || product.gsm} GSM
          </div>
          {selectedFabricVariant.fabric_code && (
            <div className="text-xs text-muted-foreground">Code: {selectedFabricVariant.fabric_code}</div>
          )}
        </div>
      </div>
    )}

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {(product.customizations || []).map((customization, index) => (
            <div
              key={`${customization.partId}-${index}`}
              className="p-3 border rounded-lg bg-white shadow-sm min-w-0 w-full"
            >
              <div className="flex items-start gap-3">
                {customization.selectedAddonImageUrl && (
                  <img
                    src={customization.selectedAddonImageUrl}
                    alt={customization.selectedAddonImageAltText || customization.selectedAddonName}
                    className="w-12 h-12 object-cover rounded-lg border-2 border-gray-100 shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">
                        {customization.partName}
                      </div>
                      {customization.partType === 'dropdown' &&
                        (customization.selectedAddonName || customization.selectedAddonId) && (
                          <div className="text-xs text-gray-600 mt-1 break-words whitespace-normal leading-snug">
                            {customization.selectedAddonName}
                          </div>
                        )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCustomization(productIndex, index)}
                      className="shrink-0 h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      aria-label={`Remove ${customization.partName}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* Only show quantity for number type parts, never for dropdown */}
                  {customization.partType !== 'dropdown' && customization.partType === 'number' && customization.quantity && customization.quantity > 0 && (
                    <div className="text-xs text-gray-600 mt-1">
                      Qty: {customization.quantity}
                    </div>
                  )}
                  {customization.priceImpact !== undefined && customization.priceImpact !== null && customization.priceImpact !== 0 && (
                    <div className="text-xs font-medium text-green-600 mt-1">
                      ₹{customization.priceImpact > 0 ? '+' : ''}{customization.priceImpact}
                    </div>
                  )}
                  {/* Display Colors */}
                  {customization.colors && customization.colors.length > 0 && (
                    <div className="mt-2">
                      <CustomizationColorChips colors={customization.colors} />
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
          <div className="flex items-center justify-between mb-2">
            <Label className="text-base font-semibold text-gray-700 block">Size-wise Quantities</Label>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sortSizesQuantities(
              product.sizes_quantities || {},
              product.size_type_id,
              sizeTypes
            ).map(([size, quantity]) => {
              const sizePrice = product.size_prices?.[size] ?? product.price;
              const isCustomPrice = sizePrice !== product.price;
              return (
                <div key={size} className="flex flex-col space-y-1 flex-shrink-0 flex-1 min-w-0">
                  <Label className="text-sm text-center font-medium">{size}</Label>
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
                    placeholder="0"
                    className="w-full text-center text-sm px-2 py-1.5 h-9"
                  />
                  <div className="text-xs text-center text-gray-500 mt-0.5">
                    ₹{sizePrice.toFixed(2)}
                    {isCustomPrice && <span className="text-blue-600 ml-1">*</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Base Price */}
      <div>
        <Label className="text-base font-semibold text-gray-700 mb-2 block">
          Base Price (INR)
          <span className="text-xs font-normal text-gray-500 ml-2">
            (applies to all sizes by default)
          </span>
        </Label>
        <Input
          type="number"
          value={product.price}
          onChange={(e) => {
            const newPrice = parseFloat(e.target.value) || 0;
            setFormData((prev) => ({
              ...prev,
              products: prev.products.map((p, i) => {
                if (i === productIndex) {
                  // Update base price
                  const updatedProduct = { ...p, price: newPrice };
                  // Update all size prices that match the old base price (non-customized sizes)
                  if (p.size_prices) {
                    const updatedSizePrices = { ...p.size_prices };
                    const selectedSizes = selectedSizesForPriceEdit[productIndex] || [];
                    Object.keys(updatedSizePrices).forEach(size => {
                      // Only update if the size price matches the old base price AND it's not in the selected list (not customized)
                      // If it's in selected list, it means user customized it, so don't auto-update
                      if (updatedSizePrices[size] === p.price && !selectedSizes.includes(size)) {
                        updatedSizePrices[size] = newPrice;
                      }
                    });
                    updatedProduct.size_prices = updatedSizePrices;
                  } else if (p.size_type_id) {
                    // Initialize size_prices if not exists
                    const sizeType = sizeTypes.find(st => st.id === p.size_type_id);
                    const orderedSizes = getSortedSizes(sizeType || null);
                    updatedProduct.size_prices = initializeSizePrices(orderedSizes, newPrice);
                  }
                  return updatedProduct;
                }
                return p;
              }),
            }));
          }}
          placeholder="Enter base price"
        />
      </div>

      {/* Size-wise Prices */}
      {product.size_type_id && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-base font-semibold text-gray-700 block">
              Size-wise Prices (INR)
              <span className="text-xs font-normal text-gray-500 ml-2">
                (select sizes to edit prices)
              </span>
            </Label>
            <Popover 
              open={sizePriceEditOpen[productIndex] || false}
              onOpenChange={(open) => setSizePriceEditOpen(prev => ({ ...prev, [productIndex]: open }))}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  Select Sizes
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select sizes to edit prices:</Label>
                  <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                    {sortSizesQuantities(
                      product.sizes_quantities || {},
                      product.size_type_id,
                      sizeTypes
                    ).map(([size]) => {
                      const selected = selectedSizesForPriceEdit[productIndex]?.includes(size) || false;
                      return (
                        <div key={size} className="flex items-center space-x-2">
                          <Checkbox
                            id={`size-${productIndex}-${size}`}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const currentSelected = selectedSizesForPriceEdit[productIndex] || [];
                              if (checked) {
                                setSelectedSizesForPriceEdit(prev => ({
                                  ...prev,
                                  [productIndex]: [...currentSelected, size]
                                }));
                              } else {
                                // When unchecking, remove the custom price (reset to base price)
                                setFormData(prev => {
                                  const updatedProducts = prev.products.map((p, i) => {
                                    if (i === productIndex) {
                                      const currentSizePrices = p.size_prices || {};
                                      const updatedSizePrices = { ...currentSizePrices };
                                      // Remove custom price - size will use base price
                                      delete updatedSizePrices[size];
                                      return {
                                        ...p,
                                        size_prices: Object.keys(updatedSizePrices).length > 0 ? updatedSizePrices : undefined
                                      };
                                    }
                                    return p;
                                  });
                                  return {
                                    ...prev,
                                    products: updatedProducts
                                  };
                                });
                                setSelectedSizesForPriceEdit(prev => ({
                                  ...prev,
                                  [productIndex]: currentSelected.filter(s => s !== size)
                                }));
                              }
                            }}
                          />
                          <Label
                            htmlFor={`size-${productIndex}-${size}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {size}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Single row display for selected sizes */}
          {selectedSizesForPriceEdit[productIndex] && selectedSizesForPriceEdit[productIndex].length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {selectedSizesForPriceEdit[productIndex]
                .sort((a, b) => {
                  // Sort selected sizes in the same order as they appear in the size type
                  const sortedSizes = sortSizesQuantities(
                    product.sizes_quantities || {},
                    product.size_type_id,
                    sizeTypes
                  ).map(([size]) => size);
                  const indexA = sortedSizes.indexOf(a);
                  const indexB = sortedSizes.indexOf(b);
                  return indexA - indexB;
                })
                .map((size) => {
                  // Get the current product from formData to ensure we have latest state
                  const currentProduct = formData.products[productIndex];
                  const basePrice = currentProduct?.price ?? product.price;
                  // Get size price, defaulting to base price if not set or if it equals base price
                  const storedPrice = currentProduct?.size_prices?.[size];
                  const sizePrice = storedPrice !== undefined && storedPrice !== basePrice ? storedPrice : basePrice;
                  const isCustomPrice = storedPrice !== undefined && storedPrice !== basePrice;
                  return (
                    <div key={size} className="flex flex-col space-y-1 flex-shrink-0 flex-1 min-w-0">
                      <Label className="text-sm text-center font-medium">{size}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={sizePrice}
                          onChange={(e) => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            setFormData(prev => {
                              const updatedProducts = prev.products.map((p, i) => {
                                if (i === productIndex) {
                                  // Ensure we have size_prices object
                                  const currentSizePrices = p.size_prices || {};
                                  // Only store if different from base price, otherwise remove it
                                  const updatedSizePrices = { ...currentSizePrices };
                                  if (newPrice === p.price) {
                                    // If price equals base price, remove from size_prices (use base price)
                                    delete updatedSizePrices[size];
                                  } else {
                                    // Store custom price
                                    updatedSizePrices[size] = newPrice;
                                  }
                                  return {
                                    ...p,
                                    size_prices: Object.keys(updatedSizePrices).length > 0 ? updatedSizePrices : undefined
                                  };
                                }
                                return p;
                              });
                              return {
                                ...prev,
                                products: updatedProducts
                              };
                            });
                          }}
                          placeholder="0"
                          className={`w-full text-center text-sm px-2 py-1.5 h-9 ${isCustomPrice ? 'border-blue-500 bg-blue-50' : ''}`}
                        />
                        {isCustomPrice && (
                          <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full" title="Custom price" />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          
          {(!selectedSizesForPriceEdit[productIndex] || selectedSizesForPriceEdit[productIndex].length === 0) && (
            <div className="text-sm text-gray-500 italic p-2 border border-dashed rounded">
              No sizes selected. Click "Select Sizes" to choose which sizes to edit prices for.
            </div>
          )}
        </div>
      )}
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
                      
                    {/* Collapsible section cards (desktop-first compact row) */}
                    {(() => {
                      const hasMockupImage =
                        (product.mockup_images || []).some((file) => {
                          if (file instanceof File) return true;
                          return typeof file === 'string' && file.trim().length > 0;
                        }) || !!getMainImage(productIndex, 'mockup');

                      return (
                    <div className={cn("grid grid-cols-1 gap-3 mb-4", hasMockupImage ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Reference Images</span>
                          <button
                            type="button"
                            onClick={() => toggleProductSection(productIndex, 'reference')}
                            className="group inline-flex items-center cursor-pointer font-medium text-sm px-3 py-2 text-white bg-gradient-to-r from-[#0f0c29] via-[#302b63] to-[#24243e] border-0 tracking-[0.05em] rounded-2xl"
                          >
                            <svg
                              className="mr-1 h-4 w-4 rotate-[30deg] transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[5px] group-hover:rotate-90"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path d="M0 0h24v24H0z" fill="none"></path>
                              <path
                                d="M5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 .823-.076 1.626-.22 2.403l1.94 1.832a.5.5 0 0 1 .095.603l-2.495 4.575a.5.5 0 0 1-.793.114l-2.234-2.234a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.234 2.234a.5.5 0 0 1-.793-.114l-2.495-4.575a.5.5 0 0 1 .095-.603l1.94-1.832C5.077 14.626 5 13.823 5 13zm1.476 6.696l.817-.817A3 3 0 0 1 9.414 18h5.172a3 3 0 0 1 2.121.879l.817.817.982-1.8-1.1-1.04a2 2 0 0 1-.593-1.82c.124-.664.187-1.345.187-2.036 0-3.87-1.995-7.3-5-8.96C8.995 5.7 7 9.13 7 13c0 .691.063 1.372.187 2.037a2 2 0 0 1-.593 1.82l-1.1 1.039.982 1.8zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                                fill="currentColor"
                              ></path>
                            </svg>
                            <span className="transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[7px]">
                              {expandedProductSections[productIndex]?.reference ? 'Hide' : 'Launch'}
                            </span>
                          </button>
                        </div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Attachments</span>
                          <button
                            type="button"
                            onClick={() => toggleProductSection(productIndex, 'attachments')}
                            className="group inline-flex items-center cursor-pointer font-medium text-sm px-3 py-2 text-white bg-gradient-to-r from-[#0f0c29] via-[#302b63] to-[#24243e] border-0 tracking-[0.05em] rounded-2xl"
                          >
                            <svg
                              className="mr-1 h-4 w-4 rotate-[30deg] transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[5px] group-hover:rotate-90"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path d="M0 0h24v24H0z" fill="none"></path>
                              <path
                                d="M5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 .823-.076 1.626-.22 2.403l1.94 1.832a.5.5 0 0 1 .095.603l-2.495 4.575a.5.5 0 0 1-.793.114l-2.234-2.234a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.234 2.234a.5.5 0 0 1-.793-.114l-2.495-4.575a.5.5 0 0 1 .095-.603l1.94-1.832C5.077 14.626 5 13.823 5 13zm1.476 6.696l.817-.817A3 3 0 0 1 9.414 18h5.172a3 3 0 0 1 2.121.879l.817.817.982-1.8-1.1-1.04a2 2 0 0 1-.593-1.82c.124-.664.187-1.345.187-2.036 0-3.87-1.995-7.3-5-8.96C8.995 5.7 7 9.13 7 13c0 .691.063 1.372.187 2.037a2 2 0 0 1-.593 1.82l-1.1 1.039.982 1.8zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                                fill="currentColor"
                              ></path>
                            </svg>
                            <span className="transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[7px]">
                              {expandedProductSections[productIndex]?.attachments ? 'Hide' : 'Launch'}
                            </span>
                          </button>
                        </div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Branding Details</span>
                          <button
                            type="button"
                            onClick={() => toggleProductSection(productIndex, 'branding')}
                            className="group inline-flex items-center cursor-pointer font-medium text-sm px-3 py-2 text-white bg-gradient-to-r from-[#0f0c29] via-[#302b63] to-[#24243e] border-0 tracking-[0.05em] rounded-2xl"
                          >
                            <svg
                              className="mr-1 h-4 w-4 rotate-[30deg] transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[5px] group-hover:rotate-90"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path d="M0 0h24v24H0z" fill="none"></path>
                              <path
                                d="M5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 .823-.076 1.626-.22 2.403l1.94 1.832a.5.5 0 0 1 .095.603l-2.495 4.575a.5.5 0 0 1-.793.114l-2.234-2.234a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.234 2.234a.5.5 0 0 1-.793-.114l-2.495-4.575a.5.5 0 0 1 .095-.603l1.94-1.832C5.077 14.626 5 13.823 5 13zm1.476 6.696l.817-.817A3 3 0 0 1 9.414 18h5.172a3 3 0 0 1 2.121.879l.817.817.982-1.8-1.1-1.04a2 2 0 0 1-.593-1.82c.124-.664.187-1.345.187-2.036 0-3.87-1.995-7.3-5-8.96C8.995 5.7 7 9.13 7 13c0 .691.063 1.372.187 2.037a2 2 0 0 1-.593 1.82l-1.1 1.039.982 1.8zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                                fill="currentColor"
                              ></path>
                            </svg>
                            <span className="transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[7px]">
                              {expandedProductSections[productIndex]?.branding ? 'Hide' : 'Launch'}
                            </span>
                          </button>
                        </div>
                      </Card>
                      {hasMockupImage && (
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Mockup Images</span>
                          <button
                            type="button"
                            onClick={() => toggleProductSection(productIndex, 'mockup')}
                            className="group inline-flex items-center cursor-pointer font-medium text-sm px-3 py-2 text-white bg-gradient-to-r from-[#0f0c29] via-[#302b63] to-[#24243e] border-0 tracking-[0.05em] rounded-2xl"
                          >
                            <svg
                              className="mr-1 h-4 w-4 rotate-[30deg] transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[5px] group-hover:rotate-90"
                              viewBox="0 0 24 24"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path d="M0 0h24v24H0z" fill="none"></path>
                              <path
                                d="M5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 .823-.076 1.626-.22 2.403l1.94 1.832a.5.5 0 0 1 .095.603l-2.495 4.575a.5.5 0 0 1-.793.114l-2.234-2.234a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.234 2.234a.5.5 0 0 1-.793-.114l-2.495-4.575a.5.5 0 0 1 .095-.603l1.94-1.832C5.077 14.626 5 13.823 5 13zm1.476 6.696l.817-.817A3 3 0 0 1 9.414 18h5.172a3 3 0 0 1 2.121.879l.817.817.982-1.8-1.1-1.04a2 2 0 0 1-.593-1.82c.124-.664.187-1.345.187-2.036 0-3.87-1.995-7.3-5-8.96C8.995 5.7 7 9.13 7 13c0 .691.063 1.372.187 2.037a2 2 0 0 1-.593 1.82l-1.1 1.039.982 1.8zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
                                fill="currentColor"
                              ></path>
                            </svg>
                            <span className="transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-x-[7px]">
                              {expandedProductSections[productIndex]?.mockup ? 'Hide' : 'Launch'}
                            </span>
                          </button>
                        </div>
                      </Card>
                      )}
                    </div>
                      );
                    })()}

                    {/* Image Gallery Sections */}
                    {(expandedProductSections[productIndex]?.reference || expandedProductSections[productIndex]?.attachments) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Reference Images Gallery */}
                      {expandedProductSections[productIndex]?.reference && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Reference Images</Label>
                        <div className="flex gap-2">
                          <Input
                            value={mediaLinkInputs[productIndex]?.reference || ''}
                            onChange={(e) =>
                              setMediaLinkInputs((prev) => ({
                                ...prev,
                                [productIndex]: {
                                  reference: e.target.value,
                                  mockup: prev[productIndex]?.mockup || '',
                                  attachments: prev[productIndex]?.attachments || '',
                                },
                              }))
                            }
                            placeholder="Paste image/link URL (Canva, Dropbox, etc.)"
                          />
                          <Button type="button" variant="outline" onClick={() => addMediaLink(productIndex, 'reference_images')}>
                            Add Link
                          </Button>
                        </div>
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
                                  src={getMainImage(productIndex, 'reference') || getImageUrl(product.reference_images[0]) || ''} 
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
                                    className="flex-shrink-0 relative group"
                                  >
                                    <div
                                      className="cursor-pointer hover:scale-105 transition-transform duration-200"
                                      onClick={() => {
                                        const fileUrl = getImageUrl(file);
                                        if (fileUrl) {
                                          handleImageClick(productIndex, 'reference', fileUrl);
                                        }
                                      }}
                                    >
                                      {(() => {
                                        const fileUrl = getImageUrl(file);
                                        const mainImageUrl = getMainImage(productIndex, 'reference');
                                        return fileUrl ? (
                                          <img 
                                            src={fileUrl} 
                                      alt={`Reference ${idx + 1}`}
                                      className={`w-16 h-16 object-cover rounded border-2 ${
                                              mainImageUrl === fileUrl 
                                          ? 'border-primary' 
                                          : 'border-gray-200'
                                      }`}
                                    />
                                        ) : null;
                                      })()}
                                    </div>
                                    {/* Remove button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveImage(productIndex, 'reference', idx);
                                      }}
                                      className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg z-10"
                                      title="Remove image"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 space-y-1">
                                {product.reference_images.map((file, idx) => {
                                  const url = getImageUrl(file);
                                  if (!url) return null;
                                  return (
                                    <div key={`ref-link-${idx}`} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                                      <span className="truncate mr-2">{url}</span>
                                      <Button type="button" size="sm" variant="ghost" onClick={() => window.open(url, '_blank')}>
                                        Open
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {/* Attachments Gallery - Moved from below */}
                      {expandedProductSections[productIndex]?.attachments && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Attachments</Label>
                        <div className="flex gap-2">
                          <Input
                            value={mediaLinkInputs[productIndex]?.attachments || ''}
                            onChange={(e) =>
                              setMediaLinkInputs((prev) => ({
                                ...prev,
                                [productIndex]: {
                                  reference: prev[productIndex]?.reference || '',
                                  mockup: prev[productIndex]?.mockup || '',
                                  attachments: e.target.value,
                                },
                              }))
                            }
                            placeholder="Paste attachment URL (Canva, Dropbox, etc.)"
                          />
                          <Button type="button" variant="outline" onClick={() => addMediaLink(productIndex, 'attachments')}>
                            Add Link
                          </Button>
                        </div>
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                          <input
                            type="file"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setFormData(prev => ({
                                ...prev,
                                products: prev.products.map((p, i) => 
                                  i === productIndex ? { ...p, attachments: [...(p.attachments || []), ...files] } : p
                                )
                              }));
                            }}
                            className="hidden"
                            id={`attachments-${productIndex}`}
                          />
                          <label htmlFor={`attachments-${productIndex}`} className="cursor-pointer block">
                            <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
                            <p className="text-sm font-medium text-foreground">Upload Attachments</p>
                            <p className="text-xs text-muted-foreground">Any file type • PDF, DOC, etc.</p>
                          </label>
                          
                            {product.attachments.length > 0 && (
                            <div className="mt-4">
                              <Badge variant="secondary" className="bg-primary/20 text-primary mb-3">
                                  {product.attachments.length} file(s) selected
                                </Badge>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {product.attachments.map((file, idx) => (
                                  <div key={idx} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 flex items-center justify-between gap-2">
                                      <span className="truncate">
                                        {file instanceof File ? file.name : file}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => {
                                            const url = getImageUrl(file);
                                            if (url) window.open(url, '_blank');
                                          }}
                                        >
                                          Open
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => handleRemoveAttachment(productIndex, idx)}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                        </div>
                      )}
                      </div>
                    )}
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


                    {(expandedProductSections[productIndex]?.branding || expandedProductSections[productIndex]?.mockup) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start lg:items-center">
                    {/* Branding Section */}
                    {expandedProductSections[productIndex]?.branding && (
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBrandingItem(productIndex, brandingIndex)}
                              className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                            >
                              <X className="w-4 h-4" />
                            </Button>
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
                              <BrandingPlacementCombobox
                                value={brandingItem.placement}
                                onChange={(v) => updateBrandingItem(productIndex, brandingIndex, 'placement', v)}
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
                    )}

                    {/* Mockup Images Gallery */}
                    {expandedProductSections[productIndex]?.mockup && (
                    <div className="space-y-3 lg:self-center">
                      <Label className="text-sm font-medium">Mockup Images</Label>
                      <div className="flex gap-2">
                        <Input
                          value={mediaLinkInputs[productIndex]?.mockup || ''}
                          onChange={(e) =>
                            setMediaLinkInputs((prev) => ({
                              ...prev,
                              [productIndex]: {
                                reference: prev[productIndex]?.reference || '',
                                mockup: e.target.value,
                                attachments: prev[productIndex]?.attachments || '',
                              },
                            }))
                          }
                          placeholder="Paste mockup URL (Canva, Dropbox, etc.)"
                        />
                        <Button type="button" variant="outline" onClick={() => addMediaLink(productIndex, 'mockup_images')}>
                          Add Link
                        </Button>
                      </div>
                      <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 hover:border-primary/50 transition-colors bg-gradient-to-br from-primary/5 to-primary/10">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                            handleImageUpload(productIndex, 'mockup', files);
                              // Reset the input so the same file can be selected again
                              e.target.value = '';
                            }
                          }}
                          className="hidden"
                          id={`mockup-images-${productIndex}`}
                        />
                        <label htmlFor={`mockup-images-${productIndex}`} className="cursor-pointer block">
                          <Image className="w-8 h-8 mx-auto mb-2 text-primary" />
                          <p className="text-sm font-medium text-foreground">Upload Mockup Images</p>
                          <p className="text-xs text-muted-foreground">Up to 20 images • Add multiple mockups for multiple branding types</p>
                        </label>
                        
                        {product.mockup_images.length > 0 && (
                          <div className="mt-4">
                            <Badge variant="secondary" className="bg-primary/20 text-primary mb-3">
                              {product.mockup_images.length} file(s) selected
                            </Badge>
                            
                            {/* Main Image Display */}
                            <div className="mb-3">
                              <Label className="text-sm font-medium text-gray-600 flex items-center gap-2 mb-2">
                                <Image className="w-4 h-4" />
                                Main Mockup
                              </Label>
                              <div className="p-2 border-2 border-primary/30 rounded-lg bg-white relative min-h-[256px] flex items-center justify-center">
                                {(() => {
                                  const mainImageUrl = getMainImage(productIndex, 'mockup') || getImageUrl(product.mockup_images[0]);
                                  return mainImageUrl ? (
                                    <>
                                      <img 
                                        src={mainImageUrl} 
                                alt="Main Mockup"
                                className="w-full h-64 object-contain rounded cursor-pointer hover:scale-105 transition-transform duration-200"
                                        onClick={() => {
                                          window.open(mainImageUrl, '_blank');
                                        }}
                                        onError={(e) => {
                                          console.error('Failed to load mockup image:', mainImageUrl);
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                      {/* Remove button for main image */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          const currentMainImageUrl = getMainImage(productIndex, 'mockup') || getImageUrl(product.mockup_images[0]);
                                          if (currentMainImageUrl && product.mockup_images.length > 0) {
                                            // Find the index of the image that matches the current main image
                                            let imageIndex = -1;
                                            for (let i = 0; i < product.mockup_images.length; i++) {
                                              const fileUrl = getImageUrl(product.mockup_images[i]);
                                              if (fileUrl === currentMainImageUrl) {
                                                imageIndex = i;
                                                break;
                                              }
                                            }
                                            // If not found by URL, use the first image
                                            if (imageIndex === -1) {
                                              imageIndex = 0;
                                            }
                                            handleRemoveImage(productIndex, 'mockup', imageIndex);
                                          }
                                        }}
                                        className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg z-10 transition-colors duration-200"
                                        title="Remove this image"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                      <p className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center text-sm text-muted-foreground bg-white/80 px-2 py-1 rounded">
                                        Click to see full view
                                      </p>
                                    </>
                                  ) : (
                                    <div className="text-center text-muted-foreground py-8">
                                      <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                      <p className="text-sm">No preview available</p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            
                            {/* Thumbnail Gallery */}
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {product.mockup_images.map((file, idx) => (
                                <div 
                                  key={idx} 
                                  className="flex-shrink-0 relative group"
                                >
                                  <div
                                    className="cursor-pointer hover:scale-105 transition-transform duration-200"
                                    onClick={() => {
                                      const fileUrl = getImageUrl(file);
                                      if (fileUrl) {
                                        handleImageClick(productIndex, 'mockup', fileUrl);
                                      }
                                    }}
                                  >
                                    {(() => {
                                      const fileUrl = getImageUrl(file);
                                      const mainImageUrl = getMainImage(productIndex, 'mockup');
                                      return fileUrl ? (
                                        <img 
                                          src={fileUrl} 
                                    alt={`Mockup ${idx + 1}`}
                                    className={`w-16 h-16 object-cover rounded border-2 ${
                                            mainImageUrl === fileUrl 
                                        ? 'border-primary' 
                                        : 'border-gray-200'
                                    }`}
                                  />
                                      ) : null;
                                    })()}
                                  </div>
                                  {/* Remove button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveImage(productIndex, 'mockup', idx);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg z-10"
                                    title="Remove image"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                    </div>
                    )}

                  </CardContent>
                </Card>
              );
              })}

              <div className="flex justify-center">
                <Button
                  type="button"
                  onClick={addProduct}
                  className="lg:hidden bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
                <button
                  type="button"
                  onClick={addProduct}
                  className="group hidden lg:flex relative w-[190px] h-11 cursor-pointer items-center border border-primary bg-primary hover:bg-primary/90 active:border-primary/80 rounded-2xl transition-all duration-300"
                >
                  <span className="translate-x-[34px] text-white font-semibold transition-all duration-300 group-hover:text-transparent">
                    Add Product
                  </span>
                  <span className="absolute translate-x-[149px] h-full w-[39px] rounded-r-2xl bg-primary/90 group-hover:w-[188px] group-hover:translate-x-0 group-hover:rounded-2xl active:bg-primary/80 flex items-center justify-center transition-all duration-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-[30px] stroke-white"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </span>
                </button>
              </div>
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
                          // Use size-based pricing calculation
                          const amount = calculateSizeBasedTotal(
                            product.sizes_quantities || {},
                            product.size_prices,
                            product.price
                          );
                          const gstAmount = (amount * (product.gst_rate || 0)) / 100;
                          const total = amount + gstAmount;
                          
                          // Group sizes by price for display
                          const sizePriceGroups: { [price: string]: { sizes: string[], qty: number } } = {};
                          Object.entries(product.sizes_quantities || {}).forEach(([size, qty]) => {
                            if (qty > 0) {
                              const sizePrice = product.size_prices?.[size] ?? product.price;
                              const priceKey = sizePrice.toFixed(2);
                              if (!sizePriceGroups[priceKey]) {
                                sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
                              }
                              sizePriceGroups[priceKey].sizes.push(size);
                              sizePriceGroups[priceKey].qty += qty;
                            }
                          });

                          // Size-wise quantity details (without price) for Total Qty column
                          const sizeQuantityEntries = Object.entries(product.sizes_quantities || {})
                            .filter(([, qty]) => qty > 0);
                          
                          return (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2">
                                {(() => {
                                  // Only show mockup image, not category image
                                  // Keep blank until mockup is uploaded
                                  if (product.mockup_images && product.mockup_images.length > 0) {
                                    const firstMockup = product.mockup_images[0];
                                    let imageSrc: string | null = null;
                                    
                                    // Handle File object (before upload)
                                    if (firstMockup instanceof File) {
                                      imageSrc = getImageUrl(firstMockup) || '';
                                    }
                                    // Handle URL string (after upload)
                                    else if (typeof firstMockup === 'string' && firstMockup.trim()) {
                                      imageSrc = firstMockup.trim();
                                    }
                                    
                                    // Also check main image if set
                                    if (!imageSrc) {
                                      const mainImage = getMainImage(index, 'mockup');
                                      if (mainImage) {
                                        imageSrc = mainImage;
                                      }
                                    }
                                    
                                    return imageSrc ? (
                                      <img 
                                        src={imageSrc} 
                                        alt="Mockup" 
                                        className="w-20 h-20 object-cover rounded"
                                      />
                                    ) : null;
                                  }
                                  // Return null (blank) if no mockup images
                                  return null;
                                })()}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                <div className="text-sm">
                                  <div className="text-gray-800 text-xs font-extrabold">
                                    {fabrics.find(f => f.id === product.fabric_id)?.fabric_name} - {product.color}, {product.gsm} GSM
                                  </div>
                                  <div className="font-normal text-gray-800">{product.product_description}</div>
                                  <div className="text-gray-700 text-xs font-bold">
                                    {productCategories.find(c => c.id === product.product_category_id)?.category_name}
                                  </div>
                                  {product.branding_items && product.branding_items.length > 0 && (
                                    <div className="mt-2">
                                      <div className="text-xs font-bold text-gray-800 mb-1">Branding</div>
                                      <table className="w-full border-collapse text-[11px]">
                                        <thead>
                                          <tr className="bg-gray-50">
                                            <th className="border border-gray-200 px-1.5 py-1 text-left font-semibold">Type</th>
                                            <th className="border border-gray-200 px-1.5 py-1 text-left font-semibold">Placement</th>
                                            <th className="border border-gray-200 px-1.5 py-1 text-left font-semibold">Size</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {product.branding_items.map((item, idx) => (
                                            <tr key={`${item.branding_type}-${item.placement}-${idx}`}>
                                              <td className="border border-gray-200 px-1.5 py-1">{item.branding_type || '-'}</td>
                                              <td className="border border-gray-200 px-1.5 py-1">{item.placement || '-'}</td>
                                              <td className="border border-gray-200 px-1.5 py-1">{item.measurement || '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
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
                                <div className="text-xs text-gray-600 mt-1">
                                  {sizeQuantityEntries.map(([size, qty], idx) => (
                                    <span key={size}>
                                      {size}: {qty}
                                      {idx < sizeQuantityEntries.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-sm">
                                <div className="space-y-1">
                                  {Object.entries(sizePriceGroups).map(([price, group]) => (
                                    <div key={price} className="text-xs">
                                      {group.sizes.join(', ')}: ₹{parseFloat(price).toFixed(2)}
                                    </div>
                                  ))}
                                </div>
                              </td>
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


      {/* Product Customization Modal */}
      <ProductCustomizationModal
        productIndex={currentProductIndex}
        productCategoryId={formData.products[currentProductIndex]?.product_category_id || ''}
        isOpen={customizationModalOpen}
        onClose={() => setCustomizationModalOpen(false)}
        fabricColor={formData.products[currentProductIndex]?.color}
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