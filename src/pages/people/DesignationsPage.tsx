import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Loader2, Edit, Trash, Plus, Award, Building, Search, Users } from 'lucide-react';
import { ErpLayout } from '@/components/ErpLayout';

interface Designation {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  departments?: Array<{ id: string; name: string }>; // Array of departments
  employee_count?: number; // Count of employees with this designation
}

interface Department {
  id: string;
  name: string;
}

export default function DesignationsPage() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [form, setForm] = useState({ 
    name: '', 
    description: '', 
    department_ids: [] as string[], 
    is_active: true 
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchDesignations();
    fetchDepartments();
  }, []);

  const fetchDesignations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch designations with departments using the view
      const { data: designationsData, error: designationsError } = await supabase
        .from('designations_with_departments')
        .select('*')
        .order('name');
      
      if (designationsError) {
        throw designationsError;
      }

      // Fetch employee counts for each designation
      const designationsWithCounts = await Promise.all(
        (designationsData || []).map(async (designation) => {
          // Get employee count for this designation
          const { count: employeeCount } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true })
            .eq('designation', designation.name);

          return {
            ...designation,
            employee_count: employeeCount || 0
          };
        })
      );

      setDesignations(designationsWithCounts);
    } catch (error: any) {
      setError(error.message);
      toast.error('Failed to fetch designations');
      console.error('Error fetching designations:', error);
    }
    
    setLoading(false);
  };

  const fetchDepartments = async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    
    if (error) {
      console.error('Error fetching departments:', error);
    } else {
      setDepartments(data || []);
    }
  };

  const handleOpenDialog = (designation?: Designation) => {
    setEditing(designation || null);
    setForm({
      name: designation?.name || '',
      description: designation?.description || '',
      department_ids: designation?.departments?.map(dept => dept.id) || [],
      is_active: designation?.is_active ?? true
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Designation name is required');
      setSaving(false);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        // Update designation
        const { error: designationError } = await supabase
          .from('designations')
          .update({
            name: form.name.trim(),
            description: form.description.trim() || null,
            is_active: form.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editing.id);

        if (designationError) throw designationError;

        // Update department relationships
        // First, delete existing relationships
        const { error: deleteError } = await supabase
          .from('designation_departments')
          .delete()
          .eq('designation_id', editing.id);

        if (deleteError) throw deleteError;

        // Then, insert new relationships
        if (form.department_ids.length > 0) {
          const relationships = form.department_ids.map(deptId => ({
            designation_id: editing.id,
            department_id: deptId
          }));

          const { error: insertError } = await supabase
            .from('designation_departments')
            .insert(relationships);

          if (insertError) throw insertError;
        }

        toast.success('Designation updated successfully');
      } else {
        // Create new designation
        const { data: newDesignation, error: designationError } = await supabase
          .from('designations')
          .insert({
            name: form.name.trim(),
            description: form.description.trim() || null,
            is_active: form.is_active
          })
          .select()
          .single();

        if (designationError) throw designationError;

        // Create department relationships
        if (form.department_ids.length > 0) {
          const relationships = form.department_ids.map(deptId => ({
            designation_id: newDesignation.id,
            department_id: deptId
          }));

          const { error: insertError } = await supabase
            .from('designation_departments')
            .insert(relationships);

          if (insertError) throw insertError;
        }

        toast.success('Designation created successfully');
      }
      
      setShowDialog(false);
      await fetchDesignations();
    } catch (error: any) {
      console.error('Error saving designation:', error);
      toast.error(error.message || 'Failed to save designation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this designation?')) return;
    
    try {
      const { error } = await supabase
        .from('designations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Designation deleted successfully');
      await fetchDesignations();
    } catch (error: any) {
      console.error('Error deleting designation:', error);
      toast.error(error.message || 'Failed to delete designation');
    }
  };


  // Filter designations based on search term
  const filteredDesignations = designations.filter(designation =>
    designation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (designation.description && designation.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (designation.departments && designation.departments.some(dept => 
      dept.name.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Award className="w-7 h-7" />
              Designations
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage job designations and organizational hierarchy
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Designation
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Designation List</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredDesignations.length} of {designations.length} designations
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search designations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin w-8 h-8" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">Error: {error}</div>
            ) : filteredDesignations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Award className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">
                  {searchTerm ? 'No designations match your search.' : 'No designations found.'}
                </p>
                <p className="mt-2">
                  {searchTerm ? 'Try adjusting your search terms.' : 'Click Add Designation to create your first designation.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 font-medium">Name</th>
                      <th className="py-3 font-medium">Description</th>
                      <th className="py-3 font-medium">Department</th>
                      <th className="py-3 font-medium">Employees</th>
                      <th className="py-3 font-medium">Status</th>
                      <th className="py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDesignations.map((designation) => (
                      <tr key={designation.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 font-medium">{designation.name}</td>
                        <td className="py-3 text-muted-foreground">
                          {designation.description || '-'}
                        </td>
                        <td className="py-3">
                          {designation.departments && designation.departments.length > 0 ? (
                            <div className="space-y-1">
                              {designation.departments.map((dept, index) => (
                                <div key={dept.id} className="flex items-center gap-2">
                                  <Building className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm">{dept.name}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center space-x-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{designation.employee_count || 0}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            designation.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {designation.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleOpenDialog(designation)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => handleDelete(designation.id)}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editing ? 'Edit Designation' : 'Add New Designation'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Senior Manager"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the designation"
                />
              </div>

              <div>
                <Label>Departments</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No departments available</p>
                  ) : (
                    departments.map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`dept-${dept.id}`}
                          checked={form.department_ids.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setForm({
                                ...form,
                                department_ids: [...form.department_ids, dept.id]
                              });
                            } else {
                              setForm({
                                ...form,
                                department_ids: form.department_ids.filter(id => id !== dept.id)
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <Label htmlFor={`dept-${dept.id}`} className="text-sm">
                          {dept.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {form.department_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.department_ids.length} department(s) selected
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>

              <div className="flex gap-2 justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowDialog(false)} 
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}
