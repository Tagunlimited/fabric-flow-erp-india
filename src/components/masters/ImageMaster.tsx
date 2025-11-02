import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  FolderOpen
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
}

const STORAGE_BUCKET = 'company-assets';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

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

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      setLoading(true);
      // List all files in the storage bucket
      const { data: files, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list('images', {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        // If 'images' folder doesn't exist, list root and filter
        if (error.message.includes('not found') || error.message.includes('Invalid path')) {
          const { data: rootFiles, error: rootError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list('', {
              limit: 1000,
              offset: 0,
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (rootError) {
            console.error('Error fetching images:', rootError);
            toast.error('Failed to fetch images');
            setImages([]);
            return;
          }

          // Filter to only image files
          const imageFiles = (rootFiles || []).filter(file => 
            ALLOWED_TYPES.some(type => file.metadata?.mimetype?.includes(type.split('/')[1]) || 
            file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg)$/))
          );

          const imageRecords = await Promise.all(
            imageFiles.map(async (file) => {
              const filePath = file.name;
              const { data } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);

              return {
                id: file.id || filePath,
                file_name: file.name,
                file_path: filePath,
                image_url: data.publicUrl,
                file_size: file.metadata?.size || 0,
                mime_type: file.metadata?.mimetype || 'image/jpeg',
                uploaded_at: file.created_at || new Date().toISOString(),
                category: extractCategoryFromPath(filePath),
                tags: [],
                description: ''
              };
            })
          );

          setImages(imageRecords);
          return;
        }

        throw error;
      }

      // Build image records from files
      const imageRecords = await Promise.all(
        (files || []).map(async (file) => {
          const filePath = `images/${file.name}`;
          const { data } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);

          return {
            id: file.id || filePath,
            file_name: file.name,
            file_path: filePath,
            image_url: data.publicUrl,
            file_size: file.metadata?.size || 0,
            mime_type: file.metadata?.mimetype || 'image/jpeg',
            uploaded_at: file.created_at || new Date().toISOString(),
            category: uploadCategory || extractCategoryFromPath(filePath),
            tags: [],
            description: uploadDescription || ''
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
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        
        // Use category-based folder structure
        const folderPath = uploadCategory ? `images/${uploadCategory}` : 'images';
        const filePath = `${folderPath}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, file, {
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
          file_size: file.size,
          mime_type: file.type,
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

  const filteredImages = images.filter(img => {
    const matchesSearch = img.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (img.description && img.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || (img.category || 'general') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              Upload Images
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Upload Images</DialogTitle>
              <DialogDescription>
                Upload one or more images. Maximum file size: 10MB per image.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-medium">{selectedFiles.length} file(s) selected:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {selectedFiles.map((file, idx) => (
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
                    </div>
                  </div>
                )}
              </div>

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

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadDialogOpen(false);
                    setSelectedFiles([]);
                    setUploadCategory('');
                    setUploadDescription('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={uploading || selectedFiles.length === 0}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
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

      {/* Images Grid */}
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

      {filteredImages.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Showing {filteredImages.length} of {images.length} image(s)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

