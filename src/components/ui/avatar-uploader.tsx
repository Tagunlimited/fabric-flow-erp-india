import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Trash2, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AvatarUploaderProps {
  currentUrl?: string;
  onUpload: (url: string) => void;
  onDelete: () => void;
  userId: string;
  userName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function AvatarUploader({ currentUrl, onUpload, onDelete, userId, userName, size = 'md' }: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAvatar = async (file: File) => {
    try {
      setUploading(true);

      // Validate file
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File size must be less than 2MB');
        return;
      }

      if (!file.type.match(/^image\/(png|jpg|jpeg)$/)) {
        toast.error('Only PNG and JPG files are allowed');
        return;
      }

      // Delete existing avatar if any
      if (currentUrl) {
        const oldPath = currentUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('avatars').remove([`${userId}/${oldPath}`]);
        }
      }

      // Upload new avatar
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      onUpload(data.publicUrl);
      toast.success('Avatar updated successfully');
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
  };

  const handleDelete = async () => {
    if (!currentUrl) return;

    try {
      setUploading(true);
      const path = currentUrl.split('/').pop();
      if (path) {
        await supabase.storage.from('avatars').remove([`${userId}/${path}`]);
      }
      onDelete();
      toast.success('Avatar deleted successfully');
      setIsOpen(false);
    } catch (error: any) {
      toast.error('Failed to delete avatar');
    } finally {
      setUploading(false);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'h-10 w-10';
      case 'md': return 'h-16 w-16';
      case 'lg': return 'h-32 w-32';
      case 'xl': return 'h-64 w-64';
      default: return 'h-16 w-16';
    }
  };

  const getCameraSize = () => {
    switch (size) {
      case 'sm': return 'w-4 h-4';
      case 'md': return 'w-6 h-6';
      case 'lg': return 'w-8 h-8';
      case 'xl': return 'w-12 h-12';
      default: return 'w-6 h-6';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="relative group cursor-pointer">
          <Avatar className={getSizeClasses()}>
            <AvatarImage src={currentUrl} alt={userName} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {userName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className={getCameraSize() + " text-white"} />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Avatar</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={currentUrl} alt={userName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
              {userName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex space-x-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              size="sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
            {currentUrl && (
              <Button
                onClick={handleDelete}
                disabled={uploading}
                variant="destructive"
                size="sm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
          
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpg,image/jpeg"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <p className="text-xs text-muted-foreground text-center">
            PNG or JPG files only. Max size: 2MB
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}