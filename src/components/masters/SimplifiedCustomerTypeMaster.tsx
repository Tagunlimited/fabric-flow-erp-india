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
import { Plus, Edit, Trash2, Search, Users } from "lucide-react";

interface CustomerType {
  id: string;
  type_name: string;
  description?: string;
  discount_percentage?: number;
  credit_days?: number;
  is_active: boolean;
  created_at: string;
}

export function SimplifiedCustomerTypeMaster() {
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([
    {
      id: '1',
      type_name: 'Wholesale',
      description: 'Bulk purchase customers',
      discount_percentage: 15,
      credit_days: 30,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: '2', 
      type_name: 'Retail',
      description: 'Individual customers',
      discount_percentage: 0,
      credit_days: 0,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: '3',
      type_name: 'VIP',
      description: 'Premium customers',
      discount_percentage: 25,
      credit_days: 45,
      is_active: true,
      created_at: new Date().toISOString()
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<CustomerType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type_name: "",
    description: "",
    discount_percentage: "",
    credit_days: "",
    is_active: true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const typeData = {
        id: editingType?.id || Date.now().toString(),
        type_name: formData.type_name,
        description: formData.description || undefined,
        discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : 0,
        credit_days: formData.credit_days ? parseInt(formData.credit_days) : 0,
        is_active: formData.is_active,
        created_at: editingType?.created_at || new Date().toISOString()
      };

      if (editingType) {
        setCustomerTypes(prev => prev.map(type => 
          type.id === editingType.id ? typeData : type
        ));
        toast({
          title: "Success",
          description: "Customer type updated successfully!",
        });
      } else {
        setCustomerTypes(prev => [...prev, typeData]);
        toast({
          title: "Success", 
          description: "Customer type created successfully!",
        });
      }

      setShowDialog(false);
      setEditingType(null);
      resetForm();
    } catch (error) {
      console.error('Error saving customer type:', error);
      toast({
        title: "Error",
        description: "Failed to save customer type",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (type: CustomerType) => {
    setEditingType(type);
    setFormData({
      type_name: type.type_name,
      description: type.description || "",
      discount_percentage: type.discount_percentage?.toString() || "",
      credit_days: type.credit_days?.toString() || "",
      is_active: type.is_active
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    try {
      setCustomerTypes(prev => prev.filter(type => type.id !== id));
      toast({
        title: "Success",
        description: "Customer type deleted successfully!",
      });
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
      type_name: "",
      description: "",
      discount_percentage: "",
      credit_days: "",
      is_active: true
    });
  };

  const openDialog = () => {
    setEditingType(null);
    resetForm();
    setShowDialog(true);
  };

  const filteredTypes = customerTypes.filter(type =>
    type.type_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                <Label htmlFor="type_name">Type Name</Label>
                <Input
                  id="type_name"
                  value={formData.type_name}
                  onChange={(e) => setFormData({ ...formData, type_name: e.target.value })}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount_percentage">Discount %</Label>
                  <Input
                    id="discount_percentage"
                    type="number"
                    step="0.01"
                    value={formData.discount_percentage}
                    onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="credit_days">Credit Days</Label>
                  <Input
                    id="credit_days"
                    type="number"
                    value={formData.credit_days}
                    onChange={(e) => setFormData({ ...formData, credit_days: e.target.value })}
                    placeholder="0"
                  />
                </div>
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
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-primary hover:bg-gradient-primary/90">
                  {editingType ? 'Update' : 'Create'} Customer Type
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Benefits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <div className="font-medium">{type.type_name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {type.description || 'No description'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {type.discount_percentage && type.discount_percentage > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {type.discount_percentage}% Discount
                          </Badge>
                        )}
                        {type.credit_days && type.credit_days > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {type.credit_days} Days Credit
                          </Badge>
                        )}
                        {(!type.discount_percentage || type.discount_percentage === 0) && 
                         (!type.credit_days || type.credit_days === 0) && (
                          <span className="text-muted-foreground text-sm">No special benefits</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={type.is_active ? 'default' : 'secondary'}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                          className="text-error hover:text-error"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}