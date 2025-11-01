import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Trash2, FileImage, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface IdProofUploaderProps {
  idProofType?: string;
  idProofNumber?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  onIdProofTypeChange: (type: string) => void;
  onIdProofNumberChange: (number: string) => void;
  onFrontImageChange: (url: string) => void;
  onBackImageChange: (url: string) => void;
  userId: string;
  disabled?: boolean;
}

const ID_PROOF_TYPES = [
  { value: 'Aadhaar', label: 'Aadhaar Card', requiresBack: false },
  { value: 'PAN', label: 'PAN Card', requiresBack: false },
  { value: 'Driving License', label: 'Driving License', requiresBack: false },
  { value: 'Passport', label: 'Passport', requiresBack: false },
  { value: 'Voter ID', label: 'Voter ID', requiresBack: false },
  { value: 'Other', label: 'Other', requiresBack: false }
];

const ID_PROOF_FORMATS = {
  'Aadhaar': '12 digits (e.g., 123456789012)',
  'PAN': '10 characters (e.g., ABCDE1234F)',
  'Driving License': '8-20 characters',
  'Passport': '6-15 characters',
  'Voter ID': '8-15 characters',
  'Other': 'Minimum 3 characters'
};

export function IdProofUploader({
  idProofType,
  idProofNumber,
  frontImageUrl,
  backImageUrl,
  onIdProofTypeChange,
  onIdProofNumberChange,
  onFrontImageChange,
  onBackImageChange,
  userId,
  disabled = false
}: IdProofUploaderProps) {
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  const selectedProofType = ID_PROOF_TYPES.find(type => type.value === idProofType);

  const uploadImage = async (file: File, isBackImage: boolean = false): Promise<string | null> => {
    try {
      // Validate file
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return null;
      }

      if (!file.type.match(/^image\/(png|jpg|jpeg)$/)) {
        toast.error('Only PNG and JPG files are allowed');
        return null;
      }

      // Delete existing image if any
      const existingUrl = isBackImage ? backImageUrl : frontImageUrl;
      if (existingUrl) {
        const oldPath = existingUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('documents').remove([`${userId}/${oldPath}`]);
        }
      }

      // Upload new image
      const fileExt = file.name.split('.').pop();
      const fileName = `${isBackImage ? 'back' : 'front'}_${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image');
      return null;
    }
  };

  const handleFrontImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingFront(true);
      const url = await uploadImage(file, false);
      if (url) {
        onFrontImageChange(url);
        toast.success('Front image uploaded successfully');
      }
      setUploadingFront(false);
    }
  };

  const handleBackImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingBack(true);
      const url = await uploadImage(file, true);
      if (url) {
        onBackImageChange(url);
        toast.success('Back image uploaded successfully');
      }
      setUploadingBack(false);
    }
  };

  const deleteImage = async (isBackImage: boolean = false) => {
    const imageUrl = isBackImage ? backImageUrl : frontImageUrl;
    if (!imageUrl) return;

    try {
      const path = imageUrl.split('/').pop();
      if (path) {
        await supabase.storage.from('documents').remove([`${userId}/${path}`]);
      }
      
      if (isBackImage) {
        onBackImageChange('');
      } else {
        onFrontImageChange('');
      }
      
      toast.success('Image deleted successfully');
    } catch (error: any) {
      toast.error('Failed to delete image');
    }
  };

  const validateIdProofNumber = (type: string, number: string): boolean => {
    switch (type) {
      case 'Aadhaar':
        return /^[0-9]{12}$/.test(number);
      case 'PAN':
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(number);
      case 'Driving License':
        return number.length >= 8 && number.length <= 20;
      case 'Passport':
        return number.length >= 6 && number.length <= 15;
      case 'Voter ID':
        return number.length >= 8 && number.length <= 15;
      case 'Other':
        return number.length >= 3;
      default:
        return true;
    }
  };

  const handleIdProofNumberChange = (value: string) => {
    onIdProofNumberChange(value);
    // Removed immediate toast error - validation will show in the alert below
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          ID Proof Document
        </CardTitle>
        <CardDescription>
          Upload a valid government-issued ID proof document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ID Proof Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="id-proof-type">ID Proof Type *</Label>
          <Select
            value={idProofType || ''}
            onValueChange={onIdProofTypeChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select ID proof type" />
            </SelectTrigger>
            <SelectContent>
              {ID_PROOF_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ID Proof Number */}
        {idProofType && (
          <div className="space-y-2">
            <Label htmlFor="id-proof-number">ID Proof Number *</Label>
            <Input
              id="id-proof-number"
              value={idProofNumber || ''}
              onChange={(e) => handleIdProofNumberChange(e.target.value)}
              placeholder={`Enter ${idProofType} number`}
              disabled={disabled}
            />
            {idProofType && (
              <p className="text-xs text-muted-foreground">
                Format: {ID_PROOF_FORMATS[idProofType as keyof typeof ID_PROOF_FORMATS]}
              </p>
            )}
          </div>
        )}

        {/* Front Image Upload */}
        <div className="space-y-2">
          <Label>Front Image *</Label>
          <div className="flex items-center gap-4">
            {frontImageUrl ? (
              <div className="flex items-center gap-2">
                <img
                  src={frontImageUrl}
                  alt="ID Proof Front"
                  className="h-20 w-32 object-cover rounded border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteImage(false)}
                  disabled={disabled || uploadingFront}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => frontFileInputRef.current?.click()}
                  disabled={disabled || uploadingFront}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingFront ? 'Uploading...' : 'Upload Front Image'}
                </Button>
              </div>
            )}
            <Input
              ref={frontFileInputRef}
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={handleFrontImageSelect}
              className="hidden"
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            PNG or JPG files only. Max size: 5MB
          </p>
        </div>

        {/* Back Image Upload (Optional) */}
        {idProofType && (
          <div className="space-y-2">
            <Label>Back Image (Optional)</Label>
            <div className="flex items-center gap-4">
              {backImageUrl ? (
                <div className="flex items-center gap-2">
                  <img
                    src={backImageUrl}
                    alt="ID Proof Back"
                    className="h-20 w-32 object-cover rounded border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteImage(true)}
                    disabled={disabled || uploadingBack}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => backFileInputRef.current?.click()}
                    disabled={disabled || uploadingBack}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingBack ? 'Uploading...' : 'Upload Back Image'}
                  </Button>
                </div>
              )}
              <Input
                ref={backFileInputRef}
                type="file"
                accept="image/png,image/jpg,image/jpeg"
                onChange={handleBackImageSelect}
                className="hidden"
                disabled={disabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              PNG or JPG files only. Max size: 5MB. Optional for all ID types.
            </p>
          </div>
        )}

        {/* Validation Alert */}
        {idProofType && idProofNumber && !validateIdProofNumber(idProofType, idProofNumber) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Invalid {idProofType} number format. Please check the format requirements above.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
