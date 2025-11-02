import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { 
  Upload, 
  Image as ImageIcon, 
  Copy, 
  Trash2, 
  Search,
  Check,
  X,
  ExternalLink,
  Download,
  FolderOpen,
  Folder,
  Grid3X3,
  List,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ImageRecord {
  id: string;
  file_name: string;
  file_path: string;
  image_url: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  category?: string;
  tags?: string[];
  description?: string;
  product_name?: string;
  color?: string;
}

interface FolderStructure {
  [productName: string]: {
    [color: string]: ImageRecord[];
  };
}

interface TreeNode {
  id: string;
  name: string;
  type: 'product' | 'color' | 'image';
  path: string;
  children?: TreeNode[];
  image?: ImageRecord;
  expanded?: boolean;
}

const STORAGE_BUCKET = 'company-assets';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// Image compression settings
const MAX_IMAGE_WIDTH = 1920; // Max width in pixels (maintains quality for large images)
const MAX_IMAGE_HEIGHT = 1920; // Max height in pixels
const JPEG_QUALITY = 0.85; // Quality for JPEG compression (0.85 = 85%, good balance)
const COMPRESSION_THRESHOLD = 2 * 1024 * 1024; // Only compress files larger than 2MB

export function ImageMaster() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card');
  const [folderStructure, setFolderStructure] = useState<FolderStructure>({});
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [folderUploadMode, setFolderUploadMode] = useState(false);

  useEffect(() => {
    fetchImages();
  }, []);

  useEffect(() => {
    buildFolderStructure();
    buildTreeNodes();
  }, [images]);

  // Recursively list all files in a folder
  const listFilesRecursively = async (path: string): Promise<any[]> => {
    const allFiles: any[] = [];
    
    const listFiles = async (currentPath: string): Promise<void> => {
      try {
        const { data: items, error } = await supabase.storage
        .from(STORAGE_BUCKET)
          .list(currentPath, {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
          // If path doesn't exist, return empty array
        if (error.message.includes('not found') || error.message.includes('Invalid path')) {
            return;
          }
          console.error(`Error listing ${currentPath}:`, error);
            return;
          }

        if (!items || items.length === 0) return;

        for (const item of items) {
          // In Supabase Storage, folders don't have metadata.mimetype
          // Files have metadata with mimetype
          // Empty folders might not appear, but we check based on metadata
          const isFile = item.metadata && item.metadata.mimetype;
          
          if (!isFile) {
            // It's likely a folder - recursively list files in subfolder
            const subPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            await listFiles(subPath); // Recursively process subfolder
          } else {
            // It's a file - check if it's an image
            const isImage = ALLOWED_TYPES.some(type => 
              item.metadata?.mimetype?.includes(type.split('/')[1]) || 
              item.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
            );
            
            if (isImage) {
              const filePath = currentPath ? `${currentPath}/${item.name}` : item.name;
              allFiles.push({
                ...item,
                file_path: filePath
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error processing path ${currentPath}:`, err);
        // Continue processing other paths even if one fails
      }
    };

    await listFiles(path);
    return allFiles;
  };

  // Compress image using Canvas API to reduce file size while maintaining quality
  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Skip compression for small files or non-image files
      if (file.size < COMPRESSION_THRESHOLD || !file.type.startsWith('image/')) {
        resolve(file);
          return;
        }

      // Skip SVG files (they're already compressed and can't be processed by Canvas)
      if (file.type === 'image/svg+xml') {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          // Only resize if image is larger than max dimensions
          if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
            const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          // Use high-quality image rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw image to canvas
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with compression
          // Use JPEG for better compression (smaller file size)
          const outputFormat = 'image/jpeg';
          const outputQuality = JPEG_QUALITY;

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // Create new file with compressed data
              const fileName = file.name.replace(/\.[^/.]+$/, '.jpg'); // Change extension to .jpg
              const compressedFile = new File([blob], fileName, {
                type: outputFormat,
                lastModified: Date.now()
              });

              console.log(`📦 Compressed ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (${((1 - compressedFile.size / file.size) * 100).toFixed(1)}% reduction)`);

              resolve(compressedFile);
            },
            outputFormat,
            outputQuality
          );
        };

        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  };

  const fetchImages = async () => {
    try {
      setLoading(true);
      
      // Recursively fetch all image files from the 'images' folder
      const allImageFiles = await listFilesRecursively('images');

      // Build image records from files
      const imageRecords = await Promise.all(
        allImageFiles.map(async (file) => {
          const filePath = file.file_path || `images/${file.name}`;
          const { data } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);

          const parsed = parsePathStructure(filePath);

          return {
            id: file.id || filePath,
            file_name: file.name,
            file_path: filePath,
            image_url: data.publicUrl,
            file_size: file.metadata?.size || 0,
            mime_type: file.metadata?.mimetype || 'image/jpeg',
            uploaded_at: file.created_at || new Date().toISOString(),
            category: parsed?.productName || extractCategoryFromPath(filePath),
            product_name: parsed?.productName,
            color: parsed?.color,
            tags: [],
            description: ''
          };
        })
      );

      setImages(imageRecords);
    } catch (error: any) {
      console.error('Error fetching images:', error);
      toast.error('Failed to fetch images');
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  const extractCategoryFromPath = (path: string): string => {
    // Extract category from path (e.g., 'images/products/image.jpg' -> 'products')
    const parts = path.split('/');
    if (parts.length > 1 && parts[0] === 'images') {
      return parts[1];
    }
    return 'general';
  };

  // Parse folder structure: images/ProductName/Color/filename.jpg
  const parsePathStructure = (path: string): { productName: string; color: string; fileName: string } | null => {
    const parts = path.split('/').filter(p => p);
    if (parts.length >= 3 && parts[0] === 'images') {
      return {
        productName: parts[1],
        color: parts[2],
        fileName: parts.slice(3).join('/') || parts[parts.length - 1]
      };
    }
    return null;
  };

  // Build folder structure from images
  const buildFolderStructure = () => {
    const structure: FolderStructure = {};
    
    images.forEach(img => {
      const parsed = parsePathStructure(img.file_path);
      if (parsed) {
        if (!structure[parsed.productName]) {
          structure[parsed.productName] = {};
        }
        if (!structure[parsed.productName][parsed.color]) {
          structure[parsed.productName][parsed.color] = [];
        }
        structure[parsed.productName][parsed.color].push({
          ...img,
          product_name: parsed.productName,
          color: parsed.color
        });
      }
    });

    setFolderStructure(structure);
  };

  // Build tree nodes for navigation
  const buildTreeNodes = () => {
    const nodes: TreeNode[] = [];
    
    Object.entries(folderStructure).forEach(([productName, colors]) => {
      const productNode: TreeNode = {
        id: `product-${productName}`,
        name: productName,
        type: 'product',
        path: `images/${productName}`,
        children: []
      };

      Object.entries(colors).forEach(([color, imageList]) => {
        const colorNode: TreeNode = {
          id: `color-${productName}-${color}`,
          name: color,
          type: 'color',
          path: `images/${productName}/${color}`,
          children: imageList.map(img => ({
            id: img.id,
            name: img.file_name,
            type: 'image',
            path: img.file_path,
            image: img
          }))
        };
        
        productNode.children!.push(colorNode);
      });

      nodes.push(productNode);
    });

    setTreeNodes(nodes);
  };

  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Get images for selected path
  const getImagesForPath = (path: string): ImageRecord[] => {
    if (!path) return images;
    
    return images.filter(img => {
      if (path.includes('/')) {
        const pathParts = path.split('/');
        const imgParts = img.file_path.split('/');
        
        // Match product only
        if (pathParts.length === 2 && imgParts[0] === pathParts[0] && imgParts[1] === pathParts[1]) {
          return true;
        }
        // Match product/color
        if (pathParts.length === 3 && 
            imgParts[0] === pathParts[0] && 
            imgParts[1] === pathParts[1] && 
            imgParts[2] === pathParts[2]) {
          return true;
        }
      }
      return img.file_path.startsWith(path);
    });
  };

  // Handle folder upload (webkitdirectory)
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name} is not a valid image file`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      toast.error('No valid image files found in selected folder');
      return;
    }

    setSelectedFiles(validFiles);
    setFolderUploadMode(true);
  };

  // Upload with folder structure preserved
  const handleFolderUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select a folder with images');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const uploadedImages: ImageRecord[] = [];
      const fileInput = document.getElementById('folder-input') as HTMLInputElement;
      const relativePaths: { [key: string]: string } = {};

      // Get webkitRelativePath from files if available
      selectedFiles.forEach((file: any) => {
        if (file.webkitRelativePath) {
          relativePaths[file.name] = file.webkitRelativePath;
        }
      });

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        // Compress image before upload
        let fileToUpload: File;
        try {
          fileToUpload = await compressImage(file);
        } catch (error) {
          console.error(`Error compressing ${file.name}:`, error);
          toast.error(`Failed to compress ${file.name}, uploading original`);
          fileToUpload = file; // Fallback to original file
        }

        const relativePath = relativePaths[file.name] || file.name;
        const pathParts = relativePath.split('/');

        // Expected structure: ProductName/Color/filename.jpg
        // We'll upload as: images/ProductName/Color/filename.jpg
        let filePath: string;
        
        // Use compressed file name if it was changed
        const finalFileName = fileToUpload.name !== file.name ? fileToUpload.name : pathParts[pathParts.length - 1];
        
        if (pathParts.length >= 3) {
          // Full nested structure: ProductName/Color/filename.jpg
          const productName = pathParts[0];
          const color = pathParts[1];
          const fileName = pathParts.slice(2).join('/');
          // Replace extension if compressed
          const baseFileName = fileName.replace(/\.[^/.]+$/, '');
          const ext = fileToUpload.name.split('.').pop() || 'jpg';
          filePath = `images/${productName}/${color}/${baseFileName}.${ext}`;
        } else if (pathParts.length === 2) {
          // Only ProductName/filename.jpg - treat as product/general
          const productName = pathParts[0];
          const fileName = pathParts[1];
          const baseFileName = fileName.replace(/\.[^/.]+$/, '');
          const ext = fileToUpload.name.split('.').pop() || 'jpg';
          filePath = `images/${productName}/general/${baseFileName}.${ext}`;
        } else {
          // Flat structure - use filename with timestamp
          const ext = fileToUpload.name.split('.').pop() || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
          filePath = `images/general/${fileName}`;
        }

        let uploadSuccess = false;
        
        // Try upload with overwrite (delete first if exists, then upload)
        const { error: deleteError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([filePath]);
        
        // Ignore delete errors - file may not exist yet
        if (deleteError && !deleteError.message.includes('not found')) {
          console.log(`Note: Could not delete existing file ${filePath}`);
        }

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          // Check if it's a duplicate error - if so, the file already exists, which is fine
          if (uploadError.message.includes('Duplicate') || uploadError.statusCode === '409' || uploadError.message.includes('already exists')) {
            console.log(`File ${file.name} already exists at ${filePath}, skipping...`);
            uploadSuccess = true; // Treat as success since file exists
          } else {
            console.error(`Error uploading ${file.name}:`, uploadError);
            toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
            continue;
          }
        } else {
          uploadSuccess = true;
        }

        if (uploadSuccess) {
          const { data } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);

          const parsed = parsePathStructure(filePath);
          uploadedImages.push({
            id: filePath,
            file_name: finalFileName,
            file_path: filePath,
            image_url: data.publicUrl,
            file_size: fileToUpload.size,
            mime_type: fileToUpload.type,
            uploaded_at: new Date().toISOString(),
            category: parsed?.productName || 'general',
            product_name: parsed?.productName,
            color: parsed?.color,
            tags: [],
            description: ''
          });
        }

        setUploadProgress(((i + 1) / selectedFiles.length) * 100);
      }

      if (uploadedImages.length > 0) {
        toast.success(`Successfully uploaded ${uploadedImages.length} image(s) with folder structure`);
        setSelectedFiles([]);
        setFolderUploadMode(false);
        setUploadDialogOpen(false);
        await fetchImages();
      } else {
        toast.error('No files were uploaded. Please check for errors and try again.');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name} is not a valid image file`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one image to upload');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const uploadedImages: ImageRecord[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        // Compress image before upload
        let fileToUpload: File;
        try {
          fileToUpload = await compressImage(file);
        } catch (error) {
          console.error(`Error compressing ${file.name}:`, error);
          toast.error(`Failed to compress ${file.name}, uploading original`);
          fileToUpload = file; // Fallback to original file
        }

        const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        
        // Use category-based folder structure
        const folderPath = uploadCategory ? `images/${uploadCategory}` : 'images';
        const filePath = `${folderPath}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error(`Error uploading ${file.name}:`, uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        const { data } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(filePath);

        uploadedImages.push({
          id: filePath,
          file_name: fileName,
          file_path: filePath,
          image_url: data.publicUrl,
          file_size: fileToUpload.size,
          mime_type: fileToUpload.type,
          uploaded_at: new Date().toISOString(),
          category: uploadCategory || 'general',
          tags: [],
          description: uploadDescription
        });

        setUploadProgress(((i + 1) / selectedFiles.length) * 100);
      }

      if (uploadedImages.length > 0) {
        toast.success(`Successfully uploaded ${uploadedImages.length} image(s)`);
        setSelectedFiles([]);
        setUploadCategory('');
        setUploadDescription('');
        setUploadDialogOpen(false);
        await fetchImages();
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (image: ImageRecord) => {
    if (!confirm(`Are you sure you want to delete ${image.file_name}?`)) {
      return;
    }

    try {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([image.file_path]);

      if (error) {
        throw error;
      }

      toast.success('Image deleted successfully');
      await fetchImages();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete image');
    }
  };

  // Delete folder and all its contents
  const handleDeleteFolder = async (folderPath: string, folderName: string) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}" and all its contents? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Get all files in this folder and subfolders
      const allFiles = await listFilesRecursively(folderPath);
      
      if (allFiles.length === 0) {
        toast.info('Folder is empty or does not exist');
        setLoading(false);
        return;
      }

      // Prepare file paths for deletion
      const filePaths = allFiles.map(file => file.file_path || `${folderPath}/${file.name}`);

      // Delete all files in the folder
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(filePaths);

      if (error) {
        throw error;
      }

      toast.success(`Successfully deleted folder "${folderName}" with ${allFiles.length} file(s)`);
      await fetchImages();
    } catch (error: any) {
      console.error('Delete folder error:', error);
      toast.error(`Failed to delete folder: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success('URL copied to clipboard');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (error) {
      toast.error('Failed to copy URL');
    }
  };

  const categories = Array.from(new Set(images.map(img => img.category || 'general')));

  // Get images to display based on selected path
  const displayedImages = selectedPath ? getImagesForPath(selectedPath) : images;

  const filteredImages = displayedImages.filter(img => {
    const matchesSearch = img.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (img.description && img.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || (img.category || 'general') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Render tree node recursively with better file explorer style
  const renderTreeNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.id} className="mb-1">
                <div
                  className={cn(
                    "group flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors",
                    "hover:bg-muted/80 border border-transparent",
                    isSelected && "bg-primary/10 border-primary/50 shadow-sm"
                  )}
                  style={{ marginLeft: `${level * 1.5}rem` }}
                  onClick={() => {
                    if (hasChildren) {
                      toggleNode(node.id);
                    }
                    if (node.type === 'color' || node.type === 'product') {
                      setSelectedPath(node.path);
                    }
                  }}
                >
          {/* Expand/Collapse Icon */}
          <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )
            ) : (
              <span className="w-4 h-4" />
            )}
          </span>
          
          {/* Folder/File Icon */}
          <span className="flex-shrink-0">
            {node.type === 'product' && <Folder className="w-5 h-5 text-blue-600" />}
            {node.type === 'color' && <FolderOpen className="w-5 h-5 text-green-600" />}
            {node.type === 'image' && <ImageIcon className="w-4 h-4 text-gray-500" />}
          </span>
          
          {/* Name */}
          <span className={cn(
            "text-sm flex-1 truncate",
            node.type === 'product' && "font-semibold text-blue-700",
            node.type === 'color' && "font-medium text-green-700",
            isSelected && "font-semibold"
          )}>
            {node.name}
          </span>
          
          {/* Badge with count */}
          {node.type === 'color' && node.children && (
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              {node.children.length} {node.children.length === 1 ? 'image' : 'images'}
            </Badge>
          )}
          {node.type === 'product' && node.children && (
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {node.children.length} {node.children.length === 1 ? 'color' : 'colors'}
            </Badge>
          )}
          
          {/* Delete button for folders */}
          {(node.type === 'product' || node.type === 'color') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation(); // Prevent folder selection when clicking delete
                handleDeleteFolder(node.path, node.name);
              }}
              title={`Delete folder "${node.name}" and all contents`}
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          )}
        </div>
        
        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Image Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload and manage images. Get accessible links for your database.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
            setUploadDialogOpen(open);
            if (!open) {
              setFolderUploadMode(false);
            }
          }}>
          <DialogTrigger asChild>
              <Button variant="outline" onClick={() => setFolderUploadMode(false)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Images
            </Button>
          </DialogTrigger>
            <Button variant="default" onClick={() => {
              setFolderUploadMode(true);
              setUploadDialogOpen(true);
            }}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Upload Folder
            </Button>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Upload Images</DialogTitle>
              <DialogDescription>
                  {folderUploadMode 
                    ? "Select a folder with nested structure: ProductName/Color/images.jpg"
                    : "Upload one or more images. Maximum file size: 10MB per image."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                {!folderUploadMode ? (
                  <>
              <div className="space-y-2">
                <Label htmlFor="category">Category (Optional)</Label>
                <Input
                  id="category"
                  placeholder="e.g., products, banners, logos"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Images will be organized in folders based on category
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="Brief description of the images"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-input">Select Images</Label>
                <Input
                  id="file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="folder-input">Select Folder</Label>
                    <Input
                      id="folder-input"
                      type="file"
                      accept="image/*"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFolderSelect}
                    />
                    <p className="text-xs text-muted-foreground">
                      Folder structure: ProductName/Color/images.jpg
                    </p>
                  </div>
                )}

                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-medium">{selectedFiles.length} file(s) selected:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {selectedFiles.slice(0, 10).map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-muted p-2 rounded">
                          <span className="truncate">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {selectedFiles.length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          ... and {selectedFiles.length - 10} more files
                        </p>
                      )}
                    </div>
                  </div>
                )}

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

                <div className="flex justify-between items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFolderUploadMode(!folderUploadMode);
                      setSelectedFiles([]);
                    }}
                  >
                    {folderUploadMode ? 'Switch to Single Upload' : 'Switch to Folder Upload'}
                  </Button>
                  <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadDialogOpen(false);
                    setSelectedFiles([]);
                    setUploadCategory('');
                    setUploadDescription('');
                        setFolderUploadMode(false);
                  }}
                >
                  Cancel
                </Button>
                    <Button 
                      onClick={folderUploadMode ? handleFolderUpload : handleUpload} 
                      disabled={uploading || selectedFiles.length === 0}
                    >
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
                  </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          <Button
            variant={viewMode === 'card' ? 'default' : 'outline'}
            onClick={() => setViewMode('card')}
          >
            <Grid3X3 className="w-4 h-4 mr-2" />
            Card View
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            onClick={() => setViewMode('table')}
          >
            <List className="w-4 h-4 mr-2" />
            Table View
          </Button>
        </div>
      </div>

      {/* Folder Structure Display */}
      {treeNodes.length > 0 ? (
      <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                Folder Structure
              </CardTitle>
              {selectedPath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPath('')}
                >
                  Show All Images
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="space-y-1">
                {treeNodes.map(node => renderTreeNode(node))}
              </div>
            </div>
            {selectedPath && (
              <div className="mt-4 p-3 bg-primary/10 rounded-md border border-primary/20">
                <p className="text-sm font-medium text-primary">
                  📁 Currently viewing: <span className="font-mono">{selectedPath.replace('images/', '')}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredImages.length} image(s) in this location
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              No folder structure found
            </p>
            <p className="text-sm text-muted-foreground">
              Upload folders with structure: <code className="bg-muted px-2 py-1 rounded">ProductName/Color/images.jpg</code>
            </p>
          </CardContent>
        </Card>
      )}

        {/* Images Display Area */}
        <div className="col-span-12">
          {/* Filters */}
          <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by filename or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>


          {/* Images Display: Table or Card */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading images...</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {images.length === 0 ? 'No images uploaded yet. Click "Upload Images" to get started.' : 'No images match your filters.'}
            </p>
          </CardContent>
        </Card>
          ) : viewMode === 'table' ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredImages.map((image) => (
                      <TableRow key={image.id}>
                        <TableCell>
                          <div className="w-16 h-16 relative">
                            <img
                              src={image.image_url}
                              alt={image.file_name}
                              className="w-full h-full object-cover rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgRXJyb3I8L3RleHQ+PC9zdmc+';
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{image.file_name}</TableCell>
                        <TableCell>{image.product_name || '-'}</TableCell>
                        <TableCell>{image.color || '-'}</TableCell>
                        <TableCell>{formatFileSize(image.file_size)}</TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <Input
                              value={image.image_url}
                              readOnly
                              className="text-xs font-mono h-8"
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(image.image_url)}
                            >
                              {copiedUrl === image.image_url ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(image.image_url, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(image)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredImages.map((image) => (
            <Card key={image.id} className="overflow-hidden">
              <div className="aspect-square relative bg-muted">
                <img
                  src={image.image_url}
                  alt={image.file_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgRXJyb3I8L3RleHQ+PC9zdmc+';
                  }}
                />
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="text-xs">
                    {image.category || 'general'}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm truncate" title={image.file_name}>
                    {image.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(image.file_size)}
                  </p>
                  {image.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {image.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => copyToClipboard(image.image_url)}
                  >
                    {copiedUrl === image.image_url ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy URL
                      </>
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(image.image_url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDelete(image)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <Input
                    value={image.image_url}
                    readOnly
                    className="text-xs font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </div>

      {filteredImages.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Showing {filteredImages.length} of {displayedImages.length} image(s)
              {selectedPath && ` in selected folder`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

