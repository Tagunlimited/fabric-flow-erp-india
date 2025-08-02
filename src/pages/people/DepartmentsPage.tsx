import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Loader2, Edit, Trash, Plus, Users } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  description: string;
  head_id: string | null;
  created_at: string;
}

interface Employee {
  id: string;
  full_name: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: '', description: '', head_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
  }, []);

  const fetchDepartments = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('departments').select('*').order('created_at');
    if (error) setError(error.message);
    setDepartments(data || []);
    setLoading(false);
  };

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('id, full_name');
    if (error) setError(error.message);
    setEmployees(data || []);
  };

  const handleOpenDialog = (dept?: Department) => {
    setEditing(dept || null);
    setForm({
      name: dept?.name || '',
      description: dept?.description || '',
      head_id: dept?.head_id || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (!form.name) {
      toast.error('Department name is required');
      setSaving(false);
      return;
    }
    if (editing) {
      // Update
      const { error } = await supabase
        .from('departments')
        .update({ name: form.name, description: form.description, head_id: form.head_id || null })
        .eq('id', editing.id);
      if (!error) toast.success('Department updated');
    } else {
      // Insert
      const { error } = await supabase
        .from('departments')
        .insert({ name: form.name, description: form.description, head_id: form.head_id || null });
      if (!error) toast.success('Department added');
    }
    setShowDialog(false);
    setSaving(false);
    fetchDepartments();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this department?')) return;
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (!error) toast.success('Department deleted');
    fetchDepartments();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="w-7 h-7" /> Departments</h1>
        <Button onClick={() => handleOpenDialog()}><Plus className="w-4 h-4 mr-2" />Add Department</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Department List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin w-8 h-8" /></div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">Error: {error}</div>
          ) : departments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-lg">No departments found.</p>
              <p className="mt-2">Click <span className="font-semibold">Add Department</span> to create your first department.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="py-2">Name</th>
                  <th className="py-2">Description</th>
                  <th className="py-2">Head</th>
                  <th className="py-2">Employees</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id} className="border-t">
                    <td className="py-2 font-semibold cursor-pointer text-primary hover:underline" onClick={() => navigate(`/people/departments/${dept.id}`)}>{dept.name}</td>
                    <td className="py-2">{dept.description}</td>
                    <td className="py-2">{employees.find(e => e.id === dept.head_id)?.full_name || '-'}</td>
                    <td className="py-2">{/* TODO: Show employee count in department dashboard */}-</td>
                    <td className="py-2 flex gap-2">
                      <Button size="icon" variant="outline" onClick={() => handleOpenDialog(dept)}><Edit className="w-4 h-4" /></Button>
                      <Button size="icon" variant="destructive" onClick={() => handleDelete(dept.id)}><Trash className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label>Department Head</Label>
              <select className="w-full border rounded p-2" value={form.head_id} onChange={e => setForm(f => ({ ...f, head_id: e.target.value }))}>
                <option value="">-- None --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 