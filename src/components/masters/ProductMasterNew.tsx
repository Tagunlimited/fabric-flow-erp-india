import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import Papa from "papaparse";
import * as XLSX from 'xlsx';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Settings, 
  Grid3X3, 
  ExternalLink, 
  ChevronDown,
  ArrowUpDown,
  Filter,
  Eye,
  EyeOff,
  Upload,
  Download,
  FileSpreadsheet
} from "lucide-react";

const BULK_TEMPLATE_HEADERS = [
  "sku",
  "class",
  "color",
  "size_type",
  "size",
  "name",
  "material",
  "brand",
  "category",
  "gender",
  "mrp",
  "cost",
  "selling_price",
  "gst_rate",
  "hsn",
  "main_image",
  "image1",
  "image2"
];

interface Product {
  id?: string;
  sku?: string;
  class?: string;
  color?: string;
  size_type?: string;
  size?: string;
  name?: string; // product field
  material?: string;
  brand?: string;
  category?: string;
  gender?: string;
  mrp?: number;
  cost?: number;
  selling_price?: number;
  gst_rate?: number;
  hsn?: string;
  main_image?: string;
  image1?: string;
  image2?: string;
  created_at?: string;
  updated_at?: string;
}

interface ColumnVisibility {
  [key: string]: boolean;
}

