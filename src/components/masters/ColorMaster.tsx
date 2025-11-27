import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Save, X, Search, Minus, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Color {
  id: string;
  color: string;
  hex: string;
  imported_from?: string | null;
  created_at: string;
  updated_at: string;
}

const ColorMaster = () => {
  const [colors, setColors] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingColor, setEditingColor] = useState<Color | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formRows, setFormRows] = useState<Array<{ color: string; hex: string }>>([
    { color: '', hex: '' }
  ]);
  const [importing, setImporting] = useState(false);
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>('imported_from');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchColors();
  }, []);

  const fetchColors = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('colors')
        .select('*')
        .order('imported_from', { ascending: false, nullsFirst: false })
        .order('color', { ascending: true });

      if (error) throw error;
      setColors((data || []) as Color[]);
    } catch (error) {
      console.error('Error fetching colors:', error);
      toast.error('Failed to fetch colors');
    } finally {
      setLoading(false);
    }
  };

  const validateHex = (hex: string): boolean => {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    // Check if it's a valid hex color (3 or 6 characters, alphanumeric)
    return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out empty rows
    const validRows = formRows.filter(row => row.color.trim() && row.hex.trim());
    
    if (validRows.length === 0) {
      toast.error('Please add at least one color');
      return;
    }

    // Validate all hex codes
    for (const row of validRows) {
      if (!validateHex(row.hex)) {
        toast.error(`Invalid hex code for "${row.color}". Please enter a valid hex color code (e.g., #FF5733 or FF5733)`);
        return;
      }
    }

    try {
      if (editingColor) {
        // Update existing color (single row mode for editing)
        const row = validRows[0];
        const normalizedHex = row.hex.trim().startsWith('#') 
          ? row.hex.trim().toUpperCase() 
          : `#${row.hex.trim().toUpperCase()}`;

        const { error } = await (supabase as any)
          .from('colors')
          .update({
            color: row.color.trim(),
            hex: normalizedHex
          })
          .eq('id', editingColor.id);

        if (error) throw error;
        toast.success('Color updated successfully');
      } else {
        // Create multiple new colors
        const colorsToInsert = validRows.map(row => {
          const normalizedHex = row.hex.trim().startsWith('#') 
            ? row.hex.trim().toUpperCase() 
            : `#${row.hex.trim().toUpperCase()}`;
          
          return {
            color: row.color.trim(),
            hex: normalizedHex
          };
        });

        const { error } = await (supabase as any)
          .from('colors')
          .insert(colorsToInsert);

        if (error) throw error;
        toast.success(`${validRows.length} color(s) created successfully`);
      }

      await fetchColors();
      resetForm();
    } catch (error: any) {
      console.error('Error saving color(s):', error);
      if (error.code === '23505') {
        toast.error('One or more colors with these names already exist');
      } else if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('403')) {
        toast.error('Permission denied. Please check your user role or contact administrator.');
        console.error('RLS Policy Error:', error);
      } else {
        toast.error(`Failed to save color(s): ${error.message || 'Unknown error'}`);
      }
    }
  };

  const handleEdit = (color: Color) => {
    setEditingColor(color);
    setFormRows([{ color: color.color, hex: color.hex }]);
    setDialogOpen(true);
  };

  const addRow = () => {
    setFormRows([...formRows, { color: '', hex: '' }]);
  };

  const removeRow = (index: number) => {
    if (formRows.length > 1) {
      setFormRows(formRows.filter((_, i) => i !== index));
    }
  };

  const updateRow = (index: number, field: 'color' | 'hex', value: string) => {
    const newRows = [...formRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setFormRows(newRows);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    
    // Parse the pasted data - handle tab-separated, comma-separated, or newline-separated values
    const lines = pastedData.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length === 0) return;
    
    const parsedRows: Array<{ color: string; hex: string }> = [];
    
    lines.forEach(line => {
      // Try different separators: tab, comma, or multiple spaces
      const parts = line.split(/\t|,|\s{2,}/).map(p => p.trim()).filter(p => p);
      
      if (parts.length >= 2) {
        // Assume first part is color name, second is hex
        const color = parts[0];
        let hex = parts[1];
        
        // Clean up hex code (remove any extra characters)
        hex = hex.replace(/[^#0-9A-Fa-f]/g, '');
        
        if (color && hex) {
          parsedRows.push({ color, hex });
        }
      } else if (parts.length === 1) {
        // Single value - could be just hex or just color name
        // Check if it looks like a hex code
        const value = parts[0];
        if (/^#?[0-9A-Fa-f]{3,6}$/i.test(value)) {
          // It's a hex code, but we need a color name
          // Skip it or use it as hex with empty color name
          parsedRows.push({ color: '', hex: value });
        } else {
          // It's probably a color name, but we need hex
          parsedRows.push({ color: value, hex: '' });
        }
      }
    });
    
    if (parsedRows.length > 0) {
      setFormRows(parsedRows);
      toast.success(`Pasted ${parsedRows.length} color(s) from clipboard`);
    } else {
      toast.error('Could not parse pasted data. Please paste in format: ColorName\tHexCode or ColorName,HexCode');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this color?')) {
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('colors')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Color deleted successfully');
      await fetchColors();
    } catch (error) {
      console.error('Error deleting color:', error);
      toast.error('Failed to delete color');
    }
  };

  const resetForm = () => {
    setFormRows([{ color: '', hex: '' }]);
    setEditingColor(null);
    setDialogOpen(false);
  };

  const handleImportFromMasters = async () => {
    if (!confirm('This will import all unique colors from Fabric Master, Item Master, and Product Master. Continue?')) {
      return;
    }

    try {
      setImporting(true);
      const { data, error } = await (supabase as any).rpc('import_colors_from_masters');

      if (error) {
        console.error('Import error:', error);
        throw error;
      }

      if (data && typeof data === 'object' && 'success' in data && data.success) {
        const inserted = (data as any).inserted || 0;
        const skipped = (data as any).skipped || 0;
        const totalFound = (data as any).total_found || 0;
        
        toast.success(
          `Import completed! ${inserted} color(s) imported, ${skipped} skipped (already exist). Total found: ${totalFound}`,
          { duration: 5000 }
        );
        await fetchColors();
      } else {
        const errorMsg = (data as any)?.error || 'Unknown error occurred';
        toast.error(`Import failed: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Error importing colors:', error);
      toast.error(`Failed to import colors: ${error.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredColors = colors.filter(c =>
    c.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.hex.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort filtered colors
  const sortedColors = [...filteredColors].sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case 'color':
        aValue = a.color.toLowerCase();
        bValue = b.color.toLowerCase();
        break;
      case 'hex':
        aValue = a.hex.toLowerCase();
        bValue = b.hex.toLowerCase();
        break;
      case 'imported_from':
        // Sort imported colors first (nulls last)
        if (a.imported_from && !b.imported_from) return -1;
        if (!a.imported_from && b.imported_from) return 1;
        aValue = a.imported_from || '';
        bValue = b.imported_from || '';
        break;
      case 'created_at':
        aValue = new Date(a.created_at).getTime();
        bValue = new Date(b.created_at).getTime();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectColor = (colorId: string) => {
    const newSelected = new Set(selectedColors);
    if (newSelected.has(colorId)) {
      newSelected.delete(colorId);
    } else {
      newSelected.add(colorId);
    }
    setSelectedColors(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedColors(new Set(sortedColors.map(c => c.id)));
    } else {
      setSelectedColors(new Set());
    }
  };

  const allSelected = sortedColors.length > 0 && sortedColors.every(c => selectedColors.has(c.id));
  const someSelected = sortedColors.some(c => selectedColors.has(c.id)) && !allSelected;

  const handleBulkDelete = async () => {
    if (selectedColors.size === 0) {
      toast.error('Please select at least one color to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedColors.size} color(s)?`)) {
      return;
    }

    try {
      setDeleteLoading(true);
      const { error } = await (supabase as any)
        .from('colors')
        .delete()
        .in('id', Array.from(selectedColors));

      if (error) throw error;
      toast.success(`${selectedColors.size} color(s) deleted successfully`);
      setSelectedColors(new Set());
      await fetchColors();
    } catch (error) {
      console.error('Error deleting colors:', error);
      toast.error('Failed to delete colors');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading colors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-center w-full">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Color Master</h2>
          <p className="text-muted-foreground">
            Manage color definitions with hex codes
          </p>
        </div>
        <div className="flex gap-2">
          {selectedColors.size > 0 && (
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={deleteLoading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteLoading ? 'Deleting...' : `Delete ${selectedColors.size}`}
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={handleImportFromMasters}
            disabled={importing}
          >
            <Download className="w-4 h-4 mr-2" />
            {importing ? 'Importing...' : 'Import from Masters'}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Color
          </Button>
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Colors ({sortedColors.length})</CardTitle>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search colors by name or hex code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {sortedColors.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm ? 'No colors found matching your search' : 'No colors found'}
              </p>
              {!searchTerm && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Color
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-12">Color</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('color')}
                    >
                      <div className="flex items-center gap-2">
                        Color Name
                        {sortField === 'color' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )
                        ) : (
                          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('hex')}
                    >
                      <div className="flex items-center gap-2">
                        Hex Code
                        {sortField === 'hex' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )
                        ) : (
                          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('imported_from')}
                    >
                      <div className="flex items-center gap-2">
                        Imported From
                        {sortField === 'imported_from' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )
                        ) : (
                          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('created_at')}
                    >
                      <div className="flex items-center gap-2">
                        Created Date
                        {sortField === 'created_at' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )
                        ) : (
                          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedColors.map((color) => (
                    <TableRow key={color.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Checkbox
                          checked={selectedColors.has(color.id)}
                          onCheckedChange={() => handleSelectColor(color.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          className="w-10 h-10 rounded-full border-2 border-gray-300 flex-shrink-0"
                          style={{ backgroundColor: color.hex }}
                          title={color.hex}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{color.color}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {color.hex}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {color.imported_from ? (
                          <Badge variant="secondary" className="capitalize">
                            {color.imported_from.replace('_', ' ')}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Manual</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(color.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(color)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(color.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingColor ? 'Edit Color' : 'Add New Color'}
            </DialogTitle>
            <DialogDescription>
              {editingColor 
                ? 'Update the color details below.' 
                : 'Create a new color with name and hex code.'
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>💡 Tip:</strong> You can copy data from Excel and paste here. 
                Format: <code className="bg-blue-100 px-1 rounded">ColorName</code> (tab or comma) <code className="bg-blue-100 px-1 rounded">HexCode</code>
              </p>
            </div>
            <div 
              data-paste-area
              className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg p-2"
              onPaste={handlePaste}
              tabIndex={0}
              onFocus={(e) => {
                // Add visual indicator when focused
                e.currentTarget.classList.add('ring-2', 'ring-primary/20');
              }}
              onBlur={(e) => {
                e.currentTarget.classList.remove('ring-2', 'ring-primary/20');
              }}
            >
              {formRows.map((row, index) => (
                <div key={index} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`color-${index}`}>Color Name</Label>
                      <Input
                        id={`color-${index}`}
                        value={row.color}
                        onChange={(e) => updateRow(index, 'color', e.target.value)}
                        placeholder="e.g., Red, Blue, Green"
                        required={index === 0}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`hex-${index}`}>Hex Code</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`hex-${index}`}
                          value={row.hex}
                          onChange={(e) => updateRow(index, 'hex', e.target.value)}
                          placeholder="#FF5733 or FF5733"
                          required={index === 0}
                          className="font-mono flex-1"
                        />
                        {row.hex && validateHex(row.hex) && (
                          <div
                            className="w-12 h-12 rounded border-2 border-gray-300 flex-shrink-0"
                            style={{ 
                              backgroundColor: row.hex.startsWith('#') 
                                ? row.hex 
                                : `#${row.hex}` 
                            }}
                            title="Preview"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  {formRows.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeRow(index)}
                      className="mt-7 h-10 w-10 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            {!editingColor && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRow}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add More Colors
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Focus the container to enable paste
                    const container = document.querySelector('[data-paste-area]') as HTMLElement;
                    if (container) {
                      container.focus();
                      toast.info('Click in the form area and paste your Excel data (Ctrl+V or Cmd+V)');
                    }
                  }}
                  className="flex-1"
                >
                  📋 Paste from Excel
                </Button>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              Enter hex code with or without # (e.g., #FF5733 or FF5733)
            </p>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" />
                {editingColor ? 'Update' : `Create ${formRows.filter(r => r.color.trim() && r.hex.trim()).length} Color(s)`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ColorMaster;

