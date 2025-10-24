import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Trash2, CreditCard, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BankDetailsUploaderProps {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  passbookImageUrl?: string;
  onBankNameChange: (name: string) => void;
  onAccountHolderNameChange: (name: string) => void;
  onAccountNumberChange: (number: string) => void;
  onIfscCodeChange: (code: string) => void;
  onPassbookImageChange: (url: string) => void;
  userId: string;
  disabled?: boolean;
}

const BANK_NAMES = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'Indian Bank',
  'Bank of India',
  'Central Bank of India',
  'IDBI Bank',
  'Yes Bank',
  'IndusInd Bank',
  'Federal Bank',
  'South Indian Bank',
  'Karur Vysya Bank',
  'City Union Bank',
  'Tamilnad Mercantile Bank',
  'Other'
];

export function BankDetailsUploader({
  bankName,
  accountHolderName,
  accountNumber,
  ifscCode,
  passbookImageUrl,
  onBankNameChange,
  onAccountHolderNameChange,
  onAccountNumberChange,
  onIfscCodeChange,
  onPassbookImageChange,
  userId,
  disabled = false
}: BankDetailsUploaderProps) {
  const [uploadingPassbook, setUploadingPassbook] = useState(false);
  const passbookFileInputRef = useRef<HTMLInputElement>(null);

  const uploadPassbookImage = async (file: File): Promise<string | null> => {
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

      // Delete existing passbook image if any
      if (passbookImageUrl) {
        const oldPath = passbookImageUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('documents').remove([`${userId}/${oldPath}`]);
        }
      }

      // Upload new passbook image
      const fileExt = file.name.split('.').pop();
      const fileName = `passbook_${Date.now()}.${fileExt}`;
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
      toast.error(error.message || 'Failed to upload passbook image');
      return null;
    }
  };

  const handlePassbookImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingPassbook(true);
      const url = await uploadPassbookImage(file);
      if (url) {
        onPassbookImageChange(url);
        toast.success('Passbook image uploaded successfully');
      }
      setUploadingPassbook(false);
    }
  };

  const deletePassbookImage = async () => {
    if (!passbookImageUrl) return;

    try {
      const path = passbookImageUrl.split('/').pop();
      if (path) {
        await supabase.storage.from('documents').remove([`${userId}/${path}`]);
      }
      
      onPassbookImageChange('');
      toast.success('Passbook image deleted successfully');
    } catch (error: any) {
      toast.error('Failed to delete passbook image');
    }
  };

  const validateIfscCode = (code: string): boolean => {
    // IFSC code should be 11 characters: 4 letters (bank code) + 7 characters (branch code)
    return /^[A-Z]{4}[0-9A-Z]{7}$/.test(code);
  };

  const validateAccountNumber = (number: string): boolean => {
    // Account number should be between 9 and 18 digits
    return /^[0-9]{9,18}$/.test(number);
  };

  const handleIfscCodeChange = (value: string) => {
    onIfscCodeChange(value.toUpperCase());
  };

  const handleAccountNumberChange = (value: string) => {
    // Only allow digits
    const numericValue = value.replace(/\D/g, '');
    onAccountNumberChange(numericValue);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Bank Details
        </CardTitle>
        <CardDescription>
          Provide bank account details for salary payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bank Name */}
        <div className="space-y-2">
          <Label htmlFor="bank-name">Bank Name *</Label>
          <Input
            id="bank-name"
            value={bankName || ''}
            onChange={(e) => onBankNameChange(e.target.value)}
            placeholder="Enter bank name"
            disabled={disabled}
            list="bank-names"
          />
          <datalist id="bank-names">
            {BANK_NAMES.map((bank) => (
              <option key={bank} value={bank} />
            ))}
          </datalist>
        </div>

        {/* Account Holder Name */}
        <div className="space-y-2">
          <Label htmlFor="account-holder-name">Account Holder Name *</Label>
          <Input
            id="account-holder-name"
            value={accountHolderName || ''}
            onChange={(e) => onAccountHolderNameChange(e.target.value)}
            placeholder="Enter account holder name"
            disabled={disabled}
          />
        </div>

        {/* Account Number */}
        <div className="space-y-2">
          <Label htmlFor="account-number">Account Number *</Label>
          <Input
            id="account-number"
            value={accountNumber || ''}
            onChange={(e) => handleAccountNumberChange(e.target.value)}
            placeholder="Enter account number (9-18 digits)"
            disabled={disabled}
            maxLength={18}
          />
          <p className="text-xs text-muted-foreground">
            Account number should be 9-18 digits
          </p>
        </div>

        {/* IFSC Code */}
        <div className="space-y-2">
          <Label htmlFor="ifsc-code">IFSC Code *</Label>
          <Input
            id="ifsc-code"
            value={ifscCode || ''}
            onChange={(e) => handleIfscCodeChange(e.target.value)}
            placeholder="Enter IFSC code (e.g., SBIN0123456)"
            disabled={disabled}
            maxLength={11}
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Format: ABCD0123456 (4 letters + 7 alphanumeric)
          </p>
        </div>

        {/* Passbook Image Upload */}
        <div className="space-y-2">
          <Label>Passbook Image *</Label>
          <div className="flex items-center gap-4">
            {passbookImageUrl ? (
              <div className="flex items-center gap-2">
                <img
                  src={passbookImageUrl}
                  alt="Passbook"
                  className="h-20 w-32 object-cover rounded border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={deletePassbookImage}
                  disabled={disabled || uploadingPassbook}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => passbookFileInputRef.current?.click()}
                  disabled={disabled || uploadingPassbook}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingPassbook ? 'Uploading...' : 'Upload Passbook Image'}
                </Button>
              </div>
            )}
            <Input
              ref={passbookFileInputRef}
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={handlePassbookImageSelect}
              className="hidden"
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            PNG or JPG files only. Max size: 5MB. Upload clear image of passbook first page.
          </p>
        </div>

        {/* Validation Alerts */}
        {ifscCode && !validateIfscCode(ifscCode) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Invalid IFSC code format. Please check the format requirements above.
            </AlertDescription>
          </Alert>
        )}

        {accountNumber && !validateAccountNumber(accountNumber) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Invalid account number format. Account number should be 9-18 digits.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
