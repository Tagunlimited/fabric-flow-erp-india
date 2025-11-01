import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Search, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CustomerType {
  id: number;
  name: string;
  description?: string;
  discount_percentage?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export function CustomerTypeMaster() {
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<CustomerType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discount_percentage: "",
    is_active: true
  });

  // Fetch customer types from database
  const fetchCustomerTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customer_types')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customer types:', error);
        toast({
          title: "Error",
          description: "Failed to fetch customer types",
          variant: "destructive",
        });
        return;
      }

      setCustomerTypes(data || []);
    } catch (error) {
      console.error('Error fetching customer types:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customer types",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerTypes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Customer type name is required",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    
    try {
      const typeData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : 0,
        is_active: formData.is_active
      };

      if (editingType) {
        // Update existing customer type
        const { error } = await supabase
          .from('customer_types')
          .update(typeData)
          .eq('id', editingType.id);

        if (error) {
          console.error('Error updating customer type:', error);
          toast({
            title: "Error",
            description: error.message || "Failed to update customer type",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: "Customer type updated successfully!",
        });
      } else {
        // Create new customer type
        const { error } = await supabase
          .from('customer_types')
          .insert([typeData]);

        if (error) {
          console.error('Error creating customer type:', error);
          toast({
            title: "Error",
            description: error.message || "Failed to create customer type",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success", 
          description: "Customer type created successfully!",
        });
      }

      setShowDialog(false);
      setEditingType(null);
      resetForm();
      fetchCustomerTypes(); // Refresh the list
    } catch (error) {
      console.error('Error saving customer type:', error);
      toast({
        title: "Error",
        description: "Failed to save customer type",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (type: CustomerType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      discount_percentage: type.discount_percentage?.toString() || "",
      is_active: type.is_active
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this customer type? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customer_types')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting customer type:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete customer type",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Customer type deleted successfully!",
      });
      
      fetchCustomerTypes(); // Refresh the list
    } catch (error) {
      console.error('Error deleting customer type:', error);
      toast({
        title: "Error",
        description: "Failed to delete customer type",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      discount_percentage: "",
      is_active: true
    });
  };

  const openDialog = () => {
    setEditingType(null);
    resetForm();
    setShowDialog(true);
  };

  const filteredTypes = customerTypes.filter(type =>
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (type.description && type.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Customer Type Master
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage different customer types and their configurations
          </p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={openDialog} className="bg-gradient-primary hover:bg-gradient-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Customer Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Edit Customer Type' : 'Add New Customer Type'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Type Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Wholesale, Retail, VIP"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this customer type..."
                />
              </div>
              <div>
                <Label htmlFor="discount_percentage">Discount %</Label>
                <Input
                  id="discount_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowDialog(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-gradient-primary hover:bg-gradient-primary/90"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingType ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {editingType ? 'Update' : 'Create'} Customer Type
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-erp-md">
        <CardHeader>
          <CardTitle>Customer Types ({filteredTypes.length})</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search customer types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2">Loading customer types...</span>
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                {searchTerm ? 'No customer types found' : 'No customer types yet'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Get started by creating your first customer type'
                }
              </p>
              {!searchTerm && (
                <Button onClick={openDialog} className="bg-gradient-primary hover:bg-gradient-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer Type
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredTypes.map((type) => (
                <Card key={type.id} className="hover:shadow-lg transition-shadow duration-200 border-0 shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-semibold">{type.name}</CardTitle>
                          <Badge 
                            variant={type.is_active ? 'default' : 'secondary'}
                            className="mt-1 text-xs"
                          >
                            {type.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type)}
                          className="h-8 w-8 p-0 hover:bg-primary/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {type.description || 'No description provided'}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {type.discount_percentage && type.discount_percentage > 0 ? (
                            <Badge variant="secondary" className="text-xs font-medium">
                              {type.discount_percentage}% Discount
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              No Discount
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(type.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
