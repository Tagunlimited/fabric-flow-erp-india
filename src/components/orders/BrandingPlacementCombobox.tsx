import { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BrandingPlacementRow = { id: string; name: string };

export function BrandingPlacementCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [placements, setPlacements] = useState<BrandingPlacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogName, setDialogName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('branding_placements')
      .select('id, name')
      .order('name');
    if (error) {
      console.error(error);
      toast.error('Failed to load branding placements');
      setPlacements([]);
    } else {
      setPlacements((data || []) as BrandingPlacementRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trimmedSearch = search.trim();
  const hasExactMatch = useMemo(
    () =>
      placements.some((p) => p.name.toLowerCase() === trimmedSearch.toLowerCase()),
    [placements, trimmedSearch]
  );

  const canCreateFromSearch = trimmedSearch.length > 0 && !hasExactMatch;

  const filtered = useMemo(() => {
    if (!trimmedSearch) return placements;
    const q = trimmedSearch.toLowerCase();
    return placements.filter((p) => p.name.toLowerCase().includes(q));
  }, [placements, trimmedSearch]);

  const insertPlacement = async (rawName: string): Promise<boolean> => {
    const name = rawName.trim();
    if (!name) {
      toast.error('Enter a placement name');
      return false;
    }
    if (saving) return false;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('branding_placements')
        .insert({ name })
        .select('id, name')
        .single();
      if (error) {
        if (error.code === '23505') {
          toast.error('This placement already exists');
          const { data: rows } = await supabase.from('branding_placements').select('name');
          const found = (rows || []).find(
            (r: { name: string }) => r.name.trim().toLowerCase() === name.toLowerCase()
          );
          if (found) onChange(found.name);
          await load();
        } else {
          toast.error(error.message || 'Failed to create placement');
        }
        return false;
      }
      toast.success('Placement added');
      await load();
      onChange((data as BrandingPlacementRow).name);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFromSearch = async () => {
    const ok = await insertPlacement(trimmedSearch);
    if (ok) {
      setOpen(false);
      setSearch('');
    }
  };

  const handleCreateFromDialog = async () => {
    const ok = await insertPlacement(dialogName);
    if (ok) {
      setCreateDialogOpen(false);
      setDialogName('');
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setSearch('');
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className={cn('truncate', !value && 'text-muted-foreground')}>
                {value || 'Select or search placement...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search placement..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                {loading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
                ) : filtered.length === 0 && !canCreateFromSearch ? (
                  <CommandEmpty className="py-6 text-sm text-muted-foreground">
                    No placements yet. Type a name, then create it or use the + button.
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filtered.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => {
                          onChange(p.name);
                          setOpen(false);
                          setSearch('');
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            value === p.name ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="truncate">{p.name}</span>
                      </CommandItem>
                    ))}
                    {canCreateFromSearch && (
                      <CommandItem
                        value={`__create__${trimmedSearch}`}
                        onSelect={() => {
                          void handleCreateFromSearch();
                        }}
                        className="text-primary"
                      >
                        <Plus className="mr-2 h-4 w-4 shrink-0" />
                        <span>Create "{trimmedSearch}"</span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          title="Create placement"
          onClick={() => {
            setDialogName(trimmedSearch || value || '');
            setCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New branding placement</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="branding-placement-name">Name</Label>
            <Input
              id="branding-placement-name"
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              placeholder="e.g. Front chest, Back neck"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateFromDialog();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateFromDialog()} disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
