import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEnhancedFormData } from '@/hooks/useEnhancedFormData';
import { FormPersistenceWrapper } from '@/components/FormPersistenceWrapper';

interface CustomerFormProps {
  customer?: any;
  onSave: (customer: any) => void;
  onCancel: () => void;
}

interface CustomerType {
  id: number;
  name: string;
}

interface State {
  id: number;
  name: string;
  code: string;
}

function CustomerFormContent({ customer, onSave, onCancel }: CustomerFormProps) {
  const { 
    data: formData, 
    updateData: setFormData, 
    resetData, 
    isLoaded, 
    hasUnsavedChanges,
    hasSavedData,
    lastSaved,
    save
  } = useEnhancedFormData('customerForm', {
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    customer_types: 'Retail',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    pan: '',
    credit_limit: 0
  }, {
    autoSave: true,
    saveInterval: 2000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    persistToStorage: true
  });

  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomerTypes();
    fetchStates();
    
    if (customer) {
      setFormData({
        company_name: customer.company_name || '',
        contact_person: customer.contact_person || '',
        phone: customer.phone || '',
        email: customer.email || '',
        customer_types: customer.customer_type || 'Retail',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        pincode: customer.pincode || '',
        gstin: customer.gstin || '',
        pan: customer.pan || '',
        credit_limit: customer.credit_limit || 0
      });
    }
  }, [customer, setFormData]);

  const fetchCustomerTypes = async () => {
    try {
      // Fallback customer types from enum
      const types = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
      setCustomerTypes(types.map((name, id) => ({ id, name })));
    } catch (error) {
      // Fallback customer types
      const types = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
      setCustomerTypes(types.map((name, id) => ({ id, name })));
    }
  };

  const fetchStates = async () => {
    // Mock data for states
    setStates([
      { id: 1, name: 'Maharashtra', code: 'MH' },
      { id: 2, name: 'Gujarat', code: 'GJ' },
      { id: 3, name: 'Karnataka', code: 'KA' },
      { id: 4, name: 'Tamil Nadu', code: 'TN' },
      { id: 5, name: 'Delhi', code: 'DL' },
      { id: 6, name: 'Uttar Pradesh', code: 'UP' },
      { id: 7, name: 'West Bengal', code: 'WB' },
      { id: 8, name: 'Rajasthan', code: 'RJ' },
      { id: 9, name: 'Madhya Pradesh', code: 'MP' },
      { id: 10, name: 'Punjab', code: 'PB' }
    ]);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.company_name.trim()) {
      setError('Company name is required');
      return;
    }

    if (!formData.contact_person.trim()) {
      setError('Contact person is required');
      return;
    }

    if (!formData.phone.trim()) {
      setError('Phone number is required');
      return;
    }

    // Email is optional, but if provided, it must be valid
    if (formData.email.trim() && !formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const customerData = {
        company_name: formData.company_name.trim(),
        contact_person: formData.contact_person.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        customer_type: formData.customer_types,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state,
        pincode: formData.pincode.trim(),
        gstin: formData.gstin.trim(),
        pan: formData.pan.trim(),
        credit_limit: Number(formData.credit_limit) || 0
      };

      let result;
      if (customer) {
        // Update existing customer
        const { data, error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', customer.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
        toast.success('Customer updated successfully');
      } else {
        // Create new customer
        const { data, error } = await supabase
          .from('customers')
          .insert([customerData])
          .select()
          .single();

        if (error) throw error;
        result = data;
        toast.success('Customer created successfully');
      }

      // Clear form data after successful save
      resetData();
      onSave(result);
    } catch (error: any) {
      console.error('Error saving customer:', error);
      setError(error.message || 'Failed to save customer');
      toast.error('Failed to save customer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    resetData();
    setError('');
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading form...</span>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {customer ? 'Edit Customer' : 'Add New Customer'}
          </CardTitle>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            {hasUnsavedChanges && (
              <div className="flex items-center space-x-1 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <span>Unsaved changes</span>
              </div>
            )}
            {hasSavedData && lastSaved && (
              <div className="text-green-600">
                Last saved: {lastSaved.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Client Information</h3>
              
              <div>
                <Label htmlFor="company_name">Client *</Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="Enter client name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="contact_person">Contact Person *</Label>
                <Input
                  id="contact_person"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => handleChange('contact_person', e.target.value)}
                  placeholder="Enter contact person name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="Enter phone number"
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>

              <div>
                <Label htmlFor="customer_types">Customer Type</Label>
                <Select
                  value={formData.customer_types}
                  onValueChange={(value) => handleChange('customer_types', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer type" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Address Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Address Information</h3>
              
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Enter address"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="Enter city"
                  />
                </div>

                <div>
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleChange('state', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state.id} value={state.name}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  name="pincode"
                  value={formData.pincode}
                  onChange={(e) => handleChange('pincode', e.target.value)}
                  placeholder="Enter pincode"
                />
              </div>
            </div>
          </div>

          {/* Tax Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Tax Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="gstin">GSTIN</Label>
                <Input
                  id="gstin"
                  name="gstin"
                  value={formData.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value)}
                  placeholder="Enter GSTIN"
                />
              </div>

              <div>
                <Label htmlFor="pan">PAN</Label>
                <Input
                  id="pan"
                  name="pan"
                  value={formData.pan}
                  onChange={(e) => handleChange('pan', e.target.value)}
                  placeholder="Enter PAN"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="credit_limit">Credit Limit (₹)</Label>
              <Input
                id="credit_limit"
                name="credit_limit"
                type="number"
                value={formData.credit_limit}
                onChange={(e) => handleChange('credit_limit', e.target.value)}
                placeholder="Enter credit limit"
                min="0"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
              >
                <X className="h-4 w-4 mr-2" />
                Reset
              </Button>
              
              {hasUnsavedChanges && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={save}
                  disabled={isLoading}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {customer ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {customer ? 'Update Customer' : 'Create Customer'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CustomerForm({ customer, onSave, onCancel }: CustomerFormProps) {
  return (
    <FormPersistenceWrapper
      formKey="customerForm"
      pageKey="customers"
      enableAutoSave={true}
      autoSaveInterval={2000}
      preventRefresh={true}
      onFormChange={(hasChanges) => {
        // You can add additional logic here if needed
      }}
    >
      <CustomerFormContent customer={customer} onSave={onSave} onCancel={onCancel} />
    </FormPersistenceWrapper>
  );
}
