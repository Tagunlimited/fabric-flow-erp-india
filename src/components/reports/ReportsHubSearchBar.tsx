import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ReportsHubSearchBarProps {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

export function ReportsHubSearchBar({
  value,
  onChange,
  placeholder = 'Search reference, description, details…',
  className,
  debounceMs = 280,
}: ReportsHubSearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      onChange(local);
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [local, debounceMs, onChange]);

  return (
    <div className={cn('relative flex-1 min-w-[200px] max-w-md', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60"
        aria-hidden
      />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-9 border-primary/20 bg-background pl-9 pr-10 text-sm shadow-sm focus-visible:ring-primary/30"
        aria-label="Search within report"
      />
      {local ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
