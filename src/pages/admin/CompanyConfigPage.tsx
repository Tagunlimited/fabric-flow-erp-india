import { useState, useEffect } from 'react';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Upload, Building, MapPin, Phone, Mail, CreditCard, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { useNavigate } from "react-router-dom";

interface CompanyConfig {
  id?: string;
  company_name: string;
  logo_url: string;
  sidebar_logo_url?: string;
  header_logo_url?: string;
  favicon_url?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
  bank_details: {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch: string;
  };
  created_at?: string;
  updated_at?: string;
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button variant="outline" onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2">
      <ArrowLeft className="w-4 h-4" />
      Back
    </Button>
  );
}

const CompanyConfigPage = () => {
  const { config, setConfig, loading, saveConfig } = useCompanySettings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState<{[key:string]: boolean}>({});

  const handleInputChange = (field: string, value: string) => {
    if (field.startsWith('bank_details.')) {
      const bankField = field.replace('bank_details.', '');
      setConfig(prev => ({
        ...prev,
        bank_details: {
          ...prev.bank_details,
          [bankField]: value
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveConfig(config);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving config:', error);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const uploadCompanyAsset = async (file: File, type: 'logo' | 'sidebar_logo' | 'header_logo' | 'favicon') => {
    try {
      setUploading(prev => ({ ...prev, [type]: true }));
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error(`Failed to upload ${type.replace('_', ' ')}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      setConfig(prev => ({
        ...prev,
        [`${type}_url`]: publicUrl
      }));

      toast.success(`${type.replace('_', ' ')} uploaded successfully`);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to upload ${type.replace('_', ' ')}`);
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading company configuration...</span>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="container mx-auto p-6">
        <BackButton />
        
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Company Configuration</h1>
          <p className="text-gray-600 mt-2">Manage your company information and branding assets</p>
        </div>

        {error && (
          <Alert className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={config.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  placeholder="Enter company name"
                />
              </div>
              
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={config.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Enter company address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={config.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={config.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    placeholder="State"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    value={config.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    placeholder="Pincode"
                  />
                </div>
                <div>
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input
                    id="gstin"
                    value={config.gstin}
                    onChange={(e) => handleInputChange('gstin', e.target.value)}
                    placeholder="GSTIN"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="contact_phone">Phone Number</Label>
                <Input
                  id="contact_phone"
                  value={config.contact_phone}
                  onChange={(e) => handleInputChange('contact_phone', e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
              
              <div>
                <Label htmlFor="contact_email">Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={config.contact_email}
                  onChange={(e) => handleInputChange('contact_email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Bank Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="bank_name">Bank Name</Label>
                <Input
                  id="bank_name"
                  value={config.bank_details.bank_name}
                  onChange={(e) => handleInputChange('bank_details.bank_name', e.target.value)}
                  placeholder="Enter bank name"
                />
              </div>
              
              <div>
                <Label htmlFor="account_number">Account Number</Label>
                <Input
                  id="account_number"
                  value={config.bank_details.account_number}
                  onChange={(e) => handleInputChange('bank_details.account_number', e.target.value)}
                  placeholder="Enter account number"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ifsc_code">IFSC Code</Label>
                  <Input
                    id="ifsc_code"
                    value={config.bank_details.ifsc_code}
                    onChange={(e) => handleInputChange('bank_details.ifsc_code', e.target.value)}
                    placeholder="IFSC Code"
                  />
                </div>
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={config.bank_details.branch}
                    onChange={(e) => handleInputChange('bank_details.branch', e.target.value)}
                    placeholder="Branch"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Branding Assets */}
          <Card>
            <CardHeader>
              <CardTitle>Branding Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Company Logo */}
              <div>
                <Label>Company Logo</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadCompanyAsset(file, 'logo');
                    }}
                    disabled={uploading.logo}
                  />
                  {config.logo_url && (
                    <img 
                      src={config.logo_url} 
                      alt="Company Logo" 
                      className="w-12 h-12 object-contain border rounded"
                    />
                  )}
                </div>
              </div>

              {/* Sidebar Logo */}
              <div>
                <Label>Sidebar Logo</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadCompanyAsset(file, 'sidebar_logo');
                    }}
                    disabled={uploading.sidebar_logo}
                  />
                  {config.sidebar_logo_url && (
                    <img 
                      src={config.sidebar_logo_url} 
                      alt="Sidebar Logo" 
                      className="w-12 h-12 object-contain border rounded"
                    />
                  )}
                </div>
              </div>

              {/* Header Logo */}
              <div>
                <Label>Header Logo</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadCompanyAsset(file, 'header_logo');
                    }}
                    disabled={uploading.header_logo}
                  />
                  {config.header_logo_url && (
                    <img 
                      src={config.header_logo_url} 
                      alt="Header Logo" 
                      className="w-12 h-12 object-contain border rounded"
                    />
                  )}
                </div>
              </div>

              {/* Favicon */}
              <div>
                <Label>Favicon</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadCompanyAsset(file, 'favicon');
                    }}
                    disabled={uploading.favicon}
                  />
                  {config.favicon_url && (
                    <img 
                      src={config.favicon_url} 
                      alt="Favicon" 
                      className="w-8 h-8 object-contain border rounded"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex gap-4">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </ErpLayout>
  );
};

export default CompanyConfigPage;