import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, X, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useFormData } from '@/contexts/FormPersistenceContext';
import { useNavigate } from 'react-router-dom';
import { StateCitySelector } from '@/components/ui/StateCitySelector';

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
  const navigate = useNavigate();
  const { data: formData, updateData: setFormData, resetData, isLoaded, hasSavedData } = useFormData('customerForm', {
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
    pan: ''
  });
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomerTypes();
    fetchStates();
  }, []);

  useEffect(() => {
    if (customer && customerTypes.length > 0) {
      // Find the customer type name from the ID
      const customerTypeName = customerTypes.find(type => type.id === customer.customer_type)?.name || 'Retail';
      
      setFormData({
        company_name: customer.company_name || '',
        contact_person: customer.contact_person || '',
        phone: customer.phone || '',
        email: customer.email || '',
        customer_types: customerTypeName,
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        pincode: customer.pincode || '',
        gstin: customer.gstin || '',
        pan: customer.pan || ''
      });
    }
  }, [customer, customerTypes, setFormData]);

  const fetchCustomerTypes = async () => {
    try {
      // Use type assertion since customer_types table exists but may not be in generated types
      const { data, error } = await (supabase
        .from('customer_types' as any)
        .select('id, name')
        .eq('is_active', true)
        .order('name') as any);

      if (error) {
        console.error('Error fetching customer types:', error);
        // Fallback customer types
        const types = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
        setCustomerTypes(types.map((name, id) => ({ id: id + 1, name })));
        return;
      }

      // Type guard to ensure data is valid
      if (data && Array.isArray(data)) {
        setCustomerTypes(data as CustomerType[]);
      } else {
        // Fallback if data is invalid
        const types = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
        setCustomerTypes(types.map((name, id) => ({ id: id + 1, name })));
      }
    } catch (error) {
      console.error('Error fetching customer types:', error);
      // Fallback customer types
      const types = ['Retail', 'Wholesale', 'Corporate', 'B2B', 'B2C', 'Enterprise'];
      setCustomerTypes(types.map((name, id) => ({ id: id + 1, name })));
    }
  };

  const fetchStates = async () => {
    // Mock data for states
    setStates([
      { id: 1, name: 'Maharashtra', code: 'MH' },
      { id: 2, name: 'Gujarat', code: 'GJ' },
      { id: 3, name: 'Karnataka', code: 'KA' }
    ]);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.company_name.trim()) {
      setError('Client name is required');
      return false;
    }
    if (!formData.phone.trim() || formData.phone.length < 10) {
      setError('Valid phone number is required');
      return false;
    }
    // Email is optional, but if provided, it must be valid
    if (formData.email.trim() && !formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!formData.city.trim()) {
      setError('City is required');
      return false;
    }
    if (!formData.state.trim()) {
      setError('State is required');
      return false;
    }
    // Pincode is optional, but if provided, it must be 6 digits
    if (formData.pincode.trim() && formData.pincode.length !== 6) {
      setError('Pincode must be 6 digits if provided');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      
      // Find the customer type ID from the selected name
      const selectedCustomerType = customerTypes.find(type => type.name === formData.customer_types);
      
      // Create customerData without customer_types field
      const { customer_types, ...formDataWithoutTypes } = formData;
      const customerData = {
        ...formDataWithoutTypes,
        customer_type: selectedCustomerType?.id || null
      };

      let result;
      if (customer) {
        // Update existing customer
        result = await supabase
          .from('customers')
          .update(customerData as any)
          .eq('id', customer.id)
          .select()
          .single();
      } else {
        // Create new customer
        result = await supabase
          .from('customers')
          .insert(customerData as any)
          .select()
          .single();
      }

      if (result.error) throw result.error;
      
      toast.success(customer ? 'Customer updated successfully' : 'Customer created successfully');
      
      // Clear saved form data after successful save
      resetData();
      
      onSave(result.data);
    } catch (error: any) {
      setError(error.message || 'Failed to save customer');
      toast.error('Failed to save customer');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while form data is being loaded
  if (!isLoaded) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>
            {customer ? 'Edit Customer' : 'Create New Customer'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading form data...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/crm/customers')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <CardTitle>
              {customer ? 'Edit Customer' : 'Create New Customer'}
            </CardTitle>
          </div>
          {hasSavedData && !customer && (
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={resetData}
              className="text-red-600 hover:text-red-700"
            >
              Clear Saved Data
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" data-form-key="customerForm">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Client *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => handleChange('company_name', e.target.value)}
                placeholder="Enter client name"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => handleChange('contact_person', e.target.value)}
                placeholder="Enter contact person name"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Enter phone number"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="Enter email address"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_types">Customer Type *</Label>
              <Select
                value={formData.customer_types}
                onValueChange={(value) => handleChange('customer_types', value)}
                disabled={isLoading}
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

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Enter complete address"
              disabled={isLoading}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <StateCitySelector
                selectedState={formData.state}
                selectedCity={formData.city}
                onStateChange={(value) => handleChange('state', value)}
                onCityChange={(value) => handleChange('city', value)}
                disabled={isLoading}
                stateLabel="State"
                cityLabel="City"
                stateRequired={true}
                cityRequired={true}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pincode">Pincode</Label>
              <Input
                id="pincode"
                value={formData.pincode}
                onChange={(e) => handleChange('pincode', e.target.value)}
                placeholder="Enter 6-digit pincode"
                maxLength={6}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={formData.gstin}
                onChange={(e) => handleChange('gstin', e.target.value)}
                placeholder="Enter GSTIN"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                value={formData.pan}
                onChange={(e) => handleChange('pan', e.target.value)}
                placeholder="Enter PAN"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-primary hover:bg-gradient-primary/90"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              {customer ? 'Update' : 'Create'} Customer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CustomerForm({ customer, onSave, onCancel }: CustomerFormProps) {
  // For dialog forms, we don't need FormPersistenceWrapper as it can interfere with dialog behavior
  // The useFormData hook from FormPersistenceContext already provides persistence
  // and we've disabled auto-refresh globally, so the form won't refresh on tab switch
  return <CustomerFormContent customer={customer} onSave={onSave} onCancel={onCancel} />;
}