export function ProductMasterNew() {
  // Auth context
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  // State management
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showDialog, setShowDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [editMode, setEditMode] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Column visibility state - only fields from image
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    sku: true,
    class: true,
    color: true,
    size_type: true,
    size: true,
    name: true,
    material: true,
    brand: true,
    category: true,
    gender: true,
    mrp: true,
    cost: true,
    selling_price: true,
    gst_rate: true,
    hsn: true,
    main_image: true,
    image1: true,
    image2: true
  });

  // Form state - only fields from image
  const [formData, setFormData] = useState<any>({
    sku: "",
    class: "",
    color: "",
    size_type: "",
    size: "",
    name: "", // product field
    material: "",
    brand: "",
    category: "",
    gender: "",
    mrp: "",
    cost: "",
    selling_price: "",
    gst_rate: "5",
    hsn: "",
    main_image: "",
    image1: "",
    image2: ""
  });

  // Initialize Supabase client only once
  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  // Size order for sorting
  const getSizeOrder = (size: string | undefined | null): number => {
    if (!size) return 999; // Put empty/null sizes at the end
    
    const sizeUpper = size.toUpperCase().trim();
    const sizeMap: { [key: string]: number } = {
      'S': 1,
      'M': 2,
      'L': 3,
      'XL': 4,
      'X-L': 4,
      '2XL': 5,
      '2-XL': 5,
      'XXL': 5,
      '3XL': 6,
      '3-XL': 6,
      'XXXL': 6
    };
    
    return sizeMap[sizeUpper] || 999; // Unknown sizes go to the end
  };

  // Filter and sort products
  useEffect(() => {
    let filtered = products;
    
    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter(product => product.category === categoryFilter);
    }
    
    // Apply search term filter - search in new fields only
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(product =>
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.color?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.size?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply automatic sorting: First by class, then by size
    filtered.sort((a, b) => {
      // Primary sort: Class
      const aClass = (a.class || '').toLowerCase();
      const bClass = (b.class || '').toLowerCase();
      
      if (aClass !== bClass) {
        return aClass.localeCompare(bClass);
      }
      
      // Secondary sort: Size (S, M, L, XL, 2XL, 3XL order)
      const aSizeOrder = getSizeOrder(a.size);
      const bSizeOrder = getSizeOrder(b.size);
      
      if (aSizeOrder !== bSizeOrder) {
        return aSizeOrder - bSizeOrder;
      }
      
      // Tertiary sort: If sizes are same, sort by SKU for consistency
      const aSku = (a.sku || '').toLowerCase();
      const bSku = (b.sku || '').toLowerCase();
      return aSku.localeCompare(bSku);
    });

    // Apply manual sorting if user has selected a specific field
    if (sortField && sortField !== 'class' && sortField !== 'size') {
      filtered.sort((a, b) => {
        const aVal = a[sortField as keyof Product];
        const bVal = b[sortField as keyof Product];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        return 0;
      });
    }
    
    setFilteredProducts(filtered);
  }, [searchTerm, categoryFilter, statusFilter, products, sortField, sortDirection]);

  // Preload images for better performance
  const preloadImages = (imageUrls: string[]) => {
    imageUrls.forEach((url) => {
      if (!url) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
      
      // Also prefetch for browser cache
      const img = new Image();
      img.src = url;
    });
  };

  // Fetch products from Supabase
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_master')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      const productsData = (data as unknown as Product[]) || [];
      setProducts(productsData);
      setFilteredProducts(productsData);
      
      // Clear selection if products were deleted
      setSelectedProducts(prev => {
        const newSet = new Set<string>();
        const productIds = new Set(productsData.map(p => p.id).filter(Boolean));
        prev.forEach(id => {
          if (productIds.has(id)) {
            newSet.add(id);
          }
        });
        return newSet;
      });
      
      // Preload first 20 product images for faster display
      const imageUrls: string[] = [];
      productsData.slice(0, 20).forEach((product) => {
        if (product.main_image) imageUrls.push(product.main_image);
        if (product.image1) imageUrls.push(product.image1);
        if (product.image2) imageUrls.push(product.image2);
      });
      
      // Preload images after a short delay to not block UI
      setTimeout(() => {
        preloadImages(imageUrls);
      }, 100);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load product data when in edit mode
  useEffect(() => {
    if (editMode && currentProductId) {
      const productToEdit = products.find(product => product.id === currentProductId);
      if (productToEdit) {
        setFormData({
          sku: productToEdit.sku || "",
          class: productToEdit.class || "",
          color: productToEdit.color || "",
          size_type: productToEdit.size_type || "",
          size: productToEdit.size || "",
          name: productToEdit.name || "",
          material: productToEdit.material || "",
          brand: productToEdit.brand || "",
          category: productToEdit.category || "",
          gender: productToEdit.gender || "",
          mrp: productToEdit.mrp?.toString() || "",
          cost: productToEdit.cost?.toString() || "",
          selling_price: productToEdit.selling_price?.toString() || "",
          gst_rate: productToEdit.gst_rate?.toString() || "5",
          hsn: productToEdit.hsn || "",
          main_image: productToEdit.main_image || "",
          image1: productToEdit.image1 || "",
          image2: productToEdit.image2 || ""
        });
      }
    }
  }, [editMode, currentProductId, products]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.sku?.trim()) {
      alert('SKU is required');
      return;
    }
    if (!formData.name?.trim()) {
      alert('Product Name is required');
      return;
    }
    if (!formData.category?.trim()) {
      alert('Category is required');
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare data for submission - only fields from image
      const sku = formData.sku?.trim() || null;
      let submitData: any = {
        // Map sku to product_id for backward compatibility if column exists
        product_id: sku, // Use sku as product_id
        sku: sku,
        class: formData.class?.trim() || null,
        color: formData.color?.trim() || null,
        size_type: formData.size_type?.trim() || null,
        size: formData.size?.trim() || null,
        name: formData.name?.trim() || null, // product field
        material: formData.material?.trim() || null,
        brand: formData.brand?.trim() || null,
        category: formData.category?.trim() || null,
        gender: formData.gender?.trim() || null,
        mrp: formData.mrp ? parseFloat(formData.mrp) : null,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        selling_price: formData.selling_price ? parseFloat(formData.selling_price) : null,
        gst_rate: formData.gst_rate ? parseFloat(formData.gst_rate) : null,
        hsn: formData.hsn?.trim() || null,
        main_image: formData.main_image?.trim() || null,
        image1: formData.image1?.trim() || null,
        image2: formData.image2?.trim() || null
      };
      
      // Handle image upload if a file is selected
      if (imageFile) {
        const imageUrl = await uploadImage(imageFile);
        if (imageUrl) {
          submitData.main_image = imageUrl;
        } else {
          alert('Image upload failed, but product will be saved without image. You can add the image later.');
        }
      }
      
      // Download images from URLs if provided (not already in our storage)
      try {
        if (submitData.main_image && submitData.main_image.startsWith('http') && !submitData.main_image.includes('supabase.co/storage')) {
          const downloadedUrl = await downloadAndUploadImage(submitData.main_image, submitData.sku || '', 'main');
          if (downloadedUrl) {
            submitData.main_image = downloadedUrl;
          }
        }
        if (submitData.image1 && submitData.image1.startsWith('http') && !submitData.image1.includes('supabase.co/storage')) {
          const downloadedUrl = await downloadAndUploadImage(submitData.image1, submitData.sku || '', 'image1');
          if (downloadedUrl) {
            submitData.image1 = downloadedUrl;
          }
        }
        if (submitData.image2 && submitData.image2.startsWith('http') && !submitData.image2.includes('supabase.co/storage')) {
          const downloadedUrl = await downloadAndUploadImage(submitData.image2, submitData.sku || '', 'image2');
          if (downloadedUrl) {
            submitData.image2 = downloadedUrl;
          }
        }
      } catch (error) {
        console.error('Error downloading images:', error);
        // Continue saving product even if image download fails
      }
      
      if (editMode && currentProductId) {
        // Update existing product
        const { error } = await supabase
          .from('product_master')
          .update(submitData)
          .eq('id', currentProductId as any);
        
        if (error) throw error;
      } else {
        // Add new product
        const { error } = await supabase
          .from('product_master')
          .insert([submitData]);
        
        if (error) throw error;
      }
      
      setShowDialog(false);
      await fetchProducts();
      resetForm(true);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error saving product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reset form to default values
  const resetForm = (clearImage = true) => {
    setFormData({
      sku: "",
      class: "",
      color: "",
      size_type: "",
      size: "",
      name: "",
      material: "",
      brand: "",
      category: "",
      gender: "",
      mrp: "",
      cost: "",
      selling_price: "",
      gst_rate: "5",
      hsn: "",
      main_image: "",
      image1: "",
      image2: ""
    });
    setEditMode(false);
    setCurrentProductId(null);
    if (clearImage) {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload image to Supabase storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, GIF, etc.)');
        return null;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return null;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `product-${Date.now()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        if (uploadError.message.includes('already exists')) {
          alert('A file with this name already exists. Please try again.');
        } else if (uploadError.message.includes('not found')) {
          alert('Storage bucket not found. Please contact administrator.');
        } else if (uploadError.message.includes('permission')) {
          alert('Permission denied. Please check your storage permissions.');
        } else if (uploadError.message.includes('size')) {
          alert('File size exceeds the limit. Please choose a smaller image.');
        } else {
          alert(`Upload failed: ${uploadError.message}`);
        }
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('An unexpected error occurred during upload. Please try again.');
      return null;
    }
  };

  // Download image from URL and upload to Supabase Storage with CORS proxy fallback
  const downloadAndUploadImage = async (imageUrl: string, sku: string, imageType: 'main' | 'image1' | 'image2'): Promise<string | null> => {
    try {
      // Skip if URL is already from our storage or empty
      if (!imageUrl || !imageUrl.trim()) {
        return null;
      }

      // Check if already uploaded to our storage (contains supabase storage domain)
      const supabaseStoragePattern = /supabase\.co\/storage\/v1\/object\/public/;
      if (supabaseStoragePattern.test(imageUrl)) {
        return imageUrl;
      }

      // Skip Dropbox URLs immediately - they can't be downloaded due to CORS
      if (imageUrl.includes('dropbox.com')) {
        console.warn(`⚠️ Skipping Dropbox URL for SKU ${sku} (${imageType}): Dropbox images require server-side download. Keeping original URL.`);
        return imageUrl; // Return original URL - won't display in browser but keeps the data
      }

      // Try direct fetch for CORS-enabled URLs with timeout
      let blob: Blob;
      let response: Response;

      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          response = await fetch(imageUrl, {
            mode: 'cors',
            cache: 'no-cache',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          blob = await response.blob();
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (corsError: any) {
        // If CORS fails or timeout occurs, return original URL
        if (corsError.name === 'AbortError') {
          console.warn(`⚠️ Timeout downloading ${imageUrl}. Using original URL.`);
        } else {
          console.warn(`⚠️ CORS/Network error for ${imageUrl}. Using original URL.`);
        }
        return imageUrl;
      }
      
      // Validate file type
      if (!blob.type || !blob.type.startsWith('image/')) {
        // If blob type is empty (no-cors mode), check file extension
        const urlExt = imageUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
        if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExt)) {
          console.warn('Downloaded file type cannot be verified:', blob.type || 'unknown');
          // Return original URL as fallback
          return imageUrl;
        }
      }

      // Validate file size (max 10MB)
      if (blob.size > 10 * 1024 * 1024) {
        console.warn('Image file is too large:', blob.size, 'bytes');
        return imageUrl; // Return original URL instead of failing
      }

      // Get file extension from URL or blob type
      const urlExt = imageUrl.split('.').pop()?.split('?')[0] || '';
      const ext = urlExt.match(/^(jpg|jpeg|png|gif|webp)$/i) ? urlExt.toLowerCase() : 'jpg';
      const fileName = `product-${sku.replace(/[^a-zA-Z0-9]/g, '-')}-${imageType}-${Date.now()}.${ext}`;
      const filePath = `products/${fileName}`;

      // Convert blob to File with proper MIME type
      const mimeType = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const file = new File([blob], fileName, { type: mimeType });

      // Upload to Supabase Storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('❌ Error uploading downloaded image:', uploadError);
        // Return original URL if upload fails
        return imageUrl;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      console.log(`✅ Successfully uploaded ${imageType} image for SKU ${sku}:`, urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error: any) {
      console.error(`❌ Error downloading/uploading ${imageType} image for SKU ${sku}:`, error);
      // Return original URL as fallback instead of null
      return imageUrl;
    }
  };

  // Handle edit button click
  const handleEdit = (productId: string) => {
    setCurrentProductId(productId);
    setEditMode(true);
    setShowDialog(true);
  };

  // Handle delete button click
  const handleDelete = async (productId: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('product_master')
          .delete()
          .eq('id', productId as any);
        
        if (error) throw error;
        
        toast({
          title: "Product Deleted",
          description: "Product has been deleted successfully.",
        });
        
        await fetchProducts();
        // Remove from selected set if it was selected
        setSelectedProducts(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      } catch (error) {
        console.error('Error deleting product:', error);
        toast({
          title: "Delete Failed",
          description: "Failed to delete product. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle batch delete
  const handleBatchDelete = async () => {
    if (selectedProducts.size === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedProducts.size} product(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      setDeleteLoading(true);
      const productIds = Array.from(selectedProducts);
      
      // Delete in batches to avoid timeout
      const batchSize = 50;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('product_master')
          .delete()
          .in('id', batch as any);
        
        if (error) throw error;
      }
      
      toast({
        title: "Products Deleted",
        description: `Successfully deleted ${productIds.length} product(s).`,
      });
      
      setSelectedProducts(new Set());
      await fetchProducts();
    } catch (error: any) {
      console.error('Error deleting products:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete products. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle product selection
  const handleSelectProduct = (productId: string, checked: boolean) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredProducts.map(p => p.id!).filter(Boolean));
      setSelectedProducts(allIds);
    } else {
      setSelectedProducts(new Set());
    }
  };

  // Check if all visible products are selected
  const allSelected = filteredProducts.length > 0 && filteredProducts.every(p => p.id && selectedProducts.has(p.id));
  const someSelected = filteredProducts.some(p => p.id && selectedProducts.has(p.id));

  // Handle bulk upload with support for CSV and Excel
  const handleBulkUpload = async (file: File) => {
    setBulkLoading(true);
    setBulkError(null);
    setBulkSuccess(null);
    setUploadProgress(0);
    
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let products: any[] = [];

      if (fileExtension === 'csv') {
        // Handle CSV file
      const text = await file.text();
        const result = Papa.parse(text, { 
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim()
        });
        products = result.data.filter((row: any) => 
        Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== "")
      );
        setUploadProgress(30);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Handle Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        products = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        setUploadProgress(30);
      } else {
        throw new Error("Unsupported file format. Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
      }
      
      if (!products.length) {
        throw new Error("No valid products found in file.");
      }

      setUploadProgress(50);
      
      // Convert string values to proper types - only fields from image
      const formattedProducts = products.map((product: any, index: number) => {
        try {
          const sku = product.sku?.toString().trim() || null;
          if (!sku) {
            console.warn(`Row ${index + 1}: SKU is required`);
            return null;
          }

          return {
            // Map sku to product_id if product_id column exists and is required
            product_id: sku, // Use sku as product_id for backward compatibility
            sku: sku,
            class: product.class?.toString().trim() || null,
            color: product.color?.toString().trim() || null,
            size_type: product.size_type?.toString().trim() || null,
            size: product.size?.toString().trim() || null,
            name: product.name?.toString().trim() || null,
            material: product.material?.toString().trim() || null,
            brand: product.brand?.toString().trim() || null,
            category: product.category?.toString().trim() || null,
            gender: product.gender?.toString().trim() || null,
            mrp: product.mrp ? parseFloat(product.mrp.toString().replace(/[^0-9.]/g, '')) : null,
            cost: product.cost ? parseFloat(product.cost.toString().replace(/[^0-9.]/g, '')) : null,
            selling_price: product.selling_price ? parseFloat(product.selling_price.toString().replace(/[^0-9.]/g, '')) : null,
            gst_rate: product.gst_rate ? parseFloat(product.gst_rate.toString().replace(/[^0-9.]/g, '')) : null,
            hsn: product.hsn?.toString().trim() || null,
            // Store original URLs temporarily - will be replaced with downloaded URLs
            main_image: product.main_image?.toString().trim() || null,
            image1: product.image1?.toString().trim() || null,
            image2: product.image2?.toString().trim() || null,
            // Keep original URLs for downloading
            _original_main_image: product.main_image?.toString().trim() || null,
            _original_image1: product.image1?.toString().trim() || null,
            _original_image2: product.image2?.toString().trim() || null
          };
        } catch (error) {
          console.error(`Error processing row ${index + 1}:`, error);
          return null;
        }
      }).filter(p => p !== null && p.sku); // Filter out invalid rows and rows without SKU

      // Use image URLs directly from the file (do not download)
      setUploadProgress(70);
      console.log(`📥 Processing images for ${formattedProducts.length} products...`);
      
      // Simply use the original URLs from the file - no download/upload
      for (const product of formattedProducts) {
        // Use original URLs directly
        if (product._original_main_image) {
          product.main_image = product._original_main_image;
        }
        if (product._original_image1) {
          product.image1 = product._original_image1;
        }
        if (product._original_image2) {
          product.image2 = product._original_image2;
        }
      }
      
      console.log('✅ Image URLs processed (using URLs directly from file)');

      // Remove temporary properties
      formattedProducts.forEach(p => {
        delete (p as any)._original_main_image;
        delete (p as any)._original_image1;
        delete (p as any)._original_image2;
      });
      
      setUploadProgress(75);

      if (formattedProducts.length === 0) {
        throw new Error("No valid products after processing. Please check your file format.");
      }

      setUploadProgress(70);

      // Upsert in batches of 100 to avoid timeout - updates existing SKUs or inserts new ones
      const batchSize = 100;
      let insertedCount = 0;
      let updatedCount = 0;
      for (let i = 0; i < formattedProducts.length; i += batchSize) {
        const batch = formattedProducts.slice(i, i + batchSize);
        
        // Use upsert to update existing records or insert new ones based on SKU
        // First, check if products exist by SKU
        const skus = batch.map(p => p.sku).filter(Boolean);
        const { data: existingProducts } = await supabase
        .from('product_master')
          .select('sku, id')
          .in('sku', skus);
        
        const existingSkus = new Set((existingProducts || []).map((p: any) => p.sku));
        const toInsert = batch.filter(p => !existingSkus.has(p.sku));
        const toUpdate = batch.filter(p => existingSkus.has(p.sku));
        
        // Insert new products
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('product_master')
            .insert(toInsert as any);
          
          if (insertError) {
            console.error('Insert error:', insertError);
            throw insertError;
          }
          insertedCount += toInsert.length;
        }
        
        // Update existing products by SKU
        if (toUpdate.length > 0) {
          for (const product of toUpdate) {
            const { error: updateError } = await supabase
              .from('product_master')
              .update({
                class: product.class,
                color: product.color,
                size_type: product.size_type,
                size: product.size,
                name: product.name,
                material: product.material,
                brand: product.brand,
                category: product.category,
                gender: product.gender,
                mrp: product.mrp,
                cost: product.cost,
                selling_price: product.selling_price,
                gst_rate: product.gst_rate,
                hsn: product.hsn,
                main_image: product.main_image,
                image1: product.image1,
                image2: product.image2,
                updated_at: new Date().toISOString()
              } as any)
              .eq('sku', product.sku);
            
            if (updateError) {
              console.error(`Update error for SKU ${product.sku}:`, updateError);
              // Continue with other updates even if one fails
            } else {
              updatedCount++;
            }
          }
        }
        
        setUploadProgress(70 + (i / formattedProducts.length) * 25);
      }
      
      setUploadProgress(100);
      const totalProcessed = insertedCount + updatedCount;
      const message = updatedCount > 0 
        ? `Successfully processed ${totalProcessed} products: ${insertedCount} new, ${updatedCount} updated.`
        : `Successfully uploaded ${insertedCount} products.`;
      setBulkSuccess(message);
      toast({
        title: "Upload Successful",
        description: updatedCount > 0 
          ? `${insertedCount} new products added, ${updatedCount} existing products updated.`
          : `${insertedCount} products uploaded successfully.`,
      });
      
      await fetchProducts();
      setTimeout(() => {
        setBulkDialog(false);
        setUploadProgress(0);
      }, 2000);
      
    } catch (err: any) {
      console.error('Bulk upload error:', err);
      setBulkError(err.message || "Failed to upload products. Please check the file format.");
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to upload products.",
        variant: "destructive",
      });
    } finally {
      setBulkLoading(false);
      setUploadProgress(0);
    }
  };

  // Download CSV template with sample data
  const handleDownloadTemplate = () => {
    const sampleRow = [
      "NC-DOT-WH-S",
      "NC-DOT-WH",
      "WHITE",
      "MEN-ALPHA",
      "S",
      "DOTT FORWARD R/N",
      "polyester",
      "Navycut USA",
      "Dryfit Round",
      "Men",
      "799",
      "120",
      "220",
      "5",
      "61091000",
      "https://www.dropbox.com/sample-image.jpg",
      "https://www.dropbox.com/sample-image1.jpg",
      "https://www.dropbox.com/sample-image2.jpg"
    ];
    
    const csv = [
      BULK_TEMPLATE_HEADERS.join(","),
      sampleRow.join(",")
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_master_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template Downloaded",
      description: "CSV template downloaded successfully.",
    });
  };

  // Export products to CSV
  const handleExportCSV = () => {
    try {
      setExportLoading(true);
      
      const csvHeaders = [
        "SKU", "Class", "Color", "Size Type", "Size", "Product", "Material",
        "Brand", "Category", "Gender", "MRP", "Cost", "Selling Price",
        "GST Rate", "HSN", "Main Image", "Image 1", "Image 2"
      ];
      
      const csvRows = filteredProducts.map(product => [
        product.sku || '',
        product.class || '',
        product.color || '',
        product.size_type || '',
        product.size || '',
        product.name || '',
        product.material || '',
        product.brand || '',
        product.category || '',
        product.gender || '',
        product.mrp || '',
        product.cost || '',
        product.selling_price || '',
        product.gst_rate || '',
        product.hsn || '',
        product.main_image || '',
        product.image1 || '',
        product.image2 || ''
      ]);

      const csvContent = [
        csvHeaders.join(","),
        ...csvRows.map(row => row.map(cell => {
          // Escape commas and quotes in CSV
          const cellStr = String(cell || '');
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product_master_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `${filteredProducts.length} products exported to CSV.`,
      });
    } catch (error) {
      console.error('Export CSV error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export products to CSV.",
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Export products to Excel
  const handleExportExcel = () => {
    try {
      setExportLoading(true);
      
      const headers = [
        "SKU", "Class", "Color", "Size Type", "Size", "Product", "Material",
        "Brand", "Category", "Gender", "MRP", "Cost", "Selling Price",
        "GST Rate", "HSN", "Main Image", "Image 1", "Image 2"
      ];
      
      const data = filteredProducts.map(product => [
        product.sku || '',
        product.class || '',
        product.color || '',
        product.size_type || '',
        product.size || '',
        product.name || '',
        product.material || '',
        product.brand || '',
        product.category || '',
        product.gender || '',
        product.mrp || 0,
        product.cost || 0,
        product.selling_price || 0,
        product.gst_rate || 0,
        product.hsn || '',
        product.main_image || '',
        product.image1 || '',
        product.image2 || ''
      ]);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
      
      // Set column widths
      worksheet['!cols'] = [
        { wch: 15 }, // SKU
        { wch: 12 }, // Class
        { wch: 10 }, // Color
        { wch: 12 }, // Size Type
        { wch: 8 },  // Size
        { wch: 20 }, // Product
        { wch: 15 }, // Material
        { wch: 15 }, // Brand
        { wch: 15 }, // Category
        { wch: 10 }, // Gender
        { wch: 10 }, // MRP
        { wch: 10 }, // Cost
        { wch: 12 }, // Selling Price
        { wch: 10 }, // GST Rate
        { wch: 12 }, // HSN
        { wch: 40 }, // Main Image
        { wch: 40 }, // Image 1
        { wch: 40 }  // Image 2
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
      XLSX.writeFile(workbook, `product_master_export_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: "Export Successful",
        description: `${filteredProducts.length} products exported to Excel.`,
      });
    } catch (error) {
      console.error('Export Excel error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export products to Excel.",
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  // Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique categories
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // Calculate summary statistics - removed as these fields don't exist in new schema
  const totalStockValue = 0;
  const lowStockCount = 0;
  const excessStockCount = 0;

  return (
    <div className="w-full px-4 py-8 space-y-6">
      {/* Navigation Tabs */}
      <div className="flex space-x-8 border-b">
        <div className="pb-2 border-b-2 border-blue-600 text-blue-600 font-medium">
          Product Master
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Inventory Approvals
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Stock Movement
        </div>
        <div className="pb-2 text-gray-500 hover:text-gray-700 cursor-pointer">
          Barcode
        </div>
      </div>

      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Product Master</h1>
          <div className="w-4 h-4 bg-gray-300 rounded-full flex items-center justify-center">
            <span className="text-xs text-gray-600">i</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button 
            variant="outline"
            onClick={() => setBulkDialog(true)}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Bulk Upload
            </Button>
          <Button 
            onClick={() => {
              resetForm(false);
              setShowDialog(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Single Product
          </Button>
        </div>
      </div>

      {/* Dashboard Button */}
      <Button className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
        <Grid3X3 className="w-4 h-4" />
        View Inventory Dashboard
      </Button>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Value</p>
                <p className="text-2xl font-bold">₹ {totalStockValue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold">{lowStockCount}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Excess Stock</p>
                <p className="text-2xl font-bold">{excessStockCount}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label>Products/Services:</Label>
          <Select value="Products" disabled>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Stores:</Label>
          <Select>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Show/Hide Columns:</Label>
          <div className="relative">
            <Button 
              variant="outline" 
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {Object.values(columnVisibility).filter(Boolean).length} columns selected
            </Button>
            {showColumnSelector && (
              <div className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 z-10 min-w-48">
                <div className="space-y-2">
                  {Object.entries(columnVisibility).map(([key, visible]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={key}
                        checked={visible}
                        onChange={(e) => setColumnVisibility(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }))}
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key.replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) resetForm();
        setShowDialog(open);
      }}>
        <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editMode ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto max-h-[75vh] pr-2">
            {/* Basic Information */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-4 text-gray-700">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <Label>SKU*</Label>
                <Input
                    value={formData.sku}
                    onChange={(e) => setFormData({...formData, sku: e.target.value})}
                  required
                    placeholder="e.g., NC-DOT-WH-S"
                />
              </div>
              <div>
                  <Label>Product*</Label>
                <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                    placeholder="e.g., DOTT FORWARD R/N"
                />
              </div>
              <div>
                  <Label>Category*</Label>
                <Input
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    required
                    placeholder="e.g., Dryfit Round"
                />
              </div>
              </div>
            </div>

            {/* Product Attributes */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-4 text-gray-700">Product Attributes</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                  <Label>Class</Label>
                  <Input
                    value={formData.class}
                    onChange={(e) => setFormData({...formData, class: e.target.value})}
                    placeholder="e.g., NC-DOT-WH"
                />
              </div>
              <div>
                  <Label>Color</Label>
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                    placeholder="e.g., WHITE"
                  />
                </div>
                <div>
                  <Label>Size Type</Label>
                  <Input
                    value={formData.size_type}
                    onChange={(e) => setFormData({...formData, size_type: e.target.value})}
                    placeholder="e.g., MEN-ALPHA"
                  />
                </div>
                <div>
                  <Label>Size</Label>
                  <Input
                    value={formData.size}
                    onChange={(e) => setFormData({...formData, size: e.target.value})}
                    placeholder="S, M, L, XL, 2XL"
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={formData.gender} onValueChange={(value) => setFormData({...formData, gender: value})}>
                  <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="Men">Men</SelectItem>
                      <SelectItem value="Women">Women</SelectItem>
                      <SelectItem value="Unisex">Unisex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                  <Label>Brand</Label>
                <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({...formData, brand: e.target.value})}
                    placeholder="e.g., Navycut USA"
                />
              </div>
              <div>
                  <Label>Material</Label>
                <Input
                    value={formData.material}
                    onChange={(e) => setFormData({...formData, material: e.target.value})}
                    placeholder="e.g., polyester"
                />
              </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-4 text-gray-700">Pricing</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                  <Label>MRP</Label>
                <Input
                  type="number"
                  step="0.01"
                    value={formData.mrp}
                    onChange={(e) => setFormData({...formData, mrp: e.target.value})}
                    placeholder="e.g., 799"
                />
              </div>
              <div>
                  <Label>Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({...formData, cost: e.target.value})}
                    placeholder="e.g., 120"
                />
              </div>
              <div>
                  <Label>Selling Price</Label>
                <Input
                  type="number"
                  step="0.01"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({...formData, selling_price: e.target.value})}
                    placeholder="e.g., 220"
                />
              </div>
              <div>
                <Label>GST Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gst_rate}
                    onChange={(e) => setFormData({...formData, gst_rate: e.target.value})}
                    placeholder="e.g., 5"
                />
              </div>
              <div>
                  <Label>HSN</Label>
                <Input
                    value={formData.hsn}
                    onChange={(e) => setFormData({...formData, hsn: e.target.value})}
                    placeholder="e.g., 61091000"
                />
              </div>
              </div>
            </div>

            {/* Images */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-4 text-gray-700">Images</h3>
              <div className="space-y-4">
              <div>
                  <Label>Upload Main Image</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="mb-2"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
              <div>
                  <Label>Main Image URL</Label>
                <Input
                    value={formData.main_image}
                    onChange={(e) => setFormData({...formData, main_image: e.target.value})}
                    placeholder="https://www.dropbox.com/..."
                />
              </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                    <Label>Image 1 URL</Label>
                    <Input
                      value={formData.image1}
                      onChange={(e) => setFormData({...formData, image1: e.target.value})}
                      placeholder="https://www.dropbox.com/..."
                    />
                  </div>
                  <div>
                    <Label>Image 2 URL</Label>
                    <Input
                      value={formData.image2}
                      onChange={(e) => setFormData({...formData, image2: e.target.value})}
                      placeholder="https://www.dropbox.com/..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-full flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editMode ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Products</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file (.csv, .xlsx, .xls) to add multiple products at once
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={handleDownloadTemplate}
                className="flex-1"
            >
                <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            </div>
            
            <div className="space-y-2">
              <Label>Select File</Label>
              <div className="flex items-center gap-2">
                <Input
              type="file"
                  accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleBulkUpload(file);
              }}
              disabled={bulkLoading}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-gray-500">
                Supported formats: CSV, Excel (.xlsx, .xls). Max file size: 10MB
              </p>
            </div>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {bulkLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}

            {bulkError && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-800 font-medium">Error</p>
                <p className="text-xs text-red-600 mt-1">{bulkError}</p>
              </div>
            )}

            {bulkSuccess && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-sm text-green-800 font-medium">Success</p>
                <p className="text-xs text-green-600 mt-1">{bulkSuccess}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Products Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
            <CardTitle className="text-2xl font-bold">Products ({filteredProducts.length})</CardTitle>
              {selectedProducts.size > 0 && (
                <Badge variant="secondary" className="px-3 py-1 text-sm">
                  {selectedProducts.size} selected
                </Badge>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
              {selectedProducts.size > 0 && (
                <Button 
                  variant="destructive" 
                  onClick={handleBatchDelete}
                  disabled={deleteLoading}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteLoading ? 'Deleting...' : `Delete (${selectedProducts.size})`}
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={exportLoading || filteredProducts.length === 0}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {exportLoading ? 'Exporting...' : 'Export CSV'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={exportLoading || filteredProducts.length === 0}
                  className="flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {exportLoading ? 'Exporting...' : 'Export Excel'}
                </Button>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-full shadow"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!user ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              Please log in to view products
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-lg">
              {products.length === 0 ? "No products found. Click 'Add Single Product' to create your first product." : "No matching products found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1400px]">
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    {columnVisibility.sku && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('sku')}>
                        <div className="flex items-center gap-2">
                          SKU
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.main_image && (
                      <TableHead>Main Image</TableHead>
                    )}
                    {columnVisibility.class && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('class')}>
                        <div className="flex items-center gap-2">
                          Class
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.color && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('color')}>
                        <div className="flex items-center gap-2">
                          Color
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.size_type && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('size_type')}>
                        <div className="flex items-center gap-2">
                          Size Type
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.size && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('size')}>
                        <div className="flex items-center gap-2">
                          Size
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.name && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-2">
                          Product
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.material && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('material')}>
                        <div className="flex items-center gap-2">
                          Material
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.brand && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('brand')}>
                        <div className="flex items-center gap-2">
                          Brand
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.category && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('category')}>
                        <div className="flex items-center gap-2">
                          Category
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.gender && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('gender')}>
                        <div className="flex items-center gap-2">
                          Gender
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.mrp && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('mrp')}>
                        <div className="flex items-center gap-2">
                          MRP
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.cost && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('cost')}>
                        <div className="flex items-center gap-2">
                          Cost
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.selling_price && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('selling_price')}>
                        <div className="flex items-center gap-2">
                          Selling Price
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.gst_rate && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('gst_rate')}>
                        <div className="flex items-center gap-2">
                          GST Rate
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.hsn && (
                      <TableHead className="cursor-pointer" onClick={() => handleSort('hsn')}>
                        <div className="flex items-center gap-2">
                          HSN
                          <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </TableHead>
                    )}
                    {columnVisibility.image1 && (
                      <TableHead>Image 1</TableHead>
                    )}
                    {columnVisibility.image2 && (
                      <TableHead>Image 2</TableHead>
                    )}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-blue-50 transition-colors">
                        <TableCell>
                        <Checkbox
                          checked={product.id ? selectedProducts.has(product.id) : false}
                          onCheckedChange={(checked) => product.id && handleSelectProduct(product.id, checked as boolean)}
                        />
                        </TableCell>
                      {columnVisibility.sku && (
                        <TableCell className="font-mono">{product.sku || '-'}</TableCell>
                      )}
                      {columnVisibility.main_image && (
                        <TableCell>
                          {product.main_image ? (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center relative overflow-hidden">
                              <img 
                                src={product.main_image} 
                                alt={product.name || 'Product'} 
                                className="h-12 w-12 rounded border object-cover transition-opacity duration-200"
                                loading="lazy"
                                decoding="async"
                                style={{ opacity: 1 }}
                                referrerPolicy="no-referrer"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.opacity = '1';
                                  target.style.transform = 'scale(1)';
                                }}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  // Check if it's a Dropbox URL - these need to be downloaded first
                                  const isDropboxUrl = product.main_image?.includes('dropbox.com');
                                  if (isDropboxUrl) {
                                    // Dropbox URLs can't be displayed due to CORS - show message
                                    target.style.display = 'none';
                                    const errorDiv = document.createElement('div');
                                    errorDiv.className = 'text-xs text-red-500 text-center p-1';
                                    errorDiv.innerHTML = 'Please download image<br/>via bulk upload';
                                    if (target.parentNode && !target.parentNode.querySelector('.text-xs.text-red-500')) {
                                      target.parentNode.appendChild(errorDiv);
                                    }
                                    return;
                                  }
                                  
                                  // For non-Dropbox URLs, try to reload once
                                  if (!target.dataset.retried) {
                                    target.dataset.retried = 'true';
                                    setTimeout(() => {
                                      try {
                                        const separator = product.main_image.includes('?') ? '&' : '?';
                                        target.src = product.main_image + separator + 'retry=' + Date.now();
                                      } catch (err) {
                                        target.src = product.main_image + '?retry=' + Date.now();
                                      }
                                    }, 1000);
                                    return;
                                  }
                                  
                                  // If retry fails, show error
                                  target.style.display = 'none';
                                  const errorDiv = document.createElement('div');
                                  errorDiv.className = 'text-xs text-red-500 text-center p-1';
                                  errorDiv.innerHTML = 'Image not accessible';
                                  if (target.parentNode && !target.parentNode.querySelector('.text-xs.text-red-500')) {
                                    target.parentNode.appendChild(errorDiv);
                                  }
                                }}
                              />
                          </div>
                          ) : (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.class && (
                        <TableCell>{product.class || '-'}</TableCell>
                      )}
                      {columnVisibility.color && (
                        <TableCell>{product.color || '-'}</TableCell>
                      )}
                      {columnVisibility.size_type && (
                        <TableCell>{product.size_type || '-'}</TableCell>
                      )}
                      {columnVisibility.size && (
                        <TableCell>{product.size || '-'}</TableCell>
                      )}
                      {columnVisibility.name && (
                        <TableCell>{product.name || '-'}</TableCell>
                      )}
                      {columnVisibility.material && (
                        <TableCell>{product.material || '-'}</TableCell>
                      )}
                      {columnVisibility.brand && (
                        <TableCell>{product.brand || '-'}</TableCell>
                      )}
                      {columnVisibility.category && (
                        <TableCell>{product.category || '-'}</TableCell>
                      )}
                      {columnVisibility.gender && (
                        <TableCell>{product.gender || '-'}</TableCell>
                      )}
                      {columnVisibility.mrp && (
                        <TableCell>₹{(product.mrp || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.cost && (
                        <TableCell>₹{(product.cost || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.selling_price && (
                        <TableCell>₹{(product.selling_price || 0).toFixed(2)}</TableCell>
                      )}
                      {columnVisibility.gst_rate && (
                        <TableCell>{(product.gst_rate || 0).toFixed(2)}%</TableCell>
                      )}
                      {columnVisibility.hsn && (
                        <TableCell>{product.hsn || '-'}</TableCell>
                      )}
                      {columnVisibility.image1 && (
                        <TableCell>
                          {product.image1 ? (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center relative overflow-hidden">
                              <img 
                                src={product.image1} 
                                alt={product.name || 'Product'} 
                                className="h-12 w-12 rounded border object-cover transition-opacity duration-200"
                                loading="lazy"
                                decoding="async"
                                style={{ opacity: 1 }}
                                referrerPolicy="no-referrer"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.opacity = '1';
                                }}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const isDropboxUrl = product.image1?.includes('dropbox.com');
                                  if (isDropboxUrl) {
                                  target.style.display = 'none';
                                  const errorDiv = document.createElement('div');
                                  errorDiv.className = 'text-xs text-red-500 text-center p-1';
                                    errorDiv.innerHTML = 'Download via<br/>bulk upload';
                                    if (target.parentNode && !target.parentNode.querySelector('.text-xs.text-red-500')) {
                                      target.parentNode.appendChild(errorDiv);
                                    }
                                    return;
                                  }
                                  
                                  if (!target.dataset.retried) {
                                    target.dataset.retried = 'true';
                                    setTimeout(() => {
                                      try {
                                        const separator = product.image1.includes('?') ? '&' : '?';
                                        target.src = product.image1 + separator + 'retry=' + Date.now();
                                      } catch (err) {
                                        target.src = product.image1 + '?retry=' + Date.now();
                                      }
                                    }, 1000);
                                    return;
                                  }
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">-</span>
                            </div>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.image2 && (
                        <TableCell>
                          {product.image2 ? (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center relative overflow-hidden">
                              <img 
                                src={product.image2} 
                                alt={product.name || 'Product'} 
                                className="h-12 w-12 rounded border object-cover transition-opacity duration-200"
                                loading="lazy"
                                decoding="async"
                                style={{ opacity: 1 }}
                                referrerPolicy="no-referrer"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.opacity = '1';
                                }}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  const isDropboxUrl = product.image2?.includes('dropbox.com');
                                  if (isDropboxUrl) {
                                    target.style.display = 'none';
                                    const errorDiv = document.createElement('div');
                                    errorDiv.className = 'text-xs text-red-500 text-center p-1';
                                    errorDiv.innerHTML = 'Download via<br/>bulk upload';
                                    if (target.parentNode && !target.parentNode.querySelector('.text-xs.text-red-500')) {
                                      target.parentNode.appendChild(errorDiv);
                                    }
                                    return;
                                  }
                                  
                                  if (!target.dataset.retried) {
                                    target.dataset.retried = 'true';
                                    setTimeout(() => {
                                      try {
                                        const separator = product.image2.includes('?') ? '&' : '?';
                                        target.src = product.image2 + separator + 'retry=' + Date.now();
                                      } catch (err) {
                                        target.src = product.image2 + '?retry=' + Date.now();
                                      }
                                    }, 1000);
                                    return;
                                  }
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded border bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">-</span>
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(product.id!)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(product.id!)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Rows per page:</span>
          <Select defaultValue="20">
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            1 to {filteredProducts.length} of {filteredProducts.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>
              <span>«</span>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>‹</span>
            </Button>
            <Button variant="outline" size="sm" className="bg-blue-600 text-white">
              1
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>›</span>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <span>»</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductMasterNew;
