import { useState, useEffect } from 'react';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
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
  authorized_signatory_url?: string;
  logo_sizes?: {
    sidebar_logo_height: string;
    sidebar_logo_width: string;
    header_logo_height: string;
    header_logo_width: string;
    company_logo_height: string;
    company_logo_width: string;
    favicon_size: string;
  };
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

  // Preset size options for easy configuration
  const presetSizes = [
    { label: 'Extra Small (16px)', value: '16px' },
    { label: 'Small (24px)', value: '24px' },
    { label: 'Medium (32px)', value: '32px' },
    { label: 'Large (40px)', value: '40px' },
    { label: 'Extra Large (48px)', value: '48px' },
    { label: 'Custom', value: 'custom' }
  ];

  // Helper functions for slider conversion
  const pixelToSliderValue = (pixelValue: string): number => {
    const numericValue = parseInt(pixelValue.replace('px', '')) || 32;
    return Math.min(Math.max(numericValue, 8), 80); // Clamp between 8px and 80px
  };

  const sliderToPixelValue = (sliderValue: number): string => {
    return `${sliderValue}px`;
  };

  // Apply preset size to all logos
  const applyPresetSize = (size: string) => {
    if (size === 'custom') return; // Don't change anything for custom
    
    setConfig(prev => ({
      ...prev,
      logo_sizes: {
        ...prev.logo_sizes,
        sidebar_logo_height: size,
        header_logo_height: size,
        company_logo_height: size,
        sidebar_logo_width: 'auto',
        header_logo_width: 'auto',
        company_logo_width: 'auto'
      }
    }));
  };

  // Handle slider changes
  const handleSliderChange = (field: string, value: number[]) => {
    const pixelValue = sliderToPixelValue(value[0]);
    handleInputChange(field, pixelValue);
  };

  // Reset all logo sizes to defaults
  const resetLogoSizes = () => {
    setConfig(prev => ({
      ...prev,
      logo_sizes: {
        sidebar_logo_height: '32px',
        sidebar_logo_width: 'auto',
        header_logo_height: '32px',
        header_logo_width: 'auto',
        company_logo_height: '48px',
        company_logo_width: 'auto',
        favicon_size: '16px'
      }
    }));
    toast.success('Logo sizes reset to defaults');
  };

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
    } else if (field.startsWith('logo_sizes.')) {
      const logoField = field.replace('logo_sizes.', '');
      setConfig(prev => ({
        ...prev,
        logo_sizes: {
          ...prev.logo_sizes,
          [logoField]: value
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

  const uploadCompanyAsset = async (file: File, type: 'logo' | 'sidebar_logo' | 'header_logo' | 'favicon' | 'authorized_signatory') => {
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
      <div className="w-full space-y-6">
        <BackButton />
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Company Configuration</h1>
          <p className="text-gray-600 mt-2">Manage your company information and branding assets</p>
        </div>

        {error && (
          <Alert className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

              {/* Authorized Signatory */}
              <div>
                <Label>Authorized Signatory</Label>
                <p className="text-sm text-muted-foreground mb-2">Upload signature image that will appear on all documents</p>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadCompanyAsset(file, 'authorized_signatory');
                    }}
                    disabled={uploading.authorized_signatory}
                  />
                  {config.authorized_signatory_url && (
                    <div className="flex items-center gap-2">
                      <img 
                        src={config.authorized_signatory_url} 
                        alt="Authorized Signatory" 
                        className="w-16 h-8 object-contain border rounded bg-white"
                      />
                      <span className="text-xs text-muted-foreground">Signature Preview</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Logo Size Configuration */}
              <div className="border-t pt-4">
                <Label className="text-lg font-semibold">Logo Size Configuration</Label>
                <p className="text-sm text-muted-foreground mb-4">Configure the size of logos displayed throughout the application</p>
                
                {/* Quick Preset Selector */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <Label className="text-sm font-medium mb-2 block">Quick Preset Sizes</Label>
                  <Select onValueChange={applyPresetSize}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Choose a preset size" />
                    </SelectTrigger>
                    <SelectContent>
                      {presetSizes.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">This will apply the size to all logos (height only)</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sidebar Logo Size */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Sidebar Logo</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="sidebar_height" className="text-xs">Height</Label>
                        <Input
                          id="sidebar_height"
                          placeholder="32px"
                          value={config.logo_sizes?.sidebar_logo_height || '32px'}
                          onChange={(e) => handleInputChange('logo_sizes.sidebar_logo_height', e.target.value)}
                          className="text-sm"
                        />
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Height Slider</Label>
                          <Slider
                            value={[pixelToSliderValue(config.logo_sizes?.sidebar_logo_height || '32px')]}
                            onValueChange={(value) => handleSliderChange('logo_sizes.sidebar_logo_height', value)}
                            min={8}
                            max={80}
                            step={2}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>8px</span>
                            <span>{config.logo_sizes?.sidebar_logo_height || '32px'}</span>
                            <span>80px</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="sidebar_width" className="text-xs">Width</Label>
                        <Input
                          id="sidebar_width"
                          placeholder="auto"
                          value={config.logo_sizes?.sidebar_logo_width || 'auto'}
                          onChange={(e) => handleInputChange('logo_sizes.sidebar_logo_width', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Header Logo Size */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Header Logo</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="header_height" className="text-xs">Height</Label>
                        <Input
                          id="header_height"
                          placeholder="32px"
                          value={config.logo_sizes?.header_logo_height || '32px'}
                          onChange={(e) => handleInputChange('logo_sizes.header_logo_height', e.target.value)}
                          className="text-sm"
                        />
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Height Slider</Label>
                          <Slider
                            value={[pixelToSliderValue(config.logo_sizes?.header_logo_height || '32px')]}
                            onValueChange={(value) => handleSliderChange('logo_sizes.header_logo_height', value)}
                            min={8}
                            max={80}
                            step={2}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>8px</span>
                            <span>{config.logo_sizes?.header_logo_height || '32px'}</span>
                            <span>80px</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="header_width" className="text-xs">Width</Label>
                        <Input
                          id="header_width"
                          placeholder="auto"
                          value={config.logo_sizes?.header_logo_width || 'auto'}
                          onChange={(e) => handleInputChange('logo_sizes.header_logo_width', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Company Logo Size */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Company Logo</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="company_height" className="text-xs">Height</Label>
                        <Input
                          id="company_height"
                          placeholder="48px"
                          value={config.logo_sizes?.company_logo_height || '48px'}
                          onChange={(e) => handleInputChange('logo_sizes.company_logo_height', e.target.value)}
                          className="text-sm"
                        />
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Height Slider</Label>
                          <Slider
                            value={[pixelToSliderValue(config.logo_sizes?.company_logo_height || '48px')]}
                            onValueChange={(value) => handleSliderChange('logo_sizes.company_logo_height', value)}
                            min={8}
                            max={80}
                            step={2}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>8px</span>
                            <span>{config.logo_sizes?.company_logo_height || '48px'}</span>
                            <span>80px</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="company_width" className="text-xs">Width</Label>
                        <Input
                          id="company_width"
                          placeholder="auto"
                          value={config.logo_sizes?.company_logo_width || 'auto'}
                          onChange={(e) => handleInputChange('logo_sizes.company_logo_width', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Favicon Size */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Favicon</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="favicon_size" className="text-xs">Size</Label>
                        <Input
                          id="favicon_size"
                          placeholder="16px"
                          value={config.logo_sizes?.favicon_size || '16px'}
                          onChange={(e) => handleInputChange('logo_sizes.favicon_size', e.target.value)}
                          className="text-sm"
                        />
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Size Slider</Label>
                          <Slider
                            value={[pixelToSliderValue(config.logo_sizes?.favicon_size || '16px')]}
                            onValueChange={(value) => handleSliderChange('logo_sizes.favicon_size', value)}
                            min={8}
                            max={32}
                            step={2}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>8px</span>
                            <span>{config.logo_sizes?.favicon_size || '16px'}</span>
                            <span>32px</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Section */}
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium mb-3 block">Live Preview</Label>
                  <div className="flex items-center gap-6">
                    {config.sidebar_logo_url && (
                      <div className="text-center">
                        <Label className="text-xs text-muted-foreground mb-1 block">Sidebar</Label>
                        <img 
                          src={config.sidebar_logo_url} 
                          alt="Sidebar Logo Preview" 
                          style={{
                            height: config.logo_sizes?.sidebar_logo_height || '32px',
                            width: config.logo_sizes?.sidebar_logo_width || 'auto'
                          }}
                          className="object-contain border rounded bg-white p-1"
                        />
                      </div>
                    )}
                    {config.header_logo_url && (
                      <div className="text-center">
                        <Label className="text-xs text-muted-foreground mb-1 block">Header</Label>
                        <img 
                          src={config.header_logo_url} 
                          alt="Header Logo Preview" 
                          style={{
                            height: config.logo_sizes?.header_logo_height || '32px',
                            width: config.logo_sizes?.header_logo_width || 'auto'
                          }}
                          className="object-contain border rounded bg-white p-1"
                        />
                      </div>
                    )}
                    {config.logo_url && (
                      <div className="text-center">
                        <Label className="text-xs text-muted-foreground mb-1 block">Company</Label>
                        <img 
                          src={config.logo_url} 
                          alt="Company Logo Preview" 
                          style={{
                            height: config.logo_sizes?.company_logo_height || '48px',
                            width: config.logo_sizes?.company_logo_width || 'auto'
                          }}
                          className="object-contain border rounded bg-white p-1"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Logo Configuration Button */}
                <div className="mt-4 flex justify-between items-center">
                  <Button 
                    onClick={resetLogoSizes}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    Reset to Defaults
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving Logo Settings...' : 'Save Logo Configuration'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
